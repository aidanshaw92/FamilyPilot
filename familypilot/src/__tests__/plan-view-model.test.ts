import { describe, expect, it } from 'vitest';

import { PlanParkingInput, toPlanViewModel, weekdayOf, planClock } from '@/src/services/planning/plan-view-model';
import { DayItinerary, SequenceStop, SequenceLeg } from '@/src/types/day-sequence';
import { PlanCaveat, TravelDiagnostics } from '@/src/types/day-plan';

/**
 * The adapter between `generateDayPlan` and the approved Plan screen.
 *
 * Tested without React on purpose: the approved layout's content is decided here, so it can be
 * checked exhaustively and cheaply, and a design change that moves a label does not need a browser.
 */

const stop = (over: Partial<SequenceStop> = {}): SequenceStop => ({
  index: 0,
  placeId: 'fp-google-anchor',
  name: 'Kentish Town City Farm',
  role: 'activity',
  anchor: true,
  arrive: 10 * 60,
  depart: 11 * 60 + 30,
  dwellMinutes: 90,
  opening: { status: 'open', reason: 'within-opening-period', closesAt: '17:00' },
  ...over,
});

const itinerary = (over: Partial<DayItinerary> = {}): DayItinerary => ({
  date: '2026-10-10',
  stops: [stop()],
  legs: [],
  families: [{
    familyId: 'mine', label: 'Our family',
    depart: 9 * 60 + 30, home: 12 * 60 + 30, latestDeparture: 10 * 60, notes: [],
  }],
  unknowns: [],
  openingConfidence: { confirmed: 1, unknown: 0 },
  routineInsights: [],
  homeAfter: [],
  reasons: ['Required facilities checked for every family.'],
  fairnessGap: 0,
  score: 10,
  ...over,
});

const travel = (over: Partial<TravelDiagnostics> = {}): TravelDiagnostics => ({
  provenance: { live: 2, estimated: 0 },
  trafficDowngraded: false,
  missing: [],
  ...over,
});

const build = (over: {
  itinerary?: Partial<DayItinerary>;
  travel?: Partial<TravelDiagnostics>;
  caveats?: PlanCaveat[];
  parking?: PlanParkingInput;
  media?: Record<string, { imageUrl?: string; category?: string }>;
} = {}) =>
  toPlanViewModel({
    itinerary: itinerary(over.itinerary),
    travel: travel(over.travel),
    caveats: over.caveats ?? [],
    anchorName: 'Kentish Town City Farm',
    parking: over.parking,
    media: over.media,
  });

describe('the day reads as a day, not as a schedule dump', () => {
  it('summarises the outing in the parent’s own terms', () => {
    const view = build();
    // 09:30 out to 12:30 back is three hours, and 2026-10-10 is a Saturday.
    expect(view.summary).toBe('A 3-hour Saturday');
    expect(view.dateSummary).toBe('Sat 10 Oct · 09:30–12:30');
  });

  it('measures the day from the family leaving home to being back, not from the venue', () => {
    // The venue visit is 90 minutes; the day is three hours. A parent plans around the door, not
    // the turnstile.
    const view = build();
    expect(view.stops[0].dwellLabel).toBe('1h 30m');
    expect(view.summary).toBe('A 3-hour Saturday');
  });

  it('rounds the headline to the hour and keeps the exact span beside it', () => {
    // 09:30 to 12:50 is 3h20m. The headline says "3-hour"; the precise span is still shown.
    const view = build({ itinerary: { families: [{ familyId: 'mine', label: 'Our family',
      depart: 9 * 60 + 30, home: 12 * 60 + 50, latestDeparture: 10 * 60, notes: [] }] } });
    expect(view.summary).toBe('A 3-hour Saturday');
    expect(view.dateSummary).toBe('Sat 10 Oct · 09:30–12:50');
  });

  it('does not claim an hour for a very short outing', () => {
    const view = build({ itinerary: { families: [{ familyId: 'mine', label: 'Our family',
      depart: 10 * 60, home: 10 * 60 + 20, latestDeparture: 10 * 60, notes: [] }] } });
    expect(view.summary).toBe('A short Saturday out');
  });

  it('names the three approved sections in order', () => {
    expect(build().sections.map((s) => s.label)).toEqual(['Day plan', 'Who’s coming', 'Travel & parking']);
  });
});

