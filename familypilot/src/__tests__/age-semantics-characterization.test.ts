import { describe, expect, it } from 'vitest';

import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';
import { planVenue, PlanningFamily, PlanningOptions } from '@/src/services/planning/planner';
import { buildProactiveDayRequest } from '@/src/services/recommendation/proactive-day-request';
import { parseDayRequestMock } from '@/src/services/recommendation/parse-day-request-client';
import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { DayRequest, MatchableVenueFacts } from '@/src/types/day-request';
import { FamilyProfile, VenueDetail } from '@/src/types';
import { VenueFamilyMetadata } from '@/src/types/places';

/**
 * Characterization of the age semantics as they behave on f807b82, BEFORE P0-B1.
 *
 * Every expectation in this file describes behaviour we consider wrong. It exists so the P0-B1
 * diff shows exactly what changed rather than asserting the new behaviour in a vacuum. Each
 * block names the defect it pins.
 *
 * These are deliberately deleted/inverted by the same PR that fixes them — see
 * age-recommendation-semantics.test.ts for the replacement expectations.
 */

const now = new Date('2026-09-10T08:00:00');

const family: PlanningFamily = {
  id: 'a',
  label: 'Family A',
  area: 'Town',
  latitude: 51.6,
  longitude: -0.3,
  ages: [3, 0],
  maxDriveMinutes: 45,
  budgetTier: 'moderate',
  pushchair: true,
  required: ['babyChanging'],
  routines: [],
};

const options: PlanningOptions = {
  date: '2026-09-10',
  leaveAt: '09:00',
  returnBy: '',
  visitMinutes: 60,
  bufferMinutes: 15,
  environment: 'either',
};

const journeys = { a: { outbound: 20, inbound: 25, source: 'estimated' as const } };

