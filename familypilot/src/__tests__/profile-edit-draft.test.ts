import { describe, expect, it } from 'vitest';

import { withDerivedAges } from '@/src/utils/child-age';
import {
  EditChild,
  applyEditedChildren,
  editChildFromMember,
  editChildProblem,
} from '@/src/utils/profile-edit-draft';
import { blankChild, buildOnboardingProfile, newNap } from '@/src/utils/onboarding-draft';
import { migrateLegacyProfile } from '@/src/utils/profile-migration';
import { resolveRoutines } from '@/src/utils/routine-schedule';
import { FamilyProfile } from '@/src/types';

const NOW = new Date(2026, 5, 15, 9, 0);
const HOME = { latitude: 51.6, longitude: -0.3 };

function onboarded(): FamilyProfile {
  const baby = { ...blankChild(), id: 'b', name: 'Poppy', day: '10', month: '10', year: '2025', mobility: ['buggy', 'carrier'] as never, naps: [newNap()], feedMode: 'interval' as const };
  const older = { ...blankChild(), id: 'o', name: 'Mia', day: '20', month: '3', year: '2018', mobility: ['walks'] as never };
  return buildOnboardingProfile({ parentName: 'Sam', homeLocation: 'Bushey', home: HOME, children: [baby, older], now: NOW });
}

const edits = (profile: FamilyProfile) =>
  profile.members.filter((m) => m.role === 'child').map((m) => editChildFromMember(m, profile.routines));
const owned = (profile: FamilyProfile) => (profile.routines ?? []).filter((r) => r.childId == null);
const sig = (profile: { routines?: FamilyProfile['routines'] }) =>
  (profile.routines ?? []).map((r) => `${r.childId}|${r.kind}|${r.time}|${r.durationMinutes}`).sort();

