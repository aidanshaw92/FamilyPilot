import { describe, expect, it } from 'vitest';

import {
  PlanDraftSources,
  planDraftBlocker,
  planDraftFromParams,
  nextDay,
  planDraftDefaults,
  summariseHousehold,
  PlanDraft,
  planDraftToParams,
  toggleAttendee,
  isComing,
  profileForDraft,
} from '@/src/services/planning/plan-draft';
import { VISIT_CHOICES } from '@/src/services/planning/visit-duration';
import { resolvePlanParties } from '@/src/services/planning/plan-parties';
import { FamilyProfile } from '@/src/types';
import { PlanningFamily } from '@/src/services/planning/planner';

/**
 * The seam between the Create a Plan sheet and whatever knows about the family.
 *
 * The approved sheet only works if its four rows are already right, so these tests are about the
 * defaults rather than the controls. When accounts land, `planDraftDefaults` changes and the sheet
 * does not -- which is only true if the sheet never reaches past this interface, and only testable
 * because nothing here touches a store or the clock.
 */

const TODAY = '2026-10-10';

const profile = (over: Partial<FamilyProfile> = {}): FamilyProfile => ({
  id: 'family-1',
  parentName: 'Aidan',
  members: [
    { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'p2', name: 'Sam', role: 'parent', dateOfBirth: '1991-07-02', age: 35 },
    { id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2021-06-10', age: 4 },
    { id: 'c2', name: 'Leo', role: 'child', dateOfBirth: '2024-11-22', age: 1 },
  ],
  homeLocation: 'Bushey, Hertfordshire',
  budgetTier: 'moderate',
  maxDriveMinutes: 30,
  completionPercent: 75,
  ...over,
} as FamilyProfile);

const planningFamily = (over: Partial<PlanningFamily> = {}): PlanningFamily => ({
  id: 'theirs',
  label: 'The Hills',
  area: 'Camden',
  latitude: 51.54,
  longitude: -0.14,
  ages: [3],
  maxDriveMinutes: 30,
  budgetTier: 'moderate',
  pushchair: true,
  required: [],
  routines: [],
  ...over,
});

/** A complete draft, so each test names only what it is about. */
const draftOf = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  date: TODAY,
  startAt: '09:30',
  partyIds: ['mine'],
  attendeeIds: null,
  visit: 90,
  returnBy: '',
  bufferMinutes: 15,
  environment: 'either',
  ...over,
});

const sources = (over: Partial<PlanDraftSources> = {}): PlanDraftSources => ({ today: TODAY, ...over });

