import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { MEAL_DWELL_MINUTES, createPlan } from '@/src/services/planning/create-plan';
import { planStopFromRecord } from '@/src/services/planning/day-plan';
import { lunchEvidence, lunchNeeds, rankLunchCandidates } from '@/src/services/planning/lunch-evidence';
import { PlanningFamily } from '@/src/services/planning/planner';
import { PlanDraft } from '@/src/services/planning/plan-draft';
import { planTimeline } from '@/src/services/planning/plan-timeline';
import { toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { DayItinerary } from '@/src/types/day-sequence';
import { FoodCandidate } from '@/src/types/nearby-food';
import { ExternalPlaceRecord } from '@/src/types/places';

/**
 * Lunch is the parent's call. The day is built around the place, the journey and the routines; nothing is added unless they
 * choose it, with the evidence for each place in front of them; their own place is shown as entered, with nothing invented.
 */
const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const candidate = (over: Partial<FoodCandidate>): FoodCandidate => ({
  familypilotId: 'fp-osm-1', externalId: 'osm-1', provider: 'osm', name: 'The Moat Cafe', category: 'cafe', latitude: 51.56, longitude: -0.09,
  distanceKm: 0.3, cuisine: null, openingHours: null, address: null, website: null, phone: null, tagged: {},
  travel: [{ mode: 'walk', durationMinutes: 4, distanceKm: 0.3, source: 'estimated' } as never],
  ...over,
});
const family = (over: Partial<PlanningFamily> = {}): PlanningFamily => ({ id: 'mine', label: 'Our family', area: 'Camden', latitude: 51.54, longitude: -0.14, ages: [3], maxDriveMinutes: 30, pushchair: true, required: [], routines: [], ...over });

describe('what the picker says about a place: only what is on record', () => {
  const needs = lunchNeeds([family({ ages: [2] })]);

  it('a family with a child under three needs high chairs and changing; one without needs nothing in particular', () => {
    expect(needs).toEqual({ littleOnes: true, changing: true });
    expect(lunchNeeds([family({ ages: [6] })])).toEqual({ littleOnes: false, changing: false });
    expect(lunchNeeds([family({ ages: [6], required: ['babyChanging'] })])).toEqual({ littleOnes: false, changing: true });
  });

  it('lists what mappers recorded, says the walk is estimated, says hours are unmapped, and says when lunch would start', () => {
    const lines = lunchEvidence(candidate({ tagged: { highchair: true, changingTable: true } }), { arriveAt: '10:00', visitMinutes: 90, needs });
    expect(lines.map((l) => l.text)).toEqual([
      'Cafe · about 4 min walk, estimated from distance',
      'High chairs, baby changing listed on OpenStreetMap, which your family needs.',
      'Opening hours not mapped: check before you go.',
      `Would start about 11:34 · ${MEAL_DWELL_MINUTES} minutes at the table.`,
    ]);
    expect(lines.map((l) => l.provenance)).toEqual(['estimated', 'reported', 'unknown', 'inferred']);
  });

  it('an unlisted facility is said to be unlisted, never absent; mapped hours are shown as mapped, not checked', () => {
    const lines = lunchEvidence(candidate({ openingHours: 'Mo-Su 08:00-17:00' }), { arriveAt: '10:00', visitMinutes: 90, needs });
    expect(lines[1]).toMatchObject({ text: 'No family facilities listed: not the same as none. Worth asking.', provenance: 'unknown' });
    expect(lines[2]).toMatchObject({ text: 'Hours as mapped: Mo-Su 08:00-17:00. Not checked for this day.', provenance: 'reported' });
  });

  it('a late start is advice with a warning, not a refusal', () => {
    const lines = lunchEvidence(candidate({}), { arriveAt: '14:35', visitMinutes: 90, needs });
    expect(lines.at(-1)).toMatchObject({ text: 'Would start about 16:09, later than most families eat lunch. Your call.', warn: true });
  });

  it('never claims a rating, availability, Family Fit or "open now"', () => {
    const text = lunchEvidence(candidate({ openingHours: 'Mo-Su 08:00-17:00', tagged: { highchair: true } }), { arriveAt: '10:00', visitMinutes: 90, needs }).map((l) => l.text).join(' ');
    expect(text).not.toMatch(/rating|stars|available|open now|Family Fit|suitable/i);
  });

  it('orders by the facilities this family needs, then the shortest walk', () => {
    const far = candidate({ familypilotId: 'far', name: 'Far', tagged: { highchair: true }, travel: [{ mode: 'walk', durationMinutes: 9, distanceKm: 0.7, source: 'estimated' } as never] });
    const near = candidate({ familypilotId: 'near', name: 'Near', travel: [{ mode: 'walk', durationMinutes: 3, distanceKm: 0.2, source: 'estimated' } as never] });
    const mid = candidate({ familypilotId: 'mid', name: 'Mid', tagged: { changingTable: true }, travel: [{ mode: 'walk', durationMinutes: 6, distanceKm: 0.5, source: 'estimated' } as never] });
    expect(rankLunchCandidates([near, far, mid], needs).map((c) => c.familypilotId)).toEqual(['mid', 'far', 'near']);
    expect(rankLunchCandidates([near, far, mid], lunchNeeds([family({ ages: [6] })])).map((c) => c.familypilotId)).toEqual(['near', 'mid', 'far']);
  });
});

describe('the plan is built without a lunch unless the parent put one in', () => {
  const venue = planStopFromRecord({ familypilotId: 'fp-google-anchor', name: 'Clissold Park', category: 'park', latitude: 51.56, longitude: -0.09, provider: 'google' } as ExternalPlaceRecord);
  const cafe = planStopFromRecord({ familypilotId: 'fp-google-cafe', name: 'The Moat Cafe', category: 'cafe', latitude: 51.56, longitude: -0.09, provider: 'google' } as ExternalPlaceRecord);
  const draft: PlanDraft = { date: '2026-10-13', startAt: '10:00', partyIds: ['mine'], attendeeIds: null, visit: 90, returnBy: '', bufferMinutes: 15, environment: 'either' };
  const itinerary = (withMeal: boolean): DayItinerary => ({
    date: '2026-10-13',
    stops: [
      { index: 0, placeId: 'fp-google-anchor', name: 'Clissold Park', role: 'activity', anchor: true, arrive: 600, depart: 690, dwellMinutes: 90, opening: { status: 'open', reason: 'within-opening-period' } },
      ...(withMeal ? [{ index: 1, placeId: 'fp-google-cafe', name: 'The Moat Cafe', role: 'meal' as const, anchor: false, arrive: 700, depart: 745, dwellMinutes: 45, opening: { status: 'unknown' as const, reason: 'no-hours' as never } }] : []),
    ],
    legs: [], families: [{ familyId: 'mine', label: 'Our family', depart: 580, home: 720, latestDeparture: 600, notes: [] }],
    unknowns: [], openingConfidence: { confirmed: 1, unknown: 0 }, routineInsights: [], homeAfter: [], unresolvedMustHaves: [], reasons: [], fairnessGap: 0, score: 1,
  });
  const build = async (extra: Record<string, unknown>) => {
    // The sequencer is stood in for: it receives the resolved stops, and answers with a day that has a meal only if one was asked for.
    const sequence = vi.fn((stops: Array<{ role: string }>) => ({ ok: true as const, itinerary: itinerary(stops.some((s) => s.role === 'meal')) }));
    const outcome = await createPlan(
      { venue, draft, families: [family()], lunchAvailable: true, ...extra } as never,
      { buildMatrix: vi.fn(async () => ({ matrix: {}, provenance: { live: 1, estimated: 0 }, trafficDowngraded: false, missing: [] })) as never, sequence: sequence as never, probe: vi.fn() as never, now: new Date('2026-10-13T08:00:00Z') },
    );
    if (!outcome.ok) throw new Error(outcome.title);
    const stops = (sequence.mock.calls[0] as unknown[])[0] as Array<{ role: string; placeId: string }>;
    return { outcome, request: { meal: stops.find((s) => s.role === 'meal') } };
  };

  it('with no choice made there is no meal stop, no lunch caveat, and the question is still open (lunch available, not included)', async () => {
    const { outcome, request } = await build({});
    expect(request.meal).toBeUndefined();
    expect(outcome.source.caveats.some((c) => c.kind === 'lunch-outside-window' || c.kind === 'own-lunch')).toBe(false);
    expect(outcome.view.lunch).toEqual({ included: false, available: true });
  });

  it('a lunch the parent chose is in the day whatever the hour', async () => {
    const { outcome, request } = await build({ meal: { place: cafe }, mealMode: 'chosen', draft: { ...draft, startAt: '14:35' } });
    expect(request.meal).toMatchObject({ placeId: 'fp-google-cafe', role: 'meal' });
    expect(outcome.view.lunch.included).toBe(true);
    expect(outcome.source.caveats.some((c) => c.kind === 'lunch-outside-window')).toBe(false);
  });

  it('their own place is in the day as entered: a timeline row at their time, a plain note, no journey and no facts', async () => {
    const { outcome, request } = await build({ ownLunch: { name: 'Sam’s Kitchen', startAt: '12:30' } });
    expect(request.meal).toBeUndefined(); // never sequenced: the planner would have to invent where it is
    expect(outcome.source.ownLunch).toEqual({ name: 'Sam’s Kitchen', startAt: '12:30' });
    expect(outcome.source.caveats).toContainEqual({ kind: 'own-lunch', name: 'Sam’s Kitchen' });
    expect(outcome.view.lunch.included).toBe(true);
    expect(outcome.view.caveats.join(' ')).toContain('Lunch at Sam’s Kitchen is in your day as you entered it. We don’t know where it is, so the journey there and your time home aren’t adjusted.');
    const rows = planTimeline(outcome.source);
    const lunch = rows.find((r) => r.kind === 'lunch');
    expect(lunch).toMatchObject({ time: 750, until: 795, title: 'Lunch at Sam’s Kitchen' });
    expect(lunch!.lines.map((l) => l.text)).toEqual([
      'You added this place, at the time you gave.',
      '45 min at the table, assumed.',
      'We don’t know where it is, so the journey there and your time home aren’t adjusted.',
    ]);
    expect(rows.find((r) => r.kind === 'leave' && r.stopIndex === 0)?.title).toBe('Leave for lunch');
    expect(JSON.stringify(outcome.source)).not.toMatch(/latitude.*Sam|Sam.*latitude/);
  });

  it('without a time, their own place follows the visit; a saved day reads back the same', async () => {
    const { outcome } = await build({ ownLunch: { name: 'Sam’s Kitchen' } });
    const lunch = planTimeline(outcome.source).find((r) => r.kind === 'lunch');
    expect(lunch).toMatchObject({ time: 690, until: 735 });
    expect(lunch!.lines[0].text).toBe('You added this place; shown after the visit until you give it a time.');
    const reopened = toPlanViewModel(JSON.parse(JSON.stringify(outcome.source)));
    expect(reopened.lunch.included).toBe(true);
  });
});

describe('the plan screen: ask once, confirm before inserting, remember the answer, keep what was saved', () => {
  const plan = read('app/plan.tsx');
  const view = read('src/components/planning/PlanScreenView.tsx');

  it('adds nothing by default: the discovery’s first place is never taken on the parent’s behalf', () => {
    expect(plan).toContain("const lunch = lunchIncluded ? knownLunch : undefined;");
    expect(plan).toContain("const lunchIncluded = (lunchParam === 'on' || legacyLunch) && !ownLunch;");
    expect(plan).not.toMatch(/\?\? lunchCandidates\[0\]/);
  });

  it('asks once, with the approved wording, and the two answers', () => {
    expect(view).toContain('testID="plan-lunch-ask"');
    expect(view).toContain('Add lunch to your day?');
    expect(view).toContain('We can suggest somewhere near your activity, or you can add your own place.');
    expect(view).toContain('label="Choose a place"');
    expect(view).toContain('label="No thanks"');
    expect(plan).toContain("lunchDecision={lunchOff ? 'declined' : lunchIncluded || ownLunch ? 'included' : 'undecided'}");
  });

  it('"Add lunch" anywhere opens the picker rather than inserting a lunch unseen', () => {
    expect(plan).toMatch(/if \(option\.kind === 'add-lunch'\) \{[\s\S]*?setEditing\('lunch'\);/);
    expect(plan).toContain("onChooseLunch={() => setEditing('lunch')}");
    expect(plan).not.toMatch(/router\.setParams\(\{ lunch: 'on' \} as never\)/);
  });

  it('the picker selects first and confirms second; their own place needs only a name', () => {
    expect(plan).toContain('testID="plan-lunch-confirm"');
    expect(plan).toContain("onPress={() => setPending(candidate.familypilotId)}");
    expect(plan).toContain('testID="plan-lunch-own-confirm"');
    expect(plan).toContain('placeholder="e.g. Sam’s Kitchen"');
  });

  it('"No thanks" is remembered for the plan and leaves a quiet way back', () => {
    expect(plan).toContain("router.setParams({ lunch: 'off' } as never)");
    expect(plan).toContain("...(lunchOff ? { lunch: 'off' } : lunchIncluded || ownLunch ? { lunch: 'on' } : {})");
    expect(view).toContain('testID="plan-lunch-declined"');
    expect(view).toContain('testID="plan-lunch-add"');
  });

  it('a day saved before lunch was optional keeps the lunch it was saved with', () => {
    expect(plan).toContain("const legacyLunch = lunchParam === '' && lunchPlaceParam !== '';");
    expect(plan).toContain("...(lunchIncluded && chosenCandidate ? { lunchPlace: chosenCandidate.familypilotId } : {})");
  });

  it('their own place travels with the day: saved, reopened, and through Change', () => {
    expect(plan).toContain("...(ownLunch ? { lunchOwn: ownLunch.name, ...(ownLunch.startAt ? { lunchOwnAt: ownLunch.startAt } : {}) } : {})");
    expect(plan).toContain("...(lunchOwnParam ? { lunchOwn: lunchOwnParam } : {}), ...(lunchOwnAtParam ? { lunchOwnAt: lunchOwnAtParam } : {})");
  });

  it('no new provider: lunch places still come only from the OpenStreetMap lookup the venue page already made', () => {
    expect(plan).toContain('useNearbyFood({');
    expect(read('src/services/planning/lunch-evidence.ts')).not.toMatch(/fetch\(|google|places-api-client/i);
  });
});
