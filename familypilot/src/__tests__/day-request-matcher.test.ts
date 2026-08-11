import { describe, expect, it } from 'vitest';

import { MatchableVenueFacts } from '@/src/types/day-request';
import { DayRequest } from '@/src/types/day-request';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { matchVenueToDayRequest, rankVenueMatches } from '@/src/services/matching/day-request-matcher';
import { VenueFamilyMetadata } from '@/src/types/places';

const BASE_REQUEST: DayRequest = {
  rawText: 'Indoor, pushchair-friendly, parking',
  parsedAt: '2026-08-09T12:00:00.000Z',
  childAges: [3, 1],
  homeLocation: 'Bushey',
  budgetTier: 'moderate',
  maxDriveMinutes: 30,
  hasPushchair: true,
  constraints: {
    childAgeFit: { strength: 'required', value: 'in_range' },
    environment: { strength: 'required', value: 'indoor' },
    pushchair: { strength: 'required', value: 'not_difficult' },
    parking: { strength: 'required', value: 'yes' },
    journey: { strength: 'required', value: { maxMinutes: 30 } },
  },
  context: {},
};

function enrichedFacts(overrides: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts {
  return {
    placeId: 'fp-google-test',
    name: 'Test Museum',
    category: 'museum',
    driveMinutes: 20,
    enrichmentStatus: 'enriched',
    minRecommendedAge: 2,
    maxRecommendedAge: 10,
    toilets: 'yes',
    babyChanging: 'yes',
    parking: 'yes',
    pushchairSuitability: 'good',
    environment: 'indoor',
    energyLevel: 'moderate',
    visitDurationMinutes: 120,
    estimatedSpend: '£8–£12',
    goodToKnow: [],
    warnings: [],
    ...overrides,
  };
}

describe('extractMatchableFacts', () => {
  it('returns unknown facts for provider-only venues without category inference', () => {
    const facts = extractMatchableFacts(
      'fp-google-x',
      'Mystery Park',
      'park',
      15,
      'provider_only',
      null,
    );
    expect(facts.environment).toBe('unknown');
    expect(facts.energyLevel).toBe('unknown');
    expect(facts.toilets).toBe('unknown');
  });

  it('reads trusted environment and energyLevel from metadata', () => {
    const metadata: VenueFamilyMetadata = {
      familypilotPlaceId: 'fp-google-x',
      enrichmentStatus: 'enriched',
      environment: 'indoor',
      energyLevel: 'high',
      familyFacilities: { parking: 'yes', toilets: 'yes' },
      pushchairSuitability: 'good',
      provenance: {},
      updatedAt: '2026-08-09',
    };
    const facts = extractMatchableFacts(
      'fp-google-x',
      'Adventure Zone',
      'playground',
      12,
      'enriched',
      metadata,
    );
    expect(facts.environment).toBe('indoor');
    expect(facts.energyLevel).toBe('high');
    expect(facts.parking).toBe('yes');
  });
});

describe('day-request matcher', () => {
  it('excludes when required indoor but environment unknown', () => {
    const match = matchVenueToDayRequest(
      enrichedFacts({ environment: 'unknown' }),
      BASE_REQUEST,
    );
    expect(match.eligible).toBe(false);
  });

  it('excludes when required indoor but environment outdoor — not category', () => {
    const match = matchVenueToDayRequest(
      enrichedFacts({ environment: 'outdoor', category: 'museum' }),
      BASE_REQUEST,
    );
    expect(match.eligible).toBe(false);
  });

  it('allows mixed environment for indoor request', () => {
    const match = matchVenueToDayRequest(
      enrichedFacts({ environment: 'mixed' }),
      BASE_REQUEST,
    );
    expect(match.eligible).toBe(true);
  });

  it('uses trusted energyLevel not category for energy matching', () => {
    const request: DayRequest = {
      ...BASE_REQUEST,
      constraints: {
        ...BASE_REQUEST.constraints,
        environment: undefined,
        energyLevel: { strength: 'required', value: 'high' },
      },
    };
    const lowEnergy = matchVenueToDayRequest(
      enrichedFacts({ energyLevel: 'low', category: 'playground' }),
      request,
    );
    expect(lowEnergy.eligible).toBe(false);

    const highEnergy = matchVenueToDayRequest(
      enrichedFacts({ energyLevel: 'high', category: 'museum' }),
      request,
    );
    expect(highEnergy.eligible).toBe(true);
  });

  it('treats unknown parking as exclude when parking required', () => {
    const match = matchVenueToDayRequest(
      enrichedFacts({ parking: 'unknown' }),
      BASE_REQUEST,
    );
    expect(match.eligible).toBe(false);
  });

  it('keeps yes, no, and unknown distinct for facilities', () => {
    const toiletsRequired: DayRequest = {
      ...BASE_REQUEST,
      constraints: {
        journey: BASE_REQUEST.constraints.journey,
        childAgeFit: BASE_REQUEST.constraints.childAgeFit,
        toilets: { strength: 'required', value: 'yes' },
      },
    };
    expect(matchVenueToDayRequest(enrichedFacts({ toilets: 'yes' }), toiletsRequired).eligible).toBe(
      true,
    );
    expect(matchVenueToDayRequest(enrichedFacts({ toilets: 'no' }), toiletsRequired).eligible).toBe(
      false,
    );
    expect(
      matchVenueToDayRequest(enrichedFacts({ toilets: 'unknown' }), toiletsRequired).eligible,
    ).toBe(false);
  });

  it('returns at most three ranked recommendations', () => {
    const venues = [
      enrichedFacts({ placeId: 'a', driveMinutes: 10, environment: 'indoor' }),
      enrichedFacts({ placeId: 'b', driveMinutes: 15, environment: 'indoor' }),
      enrichedFacts({ placeId: 'c', driveMinutes: 20, environment: 'indoor' }),
      enrichedFacts({ placeId: 'd', driveMinutes: 25, environment: 'indoor' }),
    ];
    const ranked = rankVenueMatches(venues, BASE_REQUEST);
    expect(ranked.length).toBeLessThanOrEqual(3);
    expect(ranked.every((r) => r.match.eligible)).toBe(true);
  });

  it('prefers verified venues over provider-only when fit is equal', () => {
    const profile = {
      members: [
        { role: 'child', age: 3 },
        { role: 'child', age: 1 },
      ],
      pushchair: 'Bugaboo',
      maxDriveMinutes: 30,
      budgetTier: 'moderate' as const,
      homeLocation: 'Bushey',
    };

    const verified = enrichedFacts({
      placeId: 'verified',
      enrichmentStatus: 'verified',
      pushchairSuitability: 'excellent',
    });
    const providerOnly = enrichedFacts({
      placeId: 'provider',
      enrichmentStatus: 'provider_only',
      minRecommendedAge: null,
      maxRecommendedAge: null,
      toilets: 'unknown',
      babyChanging: 'unknown',
      parking: 'unknown',
      pushchairSuitability: 'unknown',
      environment: 'unknown',
      energyLevel: 'unknown',
      visitDurationMinutes: null,
      estimatedSpend: null,
    });

    const relaxedRequest: DayRequest = {
      ...BASE_REQUEST,
      constraints: {
        journey: { strength: 'required', value: { maxMinutes: 30 } },
      },
    };

    const ranked = rankVenueMatches([providerOnly, verified], relaxedRequest, profile as never);
    expect(ranked[0]?.facts.placeId).toBe('verified');
  });
});

describe('day-request schema guard', () => {
  it('rejects parsed output that includes venue IDs', async () => {
    const { normaliseDayRequest } = await import('../../../api/recommendations/day-request-schema.js');
    expect(() =>
      normaliseDayRequest({ venueId: 'fp-google-x', constraints: {} }, {
        members: [{ role: 'child', age: 3 }],
        maxDriveMinutes: 30,
        budgetTier: 'moderate',
        homeLocation: 'Bushey',
      }),
    ).toThrow(/must not include venue/i);
  });
});
