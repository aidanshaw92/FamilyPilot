import { describe, expect, it } from 'vitest';

import { buildProactiveDayRequest } from '@/src/services/recommendation/proactive-day-request';
import { withDerivedAges } from '@/src/utils/child-age';
import { familyNeedsStepFree, familyUsesBuggy } from '@/src/utils/family-mobility';
import {
  DraftChild,
  anyRoutineQuestions,
  blankChild,
  buildOnboardingProfile,
  describeAge,
  draftAge,
  draftDob,
  draftDobMessage,
  newNap,
  questionsFor,
} from '@/src/utils/onboarding-draft';
import { evaluateRoutineFit } from '@/src/utils/routine-fit';
import { profileReceipt } from '@/src/utils/profile-receipt';

/** A fixed "today" so every age below is exact. */
const NOW = new Date(2026, 5, 15, 9, 0); // 15 June 2026

function draft(over: Partial<DraftChild>): DraftChild {
  return { ...blankChild(), ...over };
}

// 8 months, 2y3m, 8y11m — relative to NOW.
const BABY = (over: Partial<DraftChild> = {}) =>
  draft({ id: 'b', name: 'Poppy', day: '10', month: '10', year: '2025', ...over });
const TODDLER = (over: Partial<DraftChild> = {}) =>
  draft({ id: 't', name: 'Theo', day: '1', month: '3', year: '2024', ...over });
const OLDER = (over: Partial<DraftChild> = {}) =>
  draft({ id: 'o', name: 'Mia', day: '20', month: '6', year: '2017', ...over });

const home = { latitude: 51.6, longitude: -0.3 };
const build = (children: DraftChild[]) =>
  buildOnboardingProfile({ parentName: ' Sam ', homeLocation: ' Bushey ', home, children, now: NOW });

describe('the date of birth boxes', () => {
  it('accepts a real date and pads it', () => {
    expect(draftDob({ day: '5', month: '3', year: '2024' })).toBe('2024-03-05');
  });

  it('rejects partial, non-numeric and impossible dates instead of coercing them', () => {
    for (const bad of [
      { day: '', month: '3', year: '2024' },
      { day: '31', month: '2', year: '2024' },
      { day: '1', month: '13', year: '2024' },
      { day: '1', month: '3', year: '24' },
      { day: 'a', month: '3', year: '2024' },
      { day: '1', month: '3', year: '20245' },
      { day: '0', month: '3', year: '2024' },
    ]) {
      expect(draftDob(bad)).toBeNull();
    }
  });

  it('says nothing while a date is being typed, then says exactly what is wrong', () => {
    expect(draftDobMessage({ day: '1', month: '', year: '' }, NOW)).toBeNull();
    expect(draftDobMessage({ day: '31', month: '2', year: '2024' }, NOW)).toBe('That date doesn’t look right');
    expect(draftDobMessage({ day: '1', month: '1', year: '2027' }, NOW)).toBe('That date is in the future');
    expect(draftDobMessage({ day: '1', month: '1', year: '2000' }, NOW)).toBe(
      'FamilyPilot plans days out for children under 18',
    );
    expect(draftDobMessage({ day: '1', month: '3', year: '2024' }, NOW)).toBeNull();
  });

  it('on continue, an empty or half-filled date asks for what is missing', () => {
    expect(draftDobMessage({ day: '', month: '', year: '' }, NOW, { final: true })).toBe('Add a date of birth');
    expect(draftDobMessage({ day: '1', month: '2', year: '' }, NOW, { final: true })).toBe(
      'Add the day, month and year',
    );
  });

  it('describes age the way a parent says it, exactly for a baby', () => {
    expect(describeAge(draftAge(BABY(), NOW)!)).toBe('8 months');
    expect(describeAge(draftAge(TODDLER(), NOW)!)).toBe('2 years 3 months');
    // Born 20 June 2017: the ninth birthday is five days away, so still 8.
    expect(describeAge(draftAge(OLDER(), NOW)!)).toBe('8 years');
    expect(describeAge({ years: 0, months: 1, totalMonths: 1 })).toBe('1 month');
    expect(describeAge({ years: 1, months: 0, totalMonths: 12 })).toBe('12 months');
  });
});

