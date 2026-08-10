import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const CLAIMS_PATH = path.join(process.cwd(), '.data', 'venue-claims.json');

let savedSupabaseUrl: string | undefined;
let savedSupabaseKey: string | undefined;

function clearClaimsFile() {
  const dir = path.dirname(CLAIMS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CLAIMS_PATH, JSON.stringify({ claims: [] }, null, 2));
}

function isolateClaimsTests() {
  savedSupabaseUrl = process.env.SUPABASE_URL;
  savedSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.resetModules();
}

function restoreClaimsTests() {
  if (savedSupabaseUrl !== undefined) process.env.SUPABASE_URL = savedSupabaseUrl;
  else delete process.env.SUPABASE_URL;
  if (savedSupabaseKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedSupabaseKey;
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.resetModules();
}

const SAMPLE_DRAFT = {
  recommendedAge: { min: 2, max: 10, notes: 'All ages welcome', confidence: 'medium' },
  familyFacilities: {
    toilets: {
      value: 'yes',
      confidence: 'high',
      sourceUrl: 'https://example.org/visit',
      evidence: 'Toilets available in the visitor centre.',
      sourceType: 'official_website',
    },
    babyChanging: { value: 'unknown', confidence: 'low', reason: null },
    parking: {
      value: 'yes',
      confidence: 'high',
      sourceUrl: 'https://example.org/parking',
      evidence: 'Free on-site parking for visitors.',
      sourceType: 'official_website',
    },
    cafe: { value: 'no', confidence: 'medium', evidence: 'No café on site.', sourceType: 'official_website' },
  },
  pushchairSuitability: {
    value: 'good',
    confidence: 'medium',
    evidence: 'Wide paths suitable for pushchairs.',
    sourceType: 'official_website',
  },
  terrain: { value: 'mostly_flat', confidence: 'medium', sourceType: 'official_website' },
  environment: { value: 'outdoor', confidence: 'medium', sourceType: 'official_website' },
  energyLevel: { value: 'high', confidence: 'medium', sourceType: 'official_website' },
  accessibility: {},
  sendInfo: {},
  whyFamiliesLike: ['Nice day out'],
  goodToKnow: ['Bring a picnic'],
  suggestedVisitDuration: 120,
  rainyDaySuitability: 'unknown',
  overallDraftConfidence: 'medium',
};

/** Simulates the internal review form the editor sees before approving a draft. */
function reviewFormFromDraft(draft: typeof SAMPLE_DRAFT) {
  return {
    minRecommendedAge: draft.recommendedAge.min,
    maxRecommendedAge: draft.recommendedAge.max,
    ageNotes: draft.recommendedAge.notes,
    familyFacilities: {
      toilets: draft.familyFacilities.toilets.value,
      babyChanging: draft.familyFacilities.babyChanging.value,
      parking: draft.familyFacilities.parking.value,
      cafe: draft.familyFacilities.cafe.value,
    },
    pushchairSuitability: draft.pushchairSuitability.value,
    environment: draft.environment.value,
    energyLevel: draft.energyLevel.value,
    visitDurationMinutes: draft.suggestedVisitDuration,
    extendedTerrain: draft.terrain.value,
    accessibility: {},
    sendInfo: {},
  };
}

describe('venue claims trust layer', () => {
  beforeEach(() => {
    isolateClaimsTests();
    clearClaimsFile();
  });

  afterEach(() => {
    clearClaimsFile();
    restoreClaimsTests();
  });

  it('creates field-level claims on draft approval with evidence traceability', async () => {
    const {
      createClaimsFromApproval,
      getActiveClaims,
    } = await import('../../../api/enrichment/_lib/claims-store.js');

    await createClaimsFromApproval({
      familypilotPlaceId: 'fp-google-test-1',
      draftJson: SAMPLE_DRAFT,
      editorPayload: reviewFormFromDraft(SAMPLE_DRAFT),
      reviewedBy: 'editor@test',
      draftId: 'draft-123',
      checkedAt: '2026-08-09',
    });

    const claims = await getActiveClaims('fp-google-test-1');
    const parking = claims.find((c) => c.fieldKey === 'familyFacilities.parking');
    expect(parking).toBeDefined();
    expect(parking?.valueJson).toBe('yes');
    expect(parking?.sourceUrl).toBe('https://example.org/parking');
    expect(parking?.evidenceExcerpt).toContain('Free on-site parking');
    expect(parking?.approvedFromDraftId).toBe('draft-123');
  });

  it('supersedes previous claim while retaining history', async () => {
    const {
      createClaimsFromApproval,
      listClaimsForVenue,
      getActiveClaims,
    } = await import('../../../api/enrichment/_lib/claims-store.js');

    await createClaimsFromApproval({
      familypilotPlaceId: 'fp-google-test-2',
      draftJson: SAMPLE_DRAFT,
      editorPayload: reviewFormFromDraft(SAMPLE_DRAFT),
      reviewedBy: 'editor@test',
      draftId: 'draft-a',
      checkedAt: '2026-08-09',
    });

    await createClaimsFromApproval({
      familypilotPlaceId: 'fp-google-test-2',
      draftJson: {
        ...SAMPLE_DRAFT,
        familyFacilities: {
          ...SAMPLE_DRAFT.familyFacilities,
          parking: {
            value: 'no',
            confidence: 'high',
            sourceUrl: 'https://example.org/updates',
            evidence: 'Parking now unavailable — use nearby street parking.',
            sourceType: 'official_website',
          },
        },
      },
      editorPayload: {
        ...reviewFormFromDraft(SAMPLE_DRAFT),
        familyFacilities: {
          ...reviewFormFromDraft(SAMPLE_DRAFT).familyFacilities,
          parking: 'no',
        },
      },
      reviewedBy: 'editor@test',
      draftId: 'draft-b',
      checkedAt: '2026-08-10',
    });

    const active = await getActiveClaims('fp-google-test-2');
    const parkingActive = active.find((c) => c.fieldKey === 'familyFacilities.parking');
    expect(parkingActive?.valueJson).toBe('no');

    const all = await listClaimsForVenue('fp-google-test-2');
    const parkingClaims = all.filter((c) => c.fieldKey === 'familyFacilities.parking');
    expect(parkingClaims).toHaveLength(2);
    expect(parkingClaims.some((c) => c.status === 'superseded')).toBe(true);
    expect(parkingClaims.some((c) => c.status === 'active')).toBe(true);
    expect(parkingActive?.supersedesClaimId).toBeTruthy();
  });

  it('excludes disputed and expired claims from projection', async () => {
    const {
      createClaimsFromApproval,
      disputeClaim,
      expireClaim,
      getActiveClaims,
      projectActiveClaimsToPayload,
      listClaimsForVenue,
    } = await import('../../../api/enrichment/_lib/claims-store.js');

    await createClaimsFromApproval({
      familypilotPlaceId: 'fp-google-test-3',
      draftJson: SAMPLE_DRAFT,
      editorPayload: reviewFormFromDraft(SAMPLE_DRAFT),
      reviewedBy: 'editor@test',
      draftId: 'draft-c',
      checkedAt: '2026-08-09',
    });

    const claims = await listClaimsForVenue('fp-google-test-3');
    const toilets = claims.find((c) => c.fieldKey === 'familyFacilities.toilets' && c.status === 'active');
    const parking = claims.find((c) => c.fieldKey === 'familyFacilities.parking' && c.status === 'active');

    await disputeClaim(toilets!.id);
    await expireClaim(parking!.id);

    const active = await getActiveClaims('fp-google-test-3');
    const projected = projectActiveClaimsToPayload(active);

    expect(projected.familyFacilities?.toilets).toBeUndefined();
    expect(projected.familyFacilities?.parking).toBeUndefined();
    expect(projected.familyFacilities?.cafe).toBe('no');
  });

  it('preserves yes, no, and unknown as distinct projection values', async () => {
    const {
      createClaimsFromApproval,
      projectActiveClaimsToPayload,
      getActiveClaims,
    } = await import('../../../api/enrichment/_lib/claims-store.js');

    await createClaimsFromApproval({
      familypilotPlaceId: 'fp-google-test-4',
      draftJson: SAMPLE_DRAFT,
      editorPayload: reviewFormFromDraft(SAMPLE_DRAFT),
      reviewedBy: 'editor@test',
      draftId: 'draft-d',
      checkedAt: '2026-08-09',
    });

    const active = await getActiveClaims('fp-google-test-4');
    const projected = projectActiveClaimsToPayload(active);

    expect(projected.familyFacilities?.toilets).toBe('yes');
    expect(projected.familyFacilities?.parking).toBe('yes');
    expect(projected.familyFacilities?.cafe).toBe('no');
    expect(projected.familyFacilities?.babyChanging).toBe('unknown');
    expect(projected.pushchairSuitability).toBe('good');
    expect(projected.extendedTerrain).toBe('mostly_flat');
  });

  it('rebuilds metadata payload from active claims plus editorial extras', async () => {
    const {
      createClaimsFromApproval,
      rebuildMetadataPayloadFromClaims,
    } = await import('../../../api/enrichment/_lib/claims-store.js');

    await createClaimsFromApproval({
      familypilotPlaceId: 'fp-google-test-5',
      draftJson: SAMPLE_DRAFT,
      editorPayload: reviewFormFromDraft(SAMPLE_DRAFT),
      reviewedBy: 'editor@test',
      draftId: 'draft-e',
      checkedAt: '2026-08-09',
    });

    const payload = await rebuildMetadataPayloadFromClaims('fp-google-test-5', {
      whyFamiliesLike: ['Editorial highlight'],
      goodToKnow: ['Check opening times'],
      lastChecked: '2026-08-09',
      requestedStatus: 'enriched',
    });

    expect(payload?.familyFacilities?.parking).toBe('yes');
    expect(payload?.whyFamiliesLike).toEqual(['Editorial highlight']);
    expect(payload?.goodToKnow).toEqual(['Check opening times']);
  });

  it('applies editor overrides during approval', async () => {
    const {
      createClaimsFromApproval,
      getActiveClaims,
    } = await import('../../../api/enrichment/_lib/claims-store.js');

    await createClaimsFromApproval({
      familypilotPlaceId: 'fp-google-test-6',
      draftJson: SAMPLE_DRAFT,
      editorPayload: {
        familyFacilities: { parking: 'unknown' },
      },
      reviewedBy: 'editor@test',
      draftId: 'draft-f',
      checkedAt: '2026-08-09',
    });

    const active = await getActiveClaims('fp-google-test-6');
    const parking = active.find((c) => c.fieldKey === 'familyFacilities.parking');
    expect(parking?.valueJson).toBe('unknown');
  });
});

describe('approveDraft integration with claims', () => {
  beforeEach(() => {
    isolateClaimsTests();
    clearClaimsFile();
    const storePath = path.join(process.cwd(), '.data', 'enrichment-store.json');
    const draftPath = path.join(process.cwd(), '.data', 'enrichment-drafts.json');
    const dir = path.dirname(storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const placeId = 'fp-google-approve-test';
    fs.writeFileSync(
      storePath,
      JSON.stringify(
        {
          places: {
            [placeId]: {
              familypilot_place_id: placeId,
              external_id: 'google:approve',
              provider: 'google',
              name: 'Approve Test Park',
              category: 'park',
              lat: 51.64,
              lng: -0.36,
            },
          },
          metadata: {},
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      draftPath,
      JSON.stringify(
        {
          drafts: [
            {
              id: 'draft-approve-1',
              familypilot_place_id: placeId,
              draft_json: SAMPLE_DRAFT,
              model: 'mock-enrichment-v1',
              generated_at: '2026-08-09T12:00:00.000Z',
              source_context: {},
              confidence_json: {},
              evidence_status: 'evidence_backed',
              status: 'pending_review',
              created_at: '2026-08-09T12:00:00.000Z',
              updated_at: '2026-08-09T12:00:00.000Z',
            },
          ],
        },
        null,
        2,
      ),
    );
  });

  afterEach(() => {
    clearClaimsFile();
    restoreClaimsTests();
  });

  it('approveDraft creates claims then projects into metadata', async () => {
    const { approveDraft } = await import('../../../api/enrichment/_lib/draft-store.js');
    const { getActiveClaims } = await import('../../../api/enrichment/_lib/claims-store.js');
    const { getMetadata } = await import('../../../api/enrichment/_lib/enrichment-store.js');

    const editorPayload = {
      minRecommendedAge: 2,
      maxRecommendedAge: 10,
      ageNotes: 'All ages welcome',
      familyFacilities: {
        toilets: 'yes',
        babyChanging: 'unknown',
        parking: 'yes',
        cafe: 'no',
      },
      pushchairSuitability: 'good',
      environment: 'outdoor',
      energyLevel: 'high',
      visitDurationMinutes: 120,
      extendedTerrain: 'mostly_flat',
      accessibility: {},
      sendInfo: {},
    };

    const result = await approveDraft('fp-google-approve-test', editorPayload, 'editor@test');
    expect(result.draftId).toBe('draft-approve-1');

    const claims = await getActiveClaims('fp-google-approve-test');
    expect(claims.some((c) => c.fieldKey === 'familyFacilities.parking')).toBe(true);

    const metadata = await getMetadata('fp-google-approve-test');
    expect(metadata?.familyFacilities?.parking).toBe('yes');
    expect(metadata?.enrichmentStatus).toBe('enriched');
  });

  it('approveDraft does not create claims for fields absent from editor review form', async () => {
    const { approveDraft } = await import('../../../api/enrichment/_lib/draft-store.js');
    const { getActiveClaims } = await import('../../../api/enrichment/_lib/claims-store.js');

    const partialReview = {
      familyFacilities: { parking: 'yes' as const },
      environment: 'unknown' as const,
      energyLevel: 'unknown' as const,
      accessibility: {},
    };

    await approveDraft('fp-google-approve-test', partialReview, 'editor@test');

    const claims = await getActiveClaims('fp-google-approve-test');
    expect(claims.some((c) => c.fieldKey === 'familyFacilities.parking')).toBe(true);
    expect(claims.some((c) => c.fieldKey === 'familyFacilities.toilets')).toBe(false);
    expect(claims.some((c) => c.fieldKey === 'pushchairSuitability')).toBe(false);
  });
});


describe('editorial claim projection', () => {
  beforeEach(() => {
    isolateClaimsTests();
    clearClaimsFile();
  });

  afterEach(() => {
    clearClaimsFile();
    restoreClaimsTests();
  });

  it('projects reviewed visit duration and estimated spend from active claims', async () => {
    const { createClaimsFromApproval, rebuildMetadataPayloadFromClaims } = await import(
      '../../../api/enrichment/_lib/claims-store.js'
    );

    await createClaimsFromApproval({
      familypilotPlaceId: 'fp-editorial-projection',
      draftJson: SAMPLE_DRAFT,
      editorPayload: {
        visitDurationMinutes: 120,
        estimatedSpend: '££',
      },
      reviewedBy: 'editor@test',
      draftId: 'draft-editorial',
      checkedAt: '2026-08-09',
    });

    const payload = await rebuildMetadataPayloadFromClaims('fp-editorial-projection');
    expect(payload?.visitDurationMinutes).toBe(120);
    expect(payload?.estimatedSpend).toBe('££');
  });
});
