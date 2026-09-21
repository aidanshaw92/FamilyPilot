import { describe, expect, it } from 'vitest';

import { PlanningFamily, Routine } from '@/src/services/planning/planner';
import { SequenceOptions, homeKey, sequenceDay, stopKey } from '@/src/services/planning/sequencer';
import { compareFailures, compareItineraries } from '@/src/services/planning/sequence-ranking';
import { JourneyMatrix, StopRequest } from '@/src/types/day-sequence';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';

import { BABYLON_PARK, TEXT_ONLY_PLACE, WHITECHAPEL_GALLERY } from './fixtures/provider-opening-hours';

const { googlePlaceToRecord } = require('../../../server/places/lib/google-places');

/**
 * The schedules come through the real provider mapper rather than being hand-written, so these
 * exercise the same path production does. Whitechapel Gallery is shut on Mondays and open late on
 * Thursdays, which makes it a venue whose hours actually decide things.
 */
const schedule = (payload: unknown): OpeningHoursSchedule =>
  googlePlaceToRecord(payload, 'explore').openingHours;

const WHITECHAPEL = schedule(WHITECHAPEL_GALLERY);
const BABYLON = schedule(BABYLON_PARK);
const NO_STRUCTURED_HOURS = schedule(TEXT_ONLY_PLACE);

const now = new Date('2026-09-20T08:00:00');
const TUESDAY = '2026-09-22';
const MONDAY = '2026-09-21';

const facts = (placeId: string, name: string): MatchableVenueFacts => ({
  placeId,
  name,
  category: 'museum',
  driveMinutes: 0,
  enrichmentStatus: 'verified',
  minRecommendedAge: 0,
  maxRecommendedAge: 12,
  venueAgePolicy: null,
  toilets: 'yes',
  babyChanging: 'yes',
  parking: 'yes',
  pushchairSuitability: 'good',
  environment: 'indoor',
  energyLevel: 'moderate',
  visitDurationMinutes: 90,
  estimatedSpend: 'Free',
  goodToKnow: [],
  warnings: [],
  openingStatus: 'unknown',
});

const gallery: StopRequest = {
  placeId: 'fp-w',
  name: 'Whitechapel Gallery',
  role: 'activity',
  anchor: true,
  dwellMinutes: 90,
  facts: facts('fp-w', 'Whitechapel Gallery'),
  openingHours: WHITECHAPEL,
};

const lunch: StopRequest = {
  placeId: 'fp-b',
  name: 'Babylon Park',
  role: 'meal',
  anchor: false,
  dwellMinutes: 60,
  facts: facts('fp-b', 'Babylon Park'),
  openingHours: BABYLON,
};

const family: PlanningFamily = {
  id: 'a',
  label: 'Family A',
  area: 'Town',
  latitude: 51.5,
  longitude: -0.1,
  ages: [4],
  maxDriveMinutes: 45,
  budgetTier: 'moderate',
  pushchair: true,
  required: ['babyChanging'],
  routines: [],
};

const options: SequenceOptions = {
  date: TUESDAY,
  leaveAt: '09:00',
  returnBy: '',
  bufferMinutes: 15,
  environment: 'either',
};

const matrix = (overrides: Record<string, Record<string, number>> = {}): JourneyMatrix => {
  const base: Record<string, Record<string, number>> = {
    [homeKey('a')]: { [stopKey('fp-w')]: 20, [stopKey('fp-b')]: 22 },
    [homeKey('b')]: { [stopKey('fp-w')]: 30, [stopKey('fp-b')]: 32 },
    [stopKey('fp-w')]: { [homeKey('a')]: 25, [homeKey('b')]: 35, [stopKey('fp-b')]: 15 },
    [stopKey('fp-b')]: { [homeKey('a')]: 25, [homeKey('b')]: 35, [stopKey('fp-w')]: 15 },
    ...overrides,
  };
  return {
    legs: Object.fromEntries(
      Object.entries(base).map(([from, tos]) => [
        from,
        Object.fromEntries(
          Object.entries(tos).map(([to, minutes]) => [to, { minutes, source: 'estimated' as const }]),
        ),
      ]),
    ),
  };
};

