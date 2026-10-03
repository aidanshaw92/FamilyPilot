import { FamilyProfile } from '@/src/types';

/**
 * What "Will this work today?" says before the planner has a family to check.
 *
 * The planner reads its own list of families (seeded when Plans is first opened), not the profile, so
 * right after onboarding it has none. Telling a parent who has just entered their naps and feeds to
 * "add your routine in Plans" contradicts the leave-by line printed a few rows above, so when the
 * profile already holds routines the copy says they are saved and where to run the check. No check is
 * run from here: that would be a journey request per venue view the parent never asked for.
 */
export function noFamiliesCopy(profile: Pick<FamilyProfile, 'routines'> | null | undefined): {
  message: string;
  button: string;
} {
  if ((profile?.routines?.length ?? 0) > 0) {
    return {
      message: 'Your nap and feed times are saved. Open Plans to check whether a visit fits around them.',
      button: 'Check in Plans',
    };
  }
  return {
    message: 'Add your family’s nap and feed routine in Plans to check whether a visit fits around it right now.',
    button: 'Set up routines in Plans',
  };
}
