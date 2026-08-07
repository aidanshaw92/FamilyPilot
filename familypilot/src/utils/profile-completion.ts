import { FamilyProfile } from '@/src/types';

export interface ProfileSuggestion {
  message: string;
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

export function getProfileSuggestion(profile: FamilyProfile): ProfileSuggestion | null {
  if (!profile.vehicle?.trim()) {
    return { message: 'Add your car to improve Car Fit recommendations', field: 'vehicle' };
  }
  if (!profile.pushchair?.trim()) {
    return { message: 'Add your pushchair for better packing and travel tips', field: 'pushchair' };
  }
  if ((profile.memberships?.length ?? 0) === 0) {
    return { message: 'Link a membership to surface savings opportunities', field: 'memberships' };
  }
  return null;
}
