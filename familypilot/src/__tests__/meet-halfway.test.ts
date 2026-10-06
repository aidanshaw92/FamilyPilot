import { describe, expect, it } from 'vitest';

import { meetHalfway } from '@/src/services/planning/meet-halfway';
import { PlanningFamily, Routine } from '@/src/services/planning/planner';
import { estimateDriveMinutes } from '@/src/services/places/geo-utils';
import { Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';

/**
 * Meet halfway: a place that works for two families, not the point between them.
 *
 * Families sit about 14 km apart (Camden and Walthamstow). Places are laid out so the closest place to one family is a bad
 * meeting place, the geometric middle is not special, and the fair one wins.
 */

const SATURDAY = '2026-10-10';
const TODAY = '2026-10-06';

const mine: PlanningFamily = {
  id: 'mine', label: 'Our family', area: 'NW5', latitude: 51.55, longitude: -0.14, ages: [3, 0],
  maxDriveMinutes: 45, budgetTier: 'moderate', pushchair: true, required: [], routines: [],
};
const other = (over: Partial<PlanningFamily> = {}): PlanningFamily => ({
  id: 'connected-1', label: 'Hannah’s family', area: 'E17', latitude: 51.59, longitude: -0.02, ages: [1],
  maxDriveMinutes: 45, budgetTier: 'moderate', pushchair: false, required: [], routines: [], ...over,
});

const facts = (over: Partial<MatchableVenueFacts> = {}): MatchableVenueFacts => ({
  placeId: 'x', name: 'x', category: 'park', driveMinutes: 0, enrichmentStatus: 'verified',
  minRecommendedAge: 0, maxRecommendedAge: 8, venueAgePolicy: null, toilets: 'yes', babyChanging: 'yes', parking: 'yes',
  pushchairSuitability: 'good', environment: 'outdoor', energyLevel: 'moderate', visitDurationMinutes: null,
  estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'unknown', ...over,
});

const OPEN_DAILY: OpeningHoursSchedule = {
  timezone: 'Europe/London',
  periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 9, minute: 0 }, close: { day: d, hour: 17, minute: 0 } })),
};
const SHUT_SATURDAYS: OpeningHoursSchedule = {
  timezone: 'Europe/London',
  periods: [0, 1, 2, 3, 4, 5].map((d) => ({ open: { day: d, hour: 9, minute: 0 }, close: { day: d, hour: 17, minute: 0 } })),
};

const venue = (id: string, latitude: number, longitude: number, over: Partial<Venue> = {}, f: Partial<MatchableVenueFacts> = {}): Venue =>
  ({
    id, name: id, category: 'park', latitude, longitude, driveMinutes: 0, imageUrl: '',
    familyScore: { score: 70, factors: {} as never, explanation: [] },
    structuredOpeningHours: OPEN_DAILY, trustedFacts: facts({ placeId: id, name: id, ...f }), facilities: [], enrichmentStatus: 'verified',
    ...over,
  }) as Venue;

// Roughly mid-way between the two homes.
const FAIR = venue('Fair Fields', 51.57, -0.08);
// Right beside the first family: lovely for them, a long way for Hannah.
const NEAR_MINE = venue('Camden Green', 51.552, -0.141);
const NEAR_OTHER = venue('Lea Marsh', 51.588, -0.025);
const FAR = venue('Far Farm', 51.9, 0.4);

const run = (venues: Venue[], over: Partial<Parameters<typeof meetHalfway>[0]> = {}) =>
  meetHalfway({ venues, mine, other: other(), date: SATURDAY, arriveAt: '10:30', today: TODAY, nowMinutes: 9 * 60, ...over });

describe('it is not the midpoint', () => {
  it('ranks the fair place first, ahead of the one closest to either family', () => {
    const result = run([NEAR_MINE, NEAR_OTHER, FAIR]);
    expect(result.options[0].venue.id).toBe('Fair Fields');
    const near = result.options.find((o) => o.venue.id === 'Camden Green')!;
    expect(near.journeys[1].minutes).toBeGreaterThan(near.journeys[0].minutes);
    expect(near.longerFor).toBe('other');
  });

  it('measures each family’s own journey, and the longer one decides', () => {
    const [option] = run([FAIR]).options;
    const expectMine = estimateDriveMinutes(mine.latitude, mine.longitude, FAIR.latitude, FAIR.longitude);
    const expectTheirs = estimateDriveMinutes(51.59, -0.02, FAIR.latitude, FAIR.longitude);
    expect(option.journeys.map((j) => j.minutes)).toEqual([expectMine, expectTheirs]);
    expect(option.gap).toBe(Math.abs(expectMine - expectTheirs));
  });

  it('says journeys are close when they are, and who has further to go when they are not', () => {
    const fair = run([FAIR]).options[0];
    expect(fair.reasons.some((r) => /within a few minutes|shorter journey/.test(r))).toBe(true);
    const near = run([NEAR_MINE]).options[0];
    expect(near.reasons.join(' ')).toMatch(/Your family has the shorter journey/);
  });
});

