import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { hardConflictsFor } from '@/src/services/matching/hard-conflicts';
import { compareVenuesForFamily } from '@/src/services/places/fit-order';
import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { CURRENT_POLICY, PROPOSED_POLICY, activeFitPolicy } from '@/src/services/scoring/fit-policy';
import { personaliseVenue } from '@/src/utils/personalise-venues';
import { planningFamilyFromProfile } from '@/src/services/planning/plan-parties';
import { SequenceOptions, homeKey, sequenceDay, stopKey } from '@/src/services/planning/sequencer';
import type { StopRequest } from '@/src/types/day-sequence';
import type { FamilyMember, FamilyProfile, Venue, VenueDetail } from '@/src/types';
import type { MatchableVenueFacts } from '@/src/types/day-request';

/**
 * The evidence-aware Family Fit policy is OFF by default. These tests pin what it does when it is on, and that off means off.
 * The line each test defends is one of the six distinctions: confirmed age-relevant activity, confirmed incompatibility, unknown,
 * practical logistics, household requirement, general preference. Weights are not under test because they do not change.
 */
const NOW = new Date('2026-10-08T12:00:00Z');
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterAll(() => { vi.useRealTimers(); });

const adult: FamilyMember = { id: 'p', name: 'P', role: 'parent', dateOfBirth: '', age: 36 };
const kid = (id: string, name: string, age: number, extra: Partial<FamilyMember> = {}): FamilyMember => ({
  id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, mobility: ['walks'], ...extra,
});
const profile = (members: FamilyMember[], extra: Partial<FamilyProfile> = {}): FamilyProfile => ({
  id: 'f', parentName: 'P', members: [adult, ...members], homeLocation: 'Camden', homeLatitude: 51.539, homeLongitude: -0.142,
  completionPercent: 90, mustHaveFacilities: [], ...extra,
} as FamilyProfile);

const facts = (over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: 'fp-x', name: 'Test Place', category: 'museum', driveMinutes: 20, enrichmentStatus: 'verified', minRecommendedAge: null,
  maxRecommendedAge: null, venueAgePolicy: null, toilets: 'unknown', babyChanging: 'unknown', parking: 'unknown', freeParking: 'unknown',
  cafe: 'unknown', playground: 'unknown', wheelchairAccessible: 'unknown', accessibleToilet: 'unknown', pushchairSuitability: 'unknown',
  environment: 'indoor', energyLevel: 'unknown', visitDurationMinutes: null, estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'unknown',
  ...over,
} as MatchableVenueFacts);

const detail = (f: MatchableVenueFacts, id = 'fp-x'): VenueDetail => ({
  id, name: 'Test Place', category: 'museum', latitude: 51.5, longitude: -0.1, driveMinutes: 20, imageUrl: '',
  familyScore: { score: 0, factors: {} as never, explanation: [] }, photos: [], facilities: [], openingHours: '', description: '',
  enrichmentStatus: 'enriched', trustedFacts: f,
} as unknown as VenueDetail);

const score = (f: MatchableVenueFacts, p: FamilyProfile, policy = PROPOSED_POLICY, id = 'fp-x') =>
  calculateFamilyScore(detail(f, id), p, { enrichmentStatus: 'enriched', policy, now: NOW });

describe('off means off', () => {
  it('the environment selects the current policy unless told otherwise', () => {
    expect(activeFitPolicy()).toEqual(CURRENT_POLICY);
  });

  it('with the current policy every score is what it always was', () => {
    const p = profile([kid('a', 'Mia', 4)]);
    const f = facts({ toilets: 'yes', cafe: 'yes', pushchairSuitability: 'good' });
    expect(score(f, p, CURRENT_POLICY).score).toBe(calculateFamilyScore(detail(f), p, { enrichmentStatus: 'enriched' }).score);
    expect(score(f, p, CURRENT_POLICY).basis).toBeUndefined();
  });

  it('the flag values map to the two switches', () => {
    const was = process.env.EXPO_PUBLIC_FAMILY_FIT_V2;
    try {
      process.env.EXPO_PUBLIC_FAMILY_FIT_V2 = 'score';
      expect(activeFitPolicy()).toEqual({ evidenceAware: true, conflictsLast: false });
      process.env.EXPO_PUBLIC_FAMILY_FIT_V2 = 'conflicts';
      expect(activeFitPolicy()).toEqual({ evidenceAware: false, conflictsLast: true });
      process.env.EXPO_PUBLIC_FAMILY_FIT_V2 = 'all';
      expect(activeFitPolicy()).toEqual(PROPOSED_POLICY);
    } finally {
      if (was === undefined) delete process.env.EXPO_PUBLIC_FAMILY_FIT_V2; else process.env.EXPO_PUBLIC_FAMILY_FIT_V2 = was;
    }
  });
});

