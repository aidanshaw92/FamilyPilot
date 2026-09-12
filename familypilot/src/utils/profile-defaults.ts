import { FamilyMember, FamilyProfile } from '@/src/types';

import { computeCompletionPercent } from './profile-completion';

export function createEmptyProfile(): FamilyProfile {
  return {
    id: `family-${Date.now()}`,
    parentName: '',
    members: [],
    homeLocation: '',
    budgetTier: 'moderate',
    maxDriveMinutes: 30,
    completionPercent: 0,
    vehicle: null,
    pushchair: null,
    travelCot: null,
    memberships: [],
    routines: [],
  };
}

/**
 * ageMonths gives precise DOB for a baby under 1 (age === 0) rather than always Jan 1st, and is
 * kept on the member so the UI can show "8 months old" instead of the much cruder "0 years old".
 * For age >= 1 we don't know the birth month, so DOB stays the 1 Jan approximation.
 */
export function createChildMember(name: string, age: number, ageMonths?: number | null): FamilyMember {
  const preciseMonths = age === 0 && ageMonths != null ? ageMonths : null;
  const today = new Date();
  const dateOfBirth =
    preciseMonths != null
      ? new Date(today.getFullYear(), today.getMonth() - preciseMonths, 1).toISOString().slice(0, 10)
      : `${today.getFullYear() - age}-01-01`;

  return {
    id: `child-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    role: 'child',
    dateOfBirth,
    age,
    ageMonths: preciseMonths,
  };
}

export function createParentMember(name: string): FamilyMember {
  return {
    id: `parent-${Date.now()}`,
    name: name.trim(),
    role: 'parent',
    dateOfBirth: '1990-01-01',
    age: 30,
  };
}

export function withCompletion(profile: FamilyProfile): FamilyProfile {
  return {
    ...profile,
    completionPercent: computeCompletionPercent(profile),
  };
}

export function formatChildAge(member: Pick<FamilyMember, 'age' | 'ageMonths'>): string {
  if (member.age === 0 && member.ageMonths != null) {
    return member.ageMonths === 1 ? '1 month old' : `${member.ageMonths} months old`;
  }
  return member.age === 1 ? '1 year old' : `${member.age} years old`;
}

export function formatBudgetTier(tier: FamilyProfile['budgetTier']): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export function getChildNames(profile: FamilyProfile): string {
  const children = profile.members.filter((m) => m.role === 'child');
  if (children.length === 0) return 'your children';
  if (children.length === 1) return children[0].name;
  if (children.length === 2) return `${children[0].name} & ${children[1].name}`;
  return `${children.slice(0, -1).map((c) => c.name).join(', ')} & ${children[children.length - 1].name}`;
}
