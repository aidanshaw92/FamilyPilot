import { describe, expect, it } from 'vitest';

import {
  AGE_RECOMMENDATION_STRENGTH,
  childAgeMonths,
  childAgesInMonths,
  evaluateAgeRecommendation,
  recommendedMonthInterval,
} from '@/src/services/matching/age-suitability';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';
import {
  buildFocusedReasons,
  buildFocusedRecommendation,
  buildFocusedUnknowns,
} from '@/src/services/matching/match-explanations';
import { familyRequest, planVenue, PlanningFamily, PlanningOptions } from '@/src/services/planning/planner';
import { buildProactiveDayRequest } from '@/src/services/recommendation/proactive-day-request';
import { parseDayRequestMock } from '@/src/services/recommendation/parse-day-request-client';
import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { scoreTrustedAgeSuitability } from '@/src/services/scoring/trusted-family-score';
import { DayRequest, MatchableVenueFacts } from '@/src/types/day-request';
import { FamilyProfile, VenueDetail } from '@/src/types';
import { VenueFamilyMetadata } from '@/src/types/places';

/**
 * P0-B1: a recommended age range ranks a venue, it never removes one.
 *
 * The invariant every test below defends is that no age input — inside the range, outside it,
 * absent, or a legacy `required` constraint from a persisted request — can make a venue
 * ineligible. Hard age eligibility is B2's separate, evidence-backed venue-level
 * prohibition; until then, nothing about age closes a door.
 */

const now = new Date('2026-09-10T08:00:00');

const options: PlanningOptions = {
  date: '2026-09-10',
  leaveAt: '09:00',
  returnBy: '',
  visitMinutes: 60,
  bufferMinutes: 15,
  environment: 'either',
};

const journeys = { a: { outbound: 20, inbound: 25, source: 'estimated' as const } };

function familyAged(ages: number[]): PlanningFamily {
  return {
    id: 'a',
    label: 'Family A',
    area: 'Town',
    latitude: 51.6,
    longitude: -0.3,
    ages,
    maxDriveMinutes: 45,
    budgetTier: 'moderate',
    pushchair: true,
    required: ['babyChanging'],
    routines: [],
  };
}