describe('periods come from the clock and the kind of stop', () => {
  it('labels a morning activity, a midday meal and an afternoon activity', () => {
    const view = build({
      itinerary: {
        stops: [
          stop({ index: 0, arrive: 10 * 60, depart: 12 * 60 }),
          stop({ index: 1, placeId: 'fp-google-meal', name: 'The Moat Cafe', role: 'meal', anchor: false,
                 arrive: 12 * 60 + 30, depart: 13 * 60 + 15, dwellMinutes: 45 }),
          stop({ index: 2, placeId: 'fp-google-second', name: 'Hampstead Heath', role: 'activity', anchor: false,
                 arrive: 14 * 60, depart: 15 * 60 + 30 }),
        ],
      },
    });
    expect(view.stops.map((s) => s.period)).toEqual(['Morning', 'Lunch', 'Afternoon']);
  });

  it('does not call a late meal lunch', () => {
    const view = build({
      itinerary: { stops: [stop({ role: 'meal', arrive: 18 * 60, depart: 19 * 60 })] },
    });
    expect(view.stops[0].period).toBe('Afternoon');
  });
});

describe('what nobody confirmed stays visible', () => {
  it('says so on the stop when hours are unknown, rather than omitting the row', () => {
    const view = build({
      itinerary: { stops: [stop({ opening: { status: 'unknown', reason: 'no-structured-hours' } })] },
    });
    const opening = view.stops[0].rows.find((r) => r.label === 'Opening');
    expect(opening?.value).toBe('Hours not confirmed. Check before you go');
    expect(opening?.unconfirmed).toBe(true);
  });

  it('carries the itinerary’s unknowns through untouched', () => {
    // Already sentences by the time they arrive -- the sequencer names them through
    // services/planning/unknown-facts -- so there is nothing here to translate, and nothing to drop.
    const view = build({ itinerary: { unknowns: ['Baby changing is not confirmed here'] } });
    expect(view.unknowns).toEqual(['Baby changing is not confirmed here']);
  });

  it('never presents an estimated journey as a measured one', () => {
    const legs: SequenceLeg[] = [
      { kind: 'rendezvous', familyId: 'mine', from: { kind: 'home', familyId: 'mine' },
        to: { kind: 'stop', index: 0, placeId: 'fp-google-anchor' },
        depart: 9 * 60 + 30, arrive: 10 * 60, travelMinutes: 20, bufferMinutes: 10, source: 'estimated' },
    ];
    const view = build({ itinerary: { legs }, travel: { provenance: { live: 0, estimated: 1 } } });
    expect(view.travel.legs[0].sourceLabel).toBe('Estimated from distance');
    expect(view.travel.legs[0].label).toBe('Home to Kentish Town City Farm');
    expect(view.travel.provenanceNote).toBe('All journey times are estimated from distance.');
  });

  it('reports a mixed provenance as the split it is', () => {
    expect(build({ travel: { provenance: { live: 3, estimated: 1 } } }).travel.provenanceNote)
      .toBe('3 journey times measured, 1 estimated from distance.');
  });

  it('turns each caveat kind into something a parent can act on', () => {
    const view = build({
      caveats: [
        { kind: 'opening-hours-unknown', placeId: 'fp-google-anchor', name: 'Kentish Town City Farm' },
        { kind: 'travel-estimated', legs: 2 },
        { kind: 'traffic-not-predictive', planDate: '2026-10-10' },
        { kind: 'meal-lookup-failed' },
      ],
    });
    expect(view.caveats).toEqual([
      'Kentish Town City Farm has not published hours for this day.',
      '2 journeys are estimated from distance rather than measured.',
      'Planned for a future date, so today’s traffic was not used.',
      'We could not check what is nearby, so this day has no lunch stop. This is about our lookup, not about the area.',
    ]);
  });

  it('blames our lookup for a missing lunch stop, never the neighbourhood', () => {
    // The distinction this caveat exists for. A day with no lunch and no explanation reads as "there
    // is nowhere to eat near here", which is a fact nobody established.
    const line = build({ caveats: [{ kind: 'meal-lookup-failed' }] }).caveats[0];
    expect(line).toContain('our lookup');
    expect(line).not.toMatch(/nothing (is )?(mapped|nearby)|nowhere to eat/i);
  });

  it('says nothing about lunch when the day simply has none', () => {
    // An empty neighbourhood is not an error, and must not borrow the error's wording.
    expect(build({ caveats: [] }).caveats).toEqual([]);
  });
});

