import AsyncStorage from '@react-native-async-storage/async-storage';
import { describe, expect, it } from 'vitest';

import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';
import { evaluateFamilyMatch } from '@/src/services/matching/family-match';
import { optionsToRemember } from '@/src/services/planning/plan-draft';
import { familyRequest, PlanningFamily } from '@/src/services/planning/planner';
import { parseDayRequestMock } from '@/src/services/recommendation/parse-day-request-client';
import { buildProactiveDayRequest } from '@/src/services/recommendation/proactive-day-request';
import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { blendFactors } from '@/src/services/scoring/blend';
import { useFamilyStore } from '@/src/stores/family-store';
import { migratePlanningState } from '@/src/stores/planning-migration';
import { FamilyProfile, Venue, VenueDetail } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { filterRestaurants } from '@/src/utils/filter-restaurants';
import { personaliseVenue } from '@/src/utils/personalise-venues';
import { budgetTierOf, driveLimitMinutes, planningFamilyWithoutLegacyDefaults, withoutLegacyDefaults } from '@/src/utils/preferences';
import { computeCompletionPercent } from '@/src/utils/profile-completion';
import { createEmptyProfile } from '@/src/utils/profile-defaults';
import { profileReceipt } from '@/src/utils/profile-receipt';

/**
 * An untouched system default must never become a user restriction.
 *
 * Every profile used to be created with a 30 minute journey limit and a "moderate" budget that nobody chose. A venue 34
 * minutes away (Whitechapel Gallery from the real-device recording) was cautioned as "4 min over the 30 min drive we're
 * using" and ranked down, although the parent had never said how far they would go.
 */

const child = (id: string, name: string, age: number) => ({ id, name, role: 'child', dateOfBirth: '', age, dobKnown: true, mobility: ['walks'] });
const FAMILY = {
  ...createEmptyProfile(),
  parentName: 'Aidan', homeLocation: 'N1', homeLatitude: 51.53, homeLongitude: -0.1,
  members: [{ id: 'p', name: 'Aidan', role: 'parent', dateOfBirth: '', age: 38 }, child('c1', 'Sloane', 4)],
} as unknown as FamilyProfile;

const FACTS = {
  placeId: 'p', name: 'Whitechapel Gallery', category: 'museum', driveMinutes: 34, enrichmentStatus: 'enriched',
  minRecommendedAge: null, maxRecommendedAge: null, venueAgePolicy: null,
  toilets: 'yes', babyChanging: 'yes', parking: 'unknown', freeParking: 'unknown', pushchairSuitability: 'good',
  environment: 'indoor', energyLevel: 'moderate', visitDurationMinutes: null, estimatedSpend: 'Free',
  goodToKnow: [], warnings: [], openingStatus: 'unknown',
} as unknown as MatchableVenueFacts;

const venue = (driveMinutes: number): Venue => ({
  id: 'fp-wc', name: 'Whitechapel Gallery', category: 'museum', latitude: 51.5, longitude: -0.07, driveMinutes, imageUrl: '',
  familyScore: { score: 0, factors: {}, explanation: [] }, enrichmentStatus: 'enriched',
  trustedFacts: { ...FACTS, driveMinutes }, facilities: ['toilets', 'baby_changing'], estimatedSpend: 'Free',
} as unknown as Venue);

describe('the correctness bug: a 34 minute place under a limit nobody stated', () => {
  it('a new profile has no limit and no budget', () => {
    expect(driveLimitMinutes(FAMILY)).toBeNull();
    expect(budgetTierOf(FAMILY)).toBeNull();
    expect('maxDriveMinutes' in FAMILY).toBe(false);
    expect('budgetTier' in FAMILY).toBe(false);
  });

  it('34 minutes is not "over" anything: no caution, no breach, no drive wording on the card or the page', () => {
    const v = personaliseVenue(venue(34), FAMILY);
    const said = JSON.stringify([v.familyMatch, v.familyScore.cautions, v.familyScore.explanation]);
    expect(said).not.toMatch(/over the|further than|drive we.re using|min over/i);
    expect(v.familyMatch!.cautions.map((l) => l.key)).not.toContain('drive-over');
    // The journey is still shown, as a fact.
    expect(v.familyMatch!.reasons.map((l) => l.text)).toContain('34 min away');
  });

  it('the same place under a limit the parent DID state is still flagged (explicit choices are respected)', () => {
    const v = personaliseVenue(venue(34), { ...FAMILY, maxDriveMinutes: 30 });
    expect(v.familyMatch!.cautions.map((l) => l.text)).toContain('34 min away, 4 min over the 30 min drive we’re using');
    expect(v.familyScore.cautions).toContain('Further than the 30 min drive we’re using');
  });

  it('with no limit, distance orders places gently: 34 minutes ranks only a little below 25, never off a cliff', () => {
    const near = calculateFamilyScore(venue(25) as unknown as VenueDetail, FAMILY);
    const far = calculateFamilyScore(venue(34) as unknown as VenueDetail, FAMILY);
    expect(far.score).toBeLessThanOrEqual(near.score);
    expect(near.score - far.score).toBeLessThanOrEqual(2);
    // Before: a 30 minute limit nobody chose scored 34 minutes at 43 against 75 at 30.
    expect(far.factors.distance).toBeGreaterThanOrEqual(85);
    // And a long journey is lower than a short one, but is never a hard drop.
    const veryFar = calculateFamilyScore(venue(90) as unknown as VenueDetail, FAMILY);
    expect(veryFar.factors.distance).toBeGreaterThanOrEqual(55);
  });

  it('the verdict does not depend on distance when no limit is stated', () => {
    const verdicts = [5, 20, 34, 60, 110].map((m) => personaliseVenue(venue(m), FAMILY).familyMatch!.verdict);
    expect(new Set(verdicts).size).toBe(1);
  });
});