const realMetadata: VenueFamilyMetadata = {
  familypilotPlaceId: 'fp-google-b1',
  enrichmentStatus: 'enriched',
  familyFacilities: { toilets: 'yes', playground: 'yes', babyChanging: 'yes' },
  provenance: {},
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function realFacts(overrides: Partial<VenueFamilyMetadata> = {}): MatchableVenueFacts {
  return extractMatchableFacts('fp-google-b1', 'B1 Park', 'park', 20, 'enriched', { ...realMetadata, ...overrides }, undefined);
}

function requestFor(childAges: number[], childAgeMonthsList?: number[]): DayRequest {
  return {
    rawText: '',
    parsedAt: '',
    childAges,
    childAgeMonthsList,
    homeLocation: 'Town',
    budgetTier: 'moderate',
    maxDriveMinutes: 45,
    hasPushchair: false,
    constraints: { ageRecommendedFit: { strength: AGE_RECOMMENDATION_STRENGTH, value: 'in_range' } },
    context: {},
  };
}

function ageOutcome(facts: MatchableVenueFacts, request: DayRequest) {
  return matchVenueToDayRequest(facts, request).evaluations.find((e) => e.field === 'ageRecommendedFit');
}

describe('a recommended range never excludes a venue', () => {
  it('keeps a venue recommended for 3-8 eligible for a 2-year-old', () => {
    const facts = realFacts({ minRecommendedAge: 3, maxRecommendedAge: 8 });
    expect(matchVenueToDayRequest(facts, requestFor([2])).eligible).toBe(true);
    expect(planVenue(facts, [familyAged([2])], journeys, options, now)).not.toBeNull();
  });

  it('keeps a venue eligible when no child is inside the range at all', () => {
    const facts = realFacts({ minRecommendedAge: 5, maxRecommendedAge: 12 });
    expect(matchVenueToDayRequest(facts, requestFor([2, 3])).eligible).toBe(true);
    expect(planVenue(facts, [familyAged([2, 3])], journeys, options, now)).not.toBeNull();
  });

  it('keeps a venue eligible when no range was ever published', () => {
    expect(matchVenueToDayRequest(realFacts(), requestFor([3])).eligible).toBe(true);
    expect(planVenue(realFacts(), [familyAged([3, 0])], journeys, options, now)).not.toBeNull();
  });

  it('keeps a venue eligible on a lower bound alone', () => {
    expect(planVenue(realFacts({ minRecommendedAge: 8 }), [familyAged([3, 0])], journeys, options, now)).not.toBeNull();
  });

  it('keeps a venue eligible on an upper bound alone', () => {
    expect(planVenue(realFacts({ maxRecommendedAge: 2 }), [familyAged([3, 0])], journeys, options, now)).not.toBeNull();
  });

  it('cannot be excluded by a legacy required childAgeFit on a persisted request', () => {
    // The deprecated key at the strength every old producer emitted, against a venue with no
    // published range: previously `required` + `unknown` rejected it outright.
    const legacy: DayRequest = {
      ...requestFor([3]),
      constraints: { childAgeFit: { strength: 'required', value: 'in_range' } },
    };
    const match = matchVenueToDayRequest(realFacts(), legacy);
    expect(match.eligible).toBe(true);
    expect(match.evaluations.find((e) => e.field === 'ageRecommendedFit')?.strength).toBe('preferred');
  });

  it('cannot be excluded by a legacy required childAgeFit against a range that suits nobody', () => {
    const legacy: DayRequest = {
      ...requestFor([2, 3]),
      constraints: { childAgeFit: { strength: 'required', value: 'in_range' } },
    };
    expect(matchVenueToDayRequest(realFacts({ minRecommendedAge: 5, maxRecommendedAge: 12 }), legacy).eligible).toBe(true);
  });
});

describe('per-child evaluation', () => {
  const facts = realFacts({ minRecommendedAge: 5, maxRecommendedAge: 12 });

  it('reports "all" when every child is inside', () => {
    expect(evaluateAgeRecommendation(facts, [6 * 12, 8 * 12])).toBe('all');
  });

  it('reports "some" for children aged 2 and 8 against 5-12 — the old overlap bug', () => {
    expect(evaluateAgeRecommendation(facts, [2 * 12, 8 * 12])).toBe('some');
  });

  it('reports "none" when no child is inside', () => {
    expect(evaluateAgeRecommendation(facts, [2 * 12, 3 * 12])).toBe('none');
  });

  it('reports "unknown" with no published range', () => {
    expect(evaluateAgeRecommendation(realFacts(), [6 * 12])).toBe('unknown');
  });

  it('reports "unknown" for a party with no children', () => {
    expect(evaluateAgeRecommendation(facts, [])).toBe('unknown');
  });

  it('surfaces the 2-and-8 case as a ranking penalty, not an exclusion', () => {
    const match = matchVenueToDayRequest(facts, requestFor([2, 8]));
    expect(match.eligible).toBe(true);
    expect(ageOutcome(facts, requestFor([2, 8]))?.outcome).toBe('unsuitable');
    expect(match.preferredUnsuitable).toBe(1);
  });

  it('records no age evaluation at all for a party with no children', () => {
    expect(ageOutcome(facts, requestFor([]))).toBeUndefined();
  });
});

describe('month normalisation', () => {
  it('keeps babies apart that whole years collapse', () => {
    expect(childAgeMonths({ age: 0, ageMonths: 2 })).toBe(2);
    expect(childAgeMonths({ age: 0, ageMonths: 11 })).toBe(11);
  });

  it('falls back to whole years when no month precision was captured', () => {
    expect(childAgeMonths({ age: 0, ageMonths: null })).toBe(0);
    expect(childAgeMonths({ age: 3 })).toBe(36);
  });

  it('ignores ageMonths for a child of one or older, where the year is authoritative', () => {
    expect(childAgeMonths({ age: 4, ageMonths: 2 })).toBe(48);
  });

  it('reads only the children out of a profile', () => {
    const members = [
      { id: 'a', name: 'Adult', role: 'adult', age: 38 },
      { id: 'b', name: 'Baby', role: 'child', age: 0, ageMonths: 7 },
      { id: 'c', name: 'Kid', role: 'child', age: 5 },
    ];
    expect(childAgesInMonths(members as never)).toEqual([7, 60]);
  });

  it('treats a whole-year minimum as inclusive and a maximum as exclusive', () => {
    expect(recommendedMonthInterval({ minRecommendedAge: 3, maxRecommendedAge: 8 })).toEqual({
      minMonthsInclusive: 36,
      maxMonthsExclusive: 108,
    });
  });

  it('puts 107 months inside "up to age 8" and 108 months outside it', () => {
    const facts = realFacts({ maxRecommendedAge: 8 });
    expect(evaluateAgeRecommendation(facts, [107])).toBe('all');
    expect(evaluateAgeRecommendation(facts, [108])).toBe('none');
  });

  it('puts 35 months outside "from age 3" and 36 months inside it', () => {
    const facts = realFacts({ minRecommendedAge: 3 });
    expect(evaluateAgeRecommendation(facts, [35])).toBe('none');
    expect(evaluateAgeRecommendation(facts, [36])).toBe('all');
  });

  it('distinguishes two babies the matcher would otherwise see as identical', () => {
    // Recommended from age 1: a 2-month-old is outside, an 11-month-old is still outside, but a
    // 13-month-old is in. Both babies read as age 0 without the months list.
    const facts = realFacts({ minRecommendedAge: 1 });
    expect(ageOutcome(facts, requestFor([0], [2]))?.outcome).toBe('unsuitable');
    expect(ageOutcome(facts, requestFor([1], [13]))?.outcome).toBe('suitable');
  });
});

describe('producers never emit a required age recommendation', () => {
  const profile = {
    id: 'p',
    homeLocation: 'Town',
    latitude: 51.6,
    longitude: -0.3,
    maxDriveMinutes: 45,
    budgetTier: 'moderate',
    members: [
      { id: 'c1', name: 'Ada', role: 'child', age: 0, ageMonths: 7 },
      { id: 'c2', name: 'Bo', role: 'child', age: 8 },
    ],
  } as unknown as FamilyProfile;

  it('client mock parser emits the soft key and no legacy key', () => {
    const parsed = parseDayRequestMock('somewhere indoors', profile);
    expect(parsed.constraints.ageRecommendedFit).toEqual({ strength: 'preferred', value: 'in_range' });
    expect(parsed.constraints.childAgeFit).toBeUndefined();
    expect(parsed.childAgeMonthsList).toEqual([7, 96]);
  });

  it('proactive day request emits the soft key and no legacy key', () => {
    const parsed = buildProactiveDayRequest(profile, null, now);
    expect(parsed.constraints.ageRecommendedFit).toEqual({ strength: 'preferred', value: 'in_range' });
    expect(parsed.constraints.childAgeFit).toBeUndefined();
    expect(parsed.childAgeMonthsList).toEqual([7, 96]);
  });

  it('planner request emits the soft key', () => {
    expect(familyRequest(familyAged([3]), 'either').constraints.ageRecommendedFit?.strength).toBe('preferred');
  });

  it('server schema normalises an AI-supplied required strength down to preferred', async () => {
    const { normaliseDayRequest } = await import('../../../server/recommendations/day-request-schema.js');
    const merged = normaliseDayRequest(
      { rawText: 'anything', constraints: { childAgeFit: { strength: 'required', value: 'in_range' } } },
      { members: [{ role: 'child', age: 3 }], homeLocation: 'Town', budgetTier: 'moderate', maxDriveMinutes: 45 },
    );
    expect(merged.constraints.ageRecommendedFit).toEqual({ strength: 'preferred', value: 'in_range' });
    expect(merged.constraints.childAgeFit).toBeUndefined();
  });

  it('server schema normalises a required strength on the new key too', async () => {
    const { normaliseDayRequest } = await import('../../../server/recommendations/day-request-schema.js');
    const merged = normaliseDayRequest(
      { rawText: 'anything', constraints: { ageRecommendedFit: { strength: 'required', value: 'in_range' } } },
      { members: [{ role: 'child', age: 3 }], homeLocation: 'Town', budgetTier: 'moderate', maxDriveMinutes: 45 },
    );
    expect(merged.constraints.ageRecommendedFit.strength).toBe('preferred');
  });

  it('server schema survives a missing or nonsense strength without inventing required', async () => {
    const { normaliseDayRequest } = await import('../../../server/recommendations/day-request-schema.js');
    for (const strength of [undefined, null, 'mandatory', 42, {}]) {
      const merged = normaliseDayRequest(
        { rawText: 'x', constraints: { ageRecommendedFit: { strength, value: 'in_range' } } },
        { members: [{ role: 'child', age: 3 }], homeLocation: 'Town', budgetTier: 'moderate', maxDriveMinutes: 45 },
      );
      expect(merged.constraints.ageRecommendedFit.strength).toBe('preferred');
    }
  });

  it('server schema defaults to the soft key when children exist and the model said nothing', async () => {
    const { normaliseDayRequest } = await import('../../../server/recommendations/day-request-schema.js');
    const merged = normaliseDayRequest(
      { rawText: 'anything', constraints: {} },
      { members: [{ role: 'child', age: 0, ageMonths: 5 }], homeLocation: 'Town', budgetTier: 'moderate', maxDriveMinutes: 45 },
    );
    expect(merged.constraints.ageRecommendedFit.strength).toBe('preferred');
    expect(merged.childAgeMonthsList).toEqual([5]);
  });

  it('the AI parser prompt no longer advertises an age constraint', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('../api/recommendations/parse-request.js', 'utf8');
    // Only the allowed-keys list. The prompt names both keys further down, in the prohibition
    // that tells the model never to emit them, which is the opposite of advertising them.
    const allowed = source.slice(source.indexOf('Allowed constraint keys'), source.indexOf('IMPORTANT:'));
    expect(allowed.length).toBeGreaterThan(50);
    expect(allowed).not.toContain('childAgeFit');
    expect(allowed).not.toContain('ageRecommendedFit');
  });
});

