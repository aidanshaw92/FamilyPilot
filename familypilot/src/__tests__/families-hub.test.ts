import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { planDraftDefaults } from '@/src/services/planning/plan-draft';
import { PIN_MAX_NUDGE, halfwayMapModel } from '@/src/services/planning/halfway-map';
import { PlanningFamily } from '@/src/services/planning/planner';
import { FamilyProfile } from '@/src/types';

/**
 * FAMILIES, the hub in the middle of the navigation, and MEET HALFWAY as a map-first feature inside it.
 *
 * "Plan together" keeps one id (`planningWith`); the next plan sheet opens with that family under Who's coming; Done
 * clears it. The map numbers every recommended place as its card is numbered, and the selected one is the filled pin.
 * Nothing about a family is copied anywhere new, and nothing private is read by the hub.
 */
const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const TODAY = '2026-10-10';
const profile: FamilyProfile = {
  id: 'family-1',
  parentName: 'Sarah',
  members: [
    { id: 'p1', name: 'Sarah', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2022-04-10', age: 4 },
  ],
  homeLocation: 'Camden, London',
  homeLatitude: 51.539,
  homeLongitude: -0.142,
  completionPercent: 75,
} as FamilyProfile;
const hannah: PlanningFamily = { id: 'guest-hannah', label: 'Hannah', area: 'Lewisham', latitude: 51.46, longitude: -0.01, ages: [3], pushchair: true, required: [], routines: [] };

describe('Plan together: the chosen family comes along by default', () => {
  it('is under Who’s coming when they are known and ready', () => {
    const { draft } = planDraftDefaults({ profile, planningFamilies: [hannah], planningWith: 'guest-hannah', today: TODAY });
    expect(draft.partyIds).toEqual(['mine', 'guest-hannah']);
  });

  it('is not, when nobody was chosen, when the id is unknown, or when the family cannot be planned for', () => {
    expect(planDraftDefaults({ profile, planningFamilies: [hannah], today: TODAY }).draft.partyIds).toEqual(['mine']);
    expect(planDraftDefaults({ profile, planningFamilies: [hannah], planningWith: 'guest-gone', today: TODAY }).draft.partyIds).toEqual(['mine']);
    const unplaced = { ...hannah, latitude: Number.NaN, longitude: Number.NaN };
    expect(planDraftDefaults({ profile, planningFamilies: [unplaced], planningWith: 'guest-hannah', today: TODAY }).draft.partyIds).toEqual(['mine']);
  });

  it('the store keeps only the id, clears it when that family is removed, and persists it', () => {
    const store = read('src/stores/planning-store.ts');
    expect(store).toContain('setPlanningWith:id=>set({planningWith:id})');
    expect(store).toContain('planningWith:s.planningWith===id?null:s.planningWith');
    expect(store).toMatch(/partialize:\(\{families,options,saved,savedDays,planningWith\}\)/);
  });

  it('the venue’s plan sheet and Explore read it; Families and Explore both offer Done', () => {
    expect(read('app/venue/[id].tsx')).toContain('planningWith,');
    const families = read('app/(tabs)/families.tsx');
    expect(families).toContain('testID="families-planning-with"');
    expect(families).toContain('testID="families-planning-with-done"');
    expect(read('src/components/profile/FamilySections.tsx')).toContain('testID="family-plan-together"');
    const explore = read('app/(tabs)/explore.tsx');
    expect(explore).toContain('testID="explore-planning-with"');
    expect(explore).toContain('testID="explore-planning-with-done"');
  });
});

describe('the Families hub', () => {
  const families = read('app/(tabs)/families.tsx');
  const sections = read('src/components/profile/FamilySections.tsx');

  it('puts the connected families and invitations first, then a compact household summary, and Plan together only while chosen', () => {
    expect(families.indexOf('<ConnectedFamiliesSection')).toBeGreaterThan(-1);
    expect(families.indexOf('<ConnectedFamiliesSection')).toBeLessThan(families.indexOf('<HouseholdSummary'));
    expect(families).not.toContain('<YourFamilySection');
    expect(families).not.toContain('<RoutinesSection');
    expect(families).toContain('{together ? (');
    expect(families).toContain('testID="families-plan-together-card"');
  });

  it('Meet halfway is the Halfway tab; each family card still offers it with that family chosen', () => {
    expect(families).not.toContain('families-go-halfway');
    expect(sections).toContain('label="Meet halfway"');
  });

  it('account, backup and device data are managed in Profile, not here', () => {
    expect(families).not.toContain('<PlanningAccount');
    expect(families).toContain('testID="families-account-link"');
    const profile = read('app/(tabs)/profile.tsx');
    expect(profile).toContain('<PlanningAccount dataOnly />');
    expect(profile).not.toContain('<ConnectedFamiliesSection');
    expect(profile).toContain('testID="profile-data-locations"');
  });

  it('says what each family is: connected, or on this phone only', () => {
    expect(sections).toContain('testID="connected-family-status"');
    expect(sections).toContain('testID="local-family-status"');
    expect(sections).toContain("'Connected · planning together' : 'Connected'");
    expect(sections).toContain('On this phone only · not connected');
  });

  it('routines are private by default: the hub says so, and reads no routine into a connection', () => {
    expect(sections).toContain('They stay private: a connected family sees the times only if you choose to share them, and never a name.');
    expect(sections).toMatch(/const \[shareRoutines, setShareRoutines\] = useState\(false\)/);
    expect(families).not.toMatch(/createInvite|listConnections|connection-invites|updateSharing/);
  });

  it('the Plans tab shows the plans first, keeps the way to start another, and does not repeat the Halfway tab', () => {
    const plans = read('app/(tabs)/trips.tsx');
    expect(plans).not.toContain("'families'");
    expect(plans).not.toContain('FamilyEditor');
    expect(plans).not.toContain('plans-go-halfway');
    // Invitations first (the only thing waiting on the parent), then the plans, then the way to start another; the "no plans yet"
    // start card appears only when there is nothing else to show.
    expect(plans.indexOf('testID="plans-invitations"')).toBeLessThan(plans.indexOf('testID="plans-saved-days"'));
    expect(plans.indexOf('testID="plans-saved-days"')).toBeLessThan(plans.indexOf('label="Plan another day"'));
    expect(plans).toContain('No plans yet');
    expect(plans).toContain('{empty ? (');
  });
});

describe('Meet halfway, map first', () => {
  const SIZE = { width: 360, height: 220 };
  const mine = { latitude: 51.539, longitude: -0.142, label: 'Your family' };
  const other = { latitude: 51.46, longitude: -0.01, label: 'Hannah’s family' };
  const places = [
    { id: 'a', latitude: 51.5, longitude: -0.08, name: 'First' },
    { id: 'b', latitude: 51.49, longitude: -0.1, name: 'Second' },
    { id: 'c', latitude: 51.51, longitude: -0.05, name: 'Third' },
  ];

  it('numbers every place as its card is numbered, and marks the selected one', () => {
    const model = halfwayMapModel({ mine, other, venue: { ...places[1], name: 'Second' }, venues: places, selectedId: 'b' }, SIZE)!;
    expect(model.pins.map((p) => [p.id, p.number, p.selected])).toEqual([['a', 1, false], ['c', 3, false], ['b', 2, true]]);
    expect(model.summary).toContain('3 places numbered as the list below');
  });

  it('the selected pin is drawn last, so it sits on top, and stays where the place is (within the nudge that keeps crowded pins apart)', () => {
    const model = halfwayMapModel({ mine, other, venue: places[0], venues: places, selectedId: 'a' }, SIZE)!;
    const last = model.pins[model.pins.length - 1];
    expect(last.id).toBe('a');
    expect(Math.hypot(last.x - model.venue!.x, last.y - model.venue!.y)).toBeLessThanOrEqual(PIN_MAX_NUDGE + 1e-6);
  });

  it('a place with no usable position is left off the map, not invented', () => {
    const model = halfwayMapModel({ mine, other, venue: places[0], venues: [...places, { id: 'd', latitude: Number.NaN, longitude: 0, name: 'Nowhere' }], selectedId: 'a' }, SIZE)!;
    expect(model.pins.map((p) => p.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('a pin never has a tap target that covers a neighbour: 44 where there is room, shrunk to the gap where places are close', () => {
    const far = halfwayMapModel({ mine, other, venue: places[0], venues: places, selectedId: 'a' }, SIZE)!;
    for (const pin of far.pins) expect(pin.hit).toBeLessThanOrEqual(44);
    // Two real galleries about a kilometre apart, with a third far away: the close pair share the gap, the far one keeps 44.
    const crowded = [
      { id: 'iwm', latitude: 51.4958, longitude: -0.1087, name: 'Imperial War Museum' },
      { id: 'tate', latitude: 51.5076, longitude: -0.0994, name: 'Tate Modern' },
      { id: 'dulwich', latitude: 51.4472, longitude: -0.0831, name: 'Dulwich Park' },
    ];
    const model = halfwayMapModel({ mine, other, venue: crowded[0], venues: crowded, selectedId: 'iwm' }, SIZE)!;
    for (const a of model.pins) {
      for (const b of model.pins) {
        if (a === b) continue;
        expect(a.hit / 2 + b.hit / 2, `${a.id} and ${b.id} tap targets do not overlap`).toBeLessThanOrEqual(Math.hypot(a.x - b.x, a.y - b.y) + 1e-6);
      }
    }
    expect(model.pins.find((p) => p.id === 'dulwich')!.hit).toBeGreaterThan(model.pins.find((p) => p.id === 'iwm')!.hit - 1);
  });

  it('with no list there are no pins, and the venue alone is drawn', () => {
    const model = halfwayMapModel({ mine, other, venue: places[0] }, SIZE)!;
    expect(model.pins).toEqual([]);
  });

  it('the screen keeps the map at the top with a Map / List control, and syncs cards and pins both ways', () => {
    const screen = read('app/(tabs)/halfway.tsx');
    const chrome = read('src/components/halfway/chrome.tsx');
    const sheet = read('src/components/halfway/Sheet.tsx');
    // v2: the map fills the screen behind a collapsible sheet; the Map / List control sits over it.
    expect(screen).toContain('<MapListToggle');
    expect(chrome).toContain('testID={`halfway-mode-${key}`}');
    expect(sheet).toContain('testID="halfway-selected-name"');
    expect(screen).toContain('onSelectPin={(id) => setSelectedId(id)}');
    expect(screen).toContain('onSelect={() => choose(option.venue.id)}');
    // Each family's journey is said separately, estimated; the ranking is explained; no score is printed.
    expect(read('src/services/planning/halfway-view.ts')).toContain("travelTimeLabel(journey.minutes, 'estimated')");
    expect(screen).toContain('not by the midpoint between your homes');
    for (const file of [screen, sheet, read('src/components/halfway/ListCard.tsx'), read('src/components/halfway/parts.tsx')]) {
      expect(file).not.toMatch(/option\.score|\{score\}|points/);
    }
    const map = read('src/components/planning/HalfwayMap.tsx');
    expect(map).toContain('testID={pin.selected ? \'halfway-map-venue\' : `halfway-map-pin-${pin.number}`}');
    // The pins are plain pressables over the SVG: a pressable inside the SVG does not render on the web build.
    expect(map).not.toMatch(/<G[^>]*onPress/);
  });
});
