import { describe, expect, it } from 'vitest';

import { migrateLegacyProfile } from '@/src/utils/profile-migration';

// The shape slice-6-era onboarding actually persisted.
const legacy = {
  id: 'family-1',
  parentName: 'Aidan',
  members: [
    { id: 'parent-1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 30 },
    { id: 'child-1', name: 'Rosie', role: 'child', dateOfBirth: '2020-01-01', age: 6 },
    { id: 'child-2', name: 'Theo', role: 'child', dateOfBirth: '2026-01-01', age: 0, ageMonths: 2 },
  ],
  homeLocation: 'Bushey, Hertfordshire', homeLatitude: 51.643, homeLongitude: -0.36,
  budgetTier: 'moderate', maxDriveMinutes: 90, completionPercent: 80, pushchair: 'Bugaboo Fox',
  routines: [{ id: 'r1', label: 'Nap', kind: 'nap', time: '13:00', durationMinutes: 60, atHome: true }],
  mustHaveFacilities: ['toilets'],
};

describe('a profile saved before dates of birth were collected', () => {
  it('keeps everything the family told us', () => {
    const { profile, droppedChildren } = migrateLegacyProfile(legacy);
    expect(droppedChildren).toBe(0);
    expect(profile.parentName).toBe('Aidan');
    expect(profile.members.map((m) => m.name)).toEqual(['Aidan', 'Rosie', 'Theo']);
    expect(profile.homeLatitude).toBe(51.643);
    expect(profile.maxDriveMinutes).toBe(90);
    expect(profile.pushchair).toBe('Bugaboo Fox');
    expect(profile.routines).toHaveLength(1);
    expect(profile.mustHaveFacilities).toEqual(['toilets']);
  });

  it('never trusts the invented date of birth and keeps the stored age', () => {
    const { profile } = migrateLegacyProfile(legacy);
    const rosie = profile.members.find((m) => m.name === 'Rosie')!;
    const theo = profile.members.find((m) => m.name === 'Theo')!;
    expect(rosie).toMatchObject({ dobKnown: false, age: 6 });
    expect(theo).toMatchObject({ dobKnown: false, age: 0, ageMonths: 2 });
  });

  it('does not let a member vouch for its own date: dobKnown needs a real date', () => {
    const { profile } = migrateLegacyProfile({
      ...legacy,
      members: [{ id: 'c', name: 'Mia', role: 'child', dateOfBirth: 'not a date', dobKnown: true, age: 3 }],
    });
    expect(profile.members[0].dobKnown).toBe(false);
  });

  it('keeps a trusted date of birth that a parent entered', () => {
    const { profile } = migrateLegacyProfile({
      ...legacy,
      members: [{ id: 'c', name: 'Mia', role: 'child', dateOfBirth: '2023-05-04', dobKnown: true, age: 2 }],
    });
    expect(profile.members[0]).toMatchObject({ dobKnown: true, dateOfBirth: '2023-05-04' });
  });
});

describe('malformed and partial storage never throws and never fabricates', () => {
  it('turns nothing, junk and arrays into a clean empty profile', () => {
    for (const bad of [undefined, null, 'x', 7, [], [1, 2]]) {
      const { profile } = migrateLegacyProfile(bad);
      expect(profile.members).toEqual([]);
      expect(profile.maxDriveMinutes).toBeUndefined();
      expect(profile.budgetTier).toBeUndefined();
      expect(profile.routines).toEqual([]);
    }
  });

  it('drops a child whose age cannot be established and says how many, instead of guessing', () => {
    const { profile, droppedChildren } = migrateLegacyProfile({
      ...legacy,
      members: [
        { id: 'a', name: 'NoAge', role: 'child' },
        { id: 'b', name: 'Nan', role: 'child', age: 'six' },
        { id: 'c', name: 'Adult', role: 'child', age: 40 },
        { id: 'd', name: 'Negative', role: 'child', age: -2 },
        { id: 'e', name: 'Fine', role: 'child', age: 4 },
        'garbage', null, { role: 'alien' },
      ],
    });
    expect(droppedChildren).toBe(4);
    expect(profile.members.map((m) => m.name)).toEqual(['Fine']);
  });

  it('repairs field by field rather than losing the family over one bad field', () => {
    const { profile } = migrateLegacyProfile({ ...legacy, budgetTier: 'lavish', maxDriveMinutes: -4, homeLatitude: 'x', memberships: [1, 'Zoo', null] });
    expect(profile.budgetTier).toBeUndefined();
    expect(profile.maxDriveMinutes).toBeUndefined();
    expect(profile.homeLatitude).toBeUndefined();
    expect(profile.memberships).toEqual(['Zoo']);
    expect(profile.parentName).toBe('Aidan');
  });

  it('keeps only routines it can read, and fills the duration it must', () => {
    const { profile } = migrateLegacyProfile({
      ...legacy,
      routines: [
        { id: 'ok', kind: 'nap', time: '09:30', durationMinutes: 45 },
        { id: 'noDur', kind: 'feed', time: '12:00' },
        { id: 'badTime', kind: 'nap', time: '25:00' },
        { id: 'badKind', kind: 'bath', time: '18:00' },
        'x',
      ],
    });
    expect(profile.routines?.map((r) => [r.id, r.durationMinutes, r.atHome])).toEqual([['ok', 45, true], ['noDur', 30, true]]);
  });

  it('detaches a routine from a child who is gone, and keeps it as the family’s', () => {
    const { profile } = migrateLegacyProfile({
      ...legacy,
      members: [{ id: 'c1', name: 'Mia', role: 'child', age: 3 }],
      routines: [
        { id: 'mine', kind: 'nap', time: '13:00', childId: 'c1' },
        { id: 'orphan', kind: 'nap', time: '10:00', childId: 'ghost' },
      ],
    });
    expect(profile.routines?.find((r) => r.id === 'mine')?.childId).toBe('c1');
    expect(profile.routines?.find((r) => r.id === 'orphan')?.childId).toBeUndefined();
  });

  it('reads mobility only from the values that exist', () => {
    const { profile } = migrateLegacyProfile({
      ...legacy,
      members: [{ id: 'c1', name: 'Mia', role: 'child', age: 1, mobility: ['buggy', 'teleport', 'carrier'] }],
    });
    expect(profile.members[0].mobility).toEqual(['buggy', 'carrier']);
  });

  it('is idempotent: migrating a migrated profile changes nothing that matters', () => {
    const once = migrateLegacyProfile(legacy).profile;
    const twice = migrateLegacyProfile(once).profile;
    expect({ ...twice, id: once.id }).toEqual(once);
  });
});

describe('the household survives migration', () => {
  it('keeps the family name and how each added adult relates to the household', () => {
    const { profile } = migrateLegacyProfile({
      parentName: 'Aidan',
      familyName: '  Shaw ',
      members: [
        { id: 'p1', name: 'Aidan', role: 'parent', age: 36, dateOfBirth: '1990-01-01' },
        { id: 'p2', name: 'Ellie', role: 'parent', relationship: 'partner', age: 35, dateOfBirth: '1991-01-01' },
        { id: 'p3', name: 'Gran', role: 'parent', relationship: 'not-a-relationship', age: 70, dateOfBirth: '1950-01-01' },
        { id: 'c1', name: 'Sloane', role: 'child', age: 3, dateOfBirth: '2023-01-01', dobKnown: true },
      ],
      homeLocation: 'N1',
    });
    expect(profile.familyName).toBe('Shaw');
    expect(profile.members.find((m) => m.id === 'p2')?.relationship).toBe('partner');
    // Anything that is not one of the three words is not a relationship.
    expect(profile.members.find((m) => m.id === 'p3')?.relationship).toBeUndefined();
  });

  it('adds no family name nobody gave', () => {
    expect(migrateLegacyProfile({ parentName: 'Aidan', members: [] }).profile.familyName).toBeUndefined();
  });
});
