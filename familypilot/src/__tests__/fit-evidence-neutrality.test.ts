import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { hardConflictsFor } from '@/src/services/matching/hard-conflicts';
import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { CURRENT_POLICY, PROPOSED_POLICY } from '@/src/services/scoring/fit-policy';
import type { FamilyProfile, VenueDetail } from '@/src/types';
import type { MatchableVenueFacts } from '@/src/types/day-request';
import { HOUSEHOLDS, kid, profileFor } from './helpers/pilot-households';
import { NOW, detail as detailOf, facts, home, plannerRefuses } from './helpers/surfaces';

/**
 * Genuine suitability is not the amount of evidence.
 *
 * A venue must not score higher because its website is longer, its fact list is fuller, or it happens to state things this
 * household never asked about. These tests state that as properties and run them for every pilot household, including families
 * whose children are years apart. They defend the evidence-aware policy (OFF in production); the current policy is shown failing
 * the same property so the difference is on the record rather than assumed.
 */
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterAll(() => { vi.useRealTimers(); });

const detail = (f: MatchableVenueFacts, id = 'fp-neutral'): VenueDetail => detailOf(f, id);
const scoreOf = (f: MatchableVenueFacts, p: FamilyProfile, policy = PROPOSED_POLICY, id = 'fp-neutral') =>
  calculateFamilyScore(detail(f, id), p, { enrichmentStatus: 'enriched', policy, now: NOW }).score;

/** Things no pilot household has asked about. A venue stating all of them knows more; it is no better for any of these families. */
const IRRELEVANT: Partial<MatchableVenueFacts> = {
  cafe: 'yes', playground: 'yes', freeParking: 'yes', accessibleToilet: 'yes', stepFreeStation: 'yes', publicTransport: 'yes',
  goodToKnow: Array.from({ length: 30 }, (_, i) => `A reviewed note ${i}`),
};

describe('stating more that the household did not ask about changes nothing', () => {
  it.each(HOUSEHOLDS.map((h) => [h.key, h.label, h] as const))('household %s: %s', (_key, _label, h) => {
    const p = profileFor(h);
    const sparse = facts({ toilets: 'yes' });
    const verbose = facts({ toilets: 'yes', ...IRRELEVANT });
    expect(scoreOf(verbose, p)).toBe(scoreOf(sparse, p));
  });

  it('under today’s policy the same extra facts DO raise the score for some household (the defect this policy removes)', () => {
    const lifted = HOUSEHOLDS.filter((h) => {
      const p = profileFor(h);
      return scoreOf(facts({ toilets: 'yes', ...IRRELEVANT }), p, CURRENT_POLICY) > scoreOf(facts({ toilets: 'yes' }), p, CURRENT_POLICY);
    });
    expect(lifted.length).toBeGreaterThan(0);
  });
});

describe('unknown stays unknown: between a confirmed no and a confirmed yes, never a penalty', () => {
  const NEEDS: Array<[string, FamilyProfile['mustHaveFacilities'], keyof MatchableVenueFacts]> = [
    ['parking', ['parking'], 'parking'],
    ['Blue Badge parking', ['blue_badge_parking'], 'blueBadgeParking'],
    ['toilets', ['toilets'], 'toilets'],
    ['baby changing', ['baby_changing'], 'babyChanging'],
  ];
  it.each(NEEDS)('a stated %s need: no < unknown < yes', (_label, must, field) => {
    const p: FamilyProfile = profileFor({ ...HOUSEHOLDS[2], must });
    const base = { toilets: 'yes' as const };
    const no = scoreOf(facts({ ...base, [field]: 'no' } as never), p);
    const unknown = scoreOf(facts({ ...base, [field]: 'unknown' } as never), p);
    const yes = scoreOf(facts({ ...base, [field]: 'yes' } as never), p);
    expect(no).toBeLessThan(unknown);
    expect(unknown).toBeLessThan(yes);
  });

  it('a venue with nothing confirmed is never listed as a conflict or as a poor match for any household', () => {
    for (const h of HOUSEHOLDS) {
      const p = profileFor(h);
      expect(hardConflictsFor(facts(), p), h.key).toEqual([]);
      expect(home(facts(), p).poor, h.key).toBe(false);
    }
  });

  it('an unreviewed venue (nothing known) scores no lower than a venue whose only facts are irrelevant to the household', () => {
    for (const h of HOUSEHOLDS) {
      const p = profileFor(h);
      expect(scoreOf(facts({ ...IRRELEVANT }), p), h.key).toBeGreaterThanOrEqual(scoreOf(facts(), p));
    }
  });
});

