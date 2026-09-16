import { describe, expect, it } from 'vitest';

import { PlanningFamily, Routine } from '@/src/services/planning/planner';
import { SequenceOptions, homeKey, sequenceDay, stopKey } from '@/src/services/planning/sequencer';
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
    expect(legs.map((l) => `${l.from.kind}->${l.to.kind}`)).toEqual([
      'home->stop',
      'stop->stop',
      'stop->home',
    ]);
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
  it('keeps it even when it is not first in the request list', () => {
    const anchoredSecond = [{ ...lunch, anchor: false }, { ...gallery, anchor: true }];
    const result = sequenceDay(anchoredSecond, [family], matrix(), options, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.stops.some((s) => s.anchor && s.placeId === 'fp-w')).toBe(true);
    expect(result.itinerary.stops).toHaveLength(2);
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

    // The unconfirmed venue schedules 85 minutes earlier, because nothing stops it opening at
    // 09:35. It must still rank below the one known to be open, or the preference inverts
    // exactly where it matters.
    expect(unconfirmed.itinerary.stops[0].arrive).toBeLessThan(confirmed.itinerary.stops[0].arrive);
    expect(confirmed.itinerary.score).toBeGreaterThan(unconfirmed.itinerary.score);

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
    // Arrives 10:02 rather than 10:00: the 5 minute scan starts from a 22 minute drive plus the
    // buffer, so it steps past the opening time rather than landing on it.
    expect(result.failure.nearest.homeAt).toBe(702);
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
    expect(result.failure.attempts).toBe(2);
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
    const arrivals = result.itinerary.legs.filter((l) => l.to.kind === 'stop' && l.from.kind === 'home');
    expect(new Set(arrivals.map((l) => l.arrive)).size).toBe(1);
  });

  it('gives every family their own outbound and return legs', () => {
    const result = sequenceDay([gallery, lunch], [family, second], matrix(), options, now);
    if (!result.ok) return;
    const perFamily = result.itinerary.legs.filter((l) => l.familyIds.length === 1);
    expect(perFamily).toHaveLength(4);
    const shared = result.itinerary.legs.filter((l) => l.familyIds.length === 2);
    expect(shared).toHaveLength(1);
    expect(shared[0].from.kind).toBe('stop');
    expect(shared[0].to.kind).toBe('stop');
  });
});
