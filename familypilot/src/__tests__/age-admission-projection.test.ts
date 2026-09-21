import { describe, expect, it } from 'vitest';

/**
 * The admission fact has to survive the whole server journey before the matcher can act on it:
 *
 *   editor payload -> reviewed claim field -> metadata row -> metadata object -> venue facts
 *
 * Every hop is a separate module, and a fact that is dropped at any of them fails silently: the
 * venue simply reads `unknown` and stays eligible, which looks exactly like a venue that has no
 * policy. That is the failure mode this file exists to catch, so it asserts the hops rather than
 * the matcher, which `age-admission.test.ts` already covers.
 */

const PLACE = 'fp-test-admission';

/** The server modules are plain JS, so their inferred return shapes are narrower than reality. */
type AgePayload = { minAdmissionAge?: number; maxAdmissionAge?: number; minRecommendedAge?: number };
type AgeMetadata = { minAdmissionAge: number | null; maxAdmissionAge: number | null; minRecommendedAge: number | null };

/** A claim is only active while inside its lifetime, so fixtures must state one. */
const FUTURE = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
const PAST = new Date(Date.now() - 1 * 86_400_000).toISOString().slice(0, 10);

describe('an admission value survives the server projection', () => {
  it('carries an approved admission claim into the metadata payload', async () => {
    const { projectActiveClaimsToPayload } = await import(
      '../../../server/enrichment/_lib/claims-store.js'
    );
    const payload = projectActiveClaimsToPayload([
      { fieldKey: 'minAdmissionAge', valueJson: 4, status: 'active', validUntil: FUTURE },
      { fieldKey: 'maxAdmissionAge', valueJson: 11, status: 'active', validUntil: FUTURE },
    ]) as AgePayload;
    expect(payload.minAdmissionAge).toBe(4);
    expect(payload.maxAdmissionAge).toBe(11);
  });

  it('drops an admission claim that has passed its lifetime', async () => {
    const { projectActiveClaimsToPayload } = await import(
      '../../../server/enrichment/_lib/claims-store.js'
    );
    /**
     * This one matters more than it looks. A prohibition is the only age fact that removes a
     * venue, so a stale one keeps a venue hidden from every family indefinitely on the strength
     * of a policy nobody has re-read. Expiry has to drop it back to unknown, where it stops
     * excluding, rather than persisting as a door that may no longer be closed.
     */
    const payload = projectActiveClaimsToPayload([
      { fieldKey: 'minAdmissionAge', valueJson: 4, status: 'active', validUntil: PAST },
    ]) as AgePayload;
    expect(payload.minAdmissionAge).toBeUndefined();
  });

  it('does not invent an admission value when no claim states one', async () => {
    const { projectActiveClaimsToPayload } = await import(
      '../../../server/enrichment/_lib/claims-store.js'
    );
    // Absent means unknown. A value conjured from nothing would be a prohibition nobody published.
    const payload = projectActiveClaimsToPayload([
      { fieldKey: 'minRecommendedAge', valueJson: 3, status: 'active', validUntil: FUTURE },
    ]) as AgePayload;
    expect(payload.minAdmissionAge).toBeUndefined();
    expect(payload.maxAdmissionAge).toBeUndefined();
  });

  it('reaches the metadata row, and back out as metadata', async () => {
    const { metadataRowFromPayload } = await import(
      '../../../server/enrichment/_lib/claims-store.js'
    );
    const { rowToMetadata } = await import('../../../server/enrichment/_lib/enrichment-store.js');

    const row = metadataRowFromPayload(PLACE, { minAdmissionAge: 4, maxAdmissionAge: 11 }, null);
    expect(row.min_admission_age).toBe(4);
    expect(row.max_admission_age).toBe(11);

    const metadata = rowToMetadata(row) as AgeMetadata;
    expect(metadata.minAdmissionAge).toBe(4);
    expect(metadata.maxAdmissionAge).toBe(11);
  });

  it('keeps admission distinct from recommendation all the way through', async () => {
    const { metadataRowFromPayload } = await import(
      '../../../server/enrichment/_lib/claims-store.js'
    );
    const { rowToMetadata } = await import('../../../server/enrichment/_lib/enrichment-store.js');

    // A venue that RECOMMENDS 8-12 but ADMITS everyone. Collapsing the two would turn advice
    // into a locked door -- the exact defect `childAgeFit` had.
    const row = metadataRowFromPayload(
      PLACE,
      { minRecommendedAge: 8, maxRecommendedAge: 12 },
      null,
    );
    const metadata = rowToMetadata(row) as AgeMetadata;
    expect(metadata.minRecommendedAge).toBe(8);
    expect(metadata.minAdmissionAge).toBeNull();
    expect(metadata.maxAdmissionAge).toBeNull();
  });

  it('projects into matchable facts, with absent meaning unknown', async () => {
    const { extractMatchableFacts } = await import('@/src/services/matching/venue-facts');

    const withPolicy = extractMatchableFacts('p', 'V', 'museum', 10, 'verified', {
      familypilotPlaceId: 'p',
      minAdmissionAge: 4,
      maxAdmissionAge: 11,
    } as never);
    expect(withPolicy.minAdmissionAge).toBe(4);
    expect(withPolicy.maxAdmissionAge).toBe(11);

    const without = extractMatchableFacts('p', 'V', 'museum', 10, 'verified', {
      familypilotPlaceId: 'p',
    } as never);
    expect(without.minAdmissionAge).toBeNull();
    expect(without.maxAdmissionAge).toBeNull();

    // An unreviewed venue must not carry a policy through either: its facts are all unknown.
    const unreviewed = extractMatchableFacts('p', 'V', 'museum', 10, 'ai_draft', {
      familypilotPlaceId: 'p',
      minAdmissionAge: 4,
    } as never);
    expect(unreviewed.minAdmissionAge).toBeNull();
  });
});
