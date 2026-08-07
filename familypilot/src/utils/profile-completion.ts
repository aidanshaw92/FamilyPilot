import { FamilyProfile } from '@/src/types';

export interface ProfileCompletionHint {
  label: string;
  field: keyof FamilyProfile | 'children';
}

export function computeCompletionPercent(profile: FamilyProfile): number {
  const checks = [
    Boolean(profile.parentName.trim()),
    Boolean(profile.homeLocation.trim()),
    profile.members.some((m) => m.role === 'child'),
    profile.maxDriveMinutes > 0,
    Boolean(profile.budgetTier),
    Boolean(profile.vehicle?.trim()),
    Boolean(profile.pushchair?.trim()),
    (profile.memberships?.length ?? 0) > 0,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

export function getNextCompletionHint(profile: FamilyProfile): ProfileCompletionHint | null {
  if (!profile.parentName.trim()) {
    return { label: 'Add your name', field: 'parentName' };
  }
  if (!profile.homeLocation.trim()) {
    return { label: 'Add your home area', field: 'homeLocation' };
  }
  if (!profile.members.some((m) => m.role === 'child')) {
    return { label: 'Add your children', field: 'children' };
  }
  if (!profile.vehicle?.trim()) {
    return { label: 'Add your car to unlock Car Fit', field: 'vehicle' };
  }
  if (!profile.pushchair?.trim()) {
    return { label: 'Add your pushchair for better packing tips', field: 'pushchair' };
  }
  if ((profile.memberships?.length ?? 0) === 0) {
    return { label: 'Link a membership for savings', field: 'memberships' };
  }
  return null;
}