describe('no budget stated: price takes no part', () => {
  it('a family with no budget scores a free and an expensive place identically on price (no factor at all)', () => {
    const free = calculateFamilyScore({ ...venue(10), estimatedSpend: 'Free', trustedFacts: { ...FACTS, estimatedSpend: 'Free' } } as unknown as VenueDetail, FAMILY);
    const dear = calculateFamilyScore({ ...venue(10), estimatedSpend: '£££', trustedFacts: { ...FACTS, estimatedSpend: '£££' } } as unknown as VenueDetail, FAMILY);
    expect(free.factors.budgetFit).toBeUndefined();
    expect(dear.factors.budgetFit).toBeUndefined();
    expect(free.score).toBe(dear.score);
    expect([...free.explanation, ...dear.explanation].join(' ')).not.toMatch(/spend|budget/i);
  });

  it('a stated budget still matters', () => {
    const budget = { ...FAMILY, budgetTier: 'budget' as const };
    const free = calculateFamilyScore({ ...venue(10), trustedFacts: { ...FACTS, estimatedSpend: 'Free' } } as unknown as VenueDetail, budget);
    const dear = calculateFamilyScore({ ...venue(10), trustedFacts: { ...FACTS, estimatedSpend: '£££' } } as unknown as VenueDetail, budget);
    expect(free.score).toBeGreaterThan(dear.score);
  });

  it('the blend leaves an absent factor out rather than scoring it', () => {
    expect(blendFactors({ a: 0.5, b: 0.5 }, { a: 100, b: undefined })).toBe(100);
    expect(blendFactors({ a: 0.5, b: 0.5 }, { a: 100, b: 0 })).toBe(50);
  });
});

describe('requests and plans only carry what the family stated', () => {
  const kids = (p: FamilyProfile) => p;
  it('proactive and parsed requests have no journey or budget constraint for a new profile, and have them when stated', () => {
    for (const build of [(p: FamilyProfile) => buildProactiveDayRequest(p, null), (p: FamilyProfile) => parseDayRequestMock('somewhere indoors', p)]) {
      const none = build(kids(FAMILY));
      expect(none.constraints.journey).toBeUndefined();
      expect(none.constraints.budget).toBeUndefined();
      expect(none.maxDriveMinutes).toBeUndefined();
      const stated = build({ ...FAMILY, maxDriveMinutes: 45, budgetTier: 'budget' });
      expect(stated.constraints.journey).toEqual({ strength: 'required', value: { maxMinutes: 45 } });
      expect(stated.constraints.budget).toBeDefined();
    }
  });

  it('a place 80 minutes away is not excluded for a family with no limit, and is for one with a stated limit', () => {
    const far = { ...FACTS, driveMinutes: 80 };
    expect(matchVenueToDayRequest(far, buildProactiveDayRequest(FAMILY, null)).eligible).toBe(true);
    expect(matchVenueToDayRequest(far, buildProactiveDayRequest({ ...FAMILY, maxDriveMinutes: 45 }, null)).eligible).toBe(false);
  });

  it('a planning family with no limit or budget produces no journey or budget constraint', () => {
    const family: PlanningFamily = { id: 'mine', label: 'Our family', area: 'N1', latitude: 51.5, longitude: -0.1, ages: [4], pushchair: false, required: [], routines: [] };
    const request = familyRequest(family, 'either');
    expect(request.constraints.journey).toBeUndefined();
    expect(request.constraints.budget).toBeUndefined();
    expect(familyRequest({ ...family, maxDriveMinutes: 30 }, 'either').constraints.journey?.value).toEqual({ maxMinutes: 30 });
  });

  it('a connected family added by postcode has no limit or budget invented for it', () => {
    const connection = planningFamilyWithoutLegacyDefaults({ id: 'guest-1', maxDriveMinutes: 120, budgetTier: 'moderate' });
    expect('maxDriveMinutes' in connection).toBe(false);
    expect('budgetTier' in connection).toBe(false);
  });
});

