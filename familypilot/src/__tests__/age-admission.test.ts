import { describe, expect, it } from 'vitest';

import {
  admissionMonthInterval,
  childIsAdmitted,
  describeAgeAdmission,
  evaluateAgeAdmission,
} from '@/src/services/matching/age-admission';
import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';
import { DayRequest, MatchableVenueFacts } from '@/src/types/day-request';

/**
 * P0-B2: a venue-level age prohibition, and the boundary between it and a recommendation.
 *
 * B1 established that `minRecommendedAge` / `maxRecommendedAge` are advice and may never exclude a
 * venue. This suite defends the other half of that sentence: an admission policy IS allowed to
 * exclude, it is the ONLY age fact that is, and it must not quietly acquire the failure modes the
 * deprecated `childAgeFit` had — where an absent value rejected the venue.
 */

const BASE_FACTS: MatchableVenueFacts = {
  placeId: 'v1',
  name: 'Test venue',
  category: 'museum',
  driveMinutes: 10,
  enrichmentStatus: 'verified',
  minRecommendedAge: null,
  maxRecommendedAge: null,
  minAdmissionAge: null,
  maxAdmissionAge: null,
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

describe('the admitted interval', () => {
  it('opens on the birthday and closes on the one after the maximum', () => {
    // "admits 4 to 11" means admitted from the fourth birthday until the twelfth.
    expect(admissionMonthInterval({ minAdmissionAge: 4, maxAdmissionAge: 11 })).toEqual({
      minMonthsInclusive: 48,
      maxMonthsExclusive: 144,
    });
  });

  it('leaves an unstated bound open rather than inventing one', () => {
    expect(admissionMonthInterval({ minAdmissionAge: 4, maxAdmissionAge: null })).toEqual({
      minMonthsInclusive: 48,
      maxMonthsExclusive: null,
    });
    expect(admissionMonthInterval({ minAdmissionAge: null, maxAdmissionAge: 11 })).toEqual({
      minMonthsInclusive: null,
      maxMonthsExclusive: 144,
    });
  });

  it('admits a child on the exact boundary month, and not the month before', () => {
    const facts = { minAdmissionAge: 4, maxAdmissionAge: null };
    expect(childIsAdmitted(facts, 48)).toBe(true);
    expect(childIsAdmitted(facts, 47)).toBe(false);
  });

  it('admits a child through the whole of their final admitted year', () => {
    const facts = { minAdmissionAge: null, maxAdmissionAge: 11 };
    expect(childIsAdmitted(facts, 143)).toBe(true); // 11y11m
    expect(childIsAdmitted(facts, 144)).toBe(false); // the twelfth birthday
  });
});

describe('unknown never excludes', () => {
  it('reports unknown when the venue states no policy', () => {
    expect(evaluateAgeAdmission({ minAdmissionAge: null, maxAdmissionAge: null }, [24])).toBe(
      'unknown',
    );
  });

  it('reports unknown when there are no children to test', () => {
    expect(evaluateAgeAdmission({ minAdmissionAge: 4, maxAdmissionAge: null }, [])).toBe('unknown');
  });

  it('leaves a venue with no policy eligible', () => {
    const result = matchVenueToDayRequest(BASE_FACTS, request([2]));
    expect(result.eligible).toBe(true);
    expect(result.evaluations.some((e) => e.field === 'ageAdmission')).toBe(false);
  });
});

describe('a prohibition excludes, and a recommendation still does not', () => {
  it('excludes a venue that will turn the child away', () => {
    const facts = { ...BASE_FACTS, minAdmissionAge: 5 };
    const result = matchVenueToDayRequest(facts, request([3]));
    expect(result.eligible).toBe(false);
    expect(
      result.evaluations.find((e) => e.field === 'ageAdmission'),
    ).toMatchObject({ strength: 'required', outcome: 'unsuitable' });
  });

  it('keeps a venue whose RECOMMENDED range excludes the child but whose door does not', () => {
    // The B1 guarantee, restated against B2: advice must not become a prohibition.
    const facts = { ...BASE_FACTS, minRecommendedAge: 8, maxRecommendedAge: 12 };
    const result = matchVenueToDayRequest(facts, request([3]));
    expect(result.eligible).toBe(true);
  });

  it('admits the family when every child is inside the policy', () => {
    const facts = { ...BASE_FACTS, minAdmissionAge: 2, maxAdmissionAge: 12 };
    const result = matchVenueToDayRequest(facts, request([3, 8]));
    expect(result.eligible).toBe(true);
    expect(result.evaluations.find((e) => e.field === 'ageAdmission')?.outcome).toBe('suitable');
  });
});

describe('one prohibited child excludes the whole family', () => {
  it('rejects when the toddler is turned away even though the sibling is admitted', () => {
    // A parent cannot leave one child at home. The same shape as the B1 ruling that a child
    // inside a range must not vouch for a sibling outside it.
    const facts = { ...BASE_FACTS, minAdmissionAge: 5 };
    const result = matchVenueToDayRequest(facts, request([2, 8]));
    expect(result.eligible).toBe(false);
  });

  it('rejects when the older child is above the maximum', () => {
    const facts = { ...BASE_FACTS, maxAdmissionAge: 5 };
    const result = matchVenueToDayRequest(facts, request([2, 8]));
    expect(result.eligible).toBe(false);
  });

  it('uses month precision so a baby is not rounded into a prohibition', () => {
    // A 7-month-old at an "admits 1 and over" venue. Rounding 7 months to 1 year would admit them.
    const facts = { ...BASE_FACTS, minAdmissionAge: 1 };
    expect(matchVenueToDayRequest(facts, request([0], [7])).eligible).toBe(false);
    expect(matchVenueToDayRequest(facts, request([1], [12])).eligible).toBe(true);
  });
});

describe('what a parent is told', () => {
  it('describes each shape of policy without naming the field', () => {
    expect(describeAgeAdmission({ minAdmissionAge: 4, maxAdmissionAge: 11 })).toBe('Admits ages 4 to 11');
    expect(describeAgeAdmission({ minAdmissionAge: 4, maxAdmissionAge: null })).toBe('Admits ages 4 and over');
    expect(describeAgeAdmission({ minAdmissionAge: null, maxAdmissionAge: 11 })).toBe('Admits ages 11 and under');
    expect(describeAgeAdmission({ minAdmissionAge: null, maxAdmissionAge: null })).toBeNull();
  });

  it('never leaks the raw field name into a reason', () => {
    const facts = { ...BASE_FACTS, minAdmissionAge: 2 };
    const result = matchVenueToDayRequest(facts, request([3]));
    const text = JSON.stringify(result);
    expect(text).not.toContain('minAdmissionAge');
    expect(text).not.toContain('ageAdmission not confirmed');
  });
});

describe('the prohibition reaches every surface that recommends a venue', () => {
  /**
   * The planner builds day plans through `matchVenueToDayRequest`, so the gate should propagate
   * without the planner knowing about admission at all. Asserted rather than assumed: a second
   * recommendation path that skipped the gate would put a family in front of a closed door.
   */
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

    const open = planVenue({ ...BASE_FACTS, category: 'park' }, [family], journeys, options, now);
    expect(open, 'a venue with no admission policy should still plan').not.toBeNull();

    const prohibited = planVenue(
      { ...BASE_FACTS, category: 'park', minAdmissionAge: 5 },
      [family], journeys, options, now,
    );
    expect(prohibited, 'a venue that excludes the two-year-old must not be planned').toBeNull();
  });
});