describe('who’s coming, as the sheet shows it', () => {
  it('names the actual household, everybody coming until somebody is taken out', () => {
    const { parties, draft } = planDraftDefaults(sources({ profile: profile({ familyName: 'Shaw' }) }));
    expect(parties[0]).toMatchObject({ id: 'mine', label: 'Shaw family', summary: 'Aidan, Sam, Mia and Leo', ready: true });
    expect(parties[0].people?.map((p) => p.name)).toEqual(['Aidan', 'Sam', 'Mia', 'Leo']);
    expect(draft.attendeeIds).toBeNull();
  });

  it('calls the household "Your family" when no family name was given, rather than guessing one', () => {
    const { parties } = planDraftDefaults(sources({ profile: profile() }));
    expect(parties[0].label).toBe('Your family');
  });

  it('gives children an age and adults a relationship, and nothing more', () => {
    const { parties } = planDraftDefaults(sources({ profile: profile() }));
    const mia = parties[0].people!.find((p) => p.name === 'Mia')!;
    expect(mia.kind).toBe('child');
    expect(mia.detail).toMatch(/year/);
    expect(JSON.stringify(parties)).not.toContain('2021');
  });

  it('toggles a person out and back, returning to "everyone" when all are in again', () => {
    const { parties, draft } = planDraftDefaults(sources({ profile: profile() }));
    const people = parties[0].people!;
    const without = toggleAttendee(draft, people, 'c2');
    expect(without.attendeeIds).toEqual(['p1', 'p2', 'c1']);
    expect(isComing(without, 'c2')).toBe(false);
    expect(isComing(without, 'c1')).toBe(true);
    const back = toggleAttendee(without, people, 'c2');
    expect(back.attendeeIds).toBeNull();
  });

  it('plans only for the people coming: a child left at home contributes no age and no routine', () => {
    const withRoutines = profile({
      routines: [
        { id: 'nap-c2', label: 'Nap', kind: 'nap', time: '13:00', durationMinutes: 60, atHome: true, childId: 'c2' },
        { id: 'nap-c1', label: 'Nap', kind: 'nap', time: '12:30', durationMinutes: 60, atHome: true, childId: 'c1' },
      ],
      homeLatitude: 51.64,
      homeLongitude: -0.36,
    } as Partial<FamilyProfile>);
    const { families } = resolvePlanParties(['mine'], { profile: withRoutines, attendeeIds: ['p1', 'c1'] });
    expect(families[0].ages).toEqual([4]);
    expect(families[0].routines.map((r) => r.id)).toEqual(['nap-c1']);
    // The narrowed household is what Family Fit and the planner both read.
    expect(profileForDraft(withRoutines, draftOf({ attendeeIds: ['p1'] })).members.map((m) => m.id)).toEqual(['p1']);
  });

  it('blocks a plan for nobody', () => {
    const { parties } = planDraftDefaults(sources({ profile: profile() }));
    expect(planDraftBlocker(draftOf({ attendeeIds: [] }), parties)).toBe('Choose who is coming.');
  });

it('pluralises one child correctly', () => {
    expect(summariseHousehold({ adults: 1, children: 1 })).toBe('1 adult, 1 child');
    expect(summariseHousehold({ adults: 2, children: 3 })).toBe('2 adults, 3 children');
    expect(summariseHousehold({ adults: 0, children: 0 })).toBe('Nobody added yet');
  });

  it('does not invent adults for a planning family that only records children', () => {
    // A PlanningFamily holds children's ages and no adult count. Rendering "2 adults" there would be
    // a fabrication, so it reports what the record actually holds.
    const { parties } = planDraftDefaults(sources({ planningFamilies: [planningFamily()] }));
    expect(parties[0].summary).toBe('1 child');
    expect(parties[0].summary).not.toContain('adult');
  });

  it('says what is on record for a family added by postcode, not that it is "adults only"', () => {
    // Nobody entered "no children": a postcode is all there is, so that is what is said.
    const { parties } = planDraftDefaults(sources({ planningFamilies: [planningFamily({ ages: [] })] }));
    expect(parties[0].summary).toBe('Starting point only');
    expect(parties[0].summary).not.toMatch(/adult/i);
  });

  it('selects only the first party, so a plan is never silently for everyone', () => {
    const { draft, parties } = planDraftDefaults(sources({
      profile: profile(),
      planningFamilies: [planningFamily()],
    }));
    expect(parties).toHaveLength(2);
    expect(draft.partyIds).toEqual(['mine']);
  });

  it('does not list the profile household twice when planning also knows it', () => {
    const { parties } = planDraftDefaults(sources({
      profile: profile(),
      planningFamilies: [planningFamily({ id: 'mine', label: 'Mine' })],
    }));
    expect(parties.filter((p) => p.id === 'mine')).toHaveLength(1);
  });
});

