import { describe, expect, it } from 'vitest';

import {
  childIsAdmitted,
  describeAgeAdmission,
  evaluateAgeAdmission,
} from '@/src/services/matching/age-admission';
import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';
import { DayRequest, MatchableVenueFacts, VenueAgeRestriction } from '@/src/types/day-request';

/**
 * P0-B2, matcher half: what a projected venue restriction does once it reaches the matcher.
 *
 * Everything arriving here is already trusted, in-lifetime, venue-scoped and non-conflicted —
 * age-policy.test.ts covers which claims earn that. This file covers the two rules the matcher
 * itself must hold: unknown never excludes, and any prohibited child excludes the family.
 */

function restriction(
  min: number | null,
  max: number | null,
  overrides: Partial<VenueAgeRestriction> = {},
): VenueAgeRestriction {
  return {
    minMonthsInclusive: min,
    maxMonthsExclusive: max,
    sourceUrl: 'https://venue.example/visit',
    checkedAt: '2026-09-21',
    ...overrides,
  };
}

const BASE_FACTS: MatchableVenueFacts = {
  placeId: 'v1',
  name: 'Test venue',
  category: 'museum',
  driveMinutes: 10,
  enrichmentStatus: 'verified',
  minRecommendedAge: null,
  maxRecommendedAge: null,
  venueAgeRestriction: null,
  toilets: 'yes',
  babyChanging: 'yes',
  parking: 'yes',
  freeParking: 'yes',
  pushchairSuitability: 'good',
  environment: 'indoor',
  energyLevel: 'moderate',
  visitDurationMinutes: 90,
  estimatedSpend: 'Free',
  goodToKnow: [],
  warnings: [],
  openingStatus: 'unknown',
};

function request(childAges: number[], childAgeMonthsList?: number[]): DayRequest {
  return {
    rawText: 'somewhere to go today',
    constraints: {},
    childAges,
    childAgeMonthsList: childAgeMonthsList ?? childAges.map((a) => a * 12),
    maxDriveMinutes: 45,
    budgetTier: 'moderate',
  } as unknown as DayRequest;
}

describe('the admitted interval is half-open, in months', () => {
  it('admits on the boundary month and not the month before', () => {
    expect(childIsAdmitted(restriction(48, null), 48)).toBe(true);
    expect(childIsAdmitted(restriction(48, null), 47)).toBe(false);
  });

  it('admits through the whole of the final admitted year', () => {
    expect(childIsAdmitted(restriction(null, 144), 143)).toBe(true);
    expect(childIsAdmitted(restriction(null, 144), 144)).toBe(false);
  });

  it('expresses a policy whole years cannot', () => {
    // "Under 6 months not admitted" — the case that motivated storing months.
    const babies = restriction(6, null);
    expect(childIsAdmitted(babies, 5)).toBe(false);
    expect(childIsAdmitted(babies, 6)).toBe(true);
  });
});

describe('unknown never excludes', () => {
  it('reports unknown when the venue records no restriction', () => {
    expect(evaluateAgeAdmission({ venueAgeRestriction: null }, [24])).toBe('unknown');
  });

  it('reports unknown when a restriction states no bound at all', () => {
    expect(evaluateAgeAdmission({ venueAgeRestriction: restriction(null, null) }, [24])).toBe('unknown');
  });

  it('reports unknown when there are no children to test', () => {
    expect(evaluateAgeAdmission({ venueAgeRestriction: restriction(48, null) }, [])).toBe('unknown');
  });

  it('leaves a venue with no restriction eligible, emitting no evaluation at all', () => {
    const result = matchVenueToDayRequest(BASE_FACTS, request([2]));
    expect(result.eligible).toBe(true);
    expect(result.evaluations.some((e) => e.field === 'ageAdmission')).toBe(false);
  });
});

