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
    vi.useFakeTimers({toFake:['Date']});
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    isolateFileStores();
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
  });

  it('returns null for ai_draft internal status', async () => {
    const placeId = 'fp-google-consumer-draft';
    writeMetadata(placeId, { enrichmentStatus: 'ai_draft' });

    const { createApprovedClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
    await createApprovedClaim({
      familypilotPlaceId: placeId,
      fieldKey: 'familyFacilities.parking',
      value: 'yes',
      fieldEvidence: {},
      reviewedBy: 'editor@test',
      draftId: null,
      checkedAt: '2026-08-10',
    });

    const { getConsumerMetadata } = await import('../../../server/enrichment/_lib/consumer-projection.js');
    const result = await getConsumerMetadata(placeId);
    expect(result).toBeNull();
  });

  it('returns null when metadata row exists but there are no active claims', async () => {
    const placeId = 'fp-google-consumer-stale';
    writeMetadata(placeId, { enrichmentStatus: 'enriched' });

    const { getConsumerMetadata } = await import('../../../server/enrichment/_lib/consumer-projection.js');
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

    const { createApprovedClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
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

    const { getConsumerMetadata } = await import('../../../server/enrichment/_lib/consumer-projection.js');
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

    const { createApprovedClaim, disputeClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
    const claim = await createApprovedClaim({
      familypilotPlaceId: placeId,
      fieldKey: 'familyFacilities.parking',
      value: 'yes',
      fieldEvidence: {},
      reviewedBy: 'editor@test',
      draftId: null,
      checkedAt: '2026-08-10',
    });
    await disputeClaim(claim!.id);

    const { getConsumerMetadata } = await import('../../../server/enrichment/_lib/consumer-projection.js');
    const result = await getConsumerMetadata(placeId);
    expect(result).toBeNull();
  });
});

describe('venue rules in the consumer projection', () => {
  beforeEach(() => {
    vi.useFakeTimers({toFake:['Date']});
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    isolateFileStores();
  });
  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
  });

  const rule = {
    kind: 'pushchair', scope: 'area', area: 'storytelling and play areas', coversCoreVisit: true,
    text: 'Pushchairs and buggies are not allowed in any storytelling or play area.',
  };
  const evidence = (key: string) => ({
    [key]: { confidence: 'high', sourceUrl: 'https://example.org/visit', evidence: 'Pushchairs and buggies are not allowed.', sourceType: 'official_website' },
  });
  const write = async (placeId: string, id: string, value: unknown, reviewedBy: string) => {
    const { createApprovedClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
    return createApprovedClaim({
      familypilotPlaceId: placeId, fieldKey: `rules.${id}`, value, fieldEvidence: evidence(`rules.${id}`),
      reviewedBy, draftId: null, checkedAt: '2026-08-10',
    });
  };

  it('attaches a person-approved rule, with its source and date, to the consumer metadata', async () => {
    const placeId = 'fp-google-rules-ok';
    writeMetadata(placeId, { enrichmentStatus: 'enriched' });
    await write(placeId, 'pushchair-play-areas', rule, 'human:alice');
    const { getConsumerMetadata } = await import('../../../server/enrichment/_lib/consumer-projection.js');
    const result = await getConsumerMetadata(placeId);
    expect(result?.rules).toEqual([{
      id: 'pushchair-play-areas', kind: 'pushchair', scope: 'area', area: 'storytelling and play areas', coversCoreVisit: true,
      text: rule.text, sourceUrl: 'https://example.org/visit', checkedAt: '2026-08-10',
    }]);
  });

  it('never projects a rule an automatic approver wrote, because a rule can refuse a date or a household', async () => {
    const placeId = 'fp-google-rules-auto';
    writeMetadata(placeId, { enrichmentStatus: 'enriched' });
    await write(placeId, 'pushchair-play-areas', rule, 'source_evidence_auto_v2');
    await write(placeId, 'closed-for-works', { kind: 'closure', scope: 'venue', from: '2026-08-20', until: '2026-08-21', text: 'Closed on 20 and 21 August.' }, 'enrichment-admin');
    const { getConsumerMetadata } = await import('../../../server/enrichment/_lib/consumer-projection.js');
    const result = await getConsumerMetadata(placeId);
    expect(result?.rules).toBeUndefined();
  });

  it('drops a malformed rule instead of half-applying it, and keeps the well-formed ones', async () => {
    const placeId = 'fp-google-rules-bad';
    writeMetadata(placeId, { enrichmentStatus: 'enriched' });
    await write(placeId, 'good', { kind: 'caution', scope: 'venue', text: 'Weekends can mean a queue to enter.' }, 'human:alice');
    await write(placeId, 'bad-kind', { kind: 'forbidden', scope: 'venue', text: 'Something very restrictive here.' }, 'human:alice');
    await write(placeId, 'bad-date', { kind: 'closure', scope: 'venue', from: '2026-13-40', text: 'Closed on a date that does not exist.' }, 'human:alice');
    await write(placeId, 'no-area', { kind: 'closure', scope: 'area', until: '2026-12-01', text: 'A gallery is closed for refurbishment.' }, 'human:alice');
    await write(placeId, 'too-short', { kind: 'caution', scope: 'venue', text: 'Busy' }, 'human:alice');
    const { getConsumerMetadata } = await import('../../../server/enrichment/_lib/consumer-projection.js');
    const result = await getConsumerMetadata(placeId);
    expect(result?.rules?.map((r: { id: string }) => r.id)).toEqual(['good']);
  });

  it('does not touch the persisted metadata row, which is what the write path and the editor see', async () => {
    const placeId = 'fp-google-rules-row';
    writeMetadata(placeId, { enrichmentStatus: 'enriched' });
    await write(placeId, 'pushchair-play-areas', rule, 'human:alice');
    const { projectActiveClaimsToPayload, metadataRowFromPayload, getActiveClaims } = await import('../../../server/enrichment/_lib/claims-store.js');
    const payload = projectActiveClaimsToPayload(await getActiveClaims(placeId));
    expect(Object.keys(payload)).not.toContain('rules');
    expect(JSON.stringify(metadataRowFromPayload(placeId, payload, { enrichmentStatus: 'enriched' }))).not.toContain('storytelling');
  });

  it('a venue with rules and no other claims still has consumer metadata, and a venue without rules is unchanged', async () => {
    const placeId = 'fp-google-rules-none';
    writeMetadata(placeId, { enrichmentStatus: 'enriched' });
    const { createApprovedClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
    await createApprovedClaim({ familypilotPlaceId: placeId, fieldKey: 'familyFacilities.parking', value: 'yes', fieldEvidence: {}, reviewedBy: 'editor@test', draftId: null, checkedAt: '2026-08-10' });
    const { getConsumerMetadata } = await import('../../../server/enrichment/_lib/consumer-projection.js');
    const result = await getConsumerMetadata(placeId);
    expect(result?.familyFacilities?.parking).toBe('yes');
    expect('rules' in (result ?? {})).toBe(false);
  });
});

describe('official hours in the consumer projection', () => {
  beforeEach(() => {
    vi.useFakeTimers({toFake:['Date']});
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    isolateFileStores();
  });
  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
  });
  const write = async (placeId: string, id: string, value: unknown, reviewedBy: string) => {
    const { createApprovedClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
    return createApprovedClaim({
      familypilotPlaceId: placeId, fieldKey: `hours.${id}`, value,
      fieldEvidence: { [`hours.${id}`]: { confidence: 'high', sourceUrl: 'https://example.org/visit', evidence: 'Open daily 10am to 4pm.', sourceType: 'official_website' } },
      reviewedBy, draftId: null, checkedAt: '2026-08-10',
    });
  };
  const winter = { scope: 'venue', days: [0, 1, 2, 3, 4, 5, 6], open: '10:00', close: '16:00', from: '2026-10-24', until: '2027-02-12', lastEntry: '15:00' };

  it('projects a person-approved reading, with its season and source', async () => {
    const placeId = 'fp-google-hours-ok';
    writeMetadata(placeId, { enrichmentStatus: 'enriched' });
    await write(placeId, 'winter', winter, 'human:alice');
    const { getConsumerMetadata } = await import('../../../server/enrichment/_lib/consumer-projection.js');
    const result = await getConsumerMetadata(placeId);
    expect(result?.officialHours).toEqual([{
      id: 'winter', scope: 'venue', days: [0, 1, 2, 3, 4, 5, 6], open: '10:00', close: '16:00', from: '2026-10-24', until: '2027-02-12',
      lastEntry: '15:00', sourceUrl: 'https://example.org/visit', checkedAt: '2026-08-10',
    }]);
  });

  it('never projects one an automatic approver wrote, and drops a malformed one', async () => {
    const placeId = 'fp-google-hours-bad';
    writeMetadata(placeId, { enrichmentStatus: 'enriched' });
    await write(placeId, 'auto', winter, 'source_evidence_auto_v2');
    await write(placeId, 'bad-clock', { ...winter, open: '25:99' }, 'human:alice');
    await write(placeId, 'no-text', { ...winter, close: null }, 'human:alice');
    await write(placeId, 'good-dusk', { scope: 'venue', days: [1], open: '07:00', close: null, closeText: 'dusk' }, 'human:alice');
    const { getConsumerMetadata } = await import('../../../server/enrichment/_lib/consumer-projection.js');
    const result = await getConsumerMetadata(placeId);
    expect(result?.officialHours?.map((r: { id: string }) => r.id)).toEqual(['good-dusk']);
    expect(result?.officialHours?.[0].closeText).toBe('dusk');
  });
});

describe('attachTrustFields', () => {
  it('copies trust metadata without adding family suitability fields', async () => {
    const { attachTrustFields } = await import('../../../server/enrichment/_lib/consumer-projection.js');
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