const withRoutines = (...routines: Routine[]): PlanningFamily => ({ ...family, routines });

describe('a day is built from stops and legs, not one padded visit', () => {
  const result = sequenceDay([gallery, lunch], [family], matrix(), options, now);

  it('schedules both stops inside their opening hours', () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [first, second] = result.itinerary.stops;
    // The gallery opens at 11:00, so the day cannot start at the earliest travel-feasible slot.
    expect(first.arrive).toBe(660);
    expect(first.depart).toBe(750);
    expect(second.arrive).toBe(780);
    expect(second.depart).toBe(840);
  });

  it('keeps travel out of every stop’s duration', () => {
    if (!result.ok) return;
    for (const stop of result.itinerary.stops) {
      expect(stop.depart - stop.arrive).toBe(stop.dwellMinutes);
    }
  });

  it('models each journey as its own leg, with travel and buffer both visible', () => {
    if (!result.ok) return;
    const { legs } = result.itinerary;
    expect(legs).toHaveLength(3);
    for (const journey of legs) {
      expect(journey.arrive - journey.depart).toBe(journey.travelMinutes + journey.bufferMinutes);
    }
    // Home out, the transfer between stops, then home again — in that order.
    expect(legs.map((l) => l.kind)).toEqual(['rendezvous', 'transfer', 'return']);
  });

  it('records when the family leaves and gets back', () => {
    if (!result.ok) return;
    const [timing] = result.itinerary.families;
    expect(timing.depart).toBe(625);
    expect(timing.home).toBe(880);
  });

  it('is deterministic, and reaches no provider to produce it', () => {
    const again = sequenceDay([gallery, lunch], [family], matrix(), options, now);
    expect(again).toEqual(result);
  });
});

describe('the anchor venue is never substituted', () => {
  it('leads the day even when it is listed second', () => {
    const anchoredSecond = [{ ...lunch, anchor: false }, { ...gallery, anchor: true }];
    const result = sequenceDay(anchoredSecond, [family], matrix(), options, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The anchor is stop 1, not merely present somewhere in the day.
    expect(result.itinerary.stops[0].placeId).toBe('fp-w');
    expect(result.itinerary.stops[0].anchor).toBe(true);
    expect(result.itinerary.stops).toHaveLength(2);
  });

  it('is never reordered behind another activity', () => {
    const second: StopRequest = { ...lunch, role: 'activity' };
    for (const requests of [[gallery, second], [second, gallery]]) {
      const result = sequenceDay(requests, [family], matrix(), options, now);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.itinerary.stops[0].placeId).toBe('fp-w');
    }
  });

  it('fails rather than dropping it when the anchor cannot be opened', () => {
    const result = sequenceDay([gallery, lunch], [family], matrix(), { ...options, date: MONDAY }, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('no-feasible-sequence');
    // Babylon Park is open on Monday, so a sequencer that simply dropped the shut anchor would
    // have returned a one-stop day instead of failing.
    if (result.failure.reason !== 'no-feasible-sequence') return;
    expect(result.failure.nearest?.reason).toBe('venue-closed');
  });

  it('refuses a request set without exactly one anchor', () => {
    for (const requests of [
      [{ ...gallery, anchor: false }, { ...lunch, anchor: false }],
      [{ ...gallery, anchor: true }, { ...lunch, anchor: true }],
    ]) {
      const result = sequenceDay(requests, [family], matrix(), options, now);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.reason).toBe('invalid-request');
    }
  });
});

describe('the stop cap', () => {
  it('allows three non-home stops', () => {
    const third: StopRequest = { ...lunch, placeId: 'fp-c', name: 'Third Stop', role: 'activity', facts: facts('fp-c', 'Third Stop'), openingHours: BABYLON };
    const extended = matrix({
      [homeKey('a')]: { [stopKey('fp-w')]: 20, [stopKey('fp-b')]: 22, [stopKey('fp-c')]: 22 },
      [stopKey('fp-w')]: { [homeKey('a')]: 25, [stopKey('fp-b')]: 15, [stopKey('fp-c')]: 15 },
      [stopKey('fp-b')]: { [homeKey('a')]: 25, [stopKey('fp-w')]: 15, [stopKey('fp-c')]: 15 },
      [stopKey('fp-c')]: { [homeKey('a')]: 25, [stopKey('fp-w')]: 15, [stopKey('fp-b')]: 15 },
    });
    const result = sequenceDay([gallery, lunch, third], [family], extended, options, now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.itinerary.stops).toHaveLength(3);
  });

  it('refuses a fourth', () => {
    const extra = (id: string): StopRequest => ({ ...lunch, placeId: id, name: id, facts: facts(id, id) });
    const result = sequenceDay(
      [gallery, extra('fp-b'), extra('fp-c'), extra('fp-d')],
      [family],
      matrix(),
      options,
      now,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.reason).toBe('invalid-request');
  });
});