describe('which questions each child is asked', () => {
  it('a baby: carrier, buggy or aid, naps and feeds, never "walks"', () => {
    const q = questionsFor(8);
    expect(q.mobilityOptions).toEqual(['carrier', 'buggy', 'mobility-aid']);
    expect(q.asksNaps && q.asksFeeds).toBe(true);
  });

  it('a toddler: walks too, naps and meals', () => {
    const q = questionsFor(27);
    expect(q.mobilityOptions).toEqual(['walks', 'buggy', 'carrier', 'mobility-aid']);
    expect(q.asksNaps && q.asksFeeds).toBe(true);
  });

  it('a three-year-old still naps but is no longer asked about feeds', () => {
    const q = questionsFor(40);
    expect(q.asksNaps).toBe(true);
    expect(q.asksFeeds).toBe(false);
  });

  it('an older child: no carrier, no naps, no feeds', () => {
    const q = questionsFor(8 * 12);
    expect(q.mobilityOptions).toEqual(['walks', 'buggy', 'mobility-aid']);
    expect(q.asksNaps || q.asksFeeds).toBe(false);
  });

  it('the boundaries sit at 12, 36 and 48 months', () => {
    expect(questionsFor(11).mobilityOptions).not.toContain('walks');
    expect(questionsFor(12).mobilityOptions).toContain('walks');
    expect(questionsFor(35).asksFeeds).toBe(true);
    expect(questionsFor(36).asksFeeds).toBe(false);
    expect(questionsFor(47).asksNaps).toBe(true);
    expect(questionsFor(48).asksNaps).toBe(false);
    expect(questionsFor(47).mobilityOptions).toContain('carrier');
    expect(questionsFor(48).mobilityOptions).not.toContain('carrier');
  });

  it('the naps step is skipped entirely when no child needs it', () => {
    expect(anyRoutineQuestions([OLDER()], NOW)).toBe(false);
    expect(anyRoutineQuestions([OLDER(), TODDLER()], NOW)).toBe(true);
    expect(anyRoutineQuestions([draft({ name: 'X' })], NOW)).toBe(false);
  });
});

