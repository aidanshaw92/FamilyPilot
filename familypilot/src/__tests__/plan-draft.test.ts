import { describe, expect, it } from 'vitest';

import {
  PlanDraftSources,
  planDraftBlocker,
  planDraftFromParams,
  nextDay,
  planDraftDefaults,
  summariseHousehold,
  VISIT_LENGTH_CHOICES,
} from '@/src/services/planning/plan-draft';
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

const sources = (over: Partial<PlanDraftSources> = {}): PlanDraftSources => ({ today: TODAY, ...over });

describe('who’s coming, as the sheet shows it', () => {
  it('counts the household rather than naming anyone', () => {
    const { parties } = planDraftDefaults(sources({ profile: profile() }));
    expect(parties[0]).toMatchObject({ id: 'mine', label: 'Our family', summary: '2 adults, 2 children', ready: true });
    // A plan is read aloud and shown on a shared screen.
    expect(JSON.stringify(parties)).not.toContain('Mia');
    expect(JSON.stringify(parties)).not.toContain('2021');
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

  it('says "Adults only" when a family records no children', () => {
    const { parties } = planDraftDefaults(sources({ planningFamilies: [planningFamily({ ages: [] })] }));
    expect(parties[0].summary).toBe('Adults only');
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
    expect(planDraftBlocker({ date: TODAY, leaveAt: '09:30', partyIds: ['mine', 'theirs'], visitMinutes: 90 }, parties))
      .toBe('One of the families still needs its details before we can plan.');
  });

  it('blocks an empty party', () => {
    expect(planDraftBlocker({ date: TODAY, leaveAt: '09:30', partyIds: [], visitMinutes: 90 }, []))
      .toBe('Choose who is coming.');
  });
});

describe('when and how long', () => {
  it('defaults to today and a sensible morning start', () => {
    const { draft } = planDraftDefaults(sources({ profile: profile() }));
    expect(draft).toMatchObject({ date: TODAY, leaveAt: '09:30', visitMinutes: 90 });
  });

  it('remembers what the parent chose last time', () => {
    const { draft } = planDraftDefaults(sources({
      profile: profile(),
      options: { date: '2026-10-17', leaveAt: '08:15', visitMinutes: 120 },
    }));
    expect(draft).toMatchObject({ date: '2026-10-17', leaveAt: '08:15', visitMinutes: 120 });
  });

  it('never opens on a date that has already passed', () => {
    const { draft } = planDraftDefaults(sources({
      profile: profile(),
      options: { date: '2026-09-01', leaveAt: '09:00', visitMinutes: 90 },
    }));
    expect(draft.date).toBe(TODAY);
  });

  it('snaps a stored length onto a length the sheet can show as chosen', () => {
    // Otherwise the sheet renders four options with none of them selected.
    const at = (visitMinutes: number) =>
      planDraftDefaults(sources({ profile: profile(), options: { date: TODAY, leaveAt: '09:30', visitMinutes } })).draft.visitMinutes;
    expect(at(75)).toBe(90);
    expect(at(60)).toBe(60);
    expect(at(1000)).toBe(180);
    expect(VISIT_LENGTH_CHOICES).toContain(at(75));
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
    expect(parties[0]).toMatchObject({ id: 'mine', summary: '2 adults, 2 children', ready: false });
    expect(planDraftBlocker({ date: TODAY, leaveAt: '09:30', partyIds: ['mine'], visitMinutes: 90 }, parties))
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
        leaveAt: ['09:30'],
        visit: ['90', '240'],
        parties: ['mine,theirs', 'someone-else'],
      }),
    ).toEqual({ date: '2026-10-10', leaveAt: '09:30', visitMinutes: 90, partyIds: ['mine', 'theirs'] });
  });

  it('reads a plain link exactly as it was written', () => {
    expect(planDraftFromParams({ date: '2026-10-10', leaveAt: '09:30', visit: '120', parties: 'mine' }))
      .toEqual({ date: '2026-10-10', leaveAt: '09:30', visitMinutes: 120, partyIds: ['mine'] });
  });

  it('leaves a malformed answer unusable rather than substituting a day nobody chose', () => {
    // The planner rejects these and names which answer does not add up. Quietly defaulting them
    // would produce a plausible-looking day for a date and a length the parent never picked.
    const draft = planDraftFromParams({ date: 'not-a-date', visit: 'soon' });
    expect(draft.date).toBe('not-a-date');
    expect(Number.isFinite(draft.visitMinutes)).toBe(false);
    expect(planDraftFromParams({}).date).toBe('');
    expect(planDraftFromParams({}).leaveAt).toBe('');
  });

  it('falls back to the signed-in household only for who is coming', () => {
    expect(planDraftFromParams({}).partyIds).toEqual(['mine']);
    expect(planDraftFromParams({ parties: '' }).partyIds).toEqual(['mine']);
    expect(planDraftFromParams({ parties: ' mine , theirs , ' }).partyIds).toEqual(['mine', 'theirs']);
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
    expect(result.parties).toEqual([expect.objectContaining({ id: 'mine', label: 'Our family', ready: true })]);
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
    expect(planDraftDefaults(sources({ nowTime: '08:00' })).draft).toMatchObject({ date: TODAY, leaveAt: '09:30' });
  });

  it('opens on tomorrow once today\'s start has gone, rather than planning a day that began in the past', () => {
    // The planner would start from "now" and report the venue closed: true, and no use as a default.
    expect(planDraftDefaults(sources({ nowTime: '20:00' })).draft).toMatchObject({ date: '2026-10-11', leaveAt: '09:30' });
  });

  it('keeps an explicit "leave from now" on today in the minute it was chosen', () => {
    const options = { date: TODAY, leaveAt: '20:00', visitMinutes: 90 };
    expect(planDraftDefaults(sources({ options, nowTime: '20:00' })).draft.date).toBe(TODAY);
  });

  it('moves a stored date that is today but whose start has gone', () => {
    const options = { date: TODAY, leaveAt: '09:00', visitMinutes: 90 };
    expect(planDraftDefaults(sources({ options, nowTime: '12:00' })).draft.date).toBe('2026-10-11');
  });

  it('leaves a stored future date alone', () => {
    const options = { date: '2026-10-20', leaveAt: '09:00', visitMinutes: 90 };
    expect(planDraftDefaults(sources({ options, nowTime: '23:00' })).draft.date).toBe('2026-10-20');
  });

  it('with no clock given, today stays today', () => {
    expect(planDraftDefaults(sources()).draft.date).toBe(TODAY);
  });

  it('rolls over month and year ends without a timezone', () => {
    expect(nextDay('2026-10-31')).toBe('2026-11-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
  });
});