describe('unknown is not unsuitable', () => {
  it('a must-have nobody has confirmed neither caps the facilities factor nor raises a "Missing" caution', () => {
    const p = profile([kid('a', 'Mia', 4)], { mustHaveFacilities: ['parking'] });
    const unknown = score(facts({ toilets: 'yes' }), p);
    expect(unknown.factors.facilitiesMatch).toBeGreaterThan(35);
    const confirmedNo = score(facts({ toilets: 'yes', parking: 'no' }), p);
    expect(confirmedNo.factors.facilitiesMatch).toBeLessThanOrEqual(35);
    // Today the unconfirmed one is capped as though it were absent.
    const today = score(facts({ toilets: 'yes' }), p, CURRENT_POLICY);
    expect(unknown.factors.facilitiesMatch).toBeGreaterThanOrEqual(today.factors.facilitiesMatch);
  });

  it('the caution says "Missing" only for a facility the venue is confirmed not to have', () => {
    const p = profile([kid('a', 'Mia', 4)], { mustHaveFacilities: ['parking'] });
    const venue = (parking: 'yes' | 'no' | 'unknown') => ({ id: 'fp-x', name: 'Test', category: 'museum', latitude: 51.5, longitude: -0.1, driveMinutes: 20, imageUrl: '', familyScore: { score: 0, factors: {} as never, explanation: [] }, enrichmentStatus: 'enriched', facilities: ['toilets'], trustedFacts: facts({ toilets: 'yes', parking }) }) as unknown as Venue;
    const cautions = (v: Venue, policy = PROPOSED_POLICY) => personaliseVenue(v, p, undefined, policy).familyScore.cautions ?? [];
    expect(cautions(venue('unknown')).some((c) => c.startsWith('Missing'))).toBe(false);
    expect(cautions(venue('no')).some((c) => c.startsWith('Missing parking'))).toBe(true);
    // The current policy reads unconfirmed as missing: that is the behaviour being corrected.
    expect(cautions(venue('unknown'), CURRENT_POLICY).some((c) => c.startsWith('Missing parking'))).toBe(true);
  });

  it('a venue with nothing confirmed is never listed as a conflict', () => {
    const p = profile([kid('a', 'Mia', 4)], { mustHaveFacilities: ['toilets', 'parking'], pushchair: 'x' });
    expect(hardConflictsFor(facts(), p)).toEqual([]);
  });

  it('every unknown sits at the same neutral value: silence moves nothing', () => {
    const p = profile([kid('a', 'Mia', 4)]);
    const r = score(facts(), p);
    expect(r.factors.ageSuitability).toBe(75);
    expect(r.basis?.age).toEqual([{ name: 'Mia', basis: 'unknown', score: 75 }]);
  });
});

