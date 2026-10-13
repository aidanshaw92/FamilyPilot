import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createPlan } from '@/src/services/planning/create-plan';
import { planStopFromRecord } from '@/src/services/planning/day-plan';
import { plannableFamilies } from '@/src/services/planning/family-visibility';
import { LUNCH_LATEST_START, arrivesAfterLunchtime, lunchFit } from '@/src/services/planning/meal-window';
import { PlanningFamily } from '@/src/services/planning/planner';
import { PlanDraft, outingDraftFromParams, planDraftDefaults, planDraftToParams } from '@/src/services/planning/plan-draft';
import { toPlanViewModel } from '@/src/services/planning/plan-view-model';
import { DayItinerary } from '@/src/types/day-sequence';
import { ExternalPlaceRecord } from '@/src/types/places';

/**
 * Three defects from a real iPhone session, traced to their causes and pinned here.
 *
 * 1. Meet halfway showed Tue 13 Oct, arrive 14:30, and the plan for the same place read Sat 17 Oct. "Plan this day" carried the
 *    day over; "See the place" (Details) did not, so the Create a plan sheet opened on its own default, or on a date remembered
 *    from an earlier plan, with the other family not selected. The two screens each held their own date, start and family.
 * 2. The plan put lunch at 16:21 for a 14:35 arrival: a lunch was added to any day that had a place to eat nearby, whatever the hour.
 * 3. Meet halfway planned with a family that Families did not show: the two screens used different rules for which stored
 *    families exist.
 */

const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('1. the day Meet halfway chose is the day the next screen opens on', () => {
  const halfway = planDraftToParams({
    date: '2026-10-13', startAt: '14:30', partyIds: ['mine', 'guest-emma'], attendeeIds: null,
    visit: 'not-sure', returnBy: '', bufferMinutes: 15, environment: 'either',
  });

  it('reads the date, arrival and who is coming back out of the route Meet halfway sends', () => {
    expect(outingDraftFromParams(halfway)).toMatchObject({ date: '2026-10-13', startAt: '14:30', partyIds: ['mine', 'guest-emma'] });
  });

  it('is nothing when a route carries no day, so every other way into a place opens as before', () => {
    expect(outingDraftFromParams({})).toBeNull();
    expect(outingDraftFromParams({ date: '', start: '10:00' })).toBeNull();
    expect(outingDraftFromParams({ date: 'Tuesday', start: '10:00' })).toBeNull();
    expect(outingDraftFromParams({ date: '2026-10-13' })).toBeNull();
  });

  it('is the day on the sheet, not the sheet’s own default, even when another day was remembered', () => {
    const remembered = planDraftDefaults({ today: '2026-10-13', nowTime: '13:05', options: { date: '2026-10-17', leaveAt: '' } });
    expect(remembered.draft.date).toBe('2026-10-17'); // the cause: a remembered Saturday
    expect(outingDraftFromParams(halfway)?.date).toBe('2026-10-13'); // what the sheet now opens on instead
  });

  it('both ways on from a place carry it, and the venue never remembers the outing as a habit', () => {
    const screen = read('src/components/together/MeetHalfwayView.tsx');
    // One function builds the parameters; Plan this day and See the place both use it.
    expect(screen).toMatch(/const outingParams = \(\)/);
    expect(screen).toMatch(/pathname: '\/plan', params: \{ venue: option\.venue\.id, \.\.\.outingParams\(\) \}/);
    expect(screen).toMatch(/pathname: '\/venue\/\[id\]', params: \{ id: option\.venue\.id, \.\.\.outingParams\(\) \}/);
    const venue = read('app/venue/[id].tsx');
    expect(venue).toContain('outingDraftFromParams(');
    expect(venue).toMatch(/useState<PlanDraft \| null>\(outing\)/);
    expect(venue).toContain('optionsToRemember(next, outing ?? reopenedDraft ?? planDefaults.draft)');
    expect(venue).toContain('testID="venue-outing-context"');
  });
});

