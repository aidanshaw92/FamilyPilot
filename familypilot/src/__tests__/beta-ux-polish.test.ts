import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createPlan } from '@/src/services/planning/create-plan';
import { PlanStopSource } from '@/src/services/planning/day-plan';
import { PlanDraft } from '@/src/services/planning/plan-draft';
import { PlanningFamily, Routine } from '@/src/services/planning/planner';
import { toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { makeSubjectResolver } from '@/src/services/planning/routine-subjects';
import { buildJourneyMatrix } from '@/src/services/planning/journey-matrix';
import { homeKey, stopKey } from '@/src/services/planning/sequencer';
import { TIGHT_HOME_MARGIN_MINUTES, homeMargins } from '@/src/services/planning/home-margin';
import { halfwayMapModel } from '@/src/services/planning/halfway-map';
import { JourneyMatrix } from '@/src/types/day-sequence';
import { FamilyProfile } from '@/src/types';

/**
 * The beta UX corrections, driven through the real planner.
 *
 * The case that started it: a Horniman plan said "You’re home around 12:56, before Ozzie’s nap at 13:00" with a tick.
 * Four minutes, on a journey estimated from distance, is not good news. The planner now measures that margin, says it
 * is tight in the warning's own words, and offers the one change it has verified builds.
 */

const FARM = 'fp-farm';
const NOW = new Date('2026-10-10T08:00:00Z');

const farm: PlanStopSource = {
  placeId: FARM,
  name: 'Horniman Museum and Gardens',
  category: 'museum',
  latitude: 51.44,
  longitude: -0.06,
  facts: {
    placeId: FARM, name: 'Horniman Museum and Gardens', category: 'museum', driveMinutes: 0, enrichmentStatus: 'verified',
    minRecommendedAge: 0, maxRecommendedAge: 12, venueAgePolicy: null, toilets: 'yes', babyChanging: 'yes', parking: 'no',
    pushchairSuitability: 'good', environment: 'indoor', energyLevel: 'moderate', visitDurationMinutes: null,
    estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'unknown',
  },
};

const nap = (time: string): Routine => ({ id: 'nap-ozzie', label: 'Nap', kind: 'nap', time, durationMinutes: 90, atHome: true });

const family = (routines: Routine[]): PlanningFamily => ({
  id: 'mine', label: 'Our family', area: 'Camden', latitude: 51.54, longitude: -0.14,
  ages: [4, 0], maxDriveMinutes: 60, budgetTier: 'moderate', pushchair: true, required: [], routines,
});

const draft = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  // A Sunday, so an earlier start is not ruled out by the clock.
  date: '2026-10-11', startAt: '10:00', partyIds: ['mine'], attendeeIds: null, visit: 120,
  returnBy: '', bufferMinutes: 15, environment: 'either', ...over,
});

/** 20 minutes each way, estimated from distance like the production fallback. Arrive 10:00, 2 hours, home 12:35. */
const matrix = (source: 'estimated' | 'live' = 'estimated'): JourneyMatrix => ({
  legs: {
    [homeKey('mine')]: { [stopKey(FARM)]: { minutes: 20, source } },
    [stopKey(FARM)]: { [homeKey('mine')]: { minutes: 20, source } },
  },
});

const deps = (source: 'estimated' | 'live' = 'estimated') => ({
  buildMatrix: vi.fn(async () => ({
    matrix: matrix(source), provenance: { live: source === 'live' ? 2 : 0, estimated: source === 'live' ? 0 : 2 }, trafficDowngraded: false, missing: [],
  })) as unknown as typeof buildJourneyMatrix,
  now: NOW,
});

const profile = {
  members: [
    { id: 'c-sloane', name: 'Sloane', role: 'child', age: 4, dateOfBirth: '2022-04-10' },
    { id: 'c-ozzie', name: 'Ozzie', role: 'child', age: 0, ageMonths: 7, dateOfBirth: '2026-02-22' },
  ],
  routines: [{ ...nap('12:39'), childId: 'c-ozzie' }],
} as unknown as FamilyProfile;