describe('saving Edit profile does not lose what onboarding stored', () => {
  it('a save with no changes keeps every child’s id, date of birth, mobility and routines', () => {
    const profile = onboarded();
    const out = applyEditedChildren(profile, edits(profile), owned(profile), NOW);
    const before = profile.members.filter((m) => m.role === 'child');
    expect(out.members.map((m) => m.id)).toEqual(before.map((m) => m.id));
    expect(out.members.map((m) => m.dateOfBirth)).toEqual(before.map((m) => m.dateOfBirth));
    expect(out.members.every((m) => m.dobKnown === true)).toBe(true);
    expect(out.members.map((m) => m.mobility)).toEqual(before.map((m) => m.mobility));
    expect(sig(out)).toEqual(sig(profile));
  });

  it('every routine still belongs to a child that exists', () => {
    const profile = onboarded();
    const out = applyEditedChildren(profile, edits(profile), owned(profile), NOW);
    const ids = new Set(out.members.map((m) => m.id));
    expect(out.routines.every((r) => r.childId && ids.has(r.childId))).toBe(true);
  });

  it('renaming a child renames their routines wherever they are read', () => {
    const profile = onboarded();
    const drafts = edits(profile).map((d) => (d.name === 'Poppy' ? { ...d, name: 'Pip' } : d));
    const out = applyEditedChildren(profile, drafts, owned(profile), NOW);
    const labels = resolveRoutines({ members: out.members, routines: out.routines }).map((r) => r.label);
    expect(labels.some((l) => l.startsWith('Pip’s'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Poppy’s'))).toBe(false);
  });

  it('removing a child removes their routines and nobody else’s', () => {
    const profile = onboarded();
    const drafts = edits(profile).filter((d) => d.name !== 'Poppy');
    const out = applyEditedChildren(profile, drafts, owned(profile), NOW);
    expect(out.members.map((m) => m.name)).toEqual(['Mia']);
    expect(out.routines).toEqual([]);
  });

  it('changing a date of birth re-derives the age and drops answers the new age does not allow', () => {
    const profile = onboarded();
    const drafts = edits(profile).map((d) =>
      d.name === 'Poppy' ? { ...d, day: '15', month: '6', year: '2018' } : d,
    );
    const out = applyEditedChildren(profile, drafts, owned(profile), NOW);
    const poppy = out.members.find((m) => m.name === 'Poppy')!;
    expect(poppy).toMatchObject({ dateOfBirth: '2018-06-15', age: 8, ageMonths: null, dobKnown: true });
    expect(poppy.mobility).toEqual(['buggy']);
    expect(out.routines.some((r) => r.childId === poppy.id)).toBe(false);
  });

  it('adds a new child with a real date and a fresh id', () => {
    const profile = onboarded();
    const fresh: EditChild = { ...blankChild(), name: 'Theo', day: '1', month: '3', year: '2024', legacy: null, mobility: ['walks'] };
    const out = applyEditedChildren(profile, [...edits(profile), fresh], owned(profile), NOW);
    const theo = out.members.find((m) => m.name === 'Theo')!;
    expect(theo).toMatchObject({ role: 'child', dobKnown: true, age: 2 });
    expect(out.members.filter((m) => m.id === theo.id)).toHaveLength(1);
  });

  it('ignores a new child with no usable date rather than inventing one', () => {
    const profile = onboarded();
    const fresh: EditChild = { ...blankChild(), name: 'Zed', day: '31', month: '2', year: '2024', legacy: null };
    const out = applyEditedChildren(profile, [...edits(profile), fresh], owned(profile), NOW);
    expect(out.members.some((m) => m.name === 'Zed')).toBe(false);
  });
});

describe('a legacy child is never given a birthday', () => {
  const legacy = () =>
    withDerivedAges(
      migrateLegacyProfile({
        id: 'p', parentName: 'Sam', homeLocation: 'Bushey', budgetTier: 'moderate', maxDriveMinutes: 30,
        members: [
          { id: 'k1', name: 'Rosie', role: 'child', age: 6, dateOfBirth: '2020-01-01' },
          { id: 'k2', name: 'Baby', role: 'child', age: 0, ageMonths: 5, dateOfBirth: '2026-01-01' },
        ],
        routines: [{ id: 'r1', label: 'Nap', kind: 'nap', time: '13:00', durationMinutes: 60, atHome: true }],
      }).profile,
      NOW,
    );

  it('opens with an empty date and the saved age kept', () => {
    const profile = legacy();
    const [rosie, baby] = edits(profile);
    expect(rosie.legacy).toEqual({ age: 6, ageMonths: null });
    expect(baby.legacy).toEqual({ age: 0, ageMonths: 5 });
    expect([rosie.day, rosie.month, rosie.year]).toEqual(['', '', '']);
  });

  it('saves with the date left empty: age and dobKnown:false unchanged, no date invented', () => {
    const profile = legacy();
    const out = applyEditedChildren(profile, edits(profile), owned(profile), NOW);
    expect(out.members[0]).toMatchObject({ age: 6, dobKnown: false });
    expect(out.members[1]).toMatchObject({ age: 0, ageMonths: 5, dobKnown: false });
    expect(out.members[0].dateOfBirth).toBe(profile.members.find((m) => m.id === 'k1')!.dateOfBirth);
  });

  it('entering the real date makes it known and derives the age from it', () => {
    const profile = legacy();
    const drafts = edits(profile).map((d) => (d.id === 'k1' ? { ...d, day: '10', month: '9', year: '2019' } : d));
    const out = applyEditedChildren(profile, drafts, owned(profile), NOW);
    expect(out.members[0]).toMatchObject({ dateOfBirth: '2019-09-10', dobKnown: true, age: 6 });
    expect(out.members[1].dobKnown).toBe(false);
  });

  it('unowned legacy routines are kept exactly, never assigned to a child on a guess', () => {
    const profile = legacy();
    const out = applyEditedChildren(profile, edits(profile), owned(profile), NOW);
    expect(out.routines).toEqual(profile.routines);
    expect(out.routines[0].childId).toBeUndefined();
  });

  it('a legacy child may leave the date empty; a half-typed date or a known child’s empty date may not', () => {
    const profile = legacy();
    const [rosie] = edits(profile);
    expect(editChildProblem(rosie, NOW)).toBeNull();
    expect(editChildProblem({ ...rosie, day: '5' }, NOW)).toBe('Add the day, month and year');
    expect(editChildProblem({ ...rosie, name: '' }, NOW)).toBe('Please add a name');
    const known = edits(onboarded())[0];
    expect(editChildProblem({ ...known, day: '', month: '', year: '' }, NOW)).toBe('Add a date of birth');
    expect(editChildProblem({ ...known, day: '31', month: '2', year: '2024' }, NOW)).toBe('That date doesn’t look right');
    expect(editChildProblem(known, NOW)).toBeNull();
  });
});
