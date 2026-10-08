import type { FamilyProfile } from '@/src/types';
import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';
import { familyRequest } from '@/src/services/planning/planner';
import { planningFamilyFromProfile } from '@/src/services/planning/plan-parties';
import type { MatchableVenueFacts } from '@/src/types/day-request';

/**
 * A confirmed incompatibility between a venue and something this household cannot do without.
 *
 * ONE DEFINITION, borrowed, not copied. The planner decides whether a family can go by asking `matchVenueToDayRequest`, and a
 * required constraint that is confirmed to FAIL refuses the day. This asks the same question of the same function for the
 * same household, so Home, Explore and Venue Detail cannot call a place "strongly recommended" that Create a Plan would
 * refuse for the family's own non-negotiables. What it deliberately leaves out:
 *
 *   - an UNKNOWN: nobody has confirmed anything, so nothing is claimed against the venue (the planner carries it as "check");
 *   - the drive: it is already scored (distance) and cautioned, and a limit is a preference of the day rather than a fact
 *     about the place;
 *   - the date: Family Fit is about the family and the place, so a closure on one date is shown beside it ("Closed today")
 *     and enforced by the planner for the date chosen, never used to rank.
 */
export interface HardConflict {
  /** The constraint that failed, in the matcher's vocabulary (`familyFacilities.toilets`, `ageAdmission`, `venueRules`, …). */
  field: string;
  /** The venue's own words, where there are some (a rule's sentence). */
  detail?: string;
}

export function hardConflictsFor(
  facts: MatchableVenueFacts | null | undefined,
  profile: FamilyProfile,
): HardConflict[] {
  if (!facts) return [];
  const family = planningFamilyFromProfile(profile);
  if (typeof family === 'string') return [];
  // The planner's own request for this household, with the journey taken out: distance is scored, not a fact about the venue.
  const request = familyRequest({ ...family, maxDriveMinutes: undefined }, 'either');
  const match = matchVenueToDayRequest(facts, request);
  return match.evaluations
    .filter((e) => e.strength === 'required' && e.outcome === 'unsuitable' && e.field !== 'journey')
    .map((e) => ({ field: e.field, ...(e.detail ? { detail: e.detail } : {}) }));
}
