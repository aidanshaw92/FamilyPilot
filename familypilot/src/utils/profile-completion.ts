import { FamilyProfile } from '@/src/types';
import { isPilotFeatureVisible } from '@/src/config/pilot-features';
import { childrenNeedingBirthday } from './child-age';
import { familyUsesBuggy } from './family-mobility';

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
    // Every child's date of birth is real, so their ages stay current.
    profile.members.some((m) => m.role === 'child') && childrenNeedingBirthday(profile).length === 0,
    (profile.memberships?.length ?? 0) > 0,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

export function getProfileSuggestion(profile: FamilyProfile): ProfileSuggestion | null {
  // Never nudge a parent toward a feature that's hidden in this build — Car Fit is gated off
  // by default, and following this suggestion would lead to a dead end.
  // Ahead of everything else: a legacy child's age is frozen until the real date is known.
  const needsBirthday = childrenNeedingBirthday(profile)[0];
  if (needsBirthday) {
    const name = needsBirthday.name.trim();
    return {
      message: name ? `Add ${name}’s birthday so ${name}’s age stays up to date` : 'Add your child’s birthday so their age stays up to date',
      field: 'children',
    };
  }
  if (!profile.vehicle?.trim() && isPilotFeatureVisible('car_fit')) {
    return { message: 'Add your car to improve Car Fit recommendations', field: 'vehicle' };
  }
  // Only a family that actually uses a buggy has a use for its make: the product name feeds packing
  // and travel tips, so asking a family without one is a dead end.
  if (familyUsesBuggy(profile) && !profile.pushchair?.trim()) {
    return { message: 'Add your pushchair for better packing and travel tips', field: 'pushchair' };
  }
  if ((profile.memberships?.length ?? 0) === 0) {
    return { message: 'Link a membership to surface savings opportunities', field: 'memberships' };
  }
  return null;
}
