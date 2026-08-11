import { describe, expect, it } from 'vitest';

import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import {
  hasTrustedMatchSignals,
  scoreTrustedAgeSuitability,
  scoreTrustedFacilitiesMatch,
} from '@/src/services/scoring/trusted-family-score';
import { FamilyProfile, VenueDetail } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';

const PROFILE: FamilyProfile = {
  id: 'p1',
  parentName: 'Parent',
  homeLocation: 'Bushey',
  maxDriveMinutes: 30,
  budgetTier: 'moderate',
  completionPercent: 100,
  members: [
    { id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2020-01-01', age: 5 },
    { id: 'c2', name: 'Leo', role: 'child', dateOfBirth: '2022-01-01', age: 3 },
  ],
  pushchair: 'yes',
};

const BASE_FACTS: MatchableVenueFacts = {
  placeId: 'fp-google-trusted',
  name: 'Trusted Park',
  category: 'park',
  driveMinutes: 12,
  enrichmentStatus: 'enriched',
  minRecommendedAge: 2,
  maxRecommendedAge: 10,
  toilets: 'yes',
  babyChanging: 'yes',
  parking: 'yes',
  freeParking: 'yes',
  pushchairSuitability: 'good',
  environment: 'outdoor',
  energyLevel: 'moderate',
  visitDurationMinutes: 120,
  estimatedSpend: '£',
  goodToKnow: [],
  warnings: [],
};

function venueWithFacts(facts: MatchableVenueFacts, overrides: Partial<VenueDetail> = {}): VenueDetail {
  return {
    id: facts.placeId,
    name: facts.name,
    category: facts.category as VenueDetail['category'],
    latitude: 51.64,
    longitude: -0.36,
    driveMinutes: facts.driveMinutes,
    imageUrl: '',
    familyScore: { score: 0, factors: {} as never, explanation: [] },
    photos: [],
    facilities: ['toilets', 'parking', 'baby_changing'],
    openingHours: '9-5',
    terrain: 'flat',
    bestAges: '2 – 10 years',
    description: 'Trusted venue',
    enrichmentStatus: 'enriched',
    trustedFacts: facts,
    ...overrides,
  };
}

describe('trusted family score helpers', () => {
  it('detects when trusted facts contain match signals', () => {
    expect(hasTrustedMatchSignals(BASE_FACTS)).toBe(true);
    expect(
      hasTrustedMatchSignals({
        ...BASE_FACTS,
        minRecommendedAge: null,
        maxRecommendedAge: null,
        toilets: 'unknown',
        babyChanging: 'unknown',
        parking: 'unknown',
        freeParking: 'unknown',
        pushchairSuitability: 'unknown',
        environment: 'unknown',
        energyLevel: 'unknown',
        estimatedSpend: null,
      }),
    ).toBe(false);
  });

  it('scores age suitability from reviewed age range', () => {
    expect(scoreTrustedAgeSuitability(BASE_FACTS, [5, 3])).toBe(96);
    expect(scoreTrustedAgeSuitability(BASE_FACTS, [12])).toBe(42);
  });

  it('scores facilities from confirmed tri-state facts', () => {
    const score = scoreTrustedFacilitiesMatch(BASE_FACTS, PROFILE);
    expect(score).toBeGreaterThan(85);
    const noParking = scoreTrustedFacilitiesMatch({ ...BASE_FACTS, parking: 'no', freeParking: 'no' }, PROFILE);
    expect(noParking).toBeLessThan(score!);
  });
});

describe('calculateFamilyScore with trusted facts', () => {
  it('uses reviewed age range instead of category guess', () => {
    const trusted = venueWithFacts(BASE_FACTS);
    const mismatchedAge = venueWithFacts({ ...BASE_FACTS, minRecommendedAge: 8, maxRecommendedAge: 14 });
    const heuristicOnly: VenueDetail = {
      ...trusted,
      trustedFacts: undefined,
      category: 'park',
    };

    const trustedScore = calculateFamilyScore(trusted, PROFILE);
    const mismatchScore = calculateFamilyScore(mismatchedAge, PROFILE);
    const heuristicScore = calculateFamilyScore(heuristicOnly, PROFILE);

    expect(trustedScore.explanation.some((line) => line.includes('Recommended for ages 2–10'))).toBe(true);
    expect(mismatchScore.score).toBeLessThan(trustedScore.score);
    expect(trustedScore.score).not.toBe(heuristicScore.score);
  });

  it('explains confirmed facilities rather than category inference', () => {
    const score = calculateFamilyScore(venueWithFacts(BASE_FACTS), PROFILE);
    expect(score.explanation.some((line) => line.includes('Free parking confirmed'))).toBe(true);
    expect(score.explanation.some((line) => line.includes('baby changing confirmed'))).toBe(true);
  });

  it('still caps provider-only venues', () => {
    const score = calculateFamilyScore(
      venueWithFacts({ ...BASE_FACTS, enrichmentStatus: 'provider_only' }, { enrichmentStatus: 'provider_only' }),
      PROFILE,
      { enrichmentStatus: 'provider_only' },
    );
    expect(score.score).toBeLessThanOrEqual(65);
    expect(score.explanation[0]).toContain('not yet been reviewed');
  });
});
