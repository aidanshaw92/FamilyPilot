import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildEvidenceBundle } = require('../../../server/enrichment/_lib/evidence-extractor.js');

/**
 * A WITHDRAWAL THAT DOES NOT LEAVE THE SERVING SURFACE IS NOT A WITHDRAWAL.
 *
 * `disputeClaim` sets a status. What a parent reads is `venue_family_metadata`, rebuilt from the
 * ACTIVE claims. Nothing rebuilt it after automatic reconciliation withdrew a claim, and the one
 * caller returns early exactly when every claim for a field has just gone:
 *
 *   reconcileSourceClaims(...)      <- disputes
 *   review = reviewEvidence(...)
 *   if (!review.eligible) return;   <- nothing to publish, so no rebuild
 *   approveDraft(...)               <- the rebuild that never happened
 *
 * Found in production on 2026-10-01: Crystal Palace Park still served playground, toilets and
 * accessibleToilet as `yes`, and Swanley Park playground as `yes`, from claims disputed on
 * 11 September. Twenty days of a withdrawn fact on a live venue page.
 */
describe('automatic reconciliation clears what it withdraws', () => {
  const VENUE = 'fp-projection-venue';
  const OWN = 'https://example.org/visit';
  const CHECKED_AT = '2026-09-20';
  const REFRESHED = '2026-09-27T09:10:18.282Z';

  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    env = { ...process.env };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    fs.mkdirSync('.data', { recursive: true });
    fs.writeFileSync(path.join('.data', 'venue-claims.json'), JSON.stringify({ claims: [] }));
    vi.resetModules();
  });
  afterEach(() => { process.env = env; vi.resetModules(); });

  const fact = (field: string, value: string) => ({
    field, value, confidence: 'high',
    evidenceText: `${field} ${value} stated on the page in enough words to pass the length gate.`,
    sourceUrl: OWN, sourceType: 'visitor_info', retrievedAt: REFRESHED,
  });

  const source = (facts: unknown[]) => ({
    url: OWN, sourceType: 'visitor_info', fetchStatus: 'ok', retrievedAt: REFRESHED,
    subjectScope: 'venue_own_subtree', facts,
  });

  async function seedClaimAndProjection() {
    const { replaceActiveClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
    const { REVIEWED_BY } = await import('../../../server/enrichment/_lib/auto-approve.js');
    const { saveMetadata } = await import('../../../server/enrichment/_lib/enrichment-store.js');
    await replaceActiveClaim({
      familypilotPlaceId: VENUE, fieldKey: 'familyFacilities.playground', valueJson: 'yes',
      confidence: 'high', sourceUrl: OWN, sourceType: 'visitor_info', sourceEvidenceId: null,
      evidenceExcerpt: 'There is a playground on site.', checkedAt: CHECKED_AT,
      validUntil: '2026-10-20', approvedAt: `${CHECKED_AT}T12:00:00Z`, approvedBy: REVIEWED_BY,
      approvedFromDraftId: null, status: 'active', supersedesClaimId: null,
    });
    // Project it, the way publication does, so the venue page serves `yes`.
    await saveMetadata(VENUE, { lastChecked: CHECKED_AT, checkedBy: REVIEWED_BY }, { fromClaims: true });
  }

  async function projectedPlayground() {
    const { getMetadata } = await import('../../../server/enrichment/_lib/enrichment-store.js');
    const metadata = await getMetadata(VENUE) as { familyFacilities?: Record<string, unknown> } | null;
    return metadata?.familyFacilities?.playground ?? null;
  }

  it('takes the withdrawn fact off the venue page, not just out of the claim table', async () => {
    await seedClaimAndProjection();
    expect(await projectedPlayground()).toBe('yes');

    // The page no longer says it. A complete read, so absence is a withdrawal.
    const { reconcileSourceClaims } = await import('../../../server/enrichment/_lib/auto-approve.js');
    await reconcileSourceClaims(VENUE, buildEvidenceBundle(VENUE, [source([fact('toilets', 'yes')])], 'official_website'));

    const { listClaimsForVenue } = await import('../../../server/enrichment/_lib/claims-store.js');
    const claims = await listClaimsForVenue(VENUE, {}) as Array<{ fieldKey: string; status: string }>;
    expect(claims.find((c) => c.fieldKey === 'familyFacilities.playground')?.status).toBe('disputed');

    // The part that was missing. Without it the claim reads `disputed` and the venue page still
    // says `yes`, which is what production looked like.
    expect(await projectedPlayground()).toBeNull();
  });

  it('clears a fact withdrawn because two eligible pages disagree', async () => {
    // The OTHER dispute site in the same function. The absence path and the conflict path reach
    // `disputeClaim` separately, so each needs its own proof that the projection follows.
    await seedClaimAndProjection();
    expect(await projectedPlayground()).toBe('yes');

    const { reconcileSourceClaims } = await import('../../../server/enrichment/_lib/auto-approve.js');
    const other = {
      url: 'https://example.org/accessibility', sourceType: 'visitor_info', fetchStatus: 'ok',
      retrievedAt: REFRESHED, subjectScope: 'venue_own_subtree',
      facts: [{
        field: 'playground', value: 'no', confidence: 'high',
        evidenceText: 'There is no playground here, stated in enough words to pass the length gate.',
        sourceUrl: 'https://example.org/accessibility', sourceType: 'visitor_info', retrievedAt: REFRESHED,
      }],
    };
    await reconcileSourceClaims(VENUE, buildEvidenceBundle(
      VENUE, [source([fact('playground', 'yes')]), other], 'official_website',
    ));

    const { listClaimsForVenue } = await import('../../../server/enrichment/_lib/claims-store.js');
    const claims = await listClaimsForVenue(VENUE, {}) as Array<{ fieldKey: string; status: string }>;
    expect(claims.find((c) => c.fieldKey === 'familyFacilities.playground')?.status).toBe('disputed');
    expect(await projectedPlayground()).toBeNull();
  });

  it('leaves the venue\'s other facts alone', async () => {
    // The rebuild writes a whole metadata row, so the risk is blanking everything around the one
    // withdrawn field. Production showed this mattered: the five wheelchair withdrawals earlier kept
    // each venue's toilets, baby changing and playground intact.
    const { replaceActiveClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
    const { REVIEWED_BY } = await import('../../../server/enrichment/_lib/auto-approve.js');
    const { saveMetadata, getMetadata } = await import('../../../server/enrichment/_lib/enrichment-store.js');
    for (const [fieldKey, value, excerpt] of [
      ['familyFacilities.playground', 'yes', 'There is a playground on site.'],
      ['familyFacilities.toilets', 'yes', 'Toilets are available next to the car park.'],
    ] as Array<[string, string, string]>) {
      await replaceActiveClaim({
        familypilotPlaceId: VENUE, fieldKey, valueJson: value, confidence: 'high',
        sourceUrl: OWN, sourceType: 'visitor_info', sourceEvidenceId: null,
        evidenceExcerpt: excerpt, checkedAt: CHECKED_AT, validUntil: '2026-10-20',
        approvedAt: `${CHECKED_AT}T12:00:00Z`, approvedBy: REVIEWED_BY,
        approvedFromDraftId: null, status: 'active', supersedesClaimId: null,
      });
    }
    await saveMetadata(VENUE, { lastChecked: CHECKED_AT, checkedBy: REVIEWED_BY }, { fromClaims: true });

    // Only the playground goes; the page still states the toilets.
    const { reconcileSourceClaims } = await import('../../../server/enrichment/_lib/auto-approve.js');
    await reconcileSourceClaims(VENUE, buildEvidenceBundle(VENUE, [source([fact('toilets', 'yes')])], 'official_website'));

    const metadata = await getMetadata(VENUE) as { familyFacilities?: Record<string, unknown> } | null;
    expect(metadata?.familyFacilities?.playground ?? null).toBeNull();
    expect(metadata?.familyFacilities?.toilets).toBe('yes');
  });

  it('repairs a projection left behind by a withdrawal from weeks ago', async () => {
    // Counting this run's own withdrawals fixes the defect forward and repairs nothing already
    // broken: a claim disputed on 11 September is disputed again by nobody. This is the case the
    // production audit actually found -- Crystal Palace Park and Swanley Park, four values between
    // them, every claim disputed and the page still showing them.
    await seedClaimAndProjection();
    const { listClaimsForVenue, disputeClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
    const seeded = await listClaimsForVenue(VENUE, {}) as Array<{ id: string; fieldKey: string }>;
    await disputeClaim(seeded[0].id);

    // The projection still says yes, exactly as production did.
    expect(await projectedPlayground()).toBe('yes');

    // A later run that withdraws NOTHING must still clean this up.
    const { reconcileSourceClaims } = await import('../../../server/enrichment/_lib/auto-approve.js');
    await reconcileSourceClaims(VENUE, buildEvidenceBundle(VENUE, [source([fact('toilets', 'yes')])], 'official_website'));

    expect(await projectedPlayground()).toBeNull();
  });

  it('writes nothing for a venue that has no claims and shows nothing', async () => {
    // The self-heal asks whether a parent can currently see a fact with nothing behind it. For a
    // venue with neither claims nor projected facts the answer is no, so every run must leave the
    // row alone rather than rewriting it forever.
    const { saveMetadata, getMetadata } = await import('../../../server/enrichment/_lib/enrichment-store.js');
    await saveMetadata(VENUE, { lastChecked: CHECKED_AT, checkedBy: 'enrichment-admin' });
    const before = await getMetadata(VENUE) as { updatedAt?: string } | null;

    const { reconcileSourceClaims } = await import('../../../server/enrichment/_lib/auto-approve.js');
    await reconcileSourceClaims(VENUE, buildEvidenceBundle(VENUE, [source([fact('toilets', 'yes')])], 'official_website'));

    const after = await getMetadata(VENUE) as { updatedAt?: string } | null;
    expect(after?.updatedAt).toBe(before?.updatedAt);
  });

  it('writes nothing when it withdraws nothing and the page already agrees', async () => {
    await seedClaimAndProjection();
    const { getMetadata } = await import('../../../server/enrichment/_lib/enrichment-store.js');
    const before = await getMetadata(VENUE) as { updatedAt?: string } | null;

    // The page still says it, so there is nothing to withdraw and nothing to rebuild.
    const { reconcileSourceClaims } = await import('../../../server/enrichment/_lib/auto-approve.js');
    await reconcileSourceClaims(VENUE, buildEvidenceBundle(VENUE, [source([fact('playground', 'yes')])], 'official_website'));

    expect(await projectedPlayground()).toBe('yes');
    const after = await getMetadata(VENUE) as { updatedAt?: string } | null;
    expect(after?.updatedAt).toBe(before?.updatedAt);
  });
});
