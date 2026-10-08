import { FamilyProfile } from '@/src/types';
import { childrenNeedingBirthday } from './child-age';

export interface ProfileSuggestion {
  message: string;
  field: keyof FamilyProfile | 'children';
}

/**
 * How much of what recommendations NEED is filled in: a name, a home area, a child, and every child's real date of birth.
 * A travel limit, a budget, a car and memberships are optional preferences and are never part of "complete": a profile
 * that has not stated them is not unfinished, and counting them handed every new profile a quarter of the bar for values
 * the app had made up.
 */
export function computeCompletionPercent(profile: FamilyProfile): number {
  const hasChild = profile.members.some((m) => m.role === 'child');
  const checks = [
    Boolean(profile.parentName.trim()),
    Boolean(profile.homeLocation.trim()),
    hasChild,
    // Every child's date of birth is real, so their ages stay current.
    hasChild && childrenNeedingBirthday(profile).length === 0,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

/**
 * The one thing worth nudging a parent about: a child whose age is frozen until the real date is known. Nothing here
 * promotes a feature that is hidden or not built (car fit, pushchair make for "packing tips", memberships for "savings"):
 * those fields stay in Edit profile for whoever wants them, and are never asked for.
 */
export function getProfileSuggestion(profile: FamilyProfile): ProfileSuggestion | null {
  const needsBirthday = childrenNeedingBirthday(profile)[0];
  if (needsBirthday) {
    const name = needsBirthday.name.trim();
    return {
      message: name ? `Add ${name}’s birthday so ${name}’s age stays up to date` : 'Add your child’s birthday so their age stays up to date',
      field: 'children',
    };
  }
  return null;
}