describe('2. lunch only where it can be lunch', () => {
  it('a 14:35 arrival with a 90 minute visit puts lunch at 16:15: not a lunch', () => {
    expect(lunchFit({ arriveAt: '14:35', visitMinutes: 90 })).toEqual({ fits: false, reason: 'late', startsAt: '16:15' });
  });

  it('keeps the lunch of an ordinary morning outing', () => {
    expect(lunchFit({ arriveAt: '10:00', visitMinutes: 90 })).toEqual({ fits: true, startsAt: '11:40' });
    expect(lunchFit({ arriveAt: '10:00', visitMinutes: 120 })).toMatchObject({ fits: true, startsAt: '12:10' });
  });

  it('the edges are exact: 14:00 is the latest start, 10:30 the earliest', () => {
    expect(LUNCH_LATEST_START).toBe(14 * 60);
    expect(lunchFit({ arriveAt: '12:20', visitMinutes: 90 })).toMatchObject({ fits: true, startsAt: '14:00' });
    expect(lunchFit({ arriveAt: '12:21', visitMinutes: 90 })).toMatchObject({ fits: false, reason: 'late' });
    expect(lunchFit({ arriveAt: '09:00', visitMinutes: 60 })).toMatchObject({ fits: false, reason: 'early', startsAt: '10:10' });
    expect(lunchFit({ arriveAt: '09:20', visitMinutes: 60 })).toMatchObject({ fits: true, startsAt: '10:30' });
  });

  it('decides nothing from an arrival it cannot read', () => {
    expect(lunchFit({ arriveAt: '', visitMinutes: 90 }).fits).toBe(true);
    expect(arrivesAfterLunchtime('')).toBe(false);
    expect(arrivesAfterLunchtime('14:35')).toBe(true);
    expect(arrivesAfterLunchtime('10:00')).toBe(false);
  });

  // The same fixtures as create-plan.test.ts: the planner's matrix and sequencer are stood in for, so the test is about what
  // createPlan hands the sequencer and says on the plan.
  const venue = planStopFromRecord({ familypilotId: 'fp-google-anchor', name: 'Clissold Park', category: 'park', latitude: 51.56, longitude: -0.09, provider: 'google' } as ExternalPlaceRecord);
  const cafe = planStopFromRecord({ familypilotId: 'fp-google-cafe', name: 'The Moat Cafe', category: 'cafe', latitude: 51.56, longitude: -0.09, provider: 'google' } as ExternalPlaceRecord);
  const family: PlanningFamily = { id: 'mine', label: 'Our family', area: 'Camden', latitude: 51.54, longitude: -0.14, ages: [3], maxDriveMinutes: 30, budgetTier: 'moderate', pushchair: true, required: [], routines: [] };
  const draft = (startAt: string): PlanDraft => ({ date: '2026-10-13', startAt, partyIds: ['mine'], attendeeIds: null, visit: 90, returnBy: '', bufferMinutes: 15, environment: 'either' });
  const itinerary = (): DayItinerary => ({
    date: '2026-10-13',
    stops: [{ index: 0, placeId: 'fp-google-anchor', name: 'Clissold Park', role: 'activity', anchor: true, arrive: 870, depart: 960, dwellMinutes: 90, opening: { status: 'open', reason: 'within-opening-period' } }],
    legs: [], families: [{ familyId: 'mine', label: 'Our family', depart: 850, home: 990, latestDeparture: 870, notes: [] }],
    unknowns: [], openingConfidence: { confirmed: 1, unknown: 0 }, routineInsights: [], homeAfter: [], unresolvedMustHaves: [], reasons: [], fairnessGap: 0, score: 1,
  });
  const run = async (startAt: string, mealMode?: 'auto' | 'chosen') => {
    const sequence = vi.fn(() => ({ ok: true as const, itinerary: itinerary() }));
    const outcome = await createPlan(
      { venue, draft: draft(startAt), families: [family], meal: { place: cafe }, lunchAvailable: true, ...(mealMode ? { mealMode } : {}) },
      { buildMatrix: vi.fn(async () => ({ matrix: {}, provenance: { live: 1, estimated: 0 }, trafficDowngraded: false, missing: [] })) as never, sequence: sequence as never, probe: vi.fn() as never, now: new Date('2026-10-13T11:00:00Z') },
    );
    const stops = (sequence.mock.calls[0] as unknown[])[0] as Array<{ role: string }>;
    return { outcome, hasMeal: stops.some((stop) => stop.role === 'meal') };
  };

  it('builds the 14:35 day without a default lunch, says why, and still offers to add one', async () => {
    const { outcome, hasMeal } = await run('14:35');
    expect(hasMeal).toBe(false);
    if (!outcome.ok) throw new Error('expected a plan');
    expect(outcome.source.caveats).toContainEqual({ kind: 'lunch-outside-window', reason: 'late', startsAt: '16:15' });
    expect(outcome.source.lunchAvailable).toBe(true);
    const view = toPlanViewModel(outcome.source);
    expect(view.lunch).toEqual({ included: false, available: true });
    expect(view.caveats.join(' ')).toContain('Lunch isn’t added');
    expect(view.caveats.join(' ')).toContain('around 16:15');
  });

  it('keeps lunch on a morning day, with nothing said', async () => {
    const { outcome, hasMeal } = await run('10:00');
    expect(hasMeal).toBe(true);
    if (!outcome.ok) throw new Error('expected a plan');
    expect(outcome.source.caveats.some((caveat) => caveat.kind === 'lunch-outside-window')).toBe(false);
  });

  it('keeps a lunch the parent added themselves, whatever the hour', async () => {
    const { outcome, hasMeal } = await run('14:35', 'chosen');
    expect(hasMeal).toBe(true);
    if (!outcome.ok) throw new Error('expected a plan');
    expect(outcome.source.caveats.some((caveat) => caveat.kind === 'lunch-outside-window')).toBe(false);
  });

  it('the plan screen treats only an added lunch as chosen, and saves it as chosen so editing keeps it', () => {
    const plan = read('app/plan.tsx');
    expect(plan).toContain("const mealMode = lunchParam === 'on' ? 'chosen' : 'auto';");
    expect(plan).toContain("mealMode === 'chosen' ? { lunch: 'on' } : {}");
  });
});