const build = async (routines: Routine[], over: Partial<PlanDraft> = {}, source: 'estimated' | 'live' = 'estimated') => {
  const outcome = await createPlan({ venue: farm, draft: draft(over), families: [family(routines)] }, deps(source));
  if (!outcome.ok) throw new Error(`expected a plan, got: ${outcome.title}`);
  return outcome;
};

describe('home only just before a nap is said as tight, never as a tick', () => {
  it('reproduces the case: home 12:35 for a 12:39 nap, journey estimated', async () => {
    const outcome = await build([nap('12:39')]);
    const margins = homeMargins(outcome.source.itinerary);
    expect(margins).toHaveLength(1);
    expect(margins[0]).toMatchObject({ home: 12 * 60 + 35, start: 12 * 60 + 39, marginMinutes: 4, source: 'estimated', tight: true });
  });

  it('says it is tight, in the words a parent needs, and never in the good-news list', async () => {
    const outcome = await build([nap('12:39')]);
    const named = toPlanViewModel(outcome.source, { resolveSubject: makeSubjectResolver(profile, [{ id: 'mine', label: 'Our family' }]) });
    const routines = named.routines!;
    expect(routines.homeBefore).toEqual([]);
    expect(routines.tight).toHaveLength(1);
    expect(routines.tight[0].text).toBe(
      'Tight for Ozzie’s nap: you’re home around 12:35, and the nap is at 12:39. That journey time is an estimate, so the gap may not hold. Consider starting 15 minutes earlier.',
    );
    expect(routines.clear).toBe(false);
    expect(routines.headline).toBe('This plan works, but one timing is tight');
    // The quiet insight line carries the same warning, as a warning.
    expect(named.insight).toMatch(/^Tight for Ozzie’s nap/);
    expect(named.insightTone).toBe('tight');
  });

  it('offers an earlier start only because the re-run was verified to build and to give the nap room', async () => {
    const outcome = await build([nap('12:39')]);
    const routines = outcome.view.routines!;
    expect(routines.tight[0].options.map((o) => o.label)).toEqual(['Arrive at 09:45']);
    const option = routines.tight[0].options[0].alternative!;
    expect(option).toMatchObject({ kind: 'earlier', arriveAt: '09:45', visitMinutes: 120 });
    const applied = await build([nap('12:39')], { startAt: option.arriveAt, visit: option.visitMinutes });
    expect(homeMargins(applied.source.itinerary)[0]).toMatchObject({ marginMinutes: 19, tight: false });
    expect(applied.view.routines!.tight).toEqual([]);
    expect(applied.view.routines!.homeBefore[0]).toMatch(/home around 12:20, before your nap at 12:39/);
  });

  it('falls back to leaving the place earlier when it does not open any earlier (Horniman opens at 10:00)', async () => {
    const opensAtTen: PlanStopSource = {
      ...farm,
      openingHours: {
        periods: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ open: { day, hour: 10, minute: 0 }, close: { day, hour: 17, minute: 30 } })),
        timezone: 'Europe/London',
      },
      facts: { ...farm.facts!, openingStatus: 'open' },
    };
    const outcome = await createPlan({ venue: opensAtTen, draft: draft(), families: [family([nap('12:39')])] }, deps());
    if (!outcome.ok) throw new Error(outcome.title);
    const tight = outcome.view.routines!.tight[0];
    expect(tight.text).toMatch(/Consider leaving 15 minutes earlier\.$/);
    expect(tight.options.map((o) => o.label)).toEqual(['Leave at 11:45']);
    expect(tight.options[0].alternative).toMatchObject({ kind: 'shorter', arriveAt: '10:00', visitMinutes: 105 });
    const applied = await createPlan({ venue: opensAtTen, draft: draft({ visit: 105 }), families: [family([nap('12:39')])] }, deps());
    if (!applied.ok) throw new Error(applied.title);
    expect(homeMargins(applied.source.itinerary)[0]).toMatchObject({ marginMinutes: 19, tight: false });
  });

  it('keeps the tick when there is real room: the threshold is the travel uncertainty', async () => {
    const fine = await build([nap('12:50')]);
    expect(homeMargins(fine.source.itinerary)[0]).toMatchObject({ marginMinutes: TIGHT_HOME_MARGIN_MINUTES.estimated, tight: false });
    expect(fine.view.routines!.tight).toEqual([]);
    expect(fine.view.routines!.homeBefore).toHaveLength(1);
    expect(fine.view.routines!.headline).toBe('This plan should work well');
    expect(fine.view.insightTone).toBe('ok');
  });

  it('allows a narrower margin when the journey was measured rather than estimated', async () => {
    const measured = await build([nap('12:46')], {}, 'live');
    expect(homeMargins(measured.source.itinerary)[0]).toMatchObject({ marginMinutes: 11, source: 'live', tight: false });
    const estimated = await build([nap('12:46')]);
    expect(homeMargins(estimated.source.itinerary)[0]).toMatchObject({ marginMinutes: 11, source: 'estimated', tight: true });
  });

  it('says how the journey home was timed on the terminus line', async () => {
    const outcome = await build([nap('12:50')]);
    expect(outcome.view.party[0].homeNote).toBe('journey estimated from distance');
    const measured = await build([nap('12:50')], {}, 'live');
    expect(measured.view.party[0].homeNote).toBeNull();
  });
});

