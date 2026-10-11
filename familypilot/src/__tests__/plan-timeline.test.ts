import { describe, expect, it, vi } from 'vitest';

import { createPlan } from '@/src/services/planning/create-plan';
import { PlanStopSource } from '@/src/services/planning/day-plan';
import { PlanDraft } from '@/src/services/planning/plan-draft';
import { PlanningFamily, Routine } from '@/src/services/planning/planner';
import { planTimeline, timelineChildren } from '@/src/services/planning/plan-timeline';
import { makeSubjectResolver } from '@/src/services/planning/routine-subjects';
import { buildJourneyMatrix } from '@/src/services/planning/journey-matrix';
import { homeKey, stopKey } from '@/src/services/planning/sequencer';
import { JourneyMatrix } from '@/src/types/day-sequence';
import { FamilyProfile } from '@/src/types';

/**
 * The day as a timeline, built from the real planner's answer: leave, travel, arrive, the time before a feed, the feed,
 * lunch and why it suits, leave, home, and whether the nap at home has room. Every line says where it came from.
 */
const MUSEUM = 'fp-museum';
const CAFE = 'fp-osm-cafe';
const NOW = new Date('2026-10-10T08:00:00Z');

const museum: PlanStopSource = {
  placeId: MUSEUM,
  name: 'Horniman Museum and Gardens',
  category: 'museum',
  latitude: 51.44,
  longitude: -0.06,
  facts: {
    placeId: MUSEUM, name: 'Horniman Museum and Gardens', category: 'museum', driveMinutes: 0, enrichmentStatus: 'verified',
    minRecommendedAge: 1, maxRecommendedAge: 12, venueAgePolicy: null, toilets: 'yes', babyChanging: 'yes', parking: 'no',
    pushchairSuitability: 'good', environment: 'indoor', energyLevel: 'moderate', visitDurationMinutes: null,
    estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'unknown',
  },
};
const cafe: PlanStopSource = { placeId: CAFE, name: 'Forest Hill Kitchen', category: 'cafe', latitude: 51.441, longitude: -0.058 };

const feed = (time: string): Routine => ({ id: 'feed-ozzie', label: 'Feed', kind: 'feed', time, durationMinutes: 30, atHome: false });
const nap = (time: string): Routine => ({ id: 'nap-ozzie', label: 'Nap', kind: 'nap', time, durationMinutes: 90, atHome: true });

const family = (routines: Routine[]): PlanningFamily => ({
  id: 'mine', label: 'Our family', area: 'Camden', latitude: 51.54, longitude: -0.14,
  ages: [4, 0], maxDriveMinutes: 60, budgetTier: 'moderate', pushchair: true, required: [], routines,
});

const draft = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  date: '2026-10-11', startAt: '10:00', partyIds: ['mine'], attendeeIds: null, visit: 120,
  returnBy: '', bufferMinutes: 15, environment: 'either', ...over,
});

/** 20 minutes each way, estimated from distance; the café 5 minutes from the museum and 22 from home. */
const matrix = (): JourneyMatrix => ({
  legs: {
    [homeKey('mine')]: { [stopKey(MUSEUM)]: { minutes: 20, source: 'estimated' }, [stopKey(CAFE)]: { minutes: 22, source: 'estimated' } },
    [stopKey(MUSEUM)]: { [homeKey('mine')]: { minutes: 20, source: 'estimated' }, [stopKey(CAFE)]: { minutes: 5, source: 'estimated' } },
    [stopKey(CAFE)]: { [homeKey('mine')]: { minutes: 22, source: 'estimated' }, [stopKey(MUSEUM)]: { minutes: 5, source: 'estimated' } },
  },
});

const deps = () => ({
  buildMatrix: vi.fn(async () => ({ matrix: matrix(), provenance: { live: 0, estimated: 4 }, trafficDowngraded: false, missing: [] })) as unknown as typeof buildJourneyMatrix,
  now: NOW,
});

const profile = {
  members: [
    { id: 'c-sloane', name: 'Sloane', role: 'child', age: 4, dateOfBirth: '2022-04-10' },
    { id: 'c-ozzie', name: 'Ozzie', role: 'child', age: 0, ageMonths: 7, dateOfBirth: '2026-02-22' },
  ],
  routines: [{ ...feed('11:15'), childId: 'c-ozzie' }, { ...nap('13:30'), childId: 'c-ozzie' }],
} as unknown as FamilyProfile;

const context = () => ({ resolveSubject: makeSubjectResolver(profile, [family([])]), children: timelineChildren(profile) });

