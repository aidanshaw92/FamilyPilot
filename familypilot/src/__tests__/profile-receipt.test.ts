import { describe, expect, it } from 'vitest';

import { profileReceipt } from '@/src/utils/profile-receipt';
import { FamilyProfile } from '@/src/types';

const profile = (over: Partial<FamilyProfile>): FamilyProfile =>
  ({ id: 'p', parentName: 'Aidan', members: [], budgetTier: 'moderate', maxDriveMinutes: 30, ...over }) as FamilyProfile;

describe('profile receipt', () => {
  it('reads like the approved frame when everything is known', () => {
    const p = profile({
      members: [
        { id: 'a', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 36 },
        { id: 'c1', name: 'Rosie', role: 'child', dateOfBirth: '2024-01-01', age: 2 },
        { id: 'c2', name: 'Theo', role: 'child', dateOfBirth: '2022-01-01', age: 4 },
      ],
      pushchair: 'Bugaboo',
      routines: [{ id: 'r', label: 'Nap', kind: 'nap', time: '15:30', durationMinutes: 60, atHome: true }],
    });
    expect(profileReceipt(p)).toBe('Using ages 2 and 4, pushchair, 15:30 nap and max 30 min drive');
  });

  it('never names a child', () => {
    const p = profile({ members: [{ id: 'c', name: 'Rosie', role: 'child', dateOfBirth: '2020-01-01', age: 6 }] });
    expect(profileReceipt(p)).not.toContain('Rosie');
    expect(profileReceipt(p)).toBe('Using age 6 and max 30 min drive');
  });

  it('says only what the profile holds', () => {
    expect(profileReceipt(profile({ maxDriveMinutes: 0 }))).toBeNull();
    expect(profileReceipt(profile({}))).toBe('Using max 30 min drive');
    expect(profileReceipt(null)).toBeNull();
  });

  it('spells a baby in months', () => {
    const p = profile({ members: [{ id: 'c', name: 'B', role: 'child', dateOfBirth: '2026-02-01', age: 0, ageMonths: 8 }], maxDriveMinutes: 20 });
    expect(profileReceipt(p)).toBe('Using age 8 months and max 20 min drive');
  });
});