describe('the Meet halfway map names the place beside its pin', () => {
  it('places the label inside the frame, above the pin, pulled in from an edge where it would run off', () => {
    const model = halfwayMapModel(
      { mine: { latitude: 51.54, longitude: -0.14, label: 'Our family' }, other: { latitude: 51.44, longitude: -0.06, label: 'Hannah’s family' }, venue: { latitude: 51.49, longitude: -0.1, name: 'Horniman Museum and Gardens' } },
      { width: 345, height: 220 },
    )!;
    expect(model.venueLabel!.x).toBeGreaterThanOrEqual(8);
    expect(model.venueLabel!.x).toBeLessThanOrEqual(345 - 8);
    expect(model.venueLabel!.y).toBeGreaterThanOrEqual(14);
    expect(model.venueLabel!.y).toBeLessThanOrEqual(220 - 30);
    expect(model.venueLabel!.anchor).toBe('middle');
    expect(model.venueLabel!.y).toBe(model.venue!.y - 26);
    // Against the right edge the label hangs inwards rather than running off the map.
    const edge = halfwayMapModel(
      { mine: { latitude: 51.54, longitude: -0.3, label: 'Our family' }, other: { latitude: 51.44, longitude: -0.25, label: 'Hannah’s family' }, venue: { latitude: 51.49, longitude: -0.02, name: 'Discover Children’s Story Centre' } },
      { width: 345, height: 220 },
    )!;
    expect(edge.venueLabel!.anchor).toBe('end');
    expect(edge.venueLabel!.x).toBe(345 - 8);
  });
});

describe('one header for the section pages', () => {
  const root = join(__dirname, '..', '..');
  const read = (path: string) => readFileSync(join(root, path), 'utf8');

  it('Plans, Profile, Families and Saved all render PageHeader; Home and Explore keep their approved headers; Meet halfway draws the approved v2 header', () => {
    // Meet halfway's approved v2 frames have no brand row: the title sits straight under the status bar, above the selector.
    expect(read('app/(tabs)/halfway.tsx')).toContain('<HalfwayHeader');
    expect(read('src/components/halfway/chrome.tsx')).toContain('Meet halfway');
    for (const screen of ['app/(tabs)/trips.tsx', 'app/(tabs)/profile.tsx', 'app/(tabs)/families.tsx', 'app/saved.tsx']) {
      expect(read(screen), screen).toContain('<PageHeader');
    }
    for (const screen of ['app/(tabs)/index.tsx', 'app/(tabs)/explore.tsx']) {
      expect(read(screen), screen).not.toContain('<PageHeader');
    }
    const header = read('src/components/navigation/PageHeader.tsx');
    expect(header).toContain('<BrandMark');
    expect(header).toContain('FamilyPilot');
  });

  it('Meet halfway says what it ranks by and lets a card focus the map', () => {
    const screen = read('app/(tabs)/halfway.tsx');
    expect(screen).toContain('not by the midpoint between your homes');
    expect(read('src/components/halfway/ListCard.tsx')).toContain('testID="halfway-option-head"');
    expect(screen).toContain('testID="halfway-ranking-note"');
    const map = read('src/components/planning/HalfwayMap.tsx');
    expect(map).toContain('testID="halfway-map-legend"');
  });
});