describe('trusted age scoring ranks but never gates', () => {
  const facts = realFacts({ minRecommendedAge: 2, maxRecommendedAge: 10 });

  it('scores every child inside highest', () => {
    expect(scoreTrustedAgeSuitability(facts, [5 * 12, 3 * 12])).toBe(96);
  });

  it('scores a partial match above no match', () => {
    const some = scoreTrustedAgeSuitability(facts, [3 * 12, 14 * 12])!;
    const none = scoreTrustedAgeSuitability(facts, [14 * 12])!;
    expect(some).toBe(58);
    expect(none).toBe(42);
    expect(some).toBeGreaterThan(none);
  });

  it('returns null rather than a guess when no range is published', () => {
    expect(scoreTrustedAgeSuitability(realFacts(), [5 * 12])).toBeNull();
  });

  it('returns null for a party with no children', () => {
    expect(scoreTrustedAgeSuitability(facts, [])).toBeNull();
  });
});

describe('Family Match makes no age claim without age evidence', () => {
  const profile = {
    id: 'p',
    homeLocation: 'Town',
    latitude: 51.6,
    longitude: -0.3,
    maxDriveMinutes: 45,
    budgetTier: 'moderate',
    members: [{ id: 'c1', name: 'Ada', role: 'child', age: 6 }],
  } as unknown as FamilyProfile;

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

  it('scores every category identically when no age evidence exists', () => {
    const scores = (['park', 'museum', 'farm', 'restaurant', 'cafe', 'zoo', 'beach'] as const).map(
      (category) => calculateFamilyScore(venue(category), profile).factors.ageSuitability,
    );
    expect(new Set(scores)).toEqual(new Set([75]));
  });

  it('uses the documented neutral placeholder, which is not a suitability claim', () => {
    expect(calculateFamilyScore(venue('park'), profile).factors.ageSuitability).toBe(75);
  });

  it('never says a child is a great age for a category', () => {
    for (const category of ['park', 'museum', 'farm', 'soft_play'] as const) {
      const explanation = calculateFamilyScore(venue(category), profile).explanation.join(' | ');
      expect(explanation).not.toContain('great age');
      expect(explanation).not.toContain('Works well for');
    }
  });

  it('still explains a genuinely published recommendation', () => {
    const withAge = {
      ...venue('park'),
      trustedFacts: realFacts({ minRecommendedAge: 2, maxRecommendedAge: 10 }),
    } as unknown as VenueDetail;
    const explanation = calculateFamilyScore(withAge, profile).explanation.join(' | ');
    expect(explanation).toContain('Recommended for ages 2–10');
  });

  it('describes a recommendation as recommended, never as permitted or prohibited', () => {
    const withAge = {
      ...venue('park'),
      trustedFacts: realFacts({ minRecommendedAge: 2, maxRecommendedAge: 10 }),
    } as unknown as VenueDetail;
    const explanation = calculateFamilyScore(withAge, profile).explanation.join(' | ').toLowerCase();
    for (const word of ['allowed', 'permitted', 'prohibited', 'not admitted', 'must be']) {
      expect(explanation).not.toContain(word);
    }
  });
});

