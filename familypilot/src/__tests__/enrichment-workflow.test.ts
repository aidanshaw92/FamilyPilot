import { describe, expect, it } from 'vitest';

import { PROVIDER_ONLY_FAMILY_MATCH_CAP } from '@/src/constants/places-quality';
import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { EnrichmentSavePayload } from '@/src/types/enrichment';
import { FamilyProfile, VenueDetail } from '@/src/types';

import {
  deriveEnrichmentStatusFromRecord,
  facilitiesFromTriState,
  hasMeaningfulEnrichmentContent,
  resolveEnrichmentStatus,
  validateVerifiedRequirements,
} from '@/src/utils/enrichment-rules';

const PROFILE: FamilyProfile = {
  id: 'p1',
  parentName: 'Parent',
  homeLocation: 'Bushey',
  maxDriveMinutes: 30,
  budgetTier: 'moderate',
  completionPercent: 100,
  members: [{ id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2020-01-01', age: 5 }],
};

const BASE_PAYLOAD: EnrichmentSavePayload = {
  categoryConfirmed: 'yes',
  minRecommendedAge: 2,
  maxRecommendedAge: 10,
  familyFacilities: {
    toilets: 'yes',
    babyChanging: 'unknown',
    parking: 'yes',
  },
  pushchairSuitability: 'good',
  extendedTerrain: 'mostly_flat',
  lastChecked: new Date().toISOString().slice(0, 10),
  enrichmentProvenance: {
    sourceType: 'official_website',
    checkedDate: new Date().toISOString().slice(0, 10),
  },
};

describe('enrichment state transitions', () => {
  it('transitions provider_only to enriched when content added', () => {
    expect(hasMeaningfulEnrichmentContent(null)).toBe(false);
    expect(resolveEnrichmentStatus({ goodToKnow: ['Test'] }, null)).toBe('enriched');
  });

  it('blocks verified when requirements missing', () => {
    expect(() =>
      resolveEnrichmentStatus({ requestedStatus: 'verified', goodToKnow: ['x'] }, null),
    ).toThrow(/Cannot mark verified/);
  });

  it('allows verified when requirements satisfied', () => {
    expect(resolveEnrichmentStatus({ ...BASE_PAYLOAD, requestedStatus: 'verified' }, null)).toBe(
      'verified',
    );
  });

  it('treats unknown as distinct from false in facilities', () => {
    const facilities = facilitiesFromTriState({
      toilets: 'unknown',
      babyChanging: 'no',
      parking: 'yes',
    });
    expect(facilities).toContain('parking');
    expect(facilities).not.toContain('toilets');
    expect(facilities).not.toContain('baby_changing');
  });
});

describe('verification requirements', () => {
  it('requires provenance for verified', () => {
    const result = validateVerifiedRequirements({
      ...BASE_PAYLOAD,
      enrichmentProvenance: undefined,
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('provenance');
  });

  it('requires core fields including age suitability', () => {
    const result = validateVerifiedRequirements({
      ...BASE_PAYLOAD,
      minRecommendedAge: undefined,
      maxRecommendedAge: undefined,
      ageNotes: undefined,
      bestAges: undefined,
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('ageSuitability');
  });
});

describe('Family Match integration', () => {
  const enrichedVenue: VenueDetail = {
    id: 'fp-google-x',
    name: 'Enriched Park',
    category: 'park',
    latitude: 51.64,
    longitude: -0.36,
    driveMinutes: 10,
    imageUrl: '',
    familyScore: { score: 0, factors: {} as never, explanation: [] },
    photos: [],
    facilities: ['toilets', 'parking'],
    openingHours: '9-5',
    terrain: 'flat',
    bestAges: '2 – 8 years',
    description: 'Enriched',
    enrichmentStatus: 'enriched',
  };

  it('removes provider-only cap for enriched venues', () => {
    const score = calculateFamilyScore(enrichedVenue, PROFILE, { enrichmentStatus: 'enriched' });
    expect(score.score).toBeGreaterThan(PROVIDER_ONLY_FAMILY_MATCH_CAP);
  });

  it('verified does not automatically mean excellent match', () => {
    const poorFit: VenueDetail = {
      ...enrichedVenue,
      driveMinutes: 55,
      enrichmentStatus: 'verified',
    };
    const score = calculateFamilyScore(poorFit, PROFILE, { enrichmentStatus: 'verified' });
    expect(score.score).toBeLessThan(90);
  });
});

describe('deriveEnrichmentStatusFromRecord', () => {
  it('returns provider_only without metadata', () => {
    expect(deriveEnrichmentStatusFromRecord(null)).toBe('provider_only');
  });

  it('returns enriched for partial metadata', () => {
    expect(
      deriveEnrichmentStatusFromRecord({
        familypilotPlaceId: 'x',
        goodToKnow: ['Busy at weekends'],
        provenance: {},
        updatedAt: '2026-01-01',
      }),
    ).toBe('enriched');
  });
});
