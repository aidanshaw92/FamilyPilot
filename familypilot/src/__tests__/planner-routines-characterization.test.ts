import { describe, expect, it } from 'vitest';

import { PlanningFamily, PlanningOptions, Routine, planVenue } from '@/src/services/planning/planner';
import { MatchableVenueFacts } from '@/src/types/day-request';

/**
 * Characterization tests for the routine logic buried inside `planVenue`'s scan loop.
 *
 * Written *before* that logic is extracted for the day sequencer to share, and deliberately
 * black-box: they drive `planVenue` and assert the times and notes it produces, rather than the
 * shape of any helper. That way the extraction is free to choose its own interface while these
 * remain the contract, and a behaviour change shows up as a failure here instead of as a subtly
 * different plan in production.
 *
 * The exact minute values are the point. A test asserting "it fits somewhere" would pass either
 * side of an off-by-one in the overlap comparisons, which is precisely the bug an extraction
 * invites.
 */

const now = new Date('2026-09-10T08:00:00');

const family: PlanningFamily = {
  id: 'a',
  label: 'Family A',
  area: 'Town',
  latitude: 51.6,
  longitude: -0.3,
  ages: [3, 0],
  maxDriveMinutes: 45,
  budgetTier: 'moderate',
  pushchair: true,
  required: ['babyChanging'],
  routines: [],
};

const options: PlanningOptions = {
  date: '2026-09-10',
  leaveAt: '09:00',
  returnBy: '',
  visitMinutes: 60,
  bufferMinutes: 15,
  environment: 'either',
};

const facts: MatchableVenueFacts = {
  placeId: 'test',
  name: 'Test venue',
  category: 'park',
  driveMinutes: 20,
  enrichmentStatus: 'verified',
  minRecommendedAge: 0,
  maxRecommendedAge: 10,
  venueAgeRestriction: null,
  toilets: 'yes',
  babyChanging: 'yes',
  parking: 'yes',
  pushchairSuitability: 'good',
  environment: 'outdoor',
  energyLevel: 'moderate',
  visitDurationMinutes: 60,
  estimatedSpend: 'Free',
  goodToKnow: [],
  warnings: [],
  openingStatus: 'unknown',
};

const journeys = { a: { outbound: 20, inbound: 25, source: 'estimated' as const } };

const withRoutines = (...routines: Routine[]): PlanningFamily => ({ ...family, routines });
const plan = (f: PlanningFamily, o: Partial<PlanningOptions> = {}) =>
  planVenue(facts, [f], journeys, { ...options, ...o }, now);

// The unconstrained baseline every case below is measured against:
// earliest 09:00 (540) + outbound 20 + buffer 15 => arrive 575, leave 635, home 675.
const BASE_START = 575;
const BASE_DEPART = 540;
const BASE_HOME = 675;

describe('baseline, so the deltas below mean something', () => {
  it('places the visit at the earliest slot that clears travel and buffer', () => {
    const result = plan(family)!;
    expect(result.timings[0].depart).toBe(BASE_DEPART);
    expect(result.start).toBe(BASE_START);
    expect(result.end).toBe(BASE_START + 60);
    expect(result.timings[0].home).toBe(BASE_HOME);
  });

  it('computes latest departure against the return deadline when no routine bounds it', () => {
    // 1439 - inbound 25 - outbound 20 - buffer 15 twice - visit 60
    expect(plan(family)!.timings[0].latestDeparture).toBe(1304);
  });
});

describe('home routine overlap is half-open, and the boundary matters', () => {
  it('allows a routine that ends exactly as the family leaves', () => {
    // 08:00 + 60 = ends 540, which is the baseline departure. Touching is not overlapping.
    const result = plan(withRoutines({ id: 'r', label: 'Feed', kind: 'feed', time: '08:00', durationMinutes: 60, atHome: true }))!;
    expect(result.start).toBe(BASE_START);
    expect(result.timings[0].depart).toBe(BASE_DEPART);
  });

  it('pushes the day later when that routine runs one minute longer', () => {
    // 08:00 + 61 = ends 541, one minute past the baseline departure, so the scan steps on by 5.
    const result = plan(withRoutines({ id: 'r', label: 'Feed', kind: 'feed', time: '08:00', durationMinutes: 61, atHome: true }))!;
    expect(result.start).toBe(580);
    expect(result.timings[0].depart).toBe(545);
  });
});

