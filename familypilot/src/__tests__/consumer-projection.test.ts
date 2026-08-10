import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const CLAIMS_PATH = path.join(process.cwd(), '.data', 'venue-claims.json');
const STORE_PATH = path.join(process.cwd(), '.data', 'enrichment-store.json');

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
}

function restoreEnv() {
  if (savedSupabaseUrl !== undefined) process.env.SUPABASE_URL = savedSupabaseUrl;
  else delete process.env.SUPABASE_URL;
  if (savedSupabaseKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedSupabaseKey;
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.resetModules();
}

function writeMetadata(placeId: string, metadata: Record<string, unknown>) {
  fs.writeFileSync(
    STORE_PATH,
    JSON.stringify(
      {
        places: {},
        metadata: {
          [placeId]: {
            familypilot_place_id: placeId,
            enrichment_status: metadata.enrichmentStatus ?? 'enriched',
            best_ages: metadata.bestAges ?? null,
            min_recommended_age: metadata.minRecommendedAge ?? null,
            max_recommended_age: metadata.maxRecommendedAge ?? null,
            age_notes: metadata.ageNotes ?? null,
            terrain: metadata.terrain ?? null,
            extended_terrain: metadata.extendedTerrain ?? null,
            terrain_notes: metadata.terrainNotes ?? null,
            path_surface: metadata.pathSurface ?? null,
            facilities: metadata.facilities ?? ['toilets', 'parking', 'cafe'],
            family_facilities: metadata.familyFacilities ?? {
              toilets: 'yes',
              parking: 'yes',
              cafe: 'yes',
            },
            parking_info: metadata.parkingInfo ?? 'Large free car park',
            visit_duration_minutes: metadata.visitDurationMinutes ?? 120,
            warnings: metadata.warnings ?? ['Bring a coat'],
            good_to_know: metadata.goodToKnow ?? ['Book ahead'],
            why_families_like: metadata.whyFamiliesLike ?? ['Great day out'],
            estimated_spend: metadata.estimatedSpend ?? '££',
            pushchair_suitability: metadata.pushchairSuitability ?? 'good',
            environment: metadata.environment ?? 'outdoor',
            energy_level: metadata.energy_level ?? 'high',
            accessibility: metadata.accessibility ?? {},
            send_info: metadata.sendInfo ?? {},
            family_notes: metadata.familyNotes ?? 'Lovely venue',
            category_confirmed: metadata.categoryConfirmed ?? null,
            enrichment_provenance: metadata.enrichmentProvenance ?? {
              sourceType: 'official_website',
              checkedDate: '2026-08-01',
            },
            last_checked: metadata.lastChecked ?? '2026-08-01',
            checked_by: metadata.checkedBy ?? 'editor@test',
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

describe('consumer metadata projection', () => {
  beforeEach(() => {
    isolateFileStores();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('returns null for ai_draft internal status', async () => {
    const placeId = 'fp-google-consumer-draft';
    writeMetadata(placeId, { enrichmentStatus: 'ai_draft' });

    const { createApprovedClaim } = await import('../../../api/enrichment/_lib/claims-store.js');
    await createApprovedClaim({
      familypilotPlaceId: placeId,
      fieldKey: 'familyFacilities.parking',
      value: 'yes',
      fieldEvidence: {},
      reviewedBy: 'editor@test',
      draftId: null,
      checkedAt: '2026-08-10',
    });

    const { getConsumerMetadata } = await import('../../../api/enrichment/_lib/consumer-projection.js');
    const result = await getConsumerMetadata(placeId);
    expect(result).toBeNull();
  });

  it('returns null when metadata row exists but there are no active claims', async () => {
    const placeId = 'fp-google-consumer-stale';
    writeMetadata(placeId, { enrichmentStatus: 'enriched' });

    const { getConsumerMetadata } = await import('../../../api/enrichment/_lib/consumer-projection.js');
    const result = await getConsumerMetadata(placeId);
    expect(result).toBeNull();
  });

  it('projects only active claim fields and drops stale metadata columns', async () => {
    const placeId = 'fp-google-consumer-project';
    writeMetadata(placeId, {
      enrichmentStatus: 'enriched',
      familyFacilities: { toilets: 'yes', parking: 'yes', cafe: 'yes' },
      facilities: ['toilets', 'parking', 'cafe'],
      parkingInfo: 'Should not leak without claim',
      goodToKnow: ['Should not leak'],
    });

    const { createApprovedClaim } = await import('../../../api/enrichment/_lib/claims-store.js');
    await createApprovedClaim({
      familypilotPlaceId: placeId,
      fieldKey: 'familyFacilities.parking',
      value: 'yes',
      fieldEvidence: {
        parking: {
          confidence: 'high',
          sourceUrl: 'https://example.org/parking',
          evidence: 'Free parking available.',
          sourceType: 'official_website',
        },
      },
      reviewedBy: 'editor@test',
      draftId: 'draft-1',
      checkedAt: '2026-08-10',
    });

    const { getConsumerMetadata } = await import('../../../api/enrichment/_lib/consumer-projection.js');
    const result = await getConsumerMetadata(placeId);

    expect(result).not.toBeNull();
    expect(result?.enrichmentStatus).toBe('enriched');
    expect(result?.familyFacilities?.parking).toBe('yes');
    expect(result?.familyFacilities?.toilets).toBeUndefined();
    expect(result?.facilities).toEqual(['parking']);
    expect(result?.parkingInfo).toBeNull();
    expect(result?.goodToKnow).toEqual([]);
    expect(result?.lastChecked).toBe('2026-08-01');
  });

  it('excludes disputed claims from consumer projection', async () => {
    const placeId = 'fp-google-consumer-disputed';
    writeMetadata(placeId, { enrichmentStatus: 'enriched' });

    const { createApprovedClaim, disputeClaim } = await import('../../../api/enrichment/_lib/claims-store.js');
    const claim = await createApprovedClaim({
      familypilotPlaceId: placeId,
      fieldKey: 'familyFacilities.parking',
      value: 'yes',
      fieldEvidence: {},
      reviewedBy: 'editor@test',
      draftId: null,
      checkedAt: '2026-08-10',
    });
    await disputeClaim(claim.id);

    const { getConsumerMetadata } = await import('../../../api/enrichment/_lib/consumer-projection.js');
    const result = await getConsumerMetadata(placeId);
    expect(result).toBeNull();
  });
});

describe('attachTrustFields', () => {
  it('copies trust metadata without adding family suitability fields', async () => {
    const { attachTrustFields } = await import('../../../api/enrichment/_lib/consumer-projection.js');
    const payload = attachTrustFields(
      { familyFacilities: { parking: 'yes' } },
      {
        lastChecked: '2026-08-01',
        checkedBy: 'editor@test',
        enrichmentProvenance: { sourceType: 'official_website' },
        familyNotes: 'must not copy',
      },
    );

    expect(payload.lastChecked).toBe('2026-08-01');
    expect(payload.checkedBy).toBe('editor@test');
    expect(payload.enrichmentProvenance).toEqual({ sourceType: 'official_website' });
    expect(payload.familyNotes).toBeUndefined();
  });
});