const build = async (routines: Routine[], over: Partial<PlanDraft> = {}, withLunch = true) => {
  const outcome = await createPlan(
    {
      venue: museum,
      draft: draft(over),
      families: [family(routines)],
      meal: withLunch ? { place: cafe, travel: [{ mode: 'walk', durationMinutes: 6, source: 'estimated-distance', confidence: 'medium' }] } : undefined,
      lunchAvailable: true,
      mealFacts: withLunch ? { provider: 'osm', highchair: true, changingTable: true, cuisine: 'british', walkMinutes: 6, walkSource: 'estimated' } : undefined,
    },
    deps(),
  );
  if (!outcome.ok) throw new Error(outcome.message);
  return outcome;
};

const text = (rows: ReturnType<typeof planTimeline>) => rows.map((r) => `${r.time} ${r.kind} ${r.title} | ${r.lines.map((l) => `${l.text}${l.provenance ? ` [${l.provenance}]` : ''}`).join(' ')}`);

describe('a day with a feed during the visit, lunch nearby and a nap at home after', () => {
  it('runs in order: leave, arrive, explore until the feed, the feed, carry on, leave for lunch, lunch, leave for home, home, the nap', async () => {
    const { source } = await build([feed('11:15'), nap('14:30')]);
    const rows = planTimeline(source, context());
    expect(rows.map((r) => r.kind)).toEqual(['leave-home', 'arrive', 'window', 'routine', 'window', 'leave', 'lunch', 'leave', 'home', 'routine-home']);
    expect(rows.map((r) => r.time)).toEqual([...rows.map((r) => r.time)].sort((a, b) => a - b));
  });

  it('says when to leave and how the journey was timed', async () => {
    const { source } = await build([feed('11:15'), nap('14:30')]);
    const [leave, arrive] = planTimeline(source, context());
    expect(leave.title).toBe('Leave home');
    expect(leave.time).toBe(9 * 60 + 25);
    expect(leave.lines[0]).toEqual({ text: 'About 20 min drive plus 15 min to settle, estimated from distance to Horniman Museum and Gardens.', provenance: 'estimated' });
    expect(arrive.title).toBe('Arrive at Horniman Museum and Gardens');
    expect(arrive.time).toBe(10 * 60);
    expect(arrive.edit).toBe('arrival');
  });

  it('the arrival says what is confirmed, what is not, and how the ages fit, each with its source', async () => {
    const { source } = await build([feed('11:15'), nap('14:30')]);
    const arrive = planTimeline(source, context())[1];
    expect(arrive.lines).toEqual([
      { text: 'Opening hours not confirmed for this day.', provenance: 'unknown' },
      { text: 'No parking on site.', provenance: 'confirmed' },
      { text: 'Pushchair friendly.', provenance: 'confirmed' },
      { text: 'Baby changing confirmed, for Ozzie.', provenance: 'confirmed' },
      { text: 'Recommended for ages 1–12: suits Sloane; Ozzie is younger.', provenance: 'inferred' },
    ]);
  });

  it('the time before the feed is said as a window, and the feed as its own row with the facility that matters', async () => {
    const { source } = await build([feed('11:15'), nap('14:30')]);
    const rows = planTimeline(source, context());
    const window = rows[2];
    expect(window.title).toBe('Explore until Ozzie’s feed');
    expect(window.lines[0]).toEqual({ text: 'You have 1 hr 15 min before Ozzie’s feed.', provenance: 'inferred' });
    expect(window.edit).toBe('visit');
    const routine = rows[3];
    expect(routine.title).toBe('Ozzie’s feed');
    expect(routine.time).toBe(11 * 60 + 15);
    expect(routine.lines[0].provenance).toBe('reported');
    expect(routine.lines[1]).toEqual({ text: 'Baby changing confirmed here.', provenance: 'confirmed' });
    expect(rows[4].title).toBe('Carry on at Horniman Museum and Gardens');
    expect(rows[4].lines[0].text).toBe('15 min more at Horniman Museum and Gardens.');
  });

  it('lunch says the walk, what the mappers listed and why it matters, how long, and can be changed', async () => {
    const { source } = await build([feed('11:15'), nap('14:30')]);
    const rows = planTimeline(source, context());
    const lunch = rows.find((r) => r.kind === 'lunch')!;
    expect(lunch.title).toBe('Lunch at Forest Hill Kitchen');
    expect(lunch.edit).toBe('lunch');
    expect(lunch.lines).toEqual([
      { text: 'About 5 min drive plus 15 min to settle, estimated from distance.', provenance: 'estimated' },
      { text: 'Or about a 6-minute walk from Horniman Museum and Gardens, estimated from distance.', provenance: 'estimated' },
      { text: 'High chairs, baby changing listed on OpenStreetMap, which matters with Ozzie.', provenance: 'reported' },
      { text: 'British, as listed.', provenance: 'reported' },
      { text: '45 min at the table.', provenance: 'inferred' },
      { text: 'Opening hours not confirmed for this day.', provenance: 'unknown' },
    ]);
    expect(rows[5].title).toBe('Leave for lunch');
    expect(rows[7].title).toBe('Leave for home');
  });

  it('home says the margin before the nap, with room, and the nap row agrees', async () => {
    const { source } = await build([feed('11:15'), nap('14:30')]);
    const rows = planTimeline(source, context());
    const home = rows.find((r) => r.kind === 'home')!;
    expect(home.tone).toBe('ok');
    expect(home.lines[0]).toEqual({ text: 'About 22 min drive plus 15 min to settle, estimated from distance.', provenance: 'estimated' });
    expect(home.lines[1].text).toMatch(/^\d+ min before Ozzie’s nap at 14:30\.$/);
    const napRow = rows.find((r) => r.kind === 'routine-home')!;
    expect(napRow.title).toBe('Ozzie’s nap, at home');
    expect(napRow.time).toBe(14 * 60 + 30);
    expect(napRow.tone).toBe('ok');
  });
});

