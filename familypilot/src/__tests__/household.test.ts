import { describe, expect, it } from 'vitest';

import { FamilyProfile } from '@/src/types';
import { buildOnboardingProfile, blankAdult, blankChild } from '@/src/utils/onboarding-draft';
import {
  createAdultMember,
  householdPeople,
  householdTitle,
  profileForAttendees,
  sayPeople,
  withAddedAdult,
  withoutAdult,
} from '@/src/utils/household';

/**
 * The household, as the product reads it: the people coming on a day out, never a guessed count.
 */

const base = (over: Partial<FamilyProfile> = {}): FamilyProfile =>
  ({
    id: 'f', parentName: 'Aidan', members: [
      { id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 36 },
      { id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2023-03-01', age: 2, dobKnown: true },
      { id: 'c2', name: 'Ozzie', role: 'child', dateOfBirth: '2026-02-01', age: 0, ageMonths: 8, dobKnown: true },
    ],
    homeLocation: 'N1', budgetTier: 'moderate', maxDriveMinutes: 30, completionPercent: 50, routines: [
      { id: 'nap-c2', label: 'Nap', kind: 'nap', time: '12:30', durationMinutes: 90, atHome: true, childId: 'c2' },
      { id: 'nap-c1', label: 'Nap', kind: 'nap', time: '13:00', durationMinutes: 60, atHome: true, childId: 'c1' },
      { id: 'old', label: 'Old nap', kind: 'nap', time: '14:00', durationMinutes: 60, atHome: true },
    ], mustHaveFacilities: [], ...over,
  }) as FamilyProfile;

describe('the household', () => {
  it('is titled by the family name when there is one, and never from a first name', () => {
    expect(householdTitle(base({ familyName: 'Shaw' }))).toBe('Shaw family');
    expect(householdTitle(base({ familyName: '  ' }))).toBe('Your family');
    expect(householdTitle(base())).toBe('Your family');
    expect(householdTitle(null)).toBe('Your family');
  });

  it('lists you first, then the other adults, then the children', () => {
    const profile = withAddedAdult(base(), 'Ellie', 'partner');
    const people = householdPeople(profile);
    expect(people.map((p) => [p.name, p.kind])).toEqual([['Aidan', 'adult'], ['Ellie', 'adult'], ['Sloane', 'child'], ['Ozzie', 'child']]);
    expect(people[0].isYou).toBe(true);
    expect(people[1]).toMatchObject({ isYou: false, relationship: 'partner' });
    expect(people[3].ageLabel).toBe('8 months');
  });

  it('adds no adult without a name, and keeps adults’ dates of birth out of it', () => {
    expect(withAddedAdult(base(), '   ', 'partner').members).toHaveLength(3);
    const adult = createAdultMember('Ellie', 'co-parent');
    expect(adult).toMatchObject({ role: 'parent', relationship: 'co-parent' });
    // A placeholder, never asked for: nothing derives an adult's age from it.
    expect(adult.dateOfBirth).toBe('1990-01-01');
  });

  it('removes an added adult, but never the person who set the app up or a child', () => {
    const profile = withAddedAdult(base(), 'Ellie', 'partner');
    const ellie = profile.members.find((m) => m.name === 'Ellie')!;
    expect(withoutAdult(profile, ellie.id).members.map((m) => m.name)).toEqual(['Aidan', 'Sloane', 'Ozzie']);
    expect(withoutAdult(profile, 'p1').members).toHaveLength(4);
    expect(withoutAdult(profile, 'c1').members).toHaveLength(4);
  });

  it('says people in a sentence', () => {
    expect(sayPeople(['Aidan', 'Ellie', 'Sloane', 'Ozzie'])).toBe('Aidan, Ellie, Sloane and Ozzie');
    expect(sayPeople(['Sloane'])).toBe('Sloane');
    expect(sayPeople([])).toBe('nobody yet');
  });
});

describe('who is coming', () => {
  it('is everyone when nothing is narrowed', () => {
    const profile = base();
    expect(profileForAttendees(profile, null)).toBe(profile);
    expect(profileForAttendees(profile, undefined)).toBe(profile);
  });

  it('drops a child who is not coming, with their routines, and keeps routines that have no owner', () => {
    const narrowed = profileForAttendees(base(), ['p1', 'c1']);
    expect(narrowed.members.map((m) => m.id)).toEqual(['p1', 'c1']);
    expect(narrowed.routines?.map((r) => r.id)).toEqual(['nap-c1', 'old']);
  });

  it('can leave an adult out too: a partner at work', () => {
    const profile = withAddedAdult(base(), 'Ellie', 'partner');
    const ellie = profile.members.find((m) => m.name === 'Ellie')!;
    const narrowed = profileForAttendees(profile, profile.members.filter((m) => m.id !== ellie.id).map((m) => m.id));
    expect(narrowed.members.some((m) => m.name === 'Ellie')).toBe(false);
  });
});

describe('onboarding builds the household it was told about', () => {
  const input = (over = {}) => ({
    parentName: 'Aidan', homeLocation: 'N1', home: { latitude: 51.5, longitude: -0.1 },
    children: [{ ...blankChild(), name: 'Sloane', day: '01', month: '03', year: '2023' }], now: new Date('2026-10-06T09:00:00'), ...over,
  });

  it('is just you when nobody else was added, with no family name invented', () => {
    const profile = buildOnboardingProfile(input() as never);
    expect(profile.members.filter((m) => m.role !== 'child')).toHaveLength(1);
    expect(profile.familyName).toBeUndefined();
  });

  it('keeps a named partner and the family name, trimmed', () => {
    const profile = buildOnboardingProfile(input({ familyName: ' Shaw ', adults: [{ ...blankAdult('partner'), name: ' Ellie ' }] }) as never);
    expect(profile.familyName).toBe('Shaw');
    const adults = profile.members.filter((m) => m.role !== 'child');
    expect(adults.map((m) => m.name)).toEqual(['Aidan', 'Ellie']);
    expect(adults[1].relationship).toBe('partner');
  });

  it('ignores an adult row left blank', () => {
    const profile = buildOnboardingProfile(input({ adults: [{ ...blankAdult('partner'), name: '   ' }] }) as never);
    expect(profile.members.filter((m) => m.role !== 'child')).toHaveLength(1);
  });
});
