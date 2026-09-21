import { describe, expect, it } from 'vitest';

import {
  childIsAdmitted,
  describeAgeAdmission,
  describeAgeCaveats,
  evaluateAgeAdmission,
} from '@/src/services/matching/age-admission';
import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';
import { buildFocusedRecommendation } from '@/src/services/matching/match-explanations';
import {
  DayRequest,
  MatchableVenueFacts,
  VenueAgeCaveat,
  VenueAgePolicy,
  VenueAgeRestriction,
} from '@/src/types/day-request';

/**
 * P0-B2, matcher half: what a projected venue policy does once it reaches the matcher.
 *
 * Everything arriving here is already trusted, in-lifetime, human-approved and venue-scoped —
 * age-policy.test.ts covers which claims earn that. This file covers the three rules the matcher
 * itself must hold: unknown never excludes, any prohibited child excludes the family, and every
 * restriction applies.
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

/** A projected policy holding one or more doors. */
function policy(
  restrictions: VenueAgeRestriction[],
  overrides: Partial<VenueAgePolicy> = {},
): VenueAgePolicy {
  return { restrictions, caveats: [], sourcesDisagree: false, ...overrides };
}

/** A policy holding one door, which is the ordinary case. */
function door(min: number | null, max: number | null): VenueAgePolicy {
  return policy([restriction(min, max)]);
}

function caveat(overrides: Partial<VenueAgeCaveat> = {}): VenueAgeCaveat {
  return {
    scope: 'activity',
    activity: 'Soft play',
    accompaniment: null,
    statedAs: null,
    minMonthsInclusive: 60,
    maxMonthsExclusive: null,
    sourceUrl: 'https://venue.example/visit',
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
  venueAgePolicy: null,
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
  it('reports unknown when the venue records no policy', () => {
    expect(evaluateAgeAdmission({ venueAgePolicy: null }, [24])).toBe('unknown');
  });

  it('reports unknown when the policy holds no door at all', () => {
    expect(evaluateAgeAdmission({ venueAgePolicy: policy([]) }, [24])).toBe('unknown');
  });

  it('reports unknown when a door states no bound at all', () => {
    expect(evaluateAgeAdmission({ venueAgePolicy: door(null, null) }, [24])).toBe('unknown');
  });

  it('reports unknown when there are no children to test', () => {
    expect(evaluateAgeAdmission({ venueAgePolicy: door(48, null) }, [])).toBe('unknown');
  });

  it('leaves a venue with no policy eligible, emitting no evaluation at all', () => {
    const result = matchVenueToDayRequest(BASE_FACTS, request([2]));
    expect(result.eligible).toBe(true);
    expect(result.evaluations.some((e) => e.field === 'ageAdmission')).toBe(false);
  });
});

describe('a restriction excludes, and a recommendation still does not', () => {
  it('excludes a venue that will turn the child away', () => {
    const facts = { ...BASE_FACTS, venueAgePolicy: door(60, null) };
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
    const facts = { ...BASE_FACTS, venueAgePolicy: door(24, 144) };
    const result = matchVenueToDayRequest(facts, request([3, 8]));
    expect(result.eligible).toBe(true);
    expect(result.evaluations.find((e) => e.field === 'ageAdmission')?.outcome).toBe('suitable');
  });
});

describe('every door applies, not just the first', () => {
  // "Under 4s not admitted" AND "over 12s not admitted" — two real doors from one source.
  const both = policy([restriction(48, null), restriction(null, 144)]);

  it('admits a child inside both', () => {
    expect(evaluateAgeAdmission({ venueAgePolicy: both }, [72])).toBe('admitted');
  });

  it('excludes a child who fails the first', () => {
    expect(evaluateAgeAdmission({ venueAgePolicy: both }, [36])).toBe('prohibited');
  });

  it('excludes a child who fails the SECOND', () => {
    // The case a single collapsed interval could not express at all.
    expect(evaluateAgeAdmission({ venueAgePolicy: both }, [156])).toBe('prohibited');
  });

  it('excludes the family when one sibling fails a different door from the other', () => {
    expect(evaluateAgeAdmission({ venueAgePolicy: both }, [36, 156])).toBe('prohibited');
    expect(matchVenueToDayRequest({ ...BASE_FACTS, venueAgePolicy: both }, request([3, 13])).eligible).toBe(false);
  });

  it('reads the admitted band as the intersection of its doors', () => {
    expect(describeAgeAdmission({ venueAgePolicy: both })).toBe('Admits age 4 to age 11');
  });

  it('reads the STRICTEST bound, not the first one listed', () => {
    // A child must satisfy every door, so the tightest is the one that decides. Reading the
    // first entry happens to be right whenever the doors bound opposite ends, which is why this
    // needs two doors bounding the SAME end to say anything.
    expect(
      describeAgeAdmission({ venueAgePolicy: policy([restriction(48, null), restriction(60, null)]) }),
    ).toBe('Admits age 5 and over');
    expect(
      describeAgeAdmission({ venueAgePolicy: policy([restriction(null, 144), restriction(null, 72)]) }),
    ).toBe('Admits age 5 and under');
  });

  it('enforces the strictest bound too, not just describes it', () => {
    const twoMinima = policy([restriction(48, null), restriction(60, null)]);
    expect(evaluateAgeAdmission({ venueAgePolicy: twoMinima }, [54])).toBe('prohibited');
    expect(evaluateAgeAdmission({ venueAgePolicy: twoMinima }, [60])).toBe('admitted');
  });
});

