import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The leak tests.
 *
 * The whole point of demoting a claim is that nothing downstream can mistake it for a confirmed
 * one. These go through the real consumer projection rather than the pure classifier, because the
 * risk is not that the classifier is wrong — it is that a stale value finds a route back into the
 * metadata object every existing screen already reads.
 */

const CLAIMS_PATH = path.join(process.cwd(), '.data', 'venue-claims.json');
const STORE_PATH = path.join(process.cwd(), '.data', 'enrichment-store.json');
const EVIDENCE_PATH = path.join(process.cwd(), '.data', 'venue-source-evidence.json');

const FAMILY_PAGE = 'https://example.org/family-visits';
const ACCESSIBILITY_PAGE = 'https://example.org/accessibility';

let savedSupabaseUrl: string | undefined;
let savedSupabaseKey: string | undefined;

function isolateFileStores() {
  savedSupabaseUrl = process.env.SUPABASE_URL;
  savedSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.resetModules();

  const dir = path.dirname(CLAIMS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CLAIMS_PATH, JSON.stringify({ claims: [] }, null, 2));
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify({ records: [] }, null, 2));
}

function restoreEnv() {
  if (savedSupabaseUrl !== undefined) process.env.SUPABASE_URL = savedSupabaseUrl;
  else delete process.env.SUPABASE_URL;
  if (savedSupabaseKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedSupabaseKey;
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.resetModules();
}

function writeMetadata(placeId: string) {
  fs.writeFileSync(
    STORE_PATH,
    JSON.stringify(
      {
        places: {},
        metadata: {
          [placeId]: {
            familypilot_place_id: placeId,
            enrichment_status: 'enriched',
            best_ages: null,
            min_recommended_age: null,
            max_recommended_age: null,
            age_notes: null,
            terrain: null,
            extended_terrain: null,
            terrain_notes: null,
            path_surface: null,
            facilities: [],
            family_facilities: {},
            parking_info: null,
            visit_duration_minutes: null,
            warnings: [],
            good_to_know: [],
            why_families_like: [],
            estimated_spend: null,
            pushchair_suitability: null,
            environment: null,
            energy_level: null,
            accessibility: {},
            send_info: {},
            family_notes: null,
            category_confirmed: null,
            enrichment_provenance: { sourceType: 'official_website', checkedDate: '2026-08-01' },
            last_checked: '2026-08-01',
            checked_by: 'editor@test',
            beta_priority: false,
            field_provenance: {},
            updated_at: '2026-08-10T12:00:00.000Z',
            updated_by: 'test',
          },
        },
      },
      null,
      2,
    ),
  );
}

function writeEvidence(
  placeId: string,
  entries: { sourceUrl: string; fetchStatus: string; retrievedAt: string; httpStatus?: number }[],
) {
  fs.writeFileSync(
    EVIDENCE_PATH,
    JSON.stringify(
      {
        records: entries.map((entry, index) => ({
          id: `evidence-${index}`,
          familypilot_place_id: placeId,
          source_url: entry.sourceUrl,
          source_type: 'family_page',
          page_title: null,
          retrieved_at: entry.retrievedAt,
          content_hash: `hash-${index}`,
          extracted_text: null,
          extracted_evidence: [],
          fetch_status: entry.fetchStatus,
          http_status: entry.httpStatus ?? null,
          error: entry.fetchStatus === 'ok' ? null : entry.fetchStatus,
          created_at: entry.retrievedAt,
          updated_at: entry.retrievedAt,
        })),
      },
      null,
      2,
    ),
  );
}

async function createClaim(placeId: string, fieldKey: string, value: string, sourceUrl: string) {
  const { createApprovedClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
  await createApprovedClaim({
    familypilotPlaceId: placeId,
    fieldKey,
    value,
    fieldEvidence: {
      [fieldKey]: {
        sourceUrl,
        sourceType: 'family_page',
        confidence: 'high',
        evidence: 'Baby changing facilities are available.',
        retrievedAt: '2026-09-01T10:00:00.000Z',
      },
    },
    reviewedBy: 'source_evidence_auto_v2',
    draftId: null,
    checkedAt: '2026-09-01',
  });
}

/** 2026-09-01 + 30 days = 2026-10-01. Past that, the claim needs grace to survive at all. */
const AFTER_EXPIRY = '2026-10-05T12:00:00Z';
const BEFORE_EXPIRY = '2026-09-20T12:00:00Z';

describe('stale facts never reach trusted metadata', () => {
  const placeId = 'fp-google-freshness-leak';

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    isolateFileStores();
    writeMetadata(placeId);
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
  });

  it('a stale positive does not appear in familyFacilities, but does appear in the sidecar', async () => {
    vi.setSystemTime(new Date(BEFORE_EXPIRY));
    await createClaim(placeId, 'familyFacilities.babyChanging', 'yes', FAMILY_PAGE);
    writeEvidence(placeId, [
      { sourceUrl: FAMILY_PAGE, fetchStatus: 'timeout', retrievedAt: '2026-09-28T10:00:00.000Z' },
    ]);

    vi.setSystemTime(new Date(AFTER_EXPIRY));
    const projection = await import('../../../server/enrichment/_lib/consumer-projection.js');

    const metadata = await projection.getConsumerMetadata(placeId);
    // No active trusted claim remains, so there is no trusted metadata at all.
    expect(metadata).toBeNull();

    const staleFacts = await projection.getVenueStaleFacts(placeId);
    expect(staleFacts).toHaveLength(1);
    expect(staleFacts[0]).toMatchObject({
      fieldKey: 'familyFacilities.babyChanging',
      value: 'yes',
      lastConfirmed: '2026-09-01',
      recheckPending: true,
    });
  });

  it('a stale fact is absent from metadata even when other claims keep the venue trusted', async () => {
    vi.setSystemTime(new Date(BEFORE_EXPIRY));
    await createClaim(placeId, 'familyFacilities.babyChanging', 'yes', FAMILY_PAGE);
    // A second claim whose own source was re-read successfully, so it stays trusted.
    const { createApprovedClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
    await createApprovedClaim({
      familypilotPlaceId: placeId,
      fieldKey: 'familyFacilities.parking',
      value: 'yes',
      fieldEvidence: {
        'familyFacilities.parking': {
          sourceUrl: ACCESSIBILITY_PAGE,
          sourceType: 'accessibility_page',
          confidence: 'high',
          evidence: 'On-site parking is available.',
          retrievedAt: '2026-09-28T10:00:00.000Z',
        },
      },
      reviewedBy: 'source_evidence_auto_v2',
      draftId: null,
      checkedAt: '2026-09-28',
    });

    writeEvidence(placeId, [
      { sourceUrl: FAMILY_PAGE, fetchStatus: 'timeout', retrievedAt: '2026-09-28T10:00:00.000Z' },
      { sourceUrl: ACCESSIBILITY_PAGE, fetchStatus: 'ok', retrievedAt: '2026-09-28T10:00:00.000Z' },
    ]);

    vi.setSystemTime(new Date(AFTER_EXPIRY));
    const projection = await import('../../../server/enrichment/_lib/consumer-projection.js');

    const metadata = await projection.getConsumerMetadata(placeId);
    expect(metadata).not.toBeNull();
    // The venue is trusted, and parking is confirmed…
    expect(metadata!.familyFacilities?.parking).toBe('yes');
    // …but the stale fact is simply not a key. A screen reading it gets undefined, which every
    // existing consumer already resolves to unknown.
    expect(metadata!.familyFacilities?.babyChanging).toBeUndefined();
    expect(JSON.stringify(metadata)).not.toContain('babyChanging');

    const staleFacts = await projection.getVenueStaleFacts(placeId);
    expect(staleFacts.map((f: { fieldKey: string }) => f.fieldKey)).toEqual([
      'familyFacilities.babyChanging',
    ]);
  });

  it('a stale negative is equally absent, so it cannot exclude a venue', async () => {
    vi.setSystemTime(new Date(BEFORE_EXPIRY));
    await createClaim(placeId, 'familyFacilities.parking', 'no', ACCESSIBILITY_PAGE);
    writeEvidence(placeId, [
      { sourceUrl: ACCESSIBILITY_PAGE, fetchStatus: 'blocked', retrievedAt: '2026-09-28T10:00:00.000Z' },
    ]);

    vi.setSystemTime(new Date(AFTER_EXPIRY));
    const projection = await import('../../../server/enrichment/_lib/consumer-projection.js');

    const metadata = await projection.getConsumerMetadata(placeId);
    expect(metadata).toBeNull();

    const staleFacts = await projection.getVenueStaleFacts(placeId);
    expect(staleFacts[0].value).toBe('no');
  });

  it('the stale sidecar carries no facility map a renderer could reuse', async () => {
    vi.setSystemTime(new Date(BEFORE_EXPIRY));
    await createClaim(placeId, 'familyFacilities.babyChanging', 'yes', FAMILY_PAGE);
    writeEvidence(placeId, [
      { sourceUrl: FAMILY_PAGE, fetchStatus: 'timeout', retrievedAt: '2026-09-28T10:00:00.000Z' },
    ]);

    vi.setSystemTime(new Date(AFTER_EXPIRY));
    const projection = await import('../../../server/enrichment/_lib/consumer-projection.js');
    const [fact] = await projection.getVenueStaleFacts(placeId);

    expect(Object.keys(fact).sort()).toEqual([
      'fieldKey',
      'graceUntil',
      'lastConfirmed',
      'recheckPending',
      'value',
    ]);
    expect(fact).not.toHaveProperty('familyFacilities');
    expect(fact).not.toHaveProperty('accessibility');
  });

  it('a permanent source failure yields neither trusted metadata nor a stale fact', async () => {
    vi.setSystemTime(new Date(BEFORE_EXPIRY));
    await createClaim(placeId, 'familyFacilities.babyChanging', 'yes', FAMILY_PAGE);
    writeEvidence(placeId, [
      {
        sourceUrl: FAMILY_PAGE,
        fetchStatus: 'error',
        httpStatus: 404,
        retrievedAt: '2026-09-28T10:00:00.000Z',
      },
    ]);

    vi.setSystemTime(new Date(AFTER_EXPIRY));
    const projection = await import('../../../server/enrichment/_lib/consumer-projection.js');

    expect(await projection.getConsumerMetadata(placeId)).toBeNull();
    expect(await projection.getVenueStaleFacts(placeId)).toEqual([]);
  });

  it('fresh behaviour is unchanged: the claim is normal trusted metadata and nothing is stale', async () => {
    vi.setSystemTime(new Date(BEFORE_EXPIRY));
    await createClaim(placeId, 'familyFacilities.babyChanging', 'yes', FAMILY_PAGE);
    writeEvidence(placeId, [
      { sourceUrl: FAMILY_PAGE, fetchStatus: 'timeout', retrievedAt: '2026-09-28T10:00:00.000Z' },
    ]);

    const projection = await import('../../../server/enrichment/_lib/consumer-projection.js');
    const metadata = await projection.getConsumerMetadata(placeId);

    expect(metadata!.familyFacilities?.babyChanging).toBe('yes');
    expect(await projection.getVenueStaleFacts(placeId)).toEqual([]);
  });

  it('trusted claims are exactly the set getActiveClaims already returned', async () => {
    vi.setSystemTime(new Date(BEFORE_EXPIRY));
    await createClaim(placeId, 'familyFacilities.babyChanging', 'yes', FAMILY_PAGE);
    await createClaim(placeId, 'familyFacilities.toilets', 'yes', FAMILY_PAGE);

    const store = await import('../../../server/enrichment/_lib/claims-store.js');
    const active = await store.getActiveClaims(placeId);
    const { trusted } = await store.listClaimsWithFreshness(placeId);

    expect(trusted.map((c: { id: string }) => c.id).sort()).toEqual(
      active.map((c: { id: string }) => c.id).sort(),
    );
  });
});
