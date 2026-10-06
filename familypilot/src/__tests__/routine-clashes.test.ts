import { describe, expect, it, vi } from 'vitest';

import { createPlan } from '@/src/services/planning/create-plan';
import { PlanStopSource } from '@/src/services/planning/day-plan';
import { PlanDraft } from '@/src/services/planning/plan-draft';
import { PlanningFamily, Routine } from '@/src/services/planning/planner';
import { toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { makeSubjectResolver } from '@/src/services/planning/routine-subjects';
import { buildJourneyMatrix } from '@/src/services/planning/journey-matrix';
import { homeKey, stopKey } from '@/src/services/planning/sequencer';
import { JourneyMatrix } from '@/src/types/day-sequence';
import { FamilyProfile } from '@/src/types';

/**
 * A routine overlapping the outing is advice, not an error.
 *
 * Driven end to end through the real planner (only the matrix is supplied) so these are the product's own answers: the
 * plan is built, the overlap is reported where it falls, the choices are verified re-runs, and names appear only when
 * the screen reads the profile on this device.
 */

const FARM = 'fp-farm';
// 2026-10-10 is a Saturday; the clock below is 09:00 local (BST).
const NOW = new Date('2026-10-10T08:00:00Z');

const farm: PlanStopSource = {
  placeId: FARM,
  name: 'Kentish Town City Farm',
  category: 'farm',
  latitude: 51.55,
  longitude: -0.15,
  facts: {
    placeId: FARM, name: 'Kentish Town City Farm', category: 'farm', driveMinutes: 0, enrichmentStatus: 'verified',
    minRecommendedAge: 0, maxRecommendedAge: 12, venueAgePolicy: null, toilets: 'yes', babyChanging: 'yes', parking: 'yes',
    pushchairSuitability: 'good', environment: 'outdoor', energyLevel: 'moderate', visitDurationMinutes: null,
    estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'unknown',
  },
};

const nap = (over: Partial<Routine> = {}): Routine => ({
  id: 'nap-ozzie', label: 'Nap', kind: 'nap', time: '12:30', durationMinutes: 90, atHome: true, ...over,
});

const family = (over: Partial<PlanningFamily> = {}): PlanningFamily => ({
  id: 'mine', label: 'Our family', area: 'Camden', latitude: 51.54, longitude: -0.14,
  ages: [3, 0], maxDriveMinutes: 45, budgetTier: 'moderate', pushchair: true, required: [], routines: [], ...over,
});

const draft = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  date: '2026-10-10', startAt: '10:00', partyIds: ['mine'], attendeeIds: null, visit: 120,
  returnBy: '', bufferMinutes: 15, environment: 'either', ...over,
});

/** Every family 20 minutes from the farm and back. */
const matrixFor = (...ids: string[]): JourneyMatrix => ({
  legs: Object.fromEntries([
    ...ids.map((id) => [homeKey(id), { [stopKey(FARM)]: { minutes: 20, source: 'estimated' as const } }]),
    [stopKey(FARM), Object.fromEntries(ids.map((id) => [homeKey(id), { minutes: 20, source: 'estimated' as const }]))],
  ]),
});

const deps = (...ids: string[]) => ({
  buildMatrix: vi.fn(async () => ({
    matrix: matrixFor(...ids), provenance: { live: 0, estimated: 2 * ids.length }, trafficDowngraded: false, missing: [],
  })) as unknown as typeof buildJourneyMatrix,
  now: NOW,
});

const profile = {
  members: [
    { id: 'c-sloane', name: 'Sloane', role: 'child', age: 3, dateOfBirth: '2023-03-01' },
    { id: 'c-ozzie', name: 'Ozzie', role: 'child', age: 0, ageMonths: 8, dateOfBirth: '2026-02-01' },
  ],
  routines: [{ ...nap(), childId: 'c-ozzie' }],
} as unknown as FamilyProfile;

const build = async (families: PlanningFamily[], over: Partial<PlanDraft> = {}, extra: Record<string, unknown> = {}) => {
  const outcome = await createPlan(
    { venue: farm, draft: draft(over), families, ...extra },
    deps(...families.map((f) => f.id)),
  );
  if (!outcome.ok) throw new Error(`expected a plan, got: ${outcome.title}`);
  return outcome;
};