describe('sources that disagree never exclude', () => {
  it('treats a disagreeing policy as unknown even if a door somehow survived into it', () => {
    // Belt and braces: the projector empties `restrictions` on disagreement and the DB constraint
    // rejects a row that does not, but the matcher must not depend on either to fail open.
    const conflicted = policy([restriction(60, null)], { sourcesDisagree: true });
    expect(evaluateAgeAdmission({ venueAgePolicy: conflicted }, [24])).toBe('unknown');
    expect(matchVenueToDayRequest({ ...BASE_FACTS, venueAgePolicy: conflicted }, request([2])).eligible).toBe(true);
  });
});

describe('one prohibited child excludes the whole family', () => {
  it('rejects when the toddler is turned away even though the sibling is admitted', () => {
    const facts = { ...BASE_FACTS, venueAgePolicy: door(60, null) };
    expect(matchVenueToDayRequest(facts, request([2, 8])).eligible).toBe(false);
  });

  it('rejects when the older child is above the maximum', () => {
    const facts = { ...BASE_FACTS, venueAgePolicy: door(null, 72) };
    expect(matchVenueToDayRequest(facts, request([2, 8])).eligible).toBe(false);
  });

  it('uses month precision so a baby is not rounded into a prohibition', () => {
    const facts = { ...BASE_FACTS, venueAgePolicy: door(12, null) };
    expect(matchVenueToDayRequest(facts, request([0], [7])).eligible).toBe(false);
    expect(matchVenueToDayRequest(facts, request([1], [12])).eligible).toBe(true);
  });
});

describe('what a parent is told', () => {
  it('renders years when lossless and months when not', () => {
    expect(describeAgeAdmission({ venueAgePolicy: door(48, 144) })).toBe('Admits age 4 to age 11');
    expect(describeAgeAdmission({ venueAgePolicy: door(48, null) })).toBe('Admits age 4 and over');
    expect(describeAgeAdmission({ venueAgePolicy: door(null, 144) })).toBe('Admits age 11 and under');
    // Months survive: "under 6 months" must not be rounded away in the wording either.
    expect(describeAgeAdmission({ venueAgePolicy: door(6, null) })).toBe('Admits 6 months and over');
    expect(describeAgeAdmission({ venueAgePolicy: null })).toBeNull();
  });

  it('turns a caveat into something a parent can act on', () => {
    expect(describeAgeCaveats({ venueAgePolicy: policy([], { caveats: [caveat()] }) })).toEqual([
      'Soft play is age 5 and over',
    ]);
    expect(
      describeAgeCaveats({
        venueAgePolicy: policy([], {
          caveats: [caveat({ scope: 'accompaniment', activity: null, minMonthsInclusive: null, maxMonthsExclusive: 24 })],
        }),
      }),
    ).toEqual(['An adult must stay with children under age 2']);
  });

  it('says plainly when sources disagree, rather than staying silent', () => {
    const lines = describeAgeCaveats({ venueAgePolicy: policy([], { sourcesDisagree: true }) });
    expect(lines[0]).toBe('Sources disagree on its age rules, so check before you go');
  });

  it('carries caveats into the recommendation a parent reads', () => {
    const facts = { ...BASE_FACTS, venueAgePolicy: policy([], { caveats: [caveat()] }) };
    const match = matchVenueToDayRequest(facts, request([3]));
    expect(match.eligible, 'a caveat must never exclude').toBe(true);

    // The defect this replaces: the caveats were projected and then reached nobody.
    const recommendation = buildFocusedRecommendation(facts, match, '');
    expect(recommendation.caveats).toContain('Soft play is age 5 and over');
  });

  it('never leaks a field name or a source URL into a reason', () => {
    const facts = { ...BASE_FACTS, venueAgePolicy: door(24, null) };
    const text = JSON.stringify(matchVenueToDayRequest(facts, request([3])));
    expect(text).not.toContain('venueAgePolicy');
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
        { ...BASE_FACTS, category: 'park', venueAgePolicy: door(60, null) },
        [family], journeys, options, now,
      ),
      'a venue that excludes the two-year-old must not be planned',
    ).toBeNull();
  });
});
