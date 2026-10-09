import { FacilityType, FamilyProfile } from '@/src/types';

const FACILITY_NAMES: Partial<Record<FacilityType, string>> = {
  toilets: 'toilets',
  baby_changing: 'baby changing',
  parking: 'parking',
  blue_badge_parking: 'Blue Badge parking',
  pushchair_friendly: 'pushchair access',
};

/**
 * Flags a must-have the family said they always need but this venue doesn't confirm — only when
 * the venue's facilities are actually known, so a not-yet-reviewed venue isn't wrongly read as
 * missing something nobody has checked yet.
 */
export function buildFacilityMissingCaution(
  profile: FamilyProfile,
  facilities?: FacilityType[],
): string | null {
  const mustHaves = profile.mustHaveFacilities ?? [];
  if (!mustHaves.length || !facilities?.length) return null;

  // A venue's facility list has no way to say "Blue Badge bays": its absence from the list is not a finding. That need is judged
  // from its own claim (access-concepts.ts), by Venue Detail and the planner.
  const missing = mustHaves.filter((facility) => facility !== 'blue_badge_parking' && !facilities.includes(facility));
  if (!missing.length) return null;

  const label = missing.map((facility) => FACILITY_NAMES[facility] ?? facility).join(' and ');
  return `Missing ${label}, which you said your family needs`;
}

/**
 * The same caution, for a must-have the venue is CONFIRMED not to have. A facility nobody has confirmed is not missing, it is
 * unchecked (Family Fit lists it under "To check"), so it is not cautioned here. Used by the evidence-aware policy; the
 * current policy keeps `buildFacilityMissingCaution`.
 */
export function buildConfirmedMissingCaution(
  profile: FamilyProfile,
  confirmedAbsent: ReadonlyArray<FacilityType>,
): string | null {
  const missing = (profile.mustHaveFacilities ?? []).filter((facility) => confirmedAbsent.includes(facility));
  if (!missing.length) return null;
  const label = missing.map((facility) => FACILITY_NAMES[facility] ?? facility).join(' and ');
  return `Missing ${label}, which you said your family needs`;
}
