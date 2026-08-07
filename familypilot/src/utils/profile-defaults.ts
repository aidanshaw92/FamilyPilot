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
  };
}

export function createChildMember(name: string, age: number): FamilyMember {
  const birthYear = new Date().getFullYear() - age;
  return {
    id: `child-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    role: 'child',
    dateOfBirth: `${birthYear}-01-01`,
    age,
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

export function formatChildAge(age: number): string {
  return age === 1 ? '1 year old' : `${age} years old`;
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