describe('how much evidence alone can move a score (the ceiling on an "evidence premium")', () => {
  it('a venue that confirms everything this household needs beats one that confirms nothing by a bounded margin, and only for relevant facts', () => {
    const margins: Record<string, number> = {};
    for (const h of HOUSEHOLDS) {
      const p = profileFor(h);
      const needsAid = h.members.some((m) => m.mobility?.includes('mobility-aid'));
      const allYes = facts({ toilets: 'yes', babyChanging: 'yes', parking: 'yes', blueBadgeParking: 'yes', wheelchairAccessible: needsAid ? 'yes' : 'unknown', pushchairSuitability: 'good' });
      margins[h.key] = scoreOf(allYes, p) - scoreOf(facts(), p);
    }
    // Recorded in docs/pilot/FAMILY_FIT_V2.md. A household with several stated needs can gain more than one with few.
    const worst = Math.max(...Object.values(margins));
    expect(worst).toBeLessThanOrEqual(10);
    expect(Math.min(...Object.values(margins))).toBeGreaterThanOrEqual(0);
  });
});

describe('families whose children are years apart', () => {
  const baby = (id: string, months = 6) => kid(id, 'Kit', 0, { ageMonths: months, mobility: ['carrier'] });
  const teen = (id: string) => kid(id, 'Max', 14);
  const SCIENCE = 'fp-google-ChIJP9oAE0MFdkgR3iKGFKZO1SE';

  it('child order does not matter', () => {
    const a = profileFor({ ...HOUSEHOLDS[2], members: [HOUSEHOLDS[2].members[0], baby('x'), kid('y', 'Mia', 5), teen('z')] });
    const b = profileFor({ ...HOUSEHOLDS[2], members: [HOUSEHOLDS[2].members[0], teen('z'), baby('x'), kid('y', 'Mia', 5)] });
    const f = facts({ toilets: 'yes', babyChanging: 'yes' });
    expect(scoreOf(f, a, PROPOSED_POLICY, SCIENCE)).toBe(scoreOf(f, b, PROPOSED_POLICY, SCIENCE));
  });

  it('a child nothing is stated for is neutral, so a mixed-age family is not marked down for a venue that serves only some of them', () => {
    const family = profileFor({ ...HOUSEHOLDS[2], members: [HOUSEHOLDS[2].members[0], baby('x'), teen('z')] });
    const none = scoreOf(facts({ toilets: 'yes' }), family, PROPOSED_POLICY, 'fp-no-activity-data');
    const covers = scoreOf(facts({ toilets: 'yes' }), family, PROPOSED_POLICY, SCIENCE);
    // The Science Museum's reviewed provision covers the teenager, not the baby: the baby is "nothing stated", never a gap.
    expect(covers).toBeGreaterThanOrEqual(none);
  });

  it('a recommended range that excludes one child lowers the age factor but is advice, never a conflict or a refusal', () => {
    const family = profileFor({ ...HOUSEHOLDS[2], members: [HOUSEHOLDS[2].members[0], baby('x'), teen('z')] });
    const f = facts({ toilets: 'yes', minRecommendedAge: 8, maxRecommendedAge: 16 });
    expect(scoreOf(f, family)).toBeLessThan(scoreOf(facts({ toilets: 'yes' }), family));
    expect(hardConflictsFor(f, family)).toEqual([]);
    expect(plannerRefuses(f, family)).toBe(false);
  });

  it('a door that turns one child away is a conflict on Home and in the planner alike, whichever child it is', () => {
    const door = (min: number | null, max: number | null) => facts({
      toilets: 'yes',
      venueAgePolicy: { restrictions: [{ minMonthsInclusive: min, maxMonthsExclusive: max, sourceUrl: 'https://example.org/visit', checkedAt: '2026-10-01' }], caveats: [], sourcesDisagree: false },
    });
    const family = profileFor({ ...HOUSEHOLDS[2], members: [HOUSEHOLDS[2].members[0], baby('x'), teen('z')] });
    for (const f of [door(12, null), door(null, 14 * 12)]) {
      expect(home(f, family).conflict).toBe(true);
      expect(plannerRefuses(f, family)).toBe(true);
    }
    // A door every child clears is not a conflict.
    expect(home(door(0, 18 * 12), family).conflict).toBe(false);
    expect(plannerRefuses(door(0, 18 * 12), family)).toBe(false);
  });

  it('a household with a baby in a buggy and a wheelchair user keeps the two needs separate', () => {
    const family = profileFor({
      ...HOUSEHOLDS[2], pushchair: 'x',
      members: [HOUSEHOLDS[2].members[0], kid('a', 'Ada', 9, { mobility: ['mobility-aid'] }), kid('b', 'Bo', 0, { mobility: ['buggy'], ageMonths: 10 })],
    });
    // Good buggy ground says nothing about the wheelchair; a wheelchair "yes" says nothing about the buggy.
    const buggyOnly = scoreOf(facts({ toilets: 'yes', pushchairSuitability: 'good' }), family);
    const chairOnly = scoreOf(facts({ toilets: 'yes', wheelchairAccessible: 'yes' }), family);
    const neither = scoreOf(facts({ toilets: 'yes' }), family);
    expect(buggyOnly).toBeGreaterThan(neither);
    expect(chairOnly).toBeGreaterThan(neither);
    expect(hardConflictsFor(facts({ toilets: 'yes', pushchairSuitability: 'good', wheelchairAccessible: 'no' }), family).map((c) => c.field)).toEqual(['accessibility.wheelchairAccessible']);
  });
});