describe('a family we know nothing about', () => {
  it('still offers a row, flagged as needing details rather than hidden', () => {
    const result = planDraftDefaults(sources());
    expect(result.needsProfile).toBe(true);
    expect(result.parties).toEqual([{ id: 'mine', label: 'Our family', summary: 'Nobody added yet', ready: false }]);
  });

  it('blocks generating and says what is missing', () => {
    const { draft, parties } = planDraftDefaults(sources());
    expect(planDraftBlocker(draft, parties)).toBe('Add your family details so we can plan around them.');
  });

  it('does not block once the household is described', () => {
    const { draft, parties } = planDraftDefaults(sources({ profile: profile() }));
    expect(planDraftBlocker(draft, parties)).toBeNull();
  });

  it('names the plural case when one of several families is incomplete', () => {
    const { parties } = planDraftDefaults(sources({
      profile: profile(),
      planningFamilies: [planningFamily({ latitude: Number.NaN })],
    }));
    expect(planDraftBlocker(draftOf({ partyIds: ['mine', 'theirs'] }), parties))
      .toBe('One of the families still needs its details before we can plan.');
  });

  it('blocks an empty party', () => {
    expect(planDraftBlocker(draftOf({ partyIds: [] }), []))
      .toBe('Choose who is coming.');
  });
});

describe('when, start and how long', () => {
  it('defaults to today, a mid-morning arrival, everyone, and "Not sure" how long', () => {
    const { draft } = planDraftDefaults(sources({ profile: profile(), options: { date: TODAY, leaveAt: '' } }));
    expect(draft).toMatchObject({ date: TODAY, startAt: '10:00', visit: 'not-sure', attendeeIds: null, returnBy: '', bufferMinutes: 15 });
  });

  it('remembers the day and start the parent chose last time, but asks how long afresh', () => {
    const { draft } = planDraftDefaults(sources({
      profile: profile(),
      options: { date: '2026-10-17', leaveAt: '08:15' },
    }));
    expect(draft).toMatchObject({ date: '2026-10-17', startAt: '08:15', visit: 'not-sure' });
  });

  it('never opens on a date that has already passed', () => {
    const { draft } = planDraftDefaults(sources({
      profile: profile(),
      options: { date: '2026-09-01', leaveAt: '09:00' },
    }));
    expect(draft.date).toBe(TODAY);
  });

  it('offers "Not sure" and "All day" alongside the lengths, and a default FamilyPilot can reason about', () => {
    expect(VISIT_CHOICES.map((c) => c.value)).toEqual(['not-sure', 60, 120, 180, 240, 'all-day']);
    expect(planDraftDefaults(sources({ profile: profile() })).draft.visit).toBe('not-sure');
  });
});

describe('the sheet’s button cannot promise a day the planner could not build', () => {
  /**
   * `ready` and the resolver have to agree. If the sheet enables Create for a household the planner
   * cannot measure, the parent taps it and lands on a failure that is really a missing profile
   * field -- so readiness asks the same question the resolver does.
   */
  it('is not ready when the household has never said where they live', () => {
    const { parties } = planDraftDefaults(
      sources({ profile: profile({ homeLocation: '', homeLatitude: null, homeLongitude: null }) }),
    );
    expect(parties[0]).toMatchObject({ id: 'mine', summary: 'Aidan, Sam, Mia and Leo', ready: false });
    expect(planDraftBlocker(draftOf(), parties))
      .toBe('Add your family details so we can plan around them.');
  });

  it('is not ready for a described household whose drive limit is unusable', () => {
    const { parties } = planDraftDefaults(
      sources({ planningFamilies: [planningFamily({ maxDriveMinutes: 0 })] }),
    );
    expect(parties[0].ready).toBe(false);
  });
});

