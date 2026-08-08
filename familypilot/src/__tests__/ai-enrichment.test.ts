import { describe, expect, it } from 'vitest';

import { PROVIDER_ONLY_FAMILY_MATCH_CAP } from '@/src/constants/places-quality';
import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { mergePlaceToVenueDetail } from '@/src/services/places/merge-place';
import { FamilyProfile, VenueDetail } from '@/src/types';
import { ExternalPlaceRecord } from '@/src/types/places';
import { VenueEnrichmentDraftJson } from '@/src/types/ai-enrichment';

import { draftJsonToSavePayload } from '../../server/enrichment/ai-draft-mapper';
import { getMatchClassification } from '@/src/utils/family-match-classification';
import {
  deriveEnrichmentStatusFromRecord,
  toConsumerEnrichmentStatus,
} from '@/src/utils/enrichment-rules';
import { draftJsonToReviewForm } from '@/src/utils/ai-draft-review';

const PROFILE: FamilyProfile = {
  id: 'p1',
  parentName: 'Parent',
  homeLocation: 'Bushey',
  maxDriveMinutes: 30,
  budgetTier: 'moderate',
  completionPercent: 100,
  members: [{ id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2020-01-01', age: 5 }],
};

const SAMPLE_DRAFT: VenueEnrichmentDraftJson = {
  recommendedAge: { min: null, max: null, notes: 'Confirm on site', confidence: 'low' },
  familyFacilities: {
    toilets: { value: 'unknown', confidence: 'unknown', reason: null },
    babyChanging: { value: 'unknown', confidence: 'unknown', reason: null },
    parking: { value: 'unknown', confidence: 'unknown', reason: null },
    cafe: { value: 'unknown', confidence: 'unknown', reason: null },
  },
  pushchairSuitability: { value: 'unknown', confidence: 'unknown', reason: null },
  terrain: { value: 'unknown', confidence: 'unknown', reason: null },
  accessibility: {},
  sendInfo: {},
  whyFamiliesLike: ['May suit families visiting the area.'],
  goodToKnow: ['AI draft — review required.'],
  suggestedVisitDuration: null,
  rainyDaySuitability: 'unknown',
  overallDraftConfidence: 'low',
};

describe('AI draft schema mapping', () => {
  it('maps draft to save payload with ai_assisted provenance', () => {
    const payload = draftJsonToSavePayload(SAMPLE_DRAFT, {
      model: 'mock-enrichment-v1',
      approvedAt: '2026-08-07T12:00:00.000Z',
      reviewedBy: 'editor@test',
    });
    expect(payload.enrichmentProvenance?.sourceType).toBe('ai_assisted');
    expect(payload.familyFacilities?.toilets).toBe('unknown');
    expect(payload.requestedStatus).toBe('enriched');
  });

  it('pre-fills review form without inventing facilities', () => {
    const form = draftJsonToReviewForm(SAMPLE_DRAFT);
    expect(form.familyFacilities?.toilets).toBe('unknown');
    expect(form.familyFacilities?.babyChanging).toBe('unknown');
  });
});

describe('ai_draft consumer behaviour', () => {
  it('treats ai_draft as provider_only for Family Match', () => {
    expect(toConsumerEnrichmentStatus('ai_draft')).toBe('provider_only');
    expect(getMatchClassification(90, 'ai_draft')).toBe('Potential match');
  });

  it('caps Family Match for ai_draft venues', () => {
    const venue: VenueDetail = {
      id: 'fp-google-x',
      name: 'Draft Park',
      category: 'park',
      latitude: 51.64,
      longitude: -0.36,
      driveMinutes: 10,
      imageUrl: '',
      familyScore: { score: 0, factors: {} as never, explanation: [] },
      photos: [],
      facilities: ['toilets'],
      openingHours: '9-5',
      bestAges: '2 – 8 years',
      description: 'Should not trust draft fields',
      enrichmentStatus: 'provider_only',
    };
    const score = calculateFamilyScore(venue, PROFILE, { enrichmentStatus: 'ai_draft' });
    expect(score.score).toBeLessThanOrEqual(PROVIDER_ONLY_FAMILY_MATCH_CAP);
  });

  it('does not merge ai_draft metadata into consumer venue detail', () => {
    const place: ExternalPlaceRecord = {
      familypilotId: 'fp-google-x',
      externalId: 'google:x',
      provider: 'google',
      name: 'Draft Zoo',
      latitude: 51.64,
      longitude: -0.36,
      category: 'zoo',
      photos: [],
      provenance: {},
      fetchedAt: '2026-08-07T00:00:00.000Z',
    };
    const detail = mergePlaceToVenueDetail(
      place,
      {
        familypilotPlaceId: 'fp-google-x',
        enrichmentStatus: 'ai_draft',
        bestAges: '2 – 8 years',
        facilities: ['toilets'],
        provenance: {},
        updatedAt: '2026-08-07',
      },
      51.64,
      -0.36,
    );
    expect(detail.enrichmentStatus).toBe('provider_only');
    expect(detail.bestAges).toBeUndefined();
    expect(detail.facilities).toEqual([]);
  });
});

describe('ai_draft status derivation', () => {
  it('returns ai_draft from metadata record', () => {
    expect(
      deriveEnrichmentStatusFromRecord({
        familypilotPlaceId: 'x',
        enrichmentStatus: 'ai_draft',
        provenance: {},
        updatedAt: '2026-01-01',
      }),
    ).toBe('ai_draft');
  });
});

describe('AI draft schema validation (server mirror)', () => {
  it('rejects non-object AI output', async () => {
    const { normaliseDraftJson } = await import('../../../api/enrichment/_lib/ai-draft-schema.js');
    expect(() => normaliseDraftJson(null)).toThrow();
    expect(() => normaliseDraftJson('string')).toThrow();
  });

  it('normalises missing fields to unknown', async () => {
    const { normaliseDraftJson } = await import('../../../api/enrichment/_lib/ai-draft-schema.js');
    const draft = normaliseDraftJson({
      recommendedAge: {},
      familyFacilities: {},
      pushchairSuitability: {},
      terrain: {},
      overallDraftConfidence: 'invalid',
    });
    expect(draft.familyFacilities.toilets.value).toBe('unknown');
    expect(draft.overallDraftConfidence).toBe('unknown');
  });
});

describe('mock AI provider', () => {
  it('generates draft without inventing toilets', async () => {
    const { generateMockDraft } = await import('../../../api/enrichment/_lib/ai-provider.js');
    const result = generateMockDraft({
      familypilotPlaceId: 'fp-google-test',
      name: 'Hanwell Zoo',
      category: 'zoo',
    });
    expect(result.draftJson.familyFacilities.toilets.value).toBe('unknown');
    expect(result.model).toBe('mock-enrichment-v2');
  });
});