describe('a nap that falls on the day is advice, not a refusal', () => {
  it('still builds the day, and says where the nap falls and what to do', async () => {
    // Arrive 10:00, 2 hours there, 20 min home plus settling: home 12:35, five minutes into a 12:30 nap.
    const outcome = await build([family({ routines: [nap()] })]);
    const routines = outcome.view.routines!;
    expect(routines.advice).toHaveLength(1);
    expect(routines.advice[0].where).toBe('falls on the drive home');
    expect(routines.headline).not.toMatch(/can’t|cannot|clash/i);
    // Verified options, not guesses: each one was re-sequenced for real.
    const kinds = routines.advice[0].options.map((o) => o.alternative?.kind);
    expect(kinds).toContain('shorter');
    // "Earlier" is not offered: it is 09:00 now, and arriving at 09:30 would mean leaving before then. Only options
    // that can really be built are shown.
    expect(kinds).not.toContain('earlier');
  });

  it('only offers a change that really clears the nap', async () => {
    const outcome = await build([family({ routines: [nap()] })]);
    for (const alt of outcome.source.alternatives ?? []) {
      const again = await build([family({ routines: [nap()] })], {
        startAt: alt.arriveAt,
        visit: alt.visitMinutes,
      });
      expect(again.source.itinerary.routineInsights).toEqual([]);
    }
  });

  it('says nothing about routines the family never gave, and never claims they fit', async () => {
    const outcome = await build([family({ routines: [] })]);
    expect(outcome.view.routines).toBeNull();
  });

  it('says it fits when routines were given and none is touched, and says the nap is next', async () => {
    const outcome = await build([family({ routines: [nap({ time: '14:30' })] })]);
    const routines = outcome.view.routines!;
    expect(routines.clear).toBe(true);
    expect(routines.advice).toEqual([]);
    expect(routines.homeBefore[0]).toMatch(/home around 12:35, before your nap at 14:30/i);
  });
});

describe('buggy advice is for families who use a buggy, from what the venue record says', () => {
  const during = nap({ time: '10:30', durationMinutes: 60 });

  it('gives buggy advice from the venue’s recorded access when a nap falls during the visit', async () => {
    const outcome = await build([family({ routines: [during] })]);
    const advice = outcome.view.routines!.advice[0];
    expect(advice.severity).toBe('soft');
    expect(advice.where).toBe('falls while you’re at Kentish Town City Farm');
    expect(advice.detail).toMatch(/Pushchair access is recorded as good here, so a nap in the buggy could work/);
  });

  it('gives none to a family that does not use a buggy: an irrelevant fact is not surfaced', async () => {
    const outcome = await build([family({ routines: [during], pushchair: false })]);
    expect(outcome.view.routines!.advice[0].detail).not.toMatch(/pushchair|buggy/i);
  });

  it('says unknown is unknown when the venue has no pushchair record', async () => {
    const outcome = await createPlan(
      { venue: { ...farm, facts: { ...farm.facts!, pushchairSuitability: 'unknown' } }, draft: draft(), families: [family({ routines: [during] })] },
      deps('mine'),
    );
    if (!outcome.ok) throw new Error('expected a plan');
    expect(outcome.view.routines!.advice[0].detail).toMatch(/don’t know yet how pushchair-friendly/);
  });
});

describe('a feed that falls during the visit', () => {
  const feed = nap({ id: 'feed-ozzie', kind: 'feed', label: 'Feed', time: '11:00', durationMinutes: 30 });

  it('is soft, allows time for it, and offers to add lunch when a place to eat is known', async () => {
    const outcome = await build([family({ routines: [feed] })], {}, { lunchAvailable: true });
    const advice = outcome.view.routines!.advice[0];
    expect(advice.severity).toBe('soft');
    expect(advice.detail).toMatch(/Allow about 30 minutes/);
    expect(advice.options.some((o) => o.kind === 'add-lunch')).toBe(true);
  });

  it('is informational when the lunch stop already covers it', async () => {
    const meal = {
      place: { placeId: 'fp-cafe', name: 'The Moat Cafe', category: 'cafe' as const, latitude: 51.551, longitude: -0.151 },
    };
    const feedAtLunch = nap({ id: 'feed-ozzie', kind: 'feed', label: 'Feed', time: '12:25', durationMinutes: 30 });
    const outcome = await createPlan(
      { venue: farm, draft: draft({ visit: 120 }), families: [family({ routines: [feedAtLunch] })], meal },
      {
        buildMatrix: vi.fn(async () => ({
          matrix: {
            legs: {
              [homeKey('mine')]: { [stopKey(FARM)]: { minutes: 20, source: 'estimated' as const } },
              [stopKey(FARM)]: { [homeKey('mine')]: { minutes: 20, source: 'estimated' as const }, [stopKey('fp-cafe')]: { minutes: 3, source: 'estimated' as const } },
              [stopKey('fp-cafe')]: { [homeKey('mine')]: { minutes: 20, source: 'estimated' as const }, [stopKey(FARM)]: { minutes: 3, source: 'estimated' as const } },
            },
          },
          provenance: { live: 0, estimated: 5 }, trafficDowngraded: false, missing: [],
        })) as unknown as typeof buildJourneyMatrix,
        now: NOW,
      },
    );
    if (!outcome.ok) throw new Error('expected a plan');
    const advice = outcome.view.routines!.advice[0];
    expect(advice.severity).toBe('info');
    expect(advice.where).toBe('falls during lunch');
    expect(advice.detail).toMatch(/lunch stop falls at the same time/);
  });
});

describe('names are added when the screen draws the plan, never saved with it', () => {
  it('reads "Ozzie’s nap" from the local profile, and the saved source holds no name', async () => {
    const outcome = await build([family({ routines: [nap()] })]);
    expect(JSON.stringify(outcome.source)).not.toMatch(/Ozzie|Sloane/);
    const named = toPlanViewModel(outcome.source, {
      resolveSubject: makeSubjectResolver(profile, [{ id: 'mine', label: 'Our family' }]),
      householdTitle: 'Shaw family',
    });
    expect(named.routines!.advice[0].title).toBe('Ozzie’s nap · 12:30–14:00');
    expect(named.party[0].label).toBe('Shaw family');
  });
});