describe('the weekday is computed without a timezone', () => {
  it('does not shift the date west of Greenwich', () => {
    // `new Date('2026-10-10')` is UTC midnight, which is 9 October in New York. A plan for Saturday
    // must not read "Friday" to a parent there, so the arithmetic has no Date in it.
    expect(weekdayOf('2026-10-10')).toMatchObject({ long: 'Saturday', short: 'Sat', day: 10, month: 'Oct' });
    expect(weekdayOf('2026-01-01')).toMatchObject({ long: 'Thursday' });
    expect(weekdayOf('2024-02-29')).toMatchObject({ long: 'Thursday' });
    expect(weekdayOf('2026-12-25')).toMatchObject({ long: 'Friday' });
  });

  it('refuses a malformed date rather than guessing one', () => {
    expect(weekdayOf('10/10/2026')).toBeNull();
    expect(weekdayOf('2026-13-01')).toBeNull();
    expect(weekdayOf('')).toBeNull();
  });

  it('still renders a plan when the date cannot be read', () => {
    const view = build({ itinerary: { date: 'not-a-date' } });
    expect(view.summary).toBe('A 3-hour day out');
    expect(view.dateSummary).toBe('09:30–12:30');
  });
});

describe('a day that runs past midnight says so', () => {
  it('marks the next day rather than wrapping silently to an earlier time', () => {
    expect(planClock(25 * 60)).toBe('01:00 next day');
    const view = build({ itinerary: { families: [{ familyId: 'mine', label: 'Our family',
      depart: 20 * 60, home: 25 * 60, latestDeparture: 21 * 60, notes: [] }] } });
    expect(view.dateSummary).toContain('01:00 next day');
  });
});

describe('the plan has a name a parent would say out loud', () => {
  it('names the day after the venue it is built around', () => {
    expect(build().title).toBe('A day at Kentish Town City Farm');
  });
});

describe('the Travel & parking section says only what is known about parking', () => {
  it('reports confirmed parking, and its cost only where that was confirmed too', () => {
    expect(build({ parking: { parking: 'yes', freeParking: 'yes' } }).travel.parking)
      .toEqual([{ label: 'Parking', value: 'On site, free' }]);
    expect(build({ parking: { parking: 'yes', freeParking: 'no' } }).travel.parking)
      .toEqual([{ label: 'Parking', value: 'On site, paid' }]);
    // Confirmed parking with nothing confirmed about cost stays silent about cost rather than
    // implying it is free.
    expect(build({ parking: { parking: 'yes', freeParking: 'unknown' } }).travel.parking)
      .toEqual([{ label: 'Parking', value: 'On site' }]);
    expect(build({ parking: { parking: 'yes' } }).travel.parking[0].value).toBe('On site');
  });

  it('says there is none where that is the evidence', () => {
    expect(build({ parking: { parking: 'no' } }).travel.parking)
      .toEqual([{ label: 'Parking', value: 'None on site' }]);
  });

  it('tells a parent it is unconfirmed rather than leaving a reassuring blank', () => {
    for (const view of [build(), build({ parking: { parking: 'unknown' } })]) {
      expect(view.travel.parking).toEqual([
        { label: 'Parking', value: 'Not confirmed. Check before you go', unconfirmed: true },
      ]);
    }
  });

  it('shows the venue’s own reviewed detail verbatim, alongside the fact', () => {
    const view = build({ parking: { parking: 'yes', freeParking: 'no', info: 'Pay and display, 120 spaces' } });
    expect(view.travel.parking).toEqual([
      { label: 'Parking', value: 'On site, paid' },
      { label: 'Details', value: 'Pay and display, 120 spaces' },
    ]);
  });

  it('keeps the detail attached to an unconfirmed fact rather than dropping either', () => {
    const view = build({ parking: { parking: 'unknown', info: 'Nearest car park is on the high street' } });
    expect(view.travel.parking[0].unconfirmed).toBe(true);
    expect(view.travel.parking[1]).toEqual({ label: 'Details', value: 'Nearest car park is on the high street' });
  });
});

