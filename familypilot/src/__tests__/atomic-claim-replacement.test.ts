import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Replacing a trusted claim must never be able to leave a venue with nothing.
 *
 * The failure these cover is not hypothetical: the venue-freshness scheduler replaces claims
 * automatically now, so a replacement insert that fails after the old claim was already superseded
 * would silently remove a fact a parent could previously see.
 */

const CLAIMS_PATH = path.join(process.cwd(), '.data', 'venue-claims.json');

const PLACE = 'fp-google-atomic-a';
const OTHER_PLACE = 'fp-google-atomic-b';
const FIELD = 'familyFacilities.babyChanging';
const OTHER_FIELD = 'familyFacilities.toilets';

let savedUrl: string | undefined;
let savedKey: string | undefined;

function isolate() {
  savedUrl = process.env.SUPABASE_URL;
  savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.resetModules();
  const dir = path.dirname(CLAIMS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CLAIMS_PATH, JSON.stringify({ claims: [] }, null, 2));
}

function restore() {
  if (savedUrl !== undefined) process.env.SUPABASE_URL = savedUrl;
  else delete process.env.SUPABASE_URL;
  if (savedKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.resetModules();
}

function readClaims(): Record<string, unknown>[] {
  return JSON.parse(fs.readFileSync(CLAIMS_PATH, 'utf8')).claims;
}

function activeFor(place = PLACE, field = FIELD) {
  return readClaims().filter(
    (c) => c.familypilot_place_id === place && c.field_key === field && c.status === 'active',
  );
}

interface StoredClaim {
  id: string;
  status: string;
  supersedesClaimId: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  confidence: string | null;
  evidenceExcerpt: string | null;
  checkedAt: string;
  validUntil: string | null;
  approvedBy: string;
}

/** `rowToClaim` is nullable by design; a successful approval never is, so assert it once here. */
async function approve(
  value: string,
  options: { place?: string; field?: string; checkedAt?: string } = {},
): Promise<StoredClaim> {
  const { createApprovedClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
  const created = await createApprovedClaim({
    familypilotPlaceId: options.place ?? PLACE,
    fieldKey: options.field ?? FIELD,
    value,
    fieldEvidence: {
      [options.field ?? FIELD]: {
        sourceUrl: 'https://example.org/visit',
        sourceType: 'visitor_info',
        confidence: 'high',
        evidence: 'Baby changing facilities are available on the ground floor.',
        retrievedAt: `${options.checkedAt ?? '2026-09-20'}T10:00:00.000Z`,
      },
    },
    reviewedBy: 'source_evidence_auto_v2',
    draftId: null,
    checkedAt: options.checkedAt ?? '2026-09-20',
  });
  expect(created, 'createApprovedClaim should return the stored claim').not.toBeNull();
  return created as StoredClaim;
}

describe('atomic claim replacement', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));
    isolate();
  });

  afterEach(() => {
    vi.useRealTimers();
    restore();
  });

  it('inserts the first claim for a field', async () => {
    const created = await approve('yes');

    expect(created.status).toBe('active');
    expect(created.supersedesClaimId).toBeNull();
    expect(activeFor()).toHaveLength(1);
  });

  it('replaces an existing claim and links the supersession', async () => {
    const first = await approve('yes');
    const second = await approve('no', { checkedAt: '2026-09-21' });

    expect(second.supersedesClaimId).toBe(first.id);
    expect(second.status).toBe('active');

    const all = readClaims().filter((c) => c.field_key === FIELD);
    expect(all).toHaveLength(2);
    expect(all.find((c) => c.id === first.id)!.status).toBe('superseded');
  });

  it('never leaves two active claims for the same field', async () => {
    await approve('yes');
    await approve('no', { checkedAt: '2026-09-21' });
    await approve('yes', { checkedAt: '2026-09-22' });

    // The database enforces this with a partial unique index; the file store must agree.
    expect(activeFor()).toHaveLength(1);
  });

  it('replacing with the same value still supersedes rather than duplicating', async () => {
    const first = await approve('yes');
    const second = await approve('yes', { checkedAt: '2026-09-27' });

    expect(second.id).not.toBe(first.id);
    expect(second.supersedesClaimId).toBe(first.id);
    expect(activeFor()).toHaveLength(1);
    expect(activeFor()[0].checked_at).toBe('2026-09-27');
  });

  /**
   * Fail the Nth claims-file write, letting earlier ones through.
   *
   * Failing *every* write would prove nothing: a two-step implementation would lose its supersede
   * along with its insert and look correct by accident. The dangerous window only exists when the
   * supersede has already been persisted and the insert then fails, so the harness has to let the
   * first write succeed.
   */
  function failClaimsWriteAfter(succeedingWrites: number) {
    let writes = 0;
    const realWrite = fs.writeFileSync;
    return vi.spyOn(fs, 'writeFileSync').mockImplementation(((file: string, ...rest: unknown[]) => {
      if (String(file).endsWith('venue-claims.json')) {
        writes += 1;
        if (writes > succeedingWrites) throw new Error('simulated write failure');
      }
      return (realWrite as unknown as (...args: unknown[]) => void)(file, ...rest);
    }) as typeof fs.writeFileSync);
  }

  const replacement = {
    familypilotPlaceId: PLACE,
    fieldKey: FIELD,
    valueJson: 'no',
    checkedAt: '2026-09-21',
    approvedBy: 'source_evidence_auto_v2',
    status: 'active',
  };

  it('a replacement never leaves the field with zero active claims', async () => {
    await approve('yes');
    expect(activeFor()).toHaveLength(1);

    const { replaceActiveClaim } = await import('../../../server/enrichment/_lib/claims-store.js');

    // One write is permitted. An atomic implementation needs exactly one and succeeds; a
    // supersede-then-insert implementation spends it on the supersede and dies on the insert,
    // leaving the venue with nothing.
    const spy = failClaimsWriteAfter(1);
    await replaceActiveClaim({ ...replacement, approvedAt: new Date().toISOString() }).catch(() => undefined);
    spy.mockRestore();

    const active = activeFor();
    expect(active, 'the field must always have exactly one active claim').toHaveLength(1);
    expect(active[0].value_json).toBe('no');
    expect(active[0].status).toBe('active');
  });

  it('a wholly failed replacement leaves the previous claim active and unmodified', async () => {
    const first = await approve('yes');

    const { replaceActiveClaim } = await import('../../../server/enrichment/_lib/claims-store.js');

    // No writes permitted at all: nothing about the existing claim may change.
    const spy = failClaimsWriteAfter(0);
    await expect(
      replaceActiveClaim({ ...replacement, approvedAt: new Date().toISOString() }),
    ).rejects.toThrow('simulated write failure');
    spy.mockRestore();

    const still = activeFor();
    expect(still).toHaveLength(1);
    expect(still[0].id).toBe(first.id);
    expect(still[0].status).toBe('active');
    expect(still[0].value_json).toBe('yes');
  });

  it('sequential replacements serialise to one active claim and one chain', async () => {
    const first = await approve('yes');
    const second = await approve('no', { checkedAt: '2026-09-21' });
    const third = await approve('yes', { checkedAt: '2026-09-22' });

    expect(activeFor()).toHaveLength(1);
    expect(third.supersedesClaimId).toBe(second.id);
    expect(second.supersedesClaimId).toBe(first.id);

    const chain = readClaims().filter((c) => c.field_key === FIELD);
    expect(chain.filter((c) => c.status === 'superseded')).toHaveLength(2);
  });

  it('leaves unrelated fields on the same venue untouched', async () => {
    const other = await approve('yes', { field: OTHER_FIELD });
    await approve('yes');
    await approve('no', { checkedAt: '2026-09-21' });

    const otherRows = readClaims().filter((c) => c.field_key === OTHER_FIELD);
    expect(otherRows).toHaveLength(1);
    expect(otherRows[0].id).toBe(other.id);
    expect(otherRows[0].status).toBe('active');
  });

  it('leaves unrelated venues untouched', async () => {
    const other = await approve('yes', { place: OTHER_PLACE });
    await approve('yes');
    await approve('no', { checkedAt: '2026-09-21' });

    const otherRows = readClaims().filter((c) => c.familypilot_place_id === OTHER_PLACE);
    expect(otherRows).toHaveLength(1);
    expect(otherRows[0].id).toBe(other.id);
    expect(otherRows[0].status).toBe('active');
  });

  it('preserves every provenance field across a replacement', async () => {
    await approve('yes');
    const replacement = await approve('no', { checkedAt: '2026-09-21' });

    expect(replacement.sourceUrl).toBe('https://example.org/visit');
    expect(replacement.sourceType).toBe('visitor_info');
    expect(replacement.confidence).toBe('high');
    expect(replacement.evidenceExcerpt).toContain('Baby changing');
    expect(replacement.checkedAt).toBe('2026-09-21');
    expect(replacement.validUntil).toBeTruthy();
    expect(replacement.approvedBy).toBe('source_evidence_auto_v2');
  });
});
