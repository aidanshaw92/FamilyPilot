import { describe, expect, it } from 'vitest';

import { compareFailures, compareItineraries, mostRelevantFailure } from '@/src/services/planning/sequence-ranking';
import { DayItinerary, SequenceFailure } from '@/src/types/day-sequence';

/**
 * The ordering policy, tested directly rather than only through a scheduled day.
 *
 * Both comparators used to be arithmetic — a `-100` penalty and an `anchor +15` bonus — which
 * meant the ordering silently depended on the magnitude of unrelated terms. These assert the
 * policy itself, so retuning the schedule score cannot quietly change which day or which failure
 * comes out.
 */

const ANCHOR = 'fp-anchor';

const itinerary = (over: Partial<DayItinerary> = {}): DayItinerary => ({
  date: '2026-09-22',
  stops: [
    {
      index: 0,
      placeId: ANCHOR,
      name: 'Anchor',
      role: 'activity',
      anchor: true,
      arrive: 600,
      depart: 690,
      dwellMinutes: 90,
      opening: { status: 'open', reason: 'within-opening-period' },
    },
  ],
  legs: [],
  families: [],
  unknowns: [],
  openingConfidence: { confirmed: 1, unknown: 0 },
  reasons: [],
  fairnessGap: 0,
  score: 900,
  ...over,
});

describe('choosing between candidate days', () => {
  it('prefers fewer unknown-hours stops however much better the other scores', () => {
    const confirmed = itinerary({ openingConfidence: { confirmed: 1, unknown: 0 }, score: 1 });
    const unknown = itinerary({ openingConfidence: { confirmed: 0, unknown: 1 }, score: 10_000 });

    expect(compareItineraries(confirmed, unknown)).toBeLessThan(0);
    expect([unknown, confirmed].sort(compareItineraries)[0]).toBe(confirmed);
  });

  it('is unaffected by rescaling the schedule score', () => {
    // The whole point of comparing before the score: multiplying every score by a hundred, or
    // shifting it, must not change which candidate wins.
    const confirmed = itinerary({ openingConfidence: { confirmed: 1, unknown: 0 }, score: 1 });
    for (const scale of [1, 100, 10_000]) {
      const unknown = itinerary({ openingConfidence: { confirmed: 0, unknown: 1 }, score: scale });
      expect(compareItineraries(confirmed, unknown)).toBeLessThan(0);
    }
  });

  it('falls back to the schedule score when hours are equally confirmed', () => {
    const better = itinerary({ score: 950 });
    const worse = itinerary({ score: 900 });
    expect(compareItineraries(better, worse)).toBeLessThan(0);
  });

  it('breaks a genuine tie deterministically, on the earlier start then the stops themselves', () => {
    const early = itinerary({ stops: [{ ...itinerary().stops[0], arrive: 600 }] });
    const late = itinerary({ stops: [{ ...itinerary().stops[0], arrive: 660 }] });
    expect(compareItineraries(early, late)).toBeLessThan(0);

    const a = itinerary({ stops: [{ ...itinerary().stops[0], placeId: 'fp-a' }] });
    const b = itinerary({ stops: [{ ...itinerary().stops[0], placeId: 'fp-b' }] });
    expect(compareItineraries(a, b)).toBeLessThan(0);
    expect(compareItineraries(a, a)).toBe(0);
  });
});

describe('choosing which failure to report', () => {
  const closed = (placeId: string, stopIndex = 0): SequenceFailure => ({
    reason: 'venue-closed',
    message: 'shut',
    stopIndex,
    placeId,
    date: '2026-09-22',
  });
  const routine: SequenceFailure = {
    reason: 'routine-conflict',
    message: 'nap',
    familyId: 'a',
    routineLabel: 'Nap',
  };
  const travel: SequenceFailure = {
    reason: 'travel-infeasible',
    message: 'too far',
    from: { kind: 'home', familyId: 'a' },
    to: { kind: 'stop', index: 0, placeId: ANCHOR },
  };

  it('prefers a problem with the anchor over the same problem at an optional stop', () => {
    expect(compareFailures(closed(ANCHOR, 0), closed('fp-other', 1), ANCHOR)).toBeLessThan(0);
    expect(mostRelevantFailure([closed('fp-other', 1), closed(ANCHOR, 0)], ANCHOR)).toEqual(closed(ANCHOR, 0));
  });

  it('does not let the anchor rule bury a failure that got further into the day', () => {
    // A routine clash is not "a failure on an optional stop" — it means every stop already
    // passed its opening check, so it is the more useful thing to say.
    expect(compareFailures(routine, closed(ANCHOR), ANCHOR)).toBeLessThan(0);
  });

  it('orders by how far the attempt got', () => {
    const order: SequenceFailure[] = [
      routine,
      { reason: 'return-by-exceeded', message: 'late', familyId: 'a', homeAt: 1200, returnBy: 1100 },
      { reason: 'venue-closes-during-visit', message: 'shuts', stopIndex: 0, placeId: ANCHOR, closesAt: '18:00' },
      closed(ANCHOR),
      travel,
    ];
    const shuffled = [order[3], order[0], order[4], order[2], order[1]];
    expect(shuffled.sort((a, b) => compareFailures(a, b, ANCHOR))).toEqual(order);
  });

  it('prefers the later stop when everything else matches', () => {
    expect(compareFailures(closed('fp-x', 2), closed('fp-y', 0), ANCHOR)).toBeLessThan(0);
  });

  it('preserves the details that make a failure actionable', () => {
    const shuts: SequenceFailure = {
      reason: 'venue-closes-during-visit',
      message: 'shuts',
      stopIndex: 1,
      placeId: 'fp-other',
      closesAt: '17:00',
    };
    const chosen = mostRelevantFailure([travel, shuts], ANCHOR);
    expect(chosen).toEqual(shuts);
    if (chosen?.reason === 'venue-closes-during-visit') expect(chosen.closesAt).toBe('17:00');
  });

  it('is a total order, so the same set always yields the same choice', () => {
    const all: SequenceFailure[] = [closed(ANCHOR, 0), closed('fp-other', 1), routine, travel];
    const first = mostRelevantFailure(all, ANCHOR);
    for (const shuffle of [all, [...all].reverse(), [all[2], all[0], all[3], all[1]]]) {
      expect(mostRelevantFailure(shuffle, ANCHOR)).toEqual(first);
    }
    expect(compareFailures(routine, routine, ANCHOR)).toBe(0);
  });

  it('returns nothing when there is nothing to report', () => {
    expect(mostRelevantFailure([], ANCHOR)).toBeUndefined();
  });
});