describe('frame 03: the heading, the insight and the stop rows', () => {
  it('names the day for the "Your Saturday plan" heading, and not when the date is unreadable', () => {
    expect(build().dayName).toBe('Saturday');
    expect(build({ itinerary: { date: 'not-a-date' } }).dayName).toBeNull();
  });

  it('shows the timing insight only when the planner recorded a routine the day is home before', () => {
    expect(build().insight).toBeNull();
    const withNap = build({ itinerary: { families: [{
      familyId: 'mine', label: 'Our family', depart: 9 * 60 + 30, home: 14 * 60 + 45, latestDeparture: 10 * 60,
      notes: ['Home before the usual nap at 15:30.'],
    }] } });
    expect(withNap.insight).toBe('Home around 14:45, before the usual nap');
  });

  it('adds Leave to every stop and Travel to next stop only where a next stop exists', () => {
    const legs: SequenceLeg[] = [{
      from: { kind: 'stop', index: 0 }, to: { kind: 'stop', index: 1 }, depart: 11 * 60 + 30, arrive: 11 * 60 + 36,
      travelMinutes: 6, bufferMinutes: 0, source: 'estimated',
    } as unknown as SequenceLeg];
    const view = build({ itinerary: {
      stops: [stop(), stop({ index: 1, placeId: 'fp-osm-lunch', name: 'The Mapped Kitchen', role: 'meal', anchor: false, arrive: 11 * 60 + 36, depart: 12 * 60 + 21, dwellMinutes: 45 })],
      legs,
    } });
    const labels = (i: number) => view.stops[i].rows.map((r) => r.label);
    expect(labels(0)).toEqual(['Arrive', 'Time there', 'Leave', 'Opening', 'Travel to next stop']);
    expect(view.stops[0].rows.find((r) => r.label === 'Leave')?.value).toBe('11:30');
    // Legs are timed as drives and this one is estimated, so the row says so rather than "6 min".
    expect(view.stops[0].rows.find((r) => r.label === 'Travel to next stop')?.value).toBe('🚗 about 6 min drive');
    expect(labels(1)).toEqual(['Arrive', 'Time there', 'Leave', 'Opening']);
  });

  it('carries a photograph where one exists and falls back to the restaurant placeholder for a meal', () => {
    const view = build({
      itinerary: { stops: [stop(), stop({ index: 1, placeId: 'fp-osm-lunch', name: 'Lunch', role: 'meal', anchor: false })] },
      media: { 'fp-google-anchor': { imageUrl: 'https://img/anchor.jpg', category: 'farm' } },
    });
    expect(view.stops[0]).toMatchObject({ imageUrl: 'https://img/anchor.jpg', category: 'farm' });
    expect(view.stops[1]).toMatchObject({ imageUrl: undefined, category: 'restaurant' });
  });
});

describe('a day saved before routines were advice still opens', () => {
  it('renders from a source with none of the newer fields, and claims nothing about routines', () => {
    const legacy = itinerary();
    // What an older build stored: no routine insights, no home-after, no visit explanation, no alternatives.
    delete (legacy as Partial<DayItinerary>).routineInsights;
    delete (legacy as Partial<DayItinerary>).homeAfter;
    const view = toPlanViewModel({ itinerary: legacy, travel: { provenance: { live: 0, estimated: 1 }, trafficDowngraded: false, missing: [] }, caveats: [], anchorName: 'Kentish Town City Farm' });
    expect(view.routines).toBeNull();
    expect(view.lunch).toEqual({ included: false, available: false });
    expect(view.stops).toHaveLength(1);
  });
});
