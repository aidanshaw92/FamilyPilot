import { describe, expect, it } from 'vitest';

import {
  plannerRequirements,
  planningFamilyFromProfile,
  resolvePlanParties,
} from '@/src/services/planning/plan-parties';
import { PlanningFamily } from '@/src/services/planning/planner';
import { FamilyProfile } from '@/src/types';
import { createEmptyProfile } from '@/src/utils/profile-defaults';

/**
 * The bridge between who a parent chose and what the planner can measure.
 *
 * The failure mode worth guarding is quiet: a day planned for one household when two were chosen
 * reads as a correct answer. So anything that cannot be resolved is reported by name, and a
 * household with nowhere to leave from is never given a default address.
 */

const profile = (over: Partial<FamilyProfile> = {}): FamilyProfile => ({
  ...createEmptyProfile(),
  parentName: 'Sam',
  homeLocation: 'Bromley',
  homeLatitude: 51.406,
  homeLongitude: 0.013,
  members: [
    { id: 'p1', name: 'Sam', role: 'parent', dateOfBirth: '1990-01-01', age: 36 },
    { id: 'c1', name: 'Ada', role: 'child', dateOfBirth: '2022-01-01', age: 4 },
  ],
  ...over,
});

const stored = (over: Partial<PlanningFamily> = {}): PlanningFamily => ({
  id: 'guest-1',
  label: 'The Shaws',
  area: 'Richmond',
  latitude: 51.4613,
  longitude: -0.3037,
  ages: [6],
  maxDriveMinutes: 45,
  budgetTier: 'moderate',
  pushchair: false,
  required: [],
  routines: [],
  ...over,
});

describe('the signed-in household becomes something the planner can measure', () => {
  it('takes the stored centroid, the children’s ages and the drive limit from the profile', () => {
    const family = planningFamilyFromProfile(profile());
    expect(typeof family).not.toBe('string');
    if (typeof family === 'string') return;
    expect(family).toMatchObject({
      id: 'mine',
      label: 'Our family',
      area: 'Bromley',
      latitude: 51.406,
      longitude: 0.013,
      ages: [4],
      maxDriveMinutes: 30,
      budgetTier: 'moderate',
    });
  });

  it('counts only children as ages, never the adults', () => {
    const family = planningFamilyFromProfile(profile());
    if (typeof family === 'string') throw new Error('expected a family');
    // Two members, one of them a parent.
    expect(family.ages).toEqual([4]);
  });

  it('resolves the entered area when no centroid was stored', () => {
    const family = planningFamilyFromProfile(
      profile({ homeLocation: 'Richmond', homeLatitude: null, homeLongitude: null }),
    );
    if (typeof family === 'string') throw new Error('expected a family');
    expect(family.latitude).toBeCloseTo(51.4613, 3);
  });

  it('refuses to invent a home for a family that has not said where they live', () => {
    // resolveHomeCoordinates would hand back a central London default. A plan built from it would
    // tell this family to leave at a time derived from an address they never gave.
    expect(
      planningFamilyFromProfile(profile({ homeLocation: '', homeLatitude: null, homeLongitude: null })),
    ).toBe('no-location');
    expect(
      planningFamilyFromProfile(profile({ homeLocation: '   ', homeLatitude: null, homeLongitude: null })),
    ).toBe('no-location');
  });

  it('refuses an empty household rather than planning for nobody', () => {
    expect(planningFamilyFromProfile(profile({ members: [] }))).toBe('not-described');
  });

  it('refuses a drive limit that is not a usable number', () => {
    expect(planningFamilyFromProfile(profile({ maxDriveMinutes: 0 }))).toBe('not-described');
    expect(planningFamilyFromProfile(profile({ maxDriveMinutes: Number.NaN }))).toBe('not-described');
  });

  it('copies the routines, so editing a plan cannot reach into the stored profile', () => {
    const source = profile({
      routines: [{ id: 'r1', label: 'Nap', kind: 'nap', time: '13:00', durationMinutes: 90, atHome: true }],
    });
    const family = planningFamilyFromProfile(source);
    if (typeof family === 'string') throw new Error('expected a family');
    expect(family.routines[0]).not.toBe(source.routines![0]);
    expect(family.routines[0]).toEqual(source.routines![0]);
  });
});

describe('must-haves become requirements only where the planner can check them', () => {
  it('maps the four the matcher gates on', () => {
    expect(plannerRequirements(['toilets', 'baby_changing', 'parking', 'pushchair_friendly']))
      .toEqual(['toilets', 'babyChanging', 'parking', 'pushchair']);
  });

  it('leaves a must-have with no constraint out rather than approximating one', () => {
    // There is no evidence rule the planner can apply to shade or a splash pad, and inventing a gate
    // would fail days closed for a facility nobody can check.
    expect(plannerRequirements(['shade', 'splash_pad', 'toilets'])).toEqual(['toilets']);
    expect(plannerRequirements(undefined)).toEqual([]);
  });

  it('does not repeat a requirement two facilities would map onto', () => {
    expect(plannerRequirements(['toilets', 'toilets'])).toEqual(['toilets']);
  });
});

describe('resolving the chosen households', () => {
  it('keeps the order the parent chose', () => {
    const { families, unresolved } = resolvePlanParties(['mine', 'guest-1'], {
      profile: profile(),
      planningFamilies: [stored()],
    });
    expect(families.map((f) => f.id)).toEqual(['mine', 'guest-1']);
    expect(unresolved).toEqual([]);
  });

  it('prefers a household the parent described over one derived from the profile', () => {
    const explicit = stored({ id: 'mine', label: 'Our family', maxDriveMinutes: 90 });
    const { families } = resolvePlanParties(['mine'], {
      profile: profile(),
      planningFamilies: [explicit],
    });
    expect(families[0]).toBe(explicit);
    expect(families[0].maxDriveMinutes).toBe(90);
  });

  it('names a chosen household it could not resolve, rather than planning for fewer people', () => {
    const { families, unresolved } = resolvePlanParties(['mine', 'guest-9'], { profile: profile() });
    expect(families.map((f) => f.id)).toEqual(['mine']);
    expect(unresolved).toEqual([{ id: 'guest-9', reason: 'not-described' }]);
  });

  it('reports a described household with unusable coordinates as having no location', () => {
    const { families, unresolved } = resolvePlanParties(['guest-1'], {
      planningFamilies: [stored({ latitude: Number.NaN, longitude: Number.NaN })],
    });
    expect(families).toEqual([]);
    expect(unresolved).toEqual([{ id: 'guest-1', reason: 'no-location' }]);
  });

  it('passes the profile’s own reason through for the signed-in household', () => {
    expect(resolvePlanParties(['mine'], { profile: profile({ members: [] }) }).unresolved)
      .toEqual([{ id: 'mine', reason: 'not-described' }]);
    expect(
      resolvePlanParties(['mine'], {
        profile: profile({ homeLocation: '', homeLatitude: null, homeLongitude: null }),
      }).unresolved,
    ).toEqual([{ id: 'mine', reason: 'no-location' }]);
  });

  it('does not resolve the same household twice when it is chosen twice', () => {
    const { families } = resolvePlanParties(['mine', 'mine'], { profile: profile() });
    expect(families).toHaveLength(1);
  });

  it('resolves nothing, and claims nothing, with no sources at all', () => {
    expect(resolvePlanParties(['mine'], {})).toEqual({
      families: [],
      unresolved: [{ id: 'mine', reason: 'not-described' }],
    });
  });
});
