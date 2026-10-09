import type { Venue } from '@/src/types';
import { activeFitPolicy, type FitPolicy } from '@/src/services/scoring/fit-policy';
import { compareTravelMinutes } from '@/src/utils/travel-time';

/**
 * The one order every list of recommendations uses (Home, Explore search, Meet Halfway candidates).
 *
 * Today: Family Fit score, then the nearer. Under the proposed policy, a venue with a confirmed incompatibility against a
 * non-negotiable of this household (`fitConflicts`, the planner's own answer) comes after every venue without one. Within
 * each group the order is unchanged. Weights and factor formulas are not touched here.
 */
/** Whether a confirmed incompatibility with this household's non-negotiables is on record for the venue. */
export const hasFitConflict = (venue: Venue): boolean => (venue.fitConflicts?.length ?? 0) > 0;

export function compareVenuesForFamily(a: Venue, b: Venue, policy: FitPolicy = activeFitPolicy()): number {
  if (policy.conflictsLast) {
    const diff = Number(hasFitConflict(a)) - Number(hasFitConflict(b));
    if (diff !== 0) return diff;
  }
  return b.familyScore.score - a.familyScore.score || compareTravelMinutes(a.driveMinutes, b.driveMinutes);
}