describe('the profile onboarding produces', () => {
  it('one baby: exact age in months, a buggy and carrier, a nap and an every-4-hours feed', () => {
    const profile = build([
      BABY({
        mobility: ['buggy', 'carrier'],
        naps: [{ ...newNap(), time: '09:30', durationMinutes: 60 }, { ...newNap(), time: '13:00' }],
        feedMode: 'interval',
        feedFirst: '07:00',
        feedEveryHours: 4,
      }),
    ]);
    const kid = profile.members.find((m) => m.role === 'child')!;
    expect(kid).toMatchObject({ name: 'Poppy', dobKnown: true, dateOfBirth: '2025-10-10', age: 0, ageMonths: 8 });
    expect(kid.mobility).toEqual(['carrier', 'buggy']);
    expect(profile.routines!.filter((r) => r.kind === 'nap').map((r) => r.time)).toEqual(['09:30', '13:00']);
    expect(profile.routines!.filter((r) => r.kind === 'feed').map((r) => r.time)).toEqual([
      '07:00', '11:00', '15:00', '19:00',
    ]);
    expect(profile.routines!.every((r) => r.childId === kid.id)).toBe(true);
    expect(familyUsesBuggy(profile)).toBe(true);
    expect(profile.maxDriveMinutes).toBe(30);
    expect(profile.budgetTier).toBe('moderate');
    expect(profile.pushchair).toBeNull();
  });

  it('one toddler with set meal times', () => {
    const profile = build([
      TODDLER({ mobility: ['walks', 'buggy'], feedMode: 'times', feedTimes: ['12:00', '17:30', '12:00'] }),
    ]);
    const feeds = profile.routines!.filter((r) => r.kind === 'feed');
    expect(feeds.map((r) => r.time)).toEqual(['12:00', '17:30']);
    expect(feeds[0].label).toBe('Theo’s meal');
  });

  it('one older child: no routines at all, even if stale answers were left in the draft', () => {
    const profile = build([
      OLDER({
        mobility: ['walks'],
        naps: [newNap()],
        feedMode: 'times',
        feedTimes: ['12:00'],
      }),
    ]);
    expect(profile.routines).toEqual([]);
    expect(familyUsesBuggy(profile)).toBe(false);
  });

  it('baby + toddler: two children, each with their own owned routines', () => {
    const profile = build([
      BABY({ naps: [newNap()] }),
      TODDLER({ naps: [{ ...newNap(), time: '12:30' }] }),
    ]);
    const [poppy, theo] = profile.members.filter((m) => m.role === 'child');
    const mine = (id: string) => profile.routines!.filter((r) => r.childId === id);
    expect(mine(poppy.id)).toHaveLength(1);
    expect(mine(theo.id)).toHaveLength(1);
    expect(mine(theo.id)[0].time).toBe('12:30');
  });

  it('multi-child with differing needs: only the child who uses an aid triggers step-free', () => {
    const profile = build([
      TODDLER({ mobility: ['buggy'] }),
      OLDER({ mobility: ['mobility-aid'] }),
    ]);
    expect(familyUsesBuggy(profile)).toBe(true);
    expect(familyNeedsStepFree(profile)).toBe(true);
    const aidOnly = build([OLDER({ mobility: ['mobility-aid'] })]);
    expect(familyUsesBuggy(aidOnly)).toBe(false);
    expect(familyNeedsStepFree(aidOnly)).toBe(true);
  });

  it('drops an answer the child’s age no longer allows (the date was edited after choosing)', () => {
    const profile = build([OLDER({ mobility: ['carrier', 'walks'] })]);
    expect(profile.members.find((m) => m.role === 'child')!.mobility).toEqual(['walks']);
  });

  it('leaves out a child with no name or no valid date rather than inventing either', () => {
    const profile = build([
      OLDER(),
      draft({ id: 'x', name: '', day: '1', month: '1', year: '2020' }),
      draft({ id: 'y', name: 'Zed', day: '31', month: '2', year: '2020' }),
      draft({ id: 'z', name: 'Future', day: '1', month: '1', year: '2030' }),
    ]);
    expect(profile.members.filter((m) => m.role === 'child').map((m) => m.name)).toEqual(['Mia']);
  });

  it('ignores invalid nap and feed times and duplicate naps', () => {
    const profile = build([
      TODDLER({
        naps: [
          { ...newNap(), time: '13:00' },
          { ...newNap(), time: '13:00' },
          { ...newNap(), time: '25:61' },
        ],
        feedMode: 'times',
        feedTimes: ['', '99:99', '12:00'],
      }),
    ]);
    expect(profile.routines!.filter((r) => r.kind === 'nap')).toHaveLength(1);
    expect(profile.routines!.filter((r) => r.kind === 'feed').map((r) => r.time)).toEqual(['12:00']);
  });

  it('a feed mode of none produces no feeds even if times are left in the draft', () => {
    const profile = build([TODDLER({ feedMode: 'none', feedTimes: ['12:00'] })]);
    expect(profile.routines!.filter((r) => r.kind === 'feed')).toEqual([]);
  });

  it('stores nothing about drive time or budget beyond the defaults every consumer expects', () => {
    const profile = build([OLDER()]);
    expect(profile.maxDriveMinutes).toBe(30);
    expect(profile.budgetTier).toBe('moderate');
  });
});

describe('what the new profile does downstream', () => {
  it('Home’s request is built from the baby’s exact age and the buggy answer', () => {
    const profile = build([BABY({ mobility: ['buggy'] })]);
    const request = buildProactiveDayRequest(profile);
    expect(request.childAgeMonthsList).toEqual([8]);
    expect(request.hasPushchair).toBe(true);
    expect(request.constraints.babyChanging).toBeDefined();
  });

  it('the profile stays right as time passes: a birthday moves the age, nothing is retyped', () => {
    const profile = build([TODDLER()]);
    const later = withDerivedAges(profile, new Date(2026, 11, 15));
    expect(later.members.find((m) => m.role === 'child')!.age).toBe(2);
    const muchLater = withDerivedAges(profile, new Date(2027, 2, 2));
    expect(muchLater.members.find((m) => m.role === 'child')!.age).toBe(3);
  });

  it('a nap is named in the leave-by line a parent reads', () => {
    const profile = build([TODDLER({ naps: [{ ...newNap(), time: '13:00' }] })]);
    const fit = evaluateRoutineFit(profile, 30, new Date(2026, 5, 15, 9, 0));
    expect(fit.reason).toBe('Leave by 12:30 to be home in time for Theo’s nap');
  });

  it('the receipt reflects the answers without naming anyone', () => {
    const profile = build([BABY({ mobility: ['buggy'], naps: [newNap()] })]);
    expect(profileReceipt(profile)).toBe('Using age 8 months, pushchair, 13:00 nap and max 30 min drive');
  });
});
