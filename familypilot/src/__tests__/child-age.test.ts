import { describe, expect, it } from 'vitest';

import {
  ageFromDob,
  childDobProblem,
  childrenNeedingBirthday,
  parseIsoDate,
  withDerivedAge,
  withDerivedAges,
} from '@/src/utils/child-age';
import { FamilyMember, FamilyProfile } from '@/src/types';

// Local-time constructor on purpose: the module reads the device's calendar.
const on = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

const child = (over: Partial<FamilyMember> = {}): FamilyMember => ({
  id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2022-06-10', dobKnown: true, age: 3, ...over,
});

describe('a date of birth becomes an age in whole calendar months', () => {
  it('counts a month only once its day has been reached', () => {
    // Born 16 December 2025: on 15 March 2026 the third month is one day away.
    expect(ageFromDob('2025-12-16', on(2026, 3, 15))).toEqual({ years: 0, months: 2, totalMonths: 2 });
    expect(ageFromDob('2025-12-16', on(2026, 3, 16))).toEqual({ years: 0, months: 3, totalMonths: 3 });
  });

  it('turns a year on the birthday, not before', () => {
    expect(ageFromDob('2022-06-10', on(2026, 6, 9))).toMatchObject({ years: 3, months: 11 });
    expect(ageFromDob('2022-06-10', on(2026, 6, 10))).toMatchObject({ years: 4, months: 0, totalMonths: 48 });
  });

  it('keeps a newborn distinguishable from an eleven-month-old', () => {
    expect(ageFromDob('2026-03-01', on(2026, 3, 20))?.totalMonths).toBe(0);
    expect(ageFromDob('2025-04-02', on(2026, 3, 20))?.totalMonths).toBe(11);
  });

  it('handles a 29 February birthday in a non-leap year without drifting a month', () => {
    expect(ageFromDob('2024-02-29', on(2026, 2, 28))).toMatchObject({ years: 1, months: 11 });
    expect(ageFromDob('2024-02-29', on(2026, 3, 1))).toMatchObject({ years: 2, months: 0 });
  });

  it('crosses a year boundary correctly', () => {
    expect(ageFromDob('2025-12-31', on(2026, 1, 1))?.totalMonths).toBe(0);
    expect(ageFromDob('2025-12-01', on(2026, 1, 1))?.totalMonths).toBe(1);
  });

  it('refuses a future date, an impossible date and anything that is not a date', () => {
    expect(ageFromDob('2026-03-21', on(2026, 3, 20))).toBeNull();
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('10/06/2022')).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
    expect(parseIsoDate(20220610)).toBeNull();
    expect(parseIsoDate('2024-02-29')).not.toBeNull();
    expect(parseIsoDate('2025-02-29')).toBeNull();
  });
});

describe('what a parent may enter as a child’s date of birth', () => {
  it('rejects the impossible, the future and an adult', () => {
    const now = on(2026, 3, 20);
    expect(childDobProblem('nope', now)).toBe('invalid');
    expect(childDobProblem('2026-04-01', now)).toBe('future');
    expect(childDobProblem('2000-01-01', now)).toBe('too-old');
    expect(childDobProblem('2008-03-21', now)).toBeNull();
    expect(childDobProblem('2008-03-20', now)).toBe('too-old');
  });
});

describe('the derived age replaces the stored one only when the date of birth is real', () => {
  const now = on(2026, 3, 20);

  it('refreshes a stale stored age from a known date of birth', () => {
    const next = withDerivedAge(child({ dateOfBirth: '2022-03-01', age: 3 }), now);
    expect(next.age).toBe(4);
    expect(next.ageMonths).toBeNull();
  });

  it('gives a baby exact months and clears them once a year old', () => {
    expect(withDerivedAge(child({ dateOfBirth: '2025-08-10', age: 0, ageMonths: 3 }), now)).toMatchObject({ age: 0, ageMonths: 7 });
    expect(withDerivedAge(child({ dateOfBirth: '2025-03-01', age: 0, ageMonths: 11 }), now)).toMatchObject({ age: 1, ageMonths: null });
  });

  it('never derives from an invented date of birth', () => {
    const legacy = child({ dobKnown: false, dateOfBirth: '2021-01-01', age: 5 });
    expect(withDerivedAge(legacy, now)).toBe(legacy);
    const unmarked = child({ dobKnown: undefined, dateOfBirth: '2021-01-01', age: 5 });
    expect(withDerivedAge(unmarked, now)).toBe(unmarked);
  });

  it('leaves parents alone and keeps a malformed date’s stored age instead of guessing', () => {
    const parent: FamilyMember = { id: 'p', name: 'A', role: 'parent', dateOfBirth: '1990-01-01', age: 36 };
    expect(withDerivedAge(parent, now)).toBe(parent);
    const broken = child({ dateOfBirth: 'garbage', age: 4 });
    expect(withDerivedAge(broken, now)).toBe(broken);
  });

  it('returns the same profile object when no age changed', () => {
    const profile = { id: 'f', members: [child({ dateOfBirth: '2022-06-10', age: 3, ageMonths: null })] } as unknown as FamilyProfile;
    expect(withDerivedAges(profile, on(2026, 3, 20))).toBe(profile);
  });

  it('lists exactly the children whose birthday must still be asked for', () => {
    const profile = { members: [child({ id: 'a' }), child({ id: 'b', dobKnown: false }), child({ id: 'c', dobKnown: undefined }),
      { id: 'p', name: 'P', role: 'parent', dateOfBirth: '1990-01-01', age: 36 }] } as unknown as FamilyProfile;
    expect(childrenNeedingBirthday(profile).map((m) => m.id)).toEqual(['b', 'c']);
  });
});