describe('opening hours decide slots without inventing certainty', () => {
  it('reports a venue that would shut mid-visit, and keeps the closing time', () => {
    // Leaving at 16:30 means the earliest possible arrival already overruns the 18:00 close.
    const result = sequenceDay([gallery], [family], matrix(), { ...options, leaveAt: '16:30' }, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('no-feasible-sequence');
    if (result.failure.reason !== 'no-feasible-sequence') return;
    expect(result.failure.nearest?.reason).toBe('venue-closes-during-visit');
    if (result.failure.nearest?.reason !== 'venue-closes-during-visit') return;
    expect(result.failure.nearest.closesAt).toBe('18:00');
    expect(result.failure.nearest.placeId).toBe('fp-w');
    expect(result.failure.nearest.stopIndex).toBe(0);
  });

  it('uses the later Thursday closing that Monday does not have', () => {
    const thursday = sequenceDay([gallery], [family], matrix(), { ...options, date: '2026-09-24', leaveAt: '17:30' }, now);
    const tuesday = sequenceDay([gallery], [family], matrix(), { ...options, date: TUESDAY, leaveAt: '17:30' }, now);
    expect(thursday.ok).toBe(true);
    expect(tuesday.ok).toBe(false);
  });

  it('schedules a venue with no structured hours, but never calls it open', () => {
    const unconfirmed: StopRequest = { ...gallery, openingHours: NO_STRUCTURED_HOURS };
    const result = sequenceDay([unconfirmed], [family], matrix(), options, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.stops[0].opening.status).toBe('unknown');
    expect(result.itinerary.stops[0].opening.status).not.toBe('open');
    expect(result.itinerary.unknowns).toContain('Whitechapel Gallery: opening hours not confirmed');
  });

  it('scores a confirmed-open venue above an identical unconfirmed one', () => {
    const confirmed = sequenceDay([gallery], [family], matrix(), options, now);
    const unconfirmed = sequenceDay(
      [{ ...gallery, openingHours: NO_STRUCTURED_HOURS }],
      [family],
      matrix(),
      options,
      now,
    );
    expect(confirmed.ok && unconfirmed.ok).toBe(true);
    if (!confirmed.ok || !unconfirmed.ok) return;

    // The unconfirmed venue schedules earlier and so scores *better* on scheduling alone. That is
    // the point: ordering must not depend on score magnitude, or the preference inverts exactly
    // where it matters.
    expect(unconfirmed.itinerary.stops[0].arrive).toBeLessThan(confirmed.itinerary.stops[0].arrive);
    expect(unconfirmed.itinerary.score).toBeGreaterThan(confirmed.itinerary.score);

    // The comparator still puts the confirmed one first, because unknown hours are compared
    // before any score is looked at.
    expect(compareItineraries(confirmed.itinerary, unconfirmed.itinerary)).toBeLessThan(0);
    expect([unconfirmed.itinerary, confirmed.itinerary].sort(compareItineraries)[0]).toBe(
      confirmed.itinerary,
    );

    // Candidate selection has not been written yet; these are the counts it will rank on, so it
    // never has to infer confidence from the weighting of a scalar.
    expect(confirmed.itinerary.openingConfidence).toEqual({ confirmed: 1, unknown: 0 });
    expect(unconfirmed.itinerary.openingConfidence).toEqual({ confirmed: 0, unknown: 1 });
  });
});

describe('the failures a person could act on', () => {
  it('moves the day after a morning nap rather than abandoning it', () => {
    // A four hour nap does not make the day impossible, it makes it an afternoon.
    const result = sequenceDay(
      [gallery, lunch],
      [withRoutines({ id: 'nap', label: 'Nap', kind: 'nap', time: '09:00', durationMinutes: 240, atHome: true })],
      matrix(),
      options,
      now,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.families[0].depart).toBeGreaterThanOrEqual(780);
  });

  it('names the routine when one genuinely leaves no room', () => {
    const result = sequenceDay(
      [gallery, lunch],
      [withRoutines({ id: 'nap', label: 'Nap', kind: 'nap', time: '09:00', durationMinutes: 240, atHome: true })],
      matrix(),
      // Closing the day at 15:00 removes the afternoon the nap pushed it into.
      { ...options, returnBy: '15:00' },
      now,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('no-feasible-sequence');
    if (result.failure.reason !== 'no-feasible-sequence') return;
    expect(result.failure.nearest?.reason).toBe('routine-conflict');
    if (result.failure.nearest?.reason !== 'routine-conflict') return;
    expect(result.failure.nearest.routineLabel).toBe('Nap');
    expect(result.failure.nearest.familyId).toBe('a');
  });

  it('reports a return time that cannot be met', () => {
    // Babylon Park opens at 10:00, so the stop itself is fine and it is the drive home that
    // breaks the deadline. Against the gallery the real blocker would be its 11:00 opening.
    const result = sequenceDay([{ ...lunch, anchor: true }], [family], matrix(), { ...options, returnBy: '11:30' }, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('no-feasible-sequence');
    if (result.failure.reason !== 'no-feasible-sequence') return;
    expect(result.failure.nearest?.reason).toBe('return-by-exceeded');
    if (result.failure.nearest?.reason !== 'return-by-exceeded') return;
    // 10:00 arrival, 60 minutes there, then a 25 minute drive and the buffer.
    expect(result.failure.nearest.homeAt).toBe(700);
    expect(result.failure.nearest.returnBy).toBe(690);
  });

  it('blames the opening time, not the deadline, when the venue is the real blocker', () => {
    // The gallery cannot open early enough for a 13:00 return, and saying "return-by" here would
    // send someone off to change the wrong thing.
    const result = sequenceDay([gallery, lunch], [family], matrix(), { ...options, returnBy: '13:00' }, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('no-feasible-sequence');
    if (result.failure.reason !== 'no-feasible-sequence') return;
    expect(result.failure.nearest?.reason).toBe('venue-closed');
  });

  it('reports a journey beyond a family’s limit, with both numbers', () => {
    const tooFar = matrix({ [homeKey('a')]: { [stopKey('fp-w')]: 90, [stopKey('fp-b')]: 22 } });
    const result = sequenceDay([gallery], [family], tooFar, options, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('no-feasible-sequence');
    if (result.failure.reason !== 'no-feasible-sequence') return;
    expect(result.failure.nearest?.reason).toBe('travel-infeasible');
    if (result.failure.nearest?.reason !== 'travel-infeasible') return;
    expect(result.failure.nearest.travelMinutes).toBe(90);
    expect(result.failure.nearest.limitMinutes).toBe(45);
  });

  it('reports a missing travel time rather than guessing one', () => {
    const result = sequenceDay([gallery], [family], { legs: {} }, options, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('no-feasible-sequence');
    if (result.failure.reason !== 'no-feasible-sequence') return;
    expect(result.failure.nearest?.reason).toBe('travel-infeasible');
  });

  it('counts the orderings it tried', () => {
    const result = sequenceDay([gallery, lunch], [family], matrix(), { ...options, returnBy: '13:00' }, now);
    if (result.ok) return;
    expect(result.failure.reason).toBe('no-feasible-sequence');
    if (result.failure.reason !== 'no-feasible-sequence') return;
    // One ordering: the anchor is pinned to stop 1, so only the stops after it can move, and
    // with a single other stop there is nothing to permute.
    expect(result.failure.attempts).toBe(1);
  });
});

describe('request validation', () => {
  it.each([
    ['no stops', [] as StopRequest[]],
    ['the same place twice', [gallery, { ...lunch, placeId: 'fp-w' }]],
    ['a dwell that is too short', [{ ...gallery, dwellMinutes: 5 }]],
    ['a dwell that is too long', [{ ...gallery, dwellMinutes: 600 }]],
  ])('refuses %s', (_label, requests) => {
    const result = sequenceDay(requests, [family], matrix(), options, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.reason).toBe('invalid-request');
  });

  it('refuses a date in the past and an impossible one', () => {
    for (const date of ['2020-01-01', '2026-02-30']) {
      const result = sequenceDay([gallery], [family], matrix(), { ...options, date }, now);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.reason).toBe('invalid-request');
    }
  });

  it('surfaces a bad routine duration as an invalid request, not a missing plan', () => {
    const result = sequenceDay(
      [gallery],
      [withRoutines({ id: 'r', label: 'Feed', kind: 'feed', time: '09:00', durationMinutes: 999, atHome: true })],
      matrix(),
      options,
      now,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('invalid-request');
      expect(result.failure.message).toBe('Routine duration must be 1–240 minutes.');
    }
  });
});

describe('several families', () => {
  const second: PlanningFamily = { ...family, id: 'b', label: 'Family B' };

  it('arrives together and measures the gap between outbound journeys', () => {
    const result = sequenceDay([gallery, lunch], [family, second], matrix(), options, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.fairnessGap).toBe(10);
    // Both leave their own homes at their own times, but reach the first stop at the same moment.
    const [a, b] = result.itinerary.families;
    expect(a.depart).not.toBe(b.depart);
    const arrivals = result.itinerary.legs.filter((l) => l.kind === 'rendezvous');
    expect(new Set(arrivals.map((l) => l.arrive)).size).toBe(1);
  });

  it('keeps each household’s own outbound duration rather than one shared number', () => {
    // Family A is 20 minutes from the anchor, Family B is 30. Both must survive into the
    // itinerary: a single travelMinutes shared across the two would have to discard one.
    const result = sequenceDay([gallery, lunch], [family, second], matrix(), options, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rendezvous = result.itinerary.legs.filter((l) => l.kind === 'rendezvous');
    const byFamily = Object.fromEntries(
      rendezvous.map((l) => [l.kind === 'rendezvous' ? l.familyId : '', l.travelMinutes]),
    );
    expect(byFamily).toEqual({ a: 20, b: 30 });

    // Return legs differ too, and each belongs to one family rather than a list.
    const returns = result.itinerary.legs.filter((l) => l.kind === 'return');
    expect(
      Object.fromEntries(returns.map((l) => [l.kind === 'return' ? l.familyId : '', l.travelMinutes])),
    ).toEqual({ a: 25, b: 35 });

    // Different departures, same moment of arrival.
    for (const journey of rendezvous) {
      expect(journey.arrive - journey.depart).toBe(journey.travelMinutes + journey.bufferMinutes);
    }
    expect(new Set(rendezvous.map((l) => l.depart)).size).toBe(2);
    expect(new Set(rendezvous.map((l) => l.arrive)).size).toBe(1);
  });

  it('gives every family their own outbound and return legs', () => {
    const result = sequenceDay([gallery, lunch], [family, second], matrix(), options, now);
    if (!result.ok) return;
    const perFamily = result.itinerary.legs.filter((l) => l.kind !== 'transfer');
    expect(perFamily).toHaveLength(4);
    const shared = result.itinerary.legs.filter((l) => l.kind === 'transfer');
    expect(shared).toHaveLength(1);
    expect(shared[0].from.kind).toBe('stop');
    expect(shared[0].to.kind).toBe('stop');
  });
});

describe('the planner picks times on the clock, not on an offset grid', () => {
  it.each(['09:00', '09:01', '09:07', '09:13', '09:22', '09:38'])(
    'starts on a five minute boundary when the earliest departure is %s',
    (leaveAt) => {
      // The home→Babylon drive is 22 minutes, so an unsnapped scan starting at
      // earliest + 22 + 15 would produce arrivals like 10:02 purely from where the grid began.
      const result = sequenceDay(
        [{ ...lunch, anchor: true }],
        [family],
        matrix(),
        { ...options, leaveAt },
        now,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      for (const stop of result.itinerary.stops) {
        expect(stop.arrive % 5).toBe(0);
        expect(stop.depart % 5).toBe(0);
      }
    },
  );

  it('opens the day at 10:00 rather than 10:02 when the venue opens at ten', () => {
    const result = sequenceDay([{ ...lunch, anchor: true }], [family], matrix(), options, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.stops[0].arrive).toBe(600);
  });

  it('does not round the travel itself, so a departure stays true to the journey', () => {
    // 22 minutes from home and a 15 minute buffer against a 10:00 arrival is 09:23, an honest
    // time off the grid. Snapping it would claim a journey nobody is making.
    const result = sequenceDay([{ ...lunch, anchor: true }], [family], matrix(), options, now);
    if (!result.ok) return;
    const [timing] = result.itinerary.families;
    expect(timing.depart).toBe(563);
    expect(timing.depart % 5).not.toBe(0);
    const rendezvous = result.itinerary.legs.find((l) => l.kind === 'rendezvous')!;
    expect(rendezvous.travelMinutes).toBe(22);
  });
});

describe('v1 stop order: home → anchor → meal → optional activity → home', () => {
  const activity: StopRequest = {
    ...lunch,
    placeId: 'fp-c',
    name: 'Second Activity',
    role: 'activity',
    facts: facts('fp-c', 'Second Activity'),
    openingHours: BABYLON,
  };
  const threeStopMatrix = matrix({
    [homeKey('a')]: { [stopKey('fp-w')]: 20, [stopKey('fp-b')]: 22, [stopKey('fp-c')]: 22 },
    [stopKey('fp-w')]: { [homeKey('a')]: 25, [stopKey('fp-b')]: 15, [stopKey('fp-c')]: 15 },
    [stopKey('fp-b')]: { [homeKey('a')]: 25, [stopKey('fp-w')]: 15, [stopKey('fp-c')]: 15 },
    [stopKey('fp-c')]: { [homeKey('a')]: 25, [stopKey('fp-w')]: 15, [stopKey('fp-b')]: 15 },
  });

  const roles = (requests: StopRequest[]) => {
    const result = sequenceDay(requests, [family], threeStopMatrix, options, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return null;
    return result.itinerary.stops.map((s) => `${s.placeId}:${s.role}`);
  };

  const EXPECTED = ['fp-w:activity', 'fp-b:meal', 'fp-c:activity'];

  it('keeps [anchor, meal, activity] in that order', () => {
    expect(roles([gallery, lunch, activity])).toEqual(EXPECTED);
  });

  it('reorders [activity, anchor, meal] to put the anchor first and the meal second', () => {
    expect(roles([activity, gallery, lunch])).toEqual(EXPECTED);
  });

  it('reorders [anchor, activity, meal] so the meal is not left until last', () => {
    // The shape this rules out: activity → activity → meal.
    expect(roles([gallery, activity, lunch])).toEqual(EXPECTED);
  });

  it('allows a second activity at stop 2 when there is no meal', () => {
    const order = roles([gallery, activity]);
    expect(order).toEqual(['fp-w:activity', 'fp-c:activity']);
  });

  it('still enforces the three-stop cap', () => {
    const fourth: StopRequest = { ...activity, placeId: 'fp-d', name: 'Fourth', facts: facts('fp-d', 'Fourth') };
    const result = sequenceDay([gallery, lunch, activity, fourth], [family], threeStopMatrix, options, now);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('invalid-request');
      expect(result.failure.message).toContain('at most 3 stops');
    }
  });

  it('refuses two meals, which cannot both be stop 2', () => {
    const secondMeal: StopRequest = { ...activity, role: 'meal' };
    const result = sequenceDay([gallery, lunch, secondMeal], [family], threeStopMatrix, options, now);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe('invalid-request');
      expect(result.failure.message).toBe('A day can include only one meal stop.');
    }
  });

  it('leaves no ordering freedom once a meal is present', () => {
    const result = sequenceDay([gallery, activity, lunch], [family], threeStopMatrix, options, now);
    if (!result.ok) return;
    // Stops and legs still line up: three stops, and travel between each of them.
    expect(result.itinerary.stops.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(result.itinerary.legs.filter((l) => l.kind === 'transfer')).toHaveLength(2);
  });
});
