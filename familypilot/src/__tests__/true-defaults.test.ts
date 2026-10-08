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
import { safeSnapshot } from '../../../api/planning/connections';
import { snapshotForSharing } from '@/src/services/planning/connection-snapshot';
import { migrateLegacyProfile } from '@/src/utils/profile-migration';
import {
  budgetTierOf,
  driveLimitMinutes,
  planningFamilyWithoutLegacyDefaults,
  restoreStashedPreferences,
  sharedFamilyPreferences,
  stashLegacyDefaults,
  unconfirmedValue,
  withoutUnconfirmed,
} from '@/src/utils/preferences';
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
    for (const build of [(p: FamilyProfile) => buildProactiveDayRequest(p), (p: FamilyProfile) => parseDayRequestMock('somewhere indoors', p)]) {
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
    expect(matchVenueToDayRequest(far, buildProactiveDayRequest(FAMILY)).eligible).toBe(true);
    expect(matchVenueToDayRequest(far, buildProactiveDayRequest({ ...FAMILY, maxDriveMinutes: 45 })).eligible).toBe(false);
  });

  it('a planning family with no limit or budget produces no journey or budget constraint', () => {
    const family: PlanningFamily = { id: 'mine', label: 'Our family', area: 'N1', latitude: 51.5, longitude: -0.1, ages: [4], pushchair: false, required: [], routines: [] };
    const request = familyRequest(family, 'either');
    expect(request.constraints.journey).toBeUndefined();
    expect(request.constraints.budget).toBeUndefined();
    expect(familyRequest({ ...family, maxDriveMinutes: 30 }, 'either').constraints.journey?.value).toEqual({ maxMinutes: 30 });
  });

  it('a connected family added by postcode has no limit or budget invented for it', () => {
    const connection = planningFamilyWithoutLegacyDefaults({ id: 'guest-1', maxDriveMinutes: 120, budgetTier: 'moderate' }, NOW);
    expect('maxDriveMinutes' in connection).toBe(false);
    expect('budgetTier' in connection).toBe(false);
    // ...and what was there is set aside, not lost.
    expect(connection.unconfirmedPreferences).toMatchObject({ maxDriveMinutes: 120, budgetTier: 'moderate' });
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

const NOW = '2026-10-08T09:00:00.000Z';

describe('legacy profiles: ambiguous defaults are set aside (kept, not applied); explicit choices are untouched', () => {
  it('30 minutes and "moderate" are set aside; anything else was chosen and stays exactly where it is', () => {
    const ambiguous = stashLegacyDefaults({ maxDriveMinutes: 30, budgetTier: 'moderate' }, NOW);
    expect('maxDriveMinutes' in ambiguous).toBe(false);
    expect('budgetTier' in ambiguous).toBe(false);
    expect(ambiguous.unconfirmedPreferences).toEqual({ maxDriveMinutes: 30, budgetTier: 'moderate', reason: 'legacy-default-or-choice', recordedAt: NOW });

    const chosen = { maxDriveMinutes: 45, budgetTier: 'budget' };
    expect(stashLegacyDefaults(chosen, NOW)).toBe(chosen); // not even copied
    expect(stashLegacyDefaults({ maxDriveMinutes: 15, budgetTier: 'premium' }, NOW)).toEqual({ maxDriveMinutes: 15, budgetTier: 'premium' });
    expect(stashLegacyDefaults({ maxDriveMinutes: 30, budgetTier: 'premium' }, NOW)).toEqual({
      budgetTier: 'premium',
      unconfirmedPreferences: { maxDriveMinutes: 30, reason: 'legacy-default-or-choice', recordedAt: NOW },
    });
    expect(stashLegacyDefaults({}, NOW)).toEqual({});
  });

  it('nothing set aside is ever read as a limit or a budget', () => {
    const profile = stashLegacyDefaults({ ...FAMILY, maxDriveMinutes: 30, budgetTier: 'moderate' } as FamilyProfile, NOW);
    expect(driveLimitMinutes(profile)).toBeNull();
    expect(budgetTierOf(profile)).toBeNull();
    // The one reader of the stash is the question put to the parent.
    expect(unconfirmedValue(profile, 'maxDriveMinutes')).toBe(30);
    expect(unconfirmedValue(profile, 'budgetTier')).toBe('moderate');
    // Everything downstream treats it exactly as a profile that never had either.
    const v = personaliseVenue(venue(34), profile);
    expect(v.familyMatch!.cautions.map((l) => l.key)).not.toContain('drive-over');
    expect(JSON.stringify(v.familyMatch)).toEqual(JSON.stringify(personaliseVenue(venue(34), FAMILY).familyMatch));
    const request = buildProactiveDayRequest(profile);
    expect(request.constraints.journey).toBeUndefined();
    expect(request.constraints.budget).toBeUndefined();
    expect(JSON.stringify(request)).not.toMatch(/unconfirmed/);
    // What a connection is sent: no limit, no budget, and the marker that says so.
    const shared = snapshotForSharing(profile);
    expect('maxDriveMinutes' in shared).toBe(false);
    expect('budgetTier' in shared).toBe(false);
    expect(shared.preferencesStated).toBe(true);
    expect(JSON.stringify(shared)).not.toMatch(/unconfirmed/);
  });

  it('is idempotent and reversible: restoring gives back exactly what was stored', () => {
    for (const before of [
      { maxDriveMinutes: 30, budgetTier: 'moderate', vehicle: 'Golf' },
      { maxDriveMinutes: 30, budgetTier: 'premium' },
      { maxDriveMinutes: 45, budgetTier: 'moderate' },
    ]) {
      const once = stashLegacyDefaults(before, NOW);
      expect(stashLegacyDefaults(once, '2030-01-01T00:00:00.000Z')).toEqual(once);
      expect(restoreStashedPreferences(once)).toEqual(before);
    }
  });

  it('restoring never overwrites a choice made since', () => {
    const once = stashLegacyDefaults({ maxDriveMinutes: 30, budgetTier: 'moderate' }, NOW);
    const later = { ...once, maxDriveMinutes: 60 };
    expect(restoreStashedPreferences(later)).toMatchObject({ maxDriveMinutes: 60, budgetTier: 'moderate' });
  });

  it('answering one question leaves the other open; answering both leaves nothing behind', () => {
    const once = stashLegacyDefaults({ maxDriveMinutes: 30, budgetTier: 'moderate' }, NOW);
    const driveAnswered = withoutUnconfirmed(once, ['maxDriveMinutes']);
    expect(driveAnswered.unconfirmedPreferences).toEqual({ budgetTier: 'moderate', reason: 'legacy-default-or-choice', recordedAt: NOW });
    expect('unconfirmedPreferences' in withoutUnconfirmed(once, ['maxDriveMinutes', 'budgetTier'])).toBe(false);
    expect(withoutUnconfirmed(once, [])).toBe(once);
  });

  it('survives a later profile migration instead of being dropped by it', () => {
    const once = stashLegacyDefaults({ ...FAMILY, maxDriveMinutes: 30 } as FamilyProfile, NOW);
    const again = migrateLegacyProfile(JSON.parse(JSON.stringify(once))).profile;
    expect(again.unconfirmedPreferences).toEqual(once.unconfirmedPreferences);
    expect(driveLimitMinutes(again)).toBeNull();
    // Junk in the stash is not carried.
    expect(migrateLegacyProfile({ ...FAMILY, unconfirmedPreferences: { maxDriveMinutes: 'far', budgetTier: 'lavish' } }).profile.unconfirmedPreferences).toBeUndefined();
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

  it('a stored v1 profile with the old defaults keeps them as unconfirmed; none applies; its other data is untouched', async () => {
    const profile = await rehydrate(blob(1, { maxDriveMinutes: 30, budgetTier: 'moderate', mustHaveFacilities: ['toilets'], vehicle: 'Golf' }));
    expect(driveLimitMinutes(profile)).toBeNull();
    expect(budgetTierOf(profile)).toBeNull();
    expect(unconfirmedValue(profile, 'maxDriveMinutes')).toBe(30);
    expect(unconfirmedValue(profile, 'budgetTier')).toBe('moderate');
    expect(profile.mustHaveFacilities).toEqual(['toilets']);
    expect(profile.vehicle).toBe('Golf');
    expect(profile.members.some((m) => m.name === 'Rosie')).toBe(true);
  });

  it('a stored v1 profile with a limit or budget the parent changed keeps them as choices, with nothing set aside', async () => {
    const profile = await rehydrate(blob(1, { maxDriveMinutes: 45, budgetTier: 'budget' }));
    expect(driveLimitMinutes(profile)).toBe(45);
    expect(budgetTierOf(profile)).toBe('budget');
    expect(profile.unconfirmedPreferences).toBeUndefined();
  });

  it('a v2 profile with an explicit 30 minutes is a choice and is kept', async () => {
    const profile = await rehydrate(blob(2, { maxDriveMinutes: 30, budgetTier: 'moderate' }));
    expect(driveLimitMinutes(profile)).toBe(30);
    expect(budgetTierOf(profile)).toBe('moderate');
    expect(profile.unconfirmedPreferences).toBeUndefined();
  });

  it('rehydrating twice does not disturb a stash, and a re-run of the migration changes nothing', async () => {
    await rehydrate(blob(1, { maxDriveMinutes: 30 }));
    const first = useFamilyStore.getState().profile.unconfirmedPreferences;
    expect(first?.maxDriveMinutes).toBe(30);
    // The persisted copy is now at the current version; reading it back gives the same stash.
    const stored = JSON.parse((await AsyncStorage.getItem('familypilot-family-v1'))!);
    expect(stored.version).toBe(2);
    expect(stored.state.profile.unconfirmedPreferences).toEqual(first);
    expect((await rehydrate(JSON.stringify(stored))).unconfirmedPreferences).toEqual(first);
  });

  it('saved planning families are set aside the same way and typed values are kept; the remembered start is cleared', () => {
    const stored = () => ({
      families: [
        { id: 'guest-1', label: 'The Shaws', area: 'Richmond', latitude: 51.46, longitude: -0.3, ages: [6], maxDriveMinutes: 120, budgetTier: 'moderate', pushchair: false, required: [], routines: [] },
        { id: 'guest-2', label: 'The Hills', area: 'Kew', latitude: 51.47, longitude: -0.29, ages: [3], maxDriveMinutes: 25, budgetTier: 'premium', pushchair: false, required: [], routines: [] },
        { id: 'mine', label: 'Our family', area: 'N1', latitude: 51.5, longitude: -0.1, ages: [4], maxDriveMinutes: 30, budgetTier: 'moderate', pushchair: false, required: [], routines: [] },
      ],
      options: { date: '2026-10-01', leaveAt: '14:30', returnBy: '', visitMinutes: 90, bufferMinutes: 15, environment: 'either' },
      saved: [], savedDays: [],
    });
    const migrated = migratePlanningState<ReturnType<typeof stored>>(stored(), 0, NOW);
    const [shaws, hills, mine] = migrated.families as unknown as Array<Record<string, unknown>>;
    expect('maxDriveMinutes' in shaws).toBe(false);
    expect('budgetTier' in shaws).toBe(false);
    expect(shaws.unconfirmedPreferences).toMatchObject({ maxDriveMinutes: 120, budgetTier: 'moderate' });
    expect(hills).toMatchObject({ maxDriveMinutes: 25, budgetTier: 'premium' });
    expect('unconfirmedPreferences' in hills).toBe(false);
    expect('maxDriveMinutes' in mine).toBe(false);
    expect(mine.unconfirmedPreferences).toMatchObject({ maxDriveMinutes: 30, budgetTier: 'moderate', recordedAt: NOW });
    expect(migrated.options.leaveAt).toBe('');
    expect(migrated.options.date).toBe('2026-10-01');
    expect(migrated.saved).toEqual([]);
    // The set-aside values reach no request or plan.
    expect(familyRequest(mine as unknown as PlanningFamily, 'either').constraints.journey).toBeUndefined();
    expect(familyRequest(mine as unknown as PlanningFamily, 'either').constraints.budget).toBeUndefined();
    // At the current version nothing is touched.
    expect(migratePlanningState<ReturnType<typeof stored>>(stored(), 1).options.leaveAt).toBe('14:30');
  });
});

describe('a connected family’s shared snapshot: an old 30 minutes or "moderate" is not applied, a stated one is', () => {
  const snapshot = { label: 'Alex’s family', area: 'Kew', latitude: 51.47, longitude: -0.29, ages: [3] };

  it('without the marker only the ambiguous values are ignored', () => {
    expect(sharedFamilyPreferences({ ...snapshot, maxDriveMinutes: 30, budgetTier: 'moderate' })).toEqual(snapshot);
    expect(sharedFamilyPreferences({ ...snapshot, maxDriveMinutes: 45, budgetTier: 'budget' })).toMatchObject({ maxDriveMinutes: 45, budgetTier: 'budget' });
    expect(sharedFamilyPreferences({ ...snapshot, maxDriveMinutes: null, budgetTier: null })).toEqual(snapshot);
  });

  it('a snapshot marked as stated is taken at its word, so a chosen 30 minutes is kept', () => {
    const stated = { ...snapshot, maxDriveMinutes: 30, budgetTier: 'moderate', preferencesStated: true };
    expect(sharedFamilyPreferences(stated)).toBe(stated);
  });

  it('snapshots made now carry the marker through the server allow-list; an unmarked one does not gain it', () => {
    const profile = { ...FAMILY, maxDriveMinutes: 30 } as FamilyProfile;
    const wire = snapshotForSharing(profile);
    expect(wire.maxDriveMinutes).toBe(30);
    const stored = safeSnapshot(JSON.parse(JSON.stringify(wire)));
    expect(stored.preferencesStated).toBe(true);
    expect(stored.maxDriveMinutes).toBe(30);
    const { preferencesStated: _marker, ...old } = wire;
    expect('preferencesStated' in safeSnapshot(JSON.parse(JSON.stringify(old)))).toBe(false);
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
