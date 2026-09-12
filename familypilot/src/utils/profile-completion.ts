import { FamilyProfile } from '@/src/types';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';

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
  // Never nudge a parent toward a feature that's hidden in this build — Car Fit is gated off
  // by default, and following this suggestion would lead to a dead end.
  if (!profile.vehicle?.trim() && isPilotFeatureVisible('car_fit')) {
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
