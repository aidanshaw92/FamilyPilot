import { FacilityType, FamilyProfile } from '@/src/types';
import { resolveHomeCoordinates } from '@/src/services/places/geo-utils';

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
  profile: FamilyProfile,
  id = 'mine',
): PlanningFamily | UnresolvedPartyReason {
  if ((profile.members?.length ?? 0) === 0) return 'not-described';
  const home = homeOf(profile);
  if (!home) return 'no-location';
  const driveLimit = Number(profile.maxDriveMinutes);
  if (!Number.isFinite(driveLimit) || driveLimit <= 0) return 'not-described';

  return {
    id,
    label: 'Our family',
    area: profile.homeLocation,
    latitude: home.latitude,
    longitude: home.longitude,
    ages: (profile.members ?? []).filter((m) => m.role === 'child').map((m) => m.age),
    maxDriveMinutes: driveLimit,
    budgetTier: profile.budgetTier,
    pushchair: Boolean(profile.pushchair),
    required: plannerRequirements(profile.mustHaveFacilities),
    // Copied, so editing a plan can never reach back into the stored profile.
    routines: (profile.routines ?? []).map((routine) => ({ ...routine })),
  };
}

/** Whether the planner could actually measure a day for this household. */
export const canPlanFor = (family: PlanningFamily): boolean =>
  Number.isFinite(family.latitude) &&
  Number.isFinite(family.longitude) &&
  Number.isFinite(family.maxDriveMinutes) &&
  family.maxDriveMinutes > 0;

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
      const derived = planningFamilyFromProfile(sources.profile);
      if (typeof derived === 'string') unresolved.push({ id, reason: derived });
      else families.push(derived);
      continue;
    }

    unresolved.push({ id, reason: 'not-described' });
  }

  return { families, unresolved };
}