describe('a restriction excludes, and a recommendation still does not', () => {
  it('excludes a venue that will turn the child away', () => {
    const facts = { ...BASE_FACTS, venueAgeRestriction: restriction(60, null) };
    const result = matchVenueToDayRequest(facts, request([3]));
    expect(result.eligible).toBe(false);
    expect(result.evaluations.find((e) => e.field === 'ageAdmission')).toMatchObject({
      strength: 'required',
      outcome: 'unsuitable',
    });
  });

  it('keeps a venue whose RECOMMENDED range excludes the child but whose door does not', () => {
    // The B1 guarantee, restated against B2: advice must never become a prohibition.
    const facts = { ...BASE_FACTS, minRecommendedAge: 8, maxRecommendedAge: 12 };
    expect(matchVenueToDayRequest(facts, request([3])).eligible).toBe(true);
  });

  it('admits the family when every child is inside the policy', () => {
    const facts = { ...BASE_FACTS, venueAgeRestriction: restriction(24, 144) };
    const result = matchVenueToDayRequest(facts, request([3, 8]));
    expect(result.eligible).toBe(true);
    expect(result.evaluations.find((e) => e.field === 'ageAdmission')?.outcome).toBe('suitable');
  });
});

describe('one prohibited child excludes the whole family', () => {
  it('rejects when the toddler is turned away even though the sibling is admitted', () => {
    const facts = { ...BASE_FACTS, venueAgeRestriction: restriction(60, null) };
    expect(matchVenueToDayRequest(facts, request([2, 8])).eligible).toBe(false);
  });

  it('rejects when the older child is above the maximum', () => {
    const facts = { ...BASE_FACTS, venueAgeRestriction: restriction(null, 72) };
    expect(matchVenueToDayRequest(facts, request([2, 8])).eligible).toBe(false);
  });

  it('uses month precision so a baby is not rounded into a prohibition', () => {
    const facts = { ...BASE_FACTS, venueAgeRestriction: restriction(12, null) };
    expect(matchVenueToDayRequest(facts, request([0], [7])).eligible).toBe(false);
    expect(matchVenueToDayRequest(facts, request([1], [12])).eligible).toBe(true);
  });
});

describe('what a parent is told', () => {
  it('renders years when lossless and months when not', () => {
    expect(describeAgeAdmission({ venueAgeRestriction: restriction(48, 144) })).toBe('Admits age 4 to age 11');
    expect(describeAgeAdmission({ venueAgeRestriction: restriction(48, null) })).toBe('Admits age 4 and over');
    expect(describeAgeAdmission({ venueAgeRestriction: restriction(null, 144) })).toBe('Admits age 11 and under');
    // Months survive: "under 6 months" must not be rounded away in the wording either.
    expect(describeAgeAdmission({ venueAgeRestriction: restriction(6, null) })).toBe('Admits 6 months and over');
    expect(describeAgeAdmission({ venueAgeRestriction: null })).toBeNull();
  });

  it('never leaks a field name or a source URL into a reason', () => {
    const facts = { ...BASE_FACTS, venueAgeRestriction: restriction(24, null) };
    const text = JSON.stringify(matchVenueToDayRequest(facts, request([3])));
    expect(text).not.toContain('venueAgeRestriction');
    expect(text).not.toContain('ageAdmission not confirmed');
    expect(text).not.toContain('venue.example');
  });
});

describe('the restriction reaches every surface that recommends a venue', () => {
  it('does not plan a venue that will turn a child away', async () => {
    const { planVenue } = await import('@/src/services/planning/planner');
    const family = {
      id: 'a', label: 'Family A', area: 'Town', latitude: 51.6, longitude: -0.3,
      ages: [2, 8], maxDriveMinutes: 45, budgetTier: 'moderate', pushchair: false,
      required: [], routines: [],
    } as never;
    const options = {
      date: '2026-09-10', leaveAt: '09:00', returnBy: '', visitMinutes: 60,
      bufferMinutes: 15, environment: 'either',
    } as never;
    const journeys = { a: { outbound: 20, inbound: 20, source: 'estimated' as const } };
    const now = new Date('2026-09-10T08:00:00');

    expect(planVenue({ ...BASE_FACTS, category: 'park' }, [family], journeys, options, now)).not.toBeNull();
    expect(
      planVenue(
        { ...BASE_FACTS, category: 'park', venueAgeRestriction: restriction(60, null) },
        [family], journeys, options, now,
      ),
      'a venue that excludes the two-year-old must not be planned',
    ).toBeNull();
  });
});
