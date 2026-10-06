import { describe, expect, it } from 'vitest';

import { fairnessLine, meetHalfway, topCardLabel } from '@/src/services/planning/meet-halfway';
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

  it('speaks of fairness, never of which family travels less', () => {
    const fair = run([FAIR]).options[0];
    expect(fair.fairness).toMatch(/^(Almost equal journeys|Journeys are within \d+ minutes of each other)$/);
    const near = run([NEAR_MINE]).options[0];
    expect(near.fairness).toMatch(/^Journeys differ by \d+ minutes$/);
    for (const option of [fair, near]) {
      const text = [...option.reasons, ...option.toCheck].join(' ');
      expect(text).not.toMatch(/shorter journey|has further to go|longer journey/i);
    }
  });

  it('puts fairness first and says it in numbers a parent can check', () => {
    const [option] = run([FAIR]).options;
    expect(option.reasons[0]).toBe(option.fairness);
    expect(fairnessLine(0)).toBe('Almost equal journeys');
    expect(fairnessLine(3)).toBe('Almost equal journeys');
    expect(fairnessLine(7)).toBe('Journeys are within 7 minutes of each other');
    expect(fairnessLine(10)).toBe('Journeys are within 10 minutes of each other');
    expect(fairnessLine(11)).toBe('Journeys differ by 11 minutes');
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

  it('applies each family’s must-haves: a confirmed miss rules a place out, an unconfirmed one is a warning', () => {
    const needsChanging = other({ required: ['babyChanging'] });
    const unknown = venue('Unchecked', 51.57, -0.08, {}, { babyChanging: 'unknown' });
    const no = venue('None', 51.571, -0.081, {}, { babyChanging: 'no' });
    const yes = venue('Confirmed', 51.572, -0.082, {}, { babyChanging: 'yes' });
    const result = run([unknown, no, yes], { other: needsChanging });
    // Only the CONFIRMED miss is excluded. The unconfirmed place is offered, below the confirmed one, saying what to check.
    expect(result.options.map((o) => o.venue.id)).toEqual(['Confirmed', 'Unchecked']);
    expect(result.excluded.requirements).toBe(1);
    const unchecked = result.options.find((o) => o.venue.id === 'Unchecked')!;
    expect(unchecked.unresolved).toEqual([{ role: 'other', field: 'familyFacilities.babyChanging', label: 'baby changing' }]);
    expect(unchecked.toCheck[0]).toBe('Baby changing isn’t confirmed at Unchecked, and Hannah’s family needs it. Check before you go');
    expect(result.options.find((o) => o.venue.id === 'Confirmed')!.unresolved).toEqual([]);
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
    expect(result.otherKnown).toEqual({ children: false, routines: false, routinesLegacy: false });
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

describe('the top card only says "Best for both" when that is supported', () => {
  const goodFit = { verdict: 'good', headline: 'Good for Sloane and Ozzie today', reasons: [], cautions: [], toCheck: [], forNames: [], children: [] } as never;
  const supported = () => venue('Fair Fields', 51.57, -0.08, { familyMatch: goodFit });

  it('is "Best for both" for a confirmed, even, well-known option', () => {
    const [option] = run([supported()]).options;
    expect(option.checks).toBe(0);
    expect(option.supported).toBe(true);
    expect(topCardLabel(option)).toBe('Best for both');
  });

  it('is a promising option, with the count, when a must-have is unknown for either family', () => {
    const needsChanging = other({ required: ['babyChanging'] });
    const unknown = venue('Fair Fields', 51.57, -0.08, { familyMatch: goodFit }, { babyChanging: 'unknown' });
    const [option] = run([unknown], { other: needsChanging }).options;
    expect(option.unresolved).toHaveLength(1);
    expect(option.supported).toBe(false);
    expect(topCardLabel(option)).toBe('Promising option · 1 thing to check');
    expect(topCardLabel(option)).not.toMatch(/Best for both/);

    const mineNeeds = { ...mine, required: ['babyChanging' as const] };
    const [forMine] = run([unknown], { mine: mineNeeds }).options;
    expect(topCardLabel(forMine)).toMatch(/^Promising option/);
  });

  it('counts each thing: two things to check reads as two', () => {
    const both = venue('Fair Fields', 51.57, -0.08, { familyMatch: goodFit, structuredOpeningHours: undefined }, { babyChanging: 'unknown' });
    const [option] = run([both], { other: other({ required: ['babyChanging'] }) }).options;
    expect(option.checks).toBe(2);
    expect(topCardLabel(option)).toBe('Promising option · 2 things to check');
  });

  it('is "Best compromise" when nothing is open but the journeys are uneven', () => {
    const [option] = run([venue('Camden Green', 51.552, -0.141, { familyMatch: goodFit })]).options;
    expect(option.gap).toBeGreaterThan(10);
    expect(option.checks).toBe(0);
    expect(topCardLabel(option)).toBe('Best compromise');
  });

  it('is "Best compromise", not "Best for both", when only a postcode is known for the other family', () => {
    const postcode = other({ ages: [], routines: [], required: [], label: 'Hannah' });
    const [option] = run([supported()], { other: postcode }).options;
    expect(option.checks).toBe(0);
    expect(option.supported).toBe(false);
    expect(topCardLabel(option)).toBe('Best compromise');
  });

  it('a Family Fit that is only possible, or a place not reviewed for families, is something to check, not a fit', () => {
    const possible = venue('Fair Fields', 51.57, -0.08, { familyMatch: { ...(goodFit as object), verdict: 'possible', headline: 'Could work for Sloane, but check buggy access for Ozzie today' } as never });
    const [option] = run([possible]).options;
    expect(option.toCheck).toContain('Could work for Sloane, but check buggy access for Ozzie');
    expect(topCardLabel(option)).toMatch(/^Promising option/);
    const unreviewed = venue('Fair Fields', 51.57, -0.08, { familyMatch: { ...(goodFit as object), verdict: 'not_reviewed', headline: 'Family suitability not yet reviewed' } as never });
    expect(run([unreviewed]).options[0].toCheck).toContain('We haven’t reviewed this place for families yet');
  });
});

describe('each card reads in one order', () => {
  it('journey fairness, then fit for both, then routines, then confirmed facilities, then what to check', () => {
    const nap = { id: 'n', label: 'Nap', kind: 'nap' as const, time: '15:30', durationMinutes: 60, atHome: true };
    const fit = { verdict: 'good', headline: 'Good for Sloane and Ozzie today', reasons: [], cautions: [], toCheck: [], forNames: [], children: [] } as never;
    const place = venue('Fair Fields', 51.57, -0.08, { familyMatch: fit, facilities: ['cafe'] });
    const [option] = run([place], { mine: { ...mine, routines: [nap] }, other: other({ routines: [{ ...nap, id: 'o' }] }) }).options;
    const at = (pattern: RegExp) => option.reasons.findIndex((line) => pattern.test(line));
    const order = [at(/journeys/i), at(/Good for Sloane and Ozzie/), at(/Suits the ages/), at(/Works around/), at(/Baby changing confirmed|Café|parking/i), at(/Open when/)];
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // What needs checking is not mixed into the confirmed lines.
    expect(option.reasons.join(' ')).not.toMatch(/isn’t confirmed|not reviewed|less certain/);
  });
});

describe('one underlying issue is one thing to check', () => {
  it('your own Family Fit sentence and the ages line are not both listed for the same problem', () => {
    const possible = { verdict: 'possible', headline: 'Could work for Sloane, but check age range for Ozzie today', reasons: [], cautions: [], toCheck: [], forNames: [], children: [] } as never;
    // The venue's ages are 6 to 12, so the children in `mine` (3 and a baby) are outside it.
    const place = venue('Big Kids', 51.57, -0.08, { familyMatch: possible }, { minRecommendedAge: 6, maxRecommendedAge: 12 });
    const [option] = run([place]).options;
    const aboutAges = option.toCheck.filter((line) => /age/i.test(line) && /your family|Ozzie|Sloane/.test(line));
    expect(aboutAges).toEqual(['Could work for Sloane, but check age range for Ozzie']);
  });

  it('for the other family, one line says it, not a fit sentence and an ages line for the same problem', () => {
    const place = venue('Big Kids', 51.57, -0.08, {}, { minRecommendedAge: 6, maxRecommendedAge: 12 });
    const [option] = run([place]).options;
    expect(option.toCheck.filter((line) => /Hannah/.test(line))).toHaveLength(1);
  });
});