describe('a draft read back out of a link', () => {
  /**
   * The Plan screen is linkable and survives a reload, so its answers come back as URL text. A
   * repeated query parameter arrives as an array, which threw on `.split` before this existed.
   */
  it('takes the first value when a parameter is repeated', () => {
    expect(
      planDraftFromParams({
        date: ['2026-10-10', '2026-12-25'],
        start: ['09:30'],
        visit: ['90', '240'],
        parties: ['mine,theirs', 'someone-else'],
      }),
    ).toEqual(draftOf({ partyIds: ['mine', 'theirs'] }));
  });

  it('reads a plain link exactly as it was written, and round-trips through its own parameters', () => {
    const draft = draftOf({ date: '2026-10-10', visit: 'all-day', attendeeIds: ['p1', 'c1'], returnBy: '16:00', bufferMinutes: 30, environment: 'indoor', partyIds: ['mine', 'theirs'] });
    expect(planDraftFromParams(planDraftToParams(draft))).toEqual(draft);
    expect(planDraftFromParams({ date: '2026-10-10', start: '09:30', visit: 'not-sure', parties: 'mine' }))
      .toEqual(draftOf({ date: '2026-10-10', visit: 'not-sure' }));
  });

  it('still understands a link written before the start meant "arrive"', () => {
    expect(planDraftFromParams({ date: '2026-10-10', leaveAt: '09:30', visit: '120', parties: 'mine' }))
      .toEqual(draftOf({ date: '2026-10-10', visit: 120 }));
  });

  it('leaves a malformed date unusable, and an unreadable length "not sure", rather than substituting a day nobody chose', () => {
    // The planner rejects a bad date and names it. A length nobody could read is honestly "not sure", not a number.
    const draft = planDraftFromParams({ date: 'not-a-date', visit: 'soon' });
    expect(draft.date).toBe('not-a-date');
    expect(draft.visit).toBe('not-sure');
    expect(planDraftFromParams({}).date).toBe('');
    expect(planDraftFromParams({}).startAt).toBe('');
  });

  it('falls back to the signed-in household only for who is coming', () => {
    expect(planDraftFromParams({}).partyIds).toEqual(['mine']);
    expect(planDraftFromParams({ parties: '' }).partyIds).toEqual(['mine']);
    expect(planDraftFromParams({ parties: ' mine , theirs , ' }).partyIds).toEqual(['mine', 'theirs']);
    expect(planDraftFromParams({}).attendeeIds).toBeNull();
    expect(planDraftFromParams({ who: 'p1,c1' }).attendeeIds).toEqual(['p1', 'c1']);
  });
});

/**
 * The Plans tab used to decide who could be planned for from the planning store alone, so a parent
 * who had finished onboarding was told to "Set up your family & routines" and sent into a second
 * editor. Both forms now ask these two functions, so this is the contract the tab's gate rests on.
 */
describe('a finished profile is enough to plan from, without a planning family', () => {
  const finished = profile({ homeLatitude: 51.643, homeLongitude: -0.36, routines: [
    { id: 'r1', label: 'Afternoon nap', kind: 'nap', time: '13:00', durationMinutes: 60, atHome: true },
  ] } as Partial<FamilyProfile>);

  it('offers the household ready, with no setup gate', () => {
    const result = planDraftDefaults(sources({ profile: finished, planningFamilies: [] }));
    expect(result.needsProfile).toBe(false);
    expect(result.parties).toEqual([expect.objectContaining({ id: 'mine', label: 'Your family', ready: true })]);
    expect(planDraftBlocker(result.draft, result.parties)).toBeNull();
  });

  it('resolves to a planning family that carries the profile routines', () => {
    const { families, unresolved } = resolvePlanParties(['mine'], { profile: finished, planningFamilies: [] });
    expect(unresolved).toEqual([]);
    expect(families).toHaveLength(1);
    expect(families[0]).toMatchObject({ id: 'mine', ages: [4, 1], maxDriveMinutes: 30 });
    expect(families[0].routines.map((r) => r.label)).toEqual(['Afternoon nap']);
  });

  it('still asks for a profile when nothing describes the family anywhere', () => {
    const result = planDraftDefaults(sources({ profile: profile({ members: [] }), planningFamilies: [] }));
    expect(result.needsProfile).toBe(true);
    expect(planDraftBlocker(result.draft, result.parties)).toBe('Add your family details so we can plan around them.');
  });
});