describe('a venue is not rewarded for how many facts were extracted', () => {
  const p = profile([kid('a', 'Mia', 4)]);
  const bare = facts({ toilets: 'yes' });
  const documented = facts({ toilets: 'yes', cafe: 'yes', freeParking: 'yes', playground: 'yes', accessibleToilet: 'yes', parking: 'yes', environment: 'indoor' });

  it('extra confirmed facilities the household did not ask for change nothing', () => {
    expect(score(documented, p).score).toBe(score(bare, p).score);
  });

  it('under the current policy they do lift the score (the behaviour being corrected)', () => {
    expect(score(documented, p, CURRENT_POLICY).score).toBeGreaterThan(score(bare, p, CURRENT_POLICY).score);
  });

  it('a pushchair rating does not lift a household that has no pushchair, and does lift one that has', () => {
    const walking = profile([kid('a', 'Cal', 9)]);
    const buggy = profile([kid('b', 'Leo', 1, { mobility: ['buggy'] })], { pushchair: 'x' });
    const good = facts({ pushchairSuitability: 'good' });
    expect(score(good, walking).score).toBe(score(facts(), walking).score);
    expect(Number.isNaN(score(good, walking).factors.accessibility)).toBe(true);
    expect(score(good, buggy).score).toBeGreaterThan(score(facts(), buggy).score);
    expect(score(facts({ pushchairSuitability: 'difficult' }), buggy).score).toBeLessThan(score(facts(), buggy).score);
  });

  it('a wheelchair claim speaks only to a household with a wheelchair or mobility-aid user', () => {
    const aid = profile([kid('c', 'Ida', 7, { mobility: ['mobility-aid'] })]);
    const walking = profile([kid('a', 'Cal', 7)]);
    expect(score(facts({ wheelchairAccessible: 'yes' }), aid).score).toBeGreaterThan(score(facts(), aid).score);
    expect(score(facts({ wheelchairAccessible: 'no' }), aid).score).toBeLessThan(score(facts(), aid).score);
    expect(score(facts({ wheelchairAccessible: 'yes' }), walking).score).toBe(score(facts(), walking).score);
  });
});

describe('age comes only from the venue\'s own words', () => {
  const OWN = 'fp-google-ChIJOWBQvA4FdkgRQf5iYYFF1v4'; // Battersea Park: a reviewed permanent playground for 4 to 14
  const p = (ages: number[]) => profile(ages.map((a, i) => kid(`k${i}`, `Kid${i}`, a)));

  it('a reviewed permanent provision for the child\'s age raises the factor above neutral', () => {
    const r = score(facts(), p([6]), PROPOSED_POLICY, OWN);
    expect(r.factors.ageSuitability).toBe(88);
    expect(r.basis?.age[0]).toMatchObject({ basis: 'provision' });
  });

  it('a child it does not cover stays neutral: other ages are not evidence against', () => {
    expect(score(facts(), p([2]), PROPOSED_POLICY, OWN).factors.ageSuitability).toBe(75);
  });

  it('is averaged over the children, so one covered child does not vouch for a sibling', () => {
    expect(score(facts(), p([6, 2]), PROPOSED_POLICY, OWN).factors.ageSuitability).toBe(Math.round((88 + 75) / 2));
  });

  it('a venue\'s own recommended range outranks a provision, and excludes a child it does not include', () => {
    const inside = score(facts({ minRecommendedAge: 3, maxRecommendedAge: 8 }), p([6]), PROPOSED_POLICY, OWN);
    expect(inside.factors.ageSuitability).toBe(96);
    const outside = score(facts({ minRecommendedAge: 9, maxRecommendedAge: 14 }), p([6]), PROPOSED_POLICY, OWN);
    expect(outside.factors.ageSuitability).toBe(42);
    expect(outside.basis?.age[0].basis).toBe('range_excludes');
  });

  it('the category never speaks: a park, a museum and a farm with no evidence score the same age factor', () => {
    const values = ['park', 'museum', 'farm'].map((category) => score(facts({ category }), p([6])).factors.ageSuitability);
    expect(new Set(values)).toEqual(new Set([75]));
  });

  it('a venue with no reviewed entry, and one whose entry has expired, is neutral', () => {
    expect(score(facts(), p([6]), PROPOSED_POLICY, 'fp-unreviewed-anywhere').factors.ageSuitability).toBe(75);
    const later = calculateFamilyScore(detail(facts(), OWN), p([6]), { enrichmentStatus: 'enriched', policy: PROPOSED_POLICY, now: new Date('2027-02-01T12:00:00Z') });
    expect(later.factors.ageSuitability).toBe(75);
  });
});