describe('a later home routine bounds the day without blocking it', () => {
  it('keeps the family home before it, and says so in the same words', () => {
    const result = plan(withRoutines({ id: 'nap', label: 'Nap', kind: 'nap', time: '12:00', durationMinutes: 60, atHome: true }))!;
    expect(result.start).toBe(BASE_START);
    expect(result.timings[0].home).toBeLessThanOrEqual(720);
    expect(result.timings[0].notes).toEqual(['Home before Nap at 12:00.']);
  });

  it('tightens latest departure to that routine rather than the deadline', () => {
    // 720 - inbound 25 - outbound 20 - buffer 15 twice - visit 60
    const result = plan(withRoutines({ id: 'nap', label: 'Nap', kind: 'nap', time: '12:00', durationMinutes: 60, atHome: true }))!;
    expect(result.timings[0].latestDeparture).toBe(585);
  });

  it('falls back to the routine kind when it has no label', () => {
    const result = plan(withRoutines({ id: 'nap', label: '', kind: 'nap', time: '12:00', durationMinutes: 60, atHome: true }))!;
    expect(result.timings[0].notes).toEqual(['Home before nap at 12:00.']);
  });
});

describe('out-of-home routines', () => {
  it('are carried as a note, verbatim, when they fall during the outing', () => {
    const result = plan(withRoutines({ id: 'f', label: 'Feed', kind: 'feed', time: '10:00', durationMinutes: 20, atHome: false }))!;
    expect(result.start).toBe(BASE_START);
    expect(result.timings[0].notes).toEqual([
      'Feed: 10:00 while out; allow 20 minutes within your visit and check facilities.',
    ]);
  });

  it('are not noted when they fall outside the time away from home', () => {
    // 18:00 is after the family is home at 675, so it is not part of this outing.
    const result = plan(withRoutines({ id: 'f', label: 'Feed', kind: 'feed', time: '18:00', durationMinutes: 20, atHome: false }))!;
    expect(result.timings[0].notes).toEqual([]);
  });

  it('push the departure past a routine that would otherwise happen while driving', () => {
    // 09:15 + 30 ends 585. Departing before that while arriving after the routine starts is the
    // outbound-drive clash, so the first workable arrival is 620 and departure 585.
    const result = plan(withRoutines({ id: 'f', label: 'Feed', kind: 'feed', time: '09:15', durationMinutes: 30, atHome: false }))!;
    expect(result.timings[0].depart).toBe(585);
    expect(result.start).toBe(620);
  });
});

describe('routine duration is validated before anything is scheduled', () => {
  const at = (durationMinutes: number): PlanningFamily =>
    withRoutines({ id: 'r', label: 'Feed', kind: 'feed', time: '08:00', durationMinutes, atHome: true });

  it.each([0, -1, 241, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s minutes', (duration) => {
    expect(() => plan(at(duration))).toThrow('Routine duration must be 1–240 minutes.');
  });

  it.each([1, 240])('accepts %s minutes', (duration) => {
    expect(() => plan(at(duration))).not.toThrow();
  });
});

describe('several families each keep their own routines', () => {
  it('holds the shared arrival while applying one family’s constraint', () => {
    const b: PlanningFamily = {
      ...family,
      id: 'b',
      label: 'Family B',
      routines: [{ id: 'r', label: 'Feed', kind: 'feed', time: '08:00', durationMinutes: 61, atHome: true }],
    };
    const result = planVenue(
      facts,
      [family, b],
      { ...journeys, b: { outbound: 20, inbound: 25, source: 'estimated' as const } },
      options,
      now,
    )!;

    // Family B's overrun moves the whole meeting, and both still arrive together.
    expect(result.start).toBe(580);
    expect(result.timings[0].arrive).toBe(result.timings[1].arrive);
    expect(result.timings[0].notes).toEqual([]);
  });
});