describe('focused explanations stay wired to the renamed evaluation field', () => {
  /**
   * The matcher emits `field: 'ageRecommendedFit'`, and match-explanations.ts looks the reason
   * and the unknown label up by exactly that string. Renaming the field without teaching the
   * explanation layer the new key silently drops the "Recommended for ages" reason and leaks the
   * raw identifier into the unknown line a parent reads.
   */
  it('produces the published range as a focused reason', () => {
    const facts = realFacts({ minRecommendedAge: 3, maxRecommendedAge: 8 });
    const match = matchVenueToDayRequest(facts, requestFor([5]));
    expect(ageOutcome(facts, requestFor([5]))?.outcome).toBe('suitable');

    const texts = buildFocusedReasons(facts, match.evaluations).map((r) => r.text);
    expect(texts).toContain('Recommended for ages 3–8');
  });

  it('formats an open-ended lower bound as a focused reason', () => {
    const facts = realFacts({ minRecommendedAge: 3 });
    const match = matchVenueToDayRequest(facts, requestFor([5]));
    const texts = buildFocusedReasons(facts, match.evaluations).map((r) => r.text);
    expect(texts).toContain('Recommended from age 3+');
  });

  it('says "Recommended ages not confirmed for this venue" when nothing is published', () => {
    const facts = realFacts();
    const match = matchVenueToDayRequest(facts, requestFor([5]));
    const texts = buildFocusedUnknowns(match.evaluations).map((r) => r.text);
    expect(texts).toContain('Recommended ages not confirmed for this venue');
  });

  it('never leaks the raw internal field name into user-visible text', () => {
    const facts = realFacts();
    const match = matchVenueToDayRequest(facts, requestFor([5]));
    const visible = [
      ...buildFocusedReasons(facts, match.evaluations),
      ...buildFocusedUnknowns(match.evaluations),
    ]
      .map((r) => r.text)
      .join(' | ');
    expect(visible).not.toContain('ageRecommendedFit');
    expect(visible).not.toContain('childAgeFit');
  });

  it('still formats the deprecated childAgeFit key if an evaluation carries it', () => {
    const facts = realFacts({ minRecommendedAge: 3, maxRecommendedAge: 8 });
    const legacySuitable = [{ field: 'childAgeFit', strength: 'preferred', outcome: 'suitable' }];
    const legacyUnknown = [{ field: 'childAgeFit', strength: 'preferred', outcome: 'unknown' }];

    expect(buildFocusedReasons(facts, legacySuitable as never).map((r) => r.text)).toContain(
      'Recommended for ages 3–8',
    );
    expect(buildFocusedUnknowns(legacyUnknown as never).map((r) => r.text)).toContain(
      'Recommended ages not confirmed for this venue',
    );
  });

  it('carries the range through the whole focused recommendation', () => {
    const facts = realFacts({ minRecommendedAge: 3, maxRecommendedAge: 8 });
    const match = matchVenueToDayRequest(facts, requestFor([5]));
    const focused = buildFocusedRecommendation(facts, match, 'https://example.org/i.jpg');
    const texts = focused.reasons.map((r) => r.text).join(' | ');
    expect(texts).toContain('Recommended for ages 3–8');
  });
});