describe('a confirmed conflict is listed after venues without one, and only a confirmed one', () => {
  const buggy = profile([kid('a', 'Hal', 3, { mobility: ['buggy'] })], { pushchair: 'x', mustHaveFacilities: ['pushchair_friendly'] });
  const asVenue = (id: string, f: MatchableVenueFacts, drive = 20): Venue =>
    personaliseVenue({ id, name: id, category: 'museum', latitude: 51.5, longitude: -0.1, driveMinutes: drive, imageUrl: '', familyScore: { score: 0, factors: {} as never, explanation: [] }, enrichmentStatus: 'enriched', facilities: ['toilets'], trustedFacts: f } as unknown as Venue, buggy, undefined, PROPOSED_POLICY);
  const RULE = { id: 'nb', kind: 'pushchair' as const, scope: 'area' as const, coversCoreVisit: true, checkedAt: '2026-10-08', text: 'No pushchairs in the play areas.' };

  it('a buggy-dependent household\'s conflicted venue ranks below a plain one even with the higher score', () => {
    const strong = asVenue('conflicted', facts({ toilets: 'yes', babyChanging: 'yes', cafe: 'yes', pushchairSuitability: 'good', rules: [RULE] }), 5);
    const plain = asVenue('plain', facts({ pushchairSuitability: 'mixed' }), 40);
    expect(strong.familyScore.score).toBeGreaterThan(plain.familyScore.score);
    expect(strong.fitConflicts?.length).toBeGreaterThan(0);
    expect(plain.fitConflicts).toEqual([]);
    expect([strong, plain].sort((a, b) => compareVenuesForFamily(a, b, PROPOSED_POLICY)).map((v) => v.id)).toEqual(['plain', 'conflicted']);
    expect([strong, plain].sort((a, b) => compareVenuesForFamily(a, b, CURRENT_POLICY)).map((v) => v.id)).toEqual(['conflicted', 'plain']);
  });

  it('a venue nobody has confirmed anything about is not pushed down', () => {
    const unknown = asVenue('unknown', facts(), 30);
    expect(unknown.fitConflicts).toEqual([]);
  });

  it('a manageable restriction (the same rule for a household that merely brings a buggy) is a warning, not a conflict', () => {
    const merely = profile([kid('a', 'Hal', 3, { mobility: ['buggy'] })], { pushchair: 'x' });
    expect(hardConflictsFor(facts({ rules: [RULE] }), merely)).toEqual([]);
    expect(hardConflictsFor(facts({ rules: [RULE] }), buggy).map((c) => c.field)).toEqual(['venueRules']);
  });

  it('a must-have confirmed absent, a wheelchair "no" and an age policy that excludes are each a conflict', () => {
    const needsParking = profile([kid('a', 'Ada', 4)], { mustHaveFacilities: ['parking'] });
    expect(hardConflictsFor(facts({ parking: 'no' }), needsParking).map((c) => c.field)).toContain('familyFacilities.parking');
    expect(hardConflictsFor(facts({ parking: 'unknown' }), needsParking)).toEqual([]);
    const aid = profile([kid('c', 'Ida', 7, { mobility: ['mobility-aid'] })]);
    expect(hardConflictsFor(facts({ wheelchairAccessible: 'no' }), aid).map((c) => c.field)).toContain('accessibility.wheelchairAccessible');
    expect(hardConflictsFor(facts({ wheelchairAccessible: 'unknown' }), aid)).toEqual([]);
  });

  it('the drive and the date are not conflicts: they are scored and shown, and the planner enforces the date', () => {
    const limited = profile([kid('a', 'Ada', 4)], { maxDriveMinutes: 10 });
    expect(hardConflictsFor(facts({ driveMinutes: 90 }), limited)).toEqual([]);
  });
});