describe('only places a plan could be built for', () => {
  it('drops a place beyond either family’s drive limit', () => {
    const result = run([FAIR, FAR]);
    expect(result.options.map((o) => o.venue.id)).toEqual(['Fair Fields']);
    expect(result.excluded.journey).toBe(1);
  });

  it('drops a place that is shut on the day, and keeps one with unconfirmed hours, saying so', () => {
    const shut = venue('Shut Saturdays', 51.57, -0.08, { structuredOpeningHours: SHUT_SATURDAYS });
    const unknownHours = venue('Maybe Open', 51.571, -0.081, { structuredOpeningHours: undefined });
    const result = run([shut, unknownHours]);
    expect(result.excluded.closed).toBe(1);
    expect(result.options[0].venue.id).toBe('Maybe Open');
    expect(result.options[0].hoursConfirmed).toBe(false);
    expect(result.options[0].toCheck).toContain('Opening hours not confirmed for that day');
  });

  it('applies each family’s must-haves with the planner’s own rule: unknown fails closed', () => {
    const needsChanging = other({ required: ['babyChanging'] });
    const unknown = venue('Unchecked', 51.57, -0.08, {}, { babyChanging: 'unknown' });
    const no = venue('None', 51.571, -0.081, {}, { babyChanging: 'no' });
    const yes = venue('Confirmed', 51.572, -0.082, {}, { babyChanging: 'yes' });
    const result = run([unknown, no, yes], { other: needsChanging });
    expect(result.options.map((o) => o.venue.id)).toEqual(['Confirmed']);
    expect(result.excluded.requirements).toBe(2);
  });

  it('does not offer a start that has already gone for one of them, and says when it would work', () => {
    const result = run([FAIR], { date: TODAY, arriveAt: '09:10', nowMinutes: 9 * 60 });
    expect(result.options).toEqual([]);
    expect(result.excluded.tooSoon).toBe(1);
    expect(result.earliestArrival).toMatch(/^\d\d:\d\d$/);
    const [h, m] = result.earliestArrival!.split(':').map(Number);
    expect(h * 60 + m).toBeGreaterThan(9 * 60 + 10);
  });
});

describe('a family known only by postcode is not pretended about', () => {
  const postcodeOnly = other({ ages: [], routines: [], maxDriveMinutes: 120, label: 'Hannah' });

  it('checks only the journey for them, and says so', () => {
    const result = run([FAIR], { other: postcodeOnly });
    expect(result.otherKnown).toEqual({ children: false, routines: false });
    const option = result.options[0];
    expect(option.toCheck.join(' ')).toMatch(/only know where Hannah’s family sets off from/);
    const text = [...option.reasons, ...option.toCheck].join(' ');
    expect(text).not.toMatch(/children in Hannah|naps for Hannah/);
  });

  it('does not enforce a travel limit nobody entered', () => {
    const result = run([FAR], { other: postcodeOnly, mine: { ...mine, maxDriveMinutes: 120 } });
    expect(result.excluded.journey).toBe(0);
  });
});

describe('routines and ages, where they are known', () => {
  const nap = (time: string): Routine => ({ id: 'nap', label: 'Nap', kind: 'nap', time, durationMinutes: 90, atHome: true });

  it('says it works around both families’ naps when neither falls in the outing', () => {
    // Out from about 09:30 to about 13:30: a 15:00 nap is clear for both.
    const result = run([FAIR], { mine: { ...mine, routines: [nap('15:00')] }, other: other({ routines: [nap('15:00')] }) });
    expect(result.options[0].reasons).toContain('Works around both families’ naps');
  });

  it('flags the family whose nap falls in the outing, as something the plan will help with, not a refusal', () => {
    const result = run([FAIR], { mine: { ...mine, routines: [nap('12:00')] }, other: other({ routines: [nap('15:00')] }) });
    const option = result.options[0];
    expect(option.toCheck.join(' ')).toMatch(/A nap or feed of yours falls during the outing\. The plan will suggest options/);
    expect(option.reasons.join(' ')).not.toMatch(/both families’ naps/);
  });

  it('names the children’s ages only where they are known for both', () => {
    const both = run([FAIR]).options[0];
    expect(both.reasons).toContain('Suits the ages of both families’ children');
    const narrow = venue('Big Kids', 51.57, -0.08, {}, { minRecommendedAge: 6, maxRecommendedAge: 12 });
    const check = run([narrow]).options[0];
    expect(check.toCheck.join(' ')).toMatch(/may not suit all the children in your family/);
  });
});

describe('your own Family Fit is carried honestly', () => {
  const fit = (verdict: string, headline: string) => ({ verdict, headline, reasons: [], cautions: [], toCheck: [], forNames: [], children: [] }) as never;

  it('adds a good fit as a reason, in the words your family reads', () => {
    const good = venue('Fair Fields', 51.57, -0.08, { familyMatch: fit('good', 'Good for Sloane and Ozzie today') });
    expect(run([good]).options[0].reasons).toContain('Good for Sloane and Ozzie');
  });

  it('says so when your own fit is poor, without softening it, and ranks it below an unrated place', () => {
    const poor = venue('Poor Fit', 51.57, -0.08, { familyMatch: fit('poor', 'Probably not for Ozzie today') });
    const plain = venue('Plain', 51.571, -0.081);
    const result = run([poor, plain]);
    expect(result.options.find((o) => o.venue.id === 'Poor Fit')!.toCheck).toContain('Probably not for Ozzie');
    expect(result.options[0].venue.id).toBe('Plain');
  });
});

describe('it spends nothing', () => {
  it('is a pure function over places already in hand', () => {
    // No clock, store or network is injected, so there is nothing for it to call. The same inputs give the same shortlist.
    expect(run([NEAR_MINE, NEAR_OTHER, FAIR]).options.map((o) => o.venue.id)).toEqual(run([FAIR, NEAR_OTHER, NEAR_MINE]).options.map((o) => o.venue.id));
  });

  it('offers at most five', () => {
    const many = Array.from({ length: 12 }, (_, i) => venue(`P${i}`, 51.57 + i * 0.001, -0.08));
    expect(run(many).options).toHaveLength(5);
  });
});