describe('the length FamilyPilot chooses when the parent is not sure', () => {
  it('uses a typical length for the kind of place, and says it is an assumption', async () => {
    const outcome = await build([family()], { visit: 'not-sure' });
    expect(outcome.source.visit).toMatchObject({ basis: 'category-typical', minutes: 120 });
    expect(outcome.source.itinerary.stops[0].dwellMinutes).toBe(120);
    expect(outcome.view.routines!.visitNote).toMatch(/typical for a farm\. It is a planning assumption/);
  });

  it('uses the venue’s own typical visit where the record has one', async () => {
    const outcome = await build([family()], { visit: 'not-sure' }, {});
    const withVenue = await createPlan(
      { venue: { ...farm, facts: { ...farm.facts!, visitDurationMinutes: 75 } }, draft: draft({ visit: 'not-sure' }), families: [family()] },
      deps('mine'),
    );
    if (!withVenue.ok) throw new Error('expected a plan');
    expect(withVenue.source.visit).toMatchObject({ basis: 'venue-typical', minutes: 75 });
    expect(outcome.source.visit?.basis).toBe('category-typical');
  });

  it('shortens the visit so everyone is home before a nap that has to happen at home', async () => {
    // Typical 120 would get home at 12:35, twenty minutes into a 12:15 nap. 90 minutes does not.
    const outcome = await build([family({ routines: [nap({ time: '12:15' })] })], { visit: 'not-sure' });
    expect(outcome.source.visit).toMatchObject({ basis: 'routine-limited', minutes: 90, unshortenedMinutes: 120 });
    expect(outcome.source.itinerary.routineInsights).toEqual([]);
    expect(outcome.view.routines!.visitNote).toMatch(/kept it to about an hour and a half, which gets you home before your nap at 12:15/);
  });

  it('never shortens a length the parent chose', async () => {
    const outcome = await build([family({ routines: [nap({ time: '12:15' })] })], { visit: 120 });
    expect(outcome.source.visit).toMatchObject({ basis: 'chosen', minutes: 120 });
    expect(outcome.source.itinerary.routineInsights.length).toBeGreaterThan(0);
  });

  it('does not shorten below a visit worth the journey', async () => {
    const outcome = await build([family({ routines: [nap({ time: '10:20' })] })], { visit: 'not-sure' });
    expect(outcome.source.visit?.basis).toBe('category-typical');
    expect(outcome.view.routines!.advice.length).toBeGreaterThan(0);
  });

  it('plans "All day" to a stated cap when closing time is unknown, and says so', async () => {
    const outcome = await build([family()], { visit: 'all-day' });
    expect(outcome.source.visit).toMatchObject({ basis: 'day-cap', minutes: 360 });
    expect(outcome.view.routines!.visitNote).toMatch(/don’t know when it closes/);
  });
});

describe('a start nobody could reach', () => {
  it('is a start-too-soon with the first arrival that would work, as a one-tap action', async () => {
    // It is 09:00; 09:10 arrival needs leaving at 08:35.
    const result = await createPlan({ venue: farm, draft: draft({ startAt: '09:10' }), families: [family()] }, deps('mine'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.title).toBe('That start is a little too soon');
    expect(result.actions).toEqual([{ kind: 'start', label: 'Start at 09:35', startAt: '09:35' }]);
  });
});

describe('two families, one plan', () => {
  const hannah = (over: Partial<PlanningFamily> = {}): PlanningFamily => ({
    ...family({ id: 'connected-1', label: 'Hannah', ages: [1], routines: [nap({ id: 'nap-theirs', time: '12:20', durationMinutes: 90 })] }),
    ...over,
  });

  it('reads both families’ routines against one day and says who is affected', async () => {
    const outcome = await build([family({ routines: [nap()] }), hannah()]);
    const routines = outcome.view.routines!;
    expect(routines.advice.map((a) => a.id.split(':')[0]).sort()).toEqual(['connected-1', 'mine']);
    expect(routines.together.join(' ')).toMatch(/Every family has a routine that overlaps the day/);
    expect(routines.together.join(' ')).toMatch(/Both families’ naps fall between 12:30 and 13:50/);
  });

  it('names a connected family by the label they shared, never by a child', async () => {
    const outcome = await build([family(), hannah()]);
    const advice = outcome.view.routines!.advice[0];
    expect(advice.title).toMatch(/^The nap for Hannah’s family/);
  });

  it('with only a postcode there is nothing to reason about for them, so nothing is claimed', async () => {
    const outcome = await build([family({ routines: [nap({ time: '14:30' })] }), hannah({ routines: [], ages: [] })]);
    const text = JSON.stringify(outcome.view.routines);
    expect(text).not.toMatch(/Hannah/);
    expect(outcome.view.routines!.together).toEqual(['Nobody’s routines are overlapped by this day.']);
  });
});