describe('Home, Explore and Create a Plan apply one rule to the same household', () => {
  // The same questions asked three ways: the order lists use (fitConflicts), the badge a card shows (verdict), and the planner's
  // own sequencer refusing the day. For a household's non-negotiables they must give one answer.
  const RULE = { id: 'nb', kind: 'pushchair' as const, scope: 'area' as const, coversCoreVisit: true, checkedAt: '2026-10-08', text: 'No pushchairs in the play areas.' };
  const buggyKid = kid('b', 'Hal', 3, { mobility: ['buggy'] });
  const aidKid = kid('c', 'Ida', 7, { mobility: ['mobility-aid'] });

  const plannerRefuses = (f: MatchableVenueFacts, p: FamilyProfile): boolean => {
    const family = planningFamilyFromProfile(p);
    if (typeof family === 'string') throw new Error(family);
    const near = { ...family, maxDriveMinutes: undefined };
    const request: StopRequest = { placeId: 'fp-x', name: 'Test Place', role: 'activity', anchor: true, dwellMinutes: 90, facts: { ...f, driveMinutes: 10 } };
    const matrix = { legs: { [homeKey(near.id)]: { [stopKey('fp-x')]: { minutes: 10, source: 'estimated' as const } }, [stopKey('fp-x')]: { [homeKey(near.id)]: { minutes: 10, source: 'estimated' as const } } } };
    const result = sequenceDay([request], [near], matrix, { date: '2026-11-10', leaveAt: '09:00', arriveAt: '10:30', returnBy: '', bufferMinutes: 15, environment: 'either' } as SequenceOptions, NOW);
    if (result.ok) return false;
    const failure = result.failure.reason === 'no-feasible-sequence' && result.failure.nearest ? result.failure.nearest : result.failure;
    return failure.reason === 'requirement-unmet';
  };
  const home = (f: MatchableVenueFacts, p: FamilyProfile) => {
    const v = personaliseVenue({ id: 'fp-x', name: 'Test Place', category: 'museum', latitude: 51.5, longitude: -0.1, driveMinutes: 10, imageUrl: '', familyScore: { score: 0, factors: {} as never, explanation: [] }, enrichmentStatus: 'enriched', facilities: [], trustedFacts: f } as unknown as Venue, p, undefined, PROPOSED_POLICY);
    return { conflict: (v.fitConflicts?.length ?? 0) > 0, poor: v.familyMatch?.verdict === 'poor' };
  };

  // The hard-conflict policy is what makes "no parking" an unchecked fact, not a refusal, for a party with a wheelchair user.
  const was = process.env.EXPO_PUBLIC_FAMILY_FIT_V2;
  beforeAll(() => { process.env.EXPO_PUBLIC_FAMILY_FIT_V2 = 'all'; });
  afterAll(() => { if (was === undefined) delete process.env.EXPO_PUBLIC_FAMILY_FIT_V2; else process.env.EXPO_PUBLIC_FAMILY_FIT_V2 = was; });

  const cases: Array<[string, MatchableVenueFacts, FamilyProfile, boolean]> = [
    ['"no parking" for a wheelchair user who needs parking: disabled bays are not covered by it, so it is to check', facts({ parking: 'no', toilets: 'yes' }), profile([aidKid], { mustHaveFacilities: ['parking'] }), false],
    ['"no parking" for a household that needs parking and has no wheelchair user', facts({ parking: 'no', toilets: 'yes' }), profile([kid('a', 'Cal', 7)], { mustHaveFacilities: ['parking'] }), true],
    ['a must-have confirmed absent', facts({ parking: 'no', toilets: 'yes' }), profile([kid('a', 'Ada', 4)], { mustHaveFacilities: ['parking'] }), true],
    ['a must-have nobody has confirmed', facts({ toilets: 'yes' }), profile([kid('a', 'Ada', 4)], { mustHaveFacilities: ['parking'] }), false],
    ['a must-have confirmed present', facts({ parking: 'yes', toilets: 'yes' }), profile([kid('a', 'Ada', 4)], { mustHaveFacilities: ['parking'] }), false],
    ['wheelchair access confirmed absent, for a wheelchair user', facts({ wheelchairAccessible: 'no' }), profile([aidKid]), true],
    ['wheelchair access unconfirmed, for a wheelchair user', facts(), profile([aidKid]), false],
    ['wheelchair access confirmed present', facts({ wheelchairAccessible: 'yes' }), profile([aidKid]), false],
    ['a core pushchair restriction, for a household that stated buggy access', facts({ rules: [RULE] }), profile([buggyKid], { pushchair: 'x', mustHaveFacilities: ['pushchair_friendly'] }), true],
    ['the same restriction, for a household that merely brings a buggy', facts({ rules: [RULE] }), profile([buggyKid], { pushchair: 'x' }), false],
    ['the same restriction, for a household with no buggy', facts({ rules: [RULE] }), profile([kid('a', 'Cal', 9)]), false],
    ['nothing known about the venue at all', facts(), profile([buggyKid], { pushchair: 'x', mustHaveFacilities: ['pushchair_friendly', 'toilets', 'parking'] }), false],
  ];

  it.each(cases)('%s', (_name, f, p, expectedConflict) => {
    const h = home(f, p);
    expect(h.conflict).toBe(expectedConflict);
    expect(plannerRefuses(f, p)).toBe(expectedConflict);
    // The card says it too: a confirmed conflict is "Probably not"; anything unconfirmed or manageable is not.
    expect(h.poor).toBe(expectedConflict);
  });
});