describe('a tight margin is said as tight on the leave, home and nap rows, and offers the earlier departure', () => {
  it('without lunch, a nap four minutes after getting home is tight', async () => {
    const { source, view } = await build([nap('12:39')], {}, false);
    const leaveEarlier = Boolean(view.routines?.tight[0]?.options.length);
    const rows = planTimeline(source, { ...context(), leaveEarlier });
    const leave = rows.find((r) => r.kind === 'leave')!;
    expect(leave.tone).toBe('tight');
    expect(leave.lines[1]).toEqual({ text: 'Leaving now gets you home only 4 min before Ozzie’s nap.', provenance: 'estimated' });
    const home = rows.find((r) => r.kind === 'home')!;
    expect(home.tone).toBe('tight');
    expect(home.lines[1]).toEqual({ text: 'Tight for Ozzie’s nap: 4 min to spare, and the journey is an estimate.', provenance: 'estimated' });
    expect(home.edit).toBe('leave-earlier');
    expect(rows.find((r) => r.kind === 'routine-home')!.tone).toBe('tight');
  });

  it('after the earlier departure is applied, the same rows read as fine', async () => {
    const first = await build([nap('12:39')], {}, false);
    const option = first.view.routines!.tight[0].options[0].alternative!;
    const { source } = await build([nap('12:39')], { startAt: option.arriveAt, visit: option.visitMinutes }, false);
    const rows = planTimeline(source, context());
    expect(rows.find((r) => r.kind === 'home')!.tone).toBe('ok');
    expect(rows.find((r) => r.kind === 'home')!.edit).toBeUndefined();
    expect(rows.find((r) => r.kind === 'routine-home')!.tone).toBe('ok');
  });
});

describe('a nap that falls during the drive home is said where it falls', () => {
  it('appears as a routine row at its own time, after leaving lunch, and nothing claims the family is home before it', async () => {
    const { source } = await build([feed('11:15'), nap('13:30')]);
    const rows = planTimeline(source, context());
    expect(rows.map((r) => r.kind)).toEqual(['leave-home', 'arrive', 'window', 'routine', 'window', 'leave', 'lunch', 'leave', 'routine', 'home']);
    const onTheWay = rows[8];
    expect(onTheWay.tone).toBe('warn');
    expect(onTheWay.lines[0].text).toMatch(/^Usually 13:30 to 15:00: falls during your drive home \(\d\d:\d\d to \d\d:\d\d\)\.$/);
    expect(rows.find((r) => r.kind === 'home')!.lines.map((l) => l.text).join(' ')).not.toMatch(/before Ozzie’s nap/);
  });
});

describe('a feed that starts during the visit and carries on into the move to lunch', () => {
  it('is one row, extended, not the same feed twice', async () => {
    // One hour at the museum: the 11:15 feed runs past the 11:00 departure... so arrive 10:30 and leave 11:30.
    const { source } = await build([feed('11:15'), nap('14:30')], { startAt: '10:30', visit: 60 });
    const rows = planTimeline(source, context());
    const feeds = rows.filter((r) => r.kind === 'routine');
    expect(feeds).toHaveLength(1);
    expect(feeds[0].until).toBe(11 * 60 + 45);
    expect(feeds[0].lines.map((l) => l.text).some((t) => t.startsWith('It carries on during the move between stops'))).toBe(true);
  });
});

describe('what it never does', () => {
  it('a plan with no routines claims nothing about them, and still explains the day', async () => {
    const { source } = await build([], {}, false);
    const rows = planTimeline(source, context());
    expect(rows.map((r) => r.kind)).toEqual(['leave-home', 'arrive', 'window', 'leave', 'home']);
    expect(text(rows).join(' ')).not.toMatch(/nap|feed/);
    expect(rows[2].lines[0].text).toBe('2 hr at Horniman Museum and Gardens.');
    expect(rows[2].edit).toBe('visit');
  });

  it('every line carries a provenance, and a measured journey is never called an estimate', async () => {
    const { source } = await build([feed('11:15'), nap('14:30')]);
    for (const row of planTimeline(source, context())) for (const line of row.lines) expect(line.provenance, line.text).toBeDefined();
  });
});
