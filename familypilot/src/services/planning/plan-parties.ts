import { FacilityType, FamilyProfile } from '@/src/types';
import { familyNeedsStepFree, familyUsesBuggy } from '@/src/utils/family-mobility';
import { budgetTierOf, driveLimitMinutes } from '@/src/utils/preferences';
import { routinesForPlanner } from '@/src/utils/routine-schedule';
import { resolveHomeCoordinates } from '@/src/services/places/geo-utils';

import { profileForAttendees } from '@/src/utils/household';

import { PlanningFamily } from './planner';

/**
 * Turns the households a parent chose in the Create a Plan sheet into what the planner needs.
 *
 * The sheet deals in `PlanParty` -- a label and a count -- because that is all a parent reads. The
 * planner needs somewhere each family leaves from, how far they will drive, which children are
 * coming and which routines have to happen at home. This is the one place that bridges the two, so
 * no screen hand-rolls it and they cannot drift apart.
 *
 * Pure: no stores, no clock, no geocoding request. What is known is passed in.
 */

export interface PlanPartySources {
  /** The signed-in household. */
  profile?: FamilyProfile | null;
  /** Households already described for planning, including ones added on this device. */
  planningFamilies?: PlanningFamily[];
  /**
   * Which members of the signed-in household are coming. `null`/absent is everyone. Anybody left out contributes
   * no age, no buggy, no nap and no feed to the day, because they are not there.
   */
  attendeeIds?: readonly string[] | null;
}

export type UnresolvedPartyReason =
  /** Nothing describes this household at all. */
  | 'not-described'
  /** Described, but with nowhere to leave from, so no journey could be measured. */
  | 'no-location';

export interface UnresolvedParty {
  id: string;
  reason: UnresolvedPartyReason;
}

export interface ResolvedPlanParties {
  /** In the order they were chosen. */
  families: PlanningFamily[];
  /**
   * Chosen households nothing could be built for.
   *
   * Reported rather than dropped: a day quietly planned for one family when the parent chose two is
   * a wrong answer that looks like a right one.
   */
  unresolved: UnresolvedParty[];
}

/**
 * The profile's must-haves, as planner requirements.
 *
 * Only the four the matcher can actually gate on appear. A must-have with no matching constraint is
 * left out rather than approximated: inventing a gate would fail days closed for a facility the
 * planner has no evidence rule for, and silently widening what "required" means is worse than
 * honouring only what we can check.
 */
const REQUIRED_BY_FACILITY: Partial<Record<FacilityType, PlanningFamily['required'][number]>> = {
  toilets: 'toilets',
  baby_changing: 'babyChanging',
  parking: 'parking',
  pushchair_friendly: 'pushchair',
};

export function plannerRequirements(mustHave: FacilityType[] | undefined): PlanningFamily['required'] {
  const required: PlanningFamily['required'] = [];
  for (const facility of mustHave ?? []) {
    const mapped = REQUIRED_BY_FACILITY[facility];
    if (mapped && !required.includes(mapped)) required.push(mapped);
  }
  return required;
}

/**
 * The household's own home, or nothing.
 *
 * A stored centroid is used as it stands. Otherwise the entered area is resolved, which is the same
 * thing every other surface already does for this family. An empty home location resolves to
 * nothing at all rather than to a default: a plan built from a place the family never named would
 * tell them to leave home at a time derived from somebody else's address.
 */
function homeOf(profile: FamilyProfile): { latitude: number; longitude: number } | null {
  if (Number.isFinite(profile.homeLatitude) && Number.isFinite(profile.homeLongitude)) {
    return { latitude: profile.homeLatitude as number, longitude: profile.homeLongitude as number };
  }
  if (!profile.homeLocation?.trim()) return null;
  return resolveHomeCoordinates(profile);
}

/** The signed-in household as a planning family, or why it could not be one. */
export function planningFamilyFromProfile(
  fullProfile: FamilyProfile,
  id = 'mine',
  attendeeIds?: readonly string[] | null,
): PlanningFamily | UnresolvedPartyReason {
  if ((fullProfile.members?.length ?? 0) === 0) return 'not-described';
  // Only the people coming. Everything below (ages, buggy, routines) then describes exactly who is there.
  const profile = profileForAttendees(fullProfile, attendeeIds);
  if ((profile.members?.length ?? 0) === 0) return 'not-described';
  const home = homeOf(profile);
  if (!home) return 'no-location';
  // A plan needs a place to start from and people to plan for. It does not need a travel limit: only a stated one applies.
  const driveLimit = driveLimitMinutes(profile);

  return {
    id,
    label: 'Our family',
    area: profile.homeLocation,
    latitude: home.latitude,
    longitude: home.longitude,
    ages: (profile.members ?? []).filter((m) => m.role === 'child').map((m) => m.age),
    ...(driveLimit !== null ? { maxDriveMinutes: driveLimit } : {}),
    ...(budgetTierOf(profile) ? { budgetTier: budgetTierOf(profile)! } : {}),
    pushchair: familyUsesBuggy(profile),
    ...(familyNeedsStepFree(profile) ? { stepFree: true } : {}),
    required: plannerRequirements(profile.mustHaveFacilities),
    // Copied, so editing a plan can never reach back into the stored profile, and stripped of the
    // child's name and id: this model can be backed up to an account, the profile cannot.
    routines: routinesForPlanner(profile),
  };
}

/** Whether the planner could actually measure a day for this household. */
export const canPlanFor = (family: PlanningFamily): boolean =>
  Number.isFinite(family.latitude) &&
  Number.isFinite(family.longitude);

export function resolvePlanParties(
  partyIds: string[],
  sources: PlanPartySources,
): ResolvedPlanParties {
  const families: PlanningFamily[] = [];
  const unresolved: UnresolvedParty[] = [];
  const seen = new Set<string>();

  for (const id of partyIds) {
    if (seen.has(id)) continue;
    seen.add(id);

    // A household the parent described explicitly wins over anything derived: they entered it for
    // this purpose, and it may differ from the profile on purpose.
    const stored = (sources.planningFamilies ?? []).find((family) => family.id === id);
    if (stored) {
      if (canPlanFor(stored)) families.push(stored);
      else unresolved.push({ id, reason: 'no-location' });
      continue;
    }

    if (id === 'mine' && sources.profile) {
      const derived = planningFamilyFromProfile(sources.profile, 'mine', sources.attendeeIds);
      if (typeof derived === 'string') unresolved.push({ id, reason: derived });
      else families.push(derived);
      continue;
    }

    unresolved.push({ id, reason: 'not-described' });
  }

  return { families, unresolved };
}