describe('Explore "Any" means any', () => {
  it('restaurants beyond the profile limit plus ten minutes are kept when the filter says any distance', () => {
    const r = (id: string, driveMinutes: number) => ({ id, driveMinutes, restaurantFeatures: {}, familyScore: { score: 50 }, estimatedSpend: '£' }) as never;
    const kept = filterRestaurants([r('near', 10), r('far', 75)], [], 'any', 'any');
    expect(kept.map((x: { id: string }) => x.id).sort()).toEqual(['far', 'near']);
    expect(filterRestaurants([r('near', 10), r('far', 75)], [], 30, 'any')).toHaveLength(1);
  });
});

describe('legacy profiles: ambiguous defaults read as unset, explicit choices are kept', () => {
  it('30 minutes and "moderate" are cleared; anything else was chosen and stays', () => {
    expect(withoutLegacyDefaults({ maxDriveMinutes: 30, budgetTier: 'moderate' })).toEqual({});
    expect(withoutLegacyDefaults({ maxDriveMinutes: 45, budgetTier: 'budget' })).toEqual({ maxDriveMinutes: 45, budgetTier: 'budget' });
    expect(withoutLegacyDefaults({ maxDriveMinutes: 15, budgetTier: 'premium' })).toEqual({ maxDriveMinutes: 15, budgetTier: 'premium' });
    expect(withoutLegacyDefaults({ maxDriveMinutes: 30, budgetTier: 'premium' })).toEqual({ budgetTier: 'premium' });
    expect(withoutLegacyDefaults({})).toEqual({});
  });

  const blob = (version: number, over: Record<string, unknown>) => JSON.stringify({
    state: {
      profile: {
        id: 'family-1', parentName: 'Aidan', homeLocation: 'Bushey', completionPercent: 50, routines: [], mustHaveFacilities: [],
        members: [{ id: 'p', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 30 }, { id: 'c1', name: 'Rosie', role: 'child', dateOfBirth: '2020-01-01', dobKnown: true, age: 6 }],
        ...over,
      },
      hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 4,
    },
    version,
  });
  const rehydrate = async (raw: string) => {
    await AsyncStorage.setItem('familypilot-family-v1', raw);
    await useFamilyStore.persist.rehydrate();
    return useFamilyStore.getState().profile;
  };

  it('a stored v1 profile with the old defaults loses them; its other data is untouched', async () => {
    const profile = await rehydrate(blob(1, { maxDriveMinutes: 30, budgetTier: 'moderate', mustHaveFacilities: ['toilets'], vehicle: 'Golf' }));
    expect(driveLimitMinutes(profile)).toBeNull();
    expect(budgetTierOf(profile)).toBeNull();
    expect(profile.mustHaveFacilities).toEqual(['toilets']);
    expect(profile.vehicle).toBe('Golf');
    expect(profile.members.some((m) => m.name === 'Rosie')).toBe(true);
  });

  it('a stored v1 profile with a limit or budget the parent changed keeps them', async () => {
    const profile = await rehydrate(blob(1, { maxDriveMinutes: 45, budgetTier: 'budget' }));
    expect(driveLimitMinutes(profile)).toBe(45);
    expect(budgetTierOf(profile)).toBe('budget');
  });

  it('a v2 profile with an explicit 30 minutes is a choice and is kept', async () => {
    const profile = await rehydrate(blob(2, { maxDriveMinutes: 30, budgetTier: 'moderate' }));
    expect(driveLimitMinutes(profile)).toBe(30);
    expect(budgetTierOf(profile)).toBe('moderate');
  });

  it('saved planning families and the remembered start lose the app’s own values but keep typed ones', () => {
    const stored = () => ({
      families: [
        { id: 'guest-1', label: 'The Shaws', area: 'Richmond', latitude: 51.46, longitude: -0.3, ages: [6], maxDriveMinutes: 120, budgetTier: 'moderate', pushchair: false, required: [], routines: [] },
        { id: 'guest-2', label: 'The Hills', area: 'Kew', latitude: 51.47, longitude: -0.29, ages: [3], maxDriveMinutes: 25, budgetTier: 'premium', pushchair: false, required: [], routines: [] },
        { id: 'mine', label: 'Our family', area: 'N1', latitude: 51.5, longitude: -0.1, ages: [4], maxDriveMinutes: 30, budgetTier: 'moderate', pushchair: false, required: [], routines: [] },
      ],
      options: { date: '2026-10-01', leaveAt: '14:30', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' },
      saved: [], savedDays: [],
    });
    const migrated = migratePlanningState<ReturnType<typeof stored>>(stored(), 0);
    const [shaws, hills, mine] = migrated.families as Array<Record<string, unknown>>;
    expect('maxDriveMinutes' in shaws).toBe(false);
    expect('budgetTier' in shaws).toBe(false);
    expect(hills).toMatchObject({ maxDriveMinutes: 25, budgetTier: 'premium' });
    expect('maxDriveMinutes' in mine).toBe(false);
    expect(migrated.options.leaveAt).toBe('');
    expect(migrated.options.date).toBe('2026-10-01');
    expect(migrated.saved).toEqual([]);
    // At the current version nothing is touched.
    expect(migratePlanningState<ReturnType<typeof stored>>(stored(), 1).options.leaveAt).toBe('14:30');
  });
});

describe('completion and receipts only count what the family gave', () => {
  it('a profile with the essentials is complete; travel limit, budget, car and memberships are not part of it', () => {
    expect(computeCompletionPercent(createEmptyProfile())).toBe(0);
    expect(computeCompletionPercent(FAMILY)).toBe(100); // a name, a home area, a child with a real birthday
    expect(computeCompletionPercent({ ...FAMILY, vehicle: 'Golf', memberships: ['NT'], maxDriveMinutes: 30, budgetTier: 'moderate' })).toBe(100);
    const noBirthday = { ...FAMILY, members: [FAMILY.members[0], { ...FAMILY.members[1], dobKnown: false }] } as FamilyProfile;
    expect(computeCompletionPercent(noBirthday)).toBe(75);
  });

  it('the receipt names a limit only when there is one', () => {
    expect(profileReceipt(FAMILY)).not.toMatch(/drive/);
    expect(profileReceipt({ ...FAMILY, maxDriveMinutes: 45 })).toMatch(/max 45 min drive/);
  });
});

describe('the plan sheet remembers only what the parent changed', () => {
  const suggested = { date: '2026-10-07', startAt: '14:30' };
  it('an untouched suggestion is not stored (it is worked out again next time)', () => {
    expect(optionsToRemember({ ...suggested }, suggested)).toEqual({});
  });
  it('a changed start or date is stored, and only that', () => {
    expect(optionsToRemember({ date: '2026-10-07', startAt: '10:00' }, suggested)).toEqual({ leaveAt: '10:00' });
    expect(optionsToRemember({ date: '2026-10-11', startAt: '14:30' }, suggested)).toEqual({ date: '2026-10-11' });
    expect(optionsToRemember({ date: '2026-10-11', startAt: '09:00' }, suggested)).toEqual({ date: '2026-10-11', leaveAt: '09:00' });
  });
});

describe('server-side request building honours an unset limit and budget', () => {
  it('no journey or budget constraint without them; both with them', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { reconcileConstraints } = require('../../../server/recommendations/day-request-schema') as { reconcileConstraints: (e: object, s: object, p: object) => Record<string, unknown> };
    const none = reconcileConstraints({}, {}, { members: [] });
    expect(none.journey).toBeUndefined();
    expect(none.budget).toBeUndefined();
    expect(none.ageRecommendedFit).toBeDefined();
    const stated = reconcileConstraints({}, {}, { members: [], maxDriveMinutes: 45, budgetTier: 'budget' });
    expect(stated.journey).toEqual({ strength: 'required', value: { maxMinutes: 45 } });
    expect(stated.budget).toBeDefined();
    // The model cannot smuggle one in.
    expect(reconcileConstraints({}, { journey: { strength: 'required', value: { maxMinutes: 10 } } }, { members: [] }).journey).toBeUndefined();
  });
});

describe('stable verdict: evaluateFamilyMatch ignores the unset limit', () => {
  it('NaN and absent limits are the same as no limit', () => {
    const a = evaluateFamilyMatch({ venue: venue(80), profile: { ...FAMILY, maxDriveMinutes: Number.NaN }, score: 80 });
    const b = evaluateFamilyMatch({ venue: venue(80), profile: FAMILY, score: 80 });
    expect(a).toEqual(b);
  });
});