const realMetadata: VenueFamilyMetadata = {
  familypilotPlaceId: 'fp-google-characterization',
  enrichmentStatus: 'enriched',
  familyFacilities: { toilets: 'yes', playground: 'yes', babyChanging: 'yes' },
  provenance: {},
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function realFacts(overrides: Partial<VenueFamilyMetadata> = {}): MatchableVenueFacts {
  return extractMatchableFacts(
    'fp-google-characterization',
    'Characterization Park',
    'park',
    20,
    'enriched',
    { ...realMetadata, ...overrides },
    undefined,
  );
}

const profile: FamilyProfile = {
  id: 'p',
  homeLocation: 'Town',
  latitude: 51.6,
  longitude: -0.3,
  maxDriveMinutes: 45,
  budgetTier: 'moderate',
  members: [
    { id: 'c1', name: 'Ada', role: 'child', age: 3 },
    { id: 'c2', name: 'Bo', role: 'child', age: 8 },
  ],
} as unknown as FamilyProfile;

describe('CHARACTERIZATION: recommended age currently acts as a hard prohibition', () => {
  it('planner rejects a venue outright when one child falls outside the recommended range', () => {
    // Defect: minRecommendedAge/maxRecommendedAge are *recommendations*, yet a child outside
    // them removes the venue from the plan entirely.
    expect(
      planVenue(realFacts({ minRecommendedAge: 5, maxRecommendedAge: 12 }), [family], journeys, options, now),
    ).toBeNull();
  });

  it('planner rejects on a lower bound alone', () => {
    expect(planVenue(realFacts({ minRecommendedAge: 2 }), [family], journeys, options, now)).toBeNull();
  });

  it('planner rejects on an upper bound alone', () => {
    expect(planVenue(realFacts({ maxRecommendedAge: 2 }), [family], journeys, options, now)).toBeNull();
  });
});

describe('CHARACTERIZATION: the multi-child overlap bug', () => {
  const request: DayRequest = {
    rawText: '',
    parsedAt: '',
    childAges: [2, 8],
    homeLocation: 'Town',
    budgetTier: 'moderate',
    maxDriveMinutes: 45,
    hasPushchair: false,
    constraints: { childAgeFit: { strength: 'preferred', value: 'in_range' } },
    context: {},
  };

  it('calls children aged 2 and 8 "suitable" against a recommended range of 5-12', () => {
    // Defect: the matcher compares oldest-vs-min and youngest-vs-max, so a range that suits
    // neither child individually passes because the *span* of the children overlaps it.
    const facts = realFacts({ minRecommendedAge: 5, maxRecommendedAge: 12 });
    const match = matchVenueToDayRequest(facts, request);
    const age = match.evaluations.find((e) => e.field === 'childAgeFit');
    expect(age?.outcome).toBe('suitable');
  });
});

describe('CHARACTERIZATION: producers force the recommendation to required', () => {
  it('client mock parser emits childAgeFit at required strength', () => {
    const parsed = parseDayRequestMock('somewhere indoors', profile);
    expect(parsed.constraints.childAgeFit).toEqual({ strength: 'required', value: 'in_range' });
  });

  it('proactive day request emits childAgeFit at required strength', () => {
    const parsed = buildProactiveDayRequest(profile, null, now);
    expect(parsed.constraints.childAgeFit).toEqual({ strength: 'required', value: 'in_range' });
  });

  it('server schema defaults childAgeFit to required when children exist', async () => {
    const { normaliseDayRequest } = await import('../../../server/recommendations/day-request-schema.js');
    const merged = normaliseDayRequest(
      { rawText: 'anything', constraints: {} },
      { members: [{ role: 'child', age: 3 }], homeLocation: 'Town', budgetTier: 'moderate', maxDriveMinutes: 45 },
    );
    expect(merged.constraints.childAgeFit).toEqual({ strength: 'required', value: 'in_range' });
  });

  it('server schema keeps an AI-supplied required strength', async () => {
    const { normaliseDayRequest } = await import('../../../server/recommendations/day-request-schema.js');
    const merged = normaliseDayRequest(
      { rawText: 'anything', constraints: { childAgeFit: { strength: 'required', value: 'in_range' } } },
      { members: [{ role: 'child', age: 3 }], homeLocation: 'Town', budgetTier: 'moderate', maxDriveMinutes: 45 },
    );
    expect(merged.constraints.childAgeFit.strength).toBe('required');
  });

  it('a required childAgeFit plus an unknown range makes the venue ineligible', () => {
    // Defect: required + unknown fails closed in applyConstraint, so a venue with no published
    // recommendation is dropped rather than simply being unknown.
    const request: DayRequest = {
      rawText: '',
      parsedAt: '',
      childAges: [3],
      homeLocation: 'Town',
      budgetTier: 'moderate',
      maxDriveMinutes: 45,
      hasPushchair: false,
      constraints: { childAgeFit: { strength: 'required', value: 'in_range' } },
      context: {},
    };
    expect(matchVenueToDayRequest(realFacts(), request).eligible).toBe(false);
  });
});

describe('CHARACTERIZATION: Family Match infers age suitability from venue category', () => {
  function venue(category: VenueDetail['category']): VenueDetail {
    return {
      familypilotId: 'v',
      externalId: 'v',
      provider: 'google',
      name: 'Category Venue',
      latitude: 51.6,
      longitude: -0.3,
      category,
      photos: [],
      provenance: {},
      fetchedAt: '2026-09-10',
      driveMinutes: 20,
      facilities: [],
      enrichmentStatus: 'enriched',
    } as unknown as VenueDetail;
  }

  it('derives the age score from the category string with no age evidence whatsoever', () => {
    // Same children, same absent age evidence: only the category differs, and it moves the score.
    const park = calculateFamilyScore(venue('park'), profile).factors.ageSuitability;
    const museum = calculateFamilyScore(venue('museum'), profile).factors.ageSuitability;
    const restaurant = calculateFamilyScore(venue('restaurant'), profile).factors.ageSuitability;

    expect(park).toBe(94); // clamp(85 + youngest*3)
    expect(museum).toBe(96); // clamp(88 + oldest)
    expect(restaurant).toBe(90); // clamp(82 + childCount*4)

    // Every one of them sits above the neutral 75 the rest of the scoring system uses for
    // "no evidence", so an unreviewed venue is scored as positively age-suitable.
    expect(Math.min(park, museum, restaurant)).toBeGreaterThan(75);
  });

  it('generates a "great age for this ..." explanation with no age evidence', () => {
    const soloProfile = {
      ...profile,
      members: [{ id: 'c1', name: 'Ada', role: 'child', age: 6 }],
    } as unknown as FamilyProfile;
    const result = calculateFamilyScore(venue('park'), soloProfile);
    expect(result.explanation.join(' | ')).toContain('is a great age for this park');
  });
});