describe('3. Meet halfway and Families agree on who the parent plans with', () => {
  const fam = (id: string, label: string): PlanningFamily => ({ id, label, area: 'E17', latitude: 51.58, longitude: -0.02, ages: [3, 1], maxDriveMinutes: 60, pushchair: true, required: [], routines: [] });
  const emma = fam('guest-emma', 'Emma');
  const sam = fam('connected-c1', 'Sam');

  it('a family typed in on the phone is local, always', () => {
    expect(plannableFamilies({ stored: [emma], accepted: [], verified: true }).map((f) => [f.id, f.kind])).toEqual([['guest-emma', 'local']]);
  });

  it('a connection the account lists is connected, and replaces its stored copy', () => {
    const live = { ...sam, ages: [4] };
    const list = plannableFamilies({ stored: [sam], accepted: [{ family: live }], verified: true });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: 'connected' });
    expect(list[0].family.ages).toEqual([4]);
  });

  it('a stored copy of a connection the account no longer lists is not offered (it is kept on the phone, only hidden)', () => {
    expect(plannableFamilies({ stored: [sam, emma], accepted: [], verified: true }).map((f) => f.id)).toEqual(['guest-emma']);
  });

  it('where the account cannot be asked, the copy is offered as unchecked, never as connected', () => {
    expect(plannableFamilies({ stored: [sam], accepted: [], verified: false }).map((f) => [f.id, f.kind])).toEqual([['connected-c1', 'unverified']]);
  });

  it('both screens use that one rule, and Families says plainly that nobody is connected when only local families exist', () => {
    expect(read('src/components/together/MeetHalfwayView.tsx')).toContain('plannableFamilies({ stored, accepted: connected.accepted');
    const families = read('src/components/profile/FamilySections.tsx');
    expect(families).toContain('plannableFamilies({ stored: storedFamilies, accepted');
    expect(families).toContain('No families are connected yet. The families below are on this phone only');
    expect(families).toContain('From a connection · can’t be checked right now');
  });
});