describe('the date the sheet opens on', () => {
  it('stays on today while today\'s start is still ahead', () => {
    expect(planDraftDefaults(sources({ nowTime: '08:00', options: { date: TODAY, leaveAt: '09:30' } })).draft).toMatchObject({ date: TODAY, startAt: '09:30' });
  });

  it('opens on tomorrow once today\'s start has gone, rather than planning a day that began in the past', () => {
    // The planner would start from "now" and report the venue closed: true, and no use as a default.
    expect(planDraftDefaults(sources({ nowTime: '20:00', options: { date: TODAY, leaveAt: '09:30' } })).draft).toMatchObject({ date: '2026-10-11', startAt: '09:30' });
  });

  it('moves a remembered start that is too close to now, because nobody could reach it', () => {
    // 20:00 remembered, and it is 20:00: there is no time to get there. (The "Leave from now" link this used to protect is gone.)
    const options = { date: TODAY, leaveAt: '20:00' };
    expect(planDraftDefaults(sources({ options, nowTime: '20:00' })).draft.date).toBe('2026-10-11');
    expect(planDraftDefaults(sources({ options: { date: TODAY, leaveAt: '11:00' }, nowTime: '10:00' })).draft.date).toBe(TODAY);
  });

  it('moves a stored date that is today but whose start has gone', () => {
    const options = { date: TODAY, leaveAt: '09:00' };
    expect(planDraftDefaults(sources({ options, nowTime: '12:00' })).draft.date).toBe('2026-10-11');
  });

  it('leaves a stored future date alone', () => {
    const options = { date: '2026-10-20', leaveAt: '09:00' };
    expect(planDraftDefaults(sources({ options, nowTime: '23:00' })).draft.date).toBe('2026-10-20');
  });

  it('with no clock given, today stays today', () => {
    expect(planDraftDefaults(sources()).draft.date).toBe(TODAY);
  });

  it('reads a one-digit hour as a time, not as text', () => {
    // '9:30' < '10:05' is false as strings; it is true as times.
    const options = { date: TODAY, leaveAt: '9:30' };
    expect(planDraftDefaults(sources({ options, nowTime: '10:05' })).draft.date).toBe('2026-10-11');
  });

  it('never rolls forward for a time it cannot read', () => {
    const options = { date: TODAY, leaveAt: 'soon' };
    expect(planDraftDefaults(sources({ options, nowTime: '23:00' })).draft.date).toBe(TODAY);
  });

  it('rolls over month and year ends without a timezone', () => {
    expect(nextDay('2026-10-31')).toBe('2026-11-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
  });
});

describe('the start a first plan opens on', () => {
  const opens = (nowTime: string) => planDraftDefaults(sources({ nowTime, options: { date: TODAY, leaveAt: '' } })).draft;

  it('is mid-morning when there is room to get there', () => {
    expect(opens('07:30')).toMatchObject({ date: TODAY, startAt: '10:00' });
    expect(opens('08:59')).toMatchObject({ date: TODAY, startAt: '10:00' });
  });

  it('is the next half hour that leaves an hour to get ready and there, once mid-morning is too close', () => {
    expect(opens('09:15')).toMatchObject({ date: TODAY, startAt: '10:00' });
    expect(opens('09:30')).toMatchObject({ date: TODAY, startAt: '10:30' });
    expect(opens('11:40')).toMatchObject({ date: TODAY, startAt: '13:00' });
  });

  it('opens on tomorrow when the next sensible start would be after 17:00', () => {
    expect(opens('16:30')).toMatchObject({ date: '2026-10-11', startAt: '10:00' });
    expect(opens('21:00')).toMatchObject({ date: '2026-10-11', startAt: '10:00' });
  });

  it('never defaults to a start that is in the past', () => {
    for (const hour of [6, 8, 9, 10, 12, 14, 16, 18]) {
      const draft = opens(`${String(hour).padStart(2, '0')}:10`);
      if (draft.date === TODAY) expect(draft.startAt > `${String(hour).padStart(2, '0')}:10`).toBe(true);
    }
  });
});
