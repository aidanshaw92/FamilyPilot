import { FacilityType, FamilyProfile } from '@/src/types';

const FACILITY_NAMES: Partial<Record<FacilityType, string>> = {
  toilets: 'toilets',
  baby_changing: 'baby changing',
  parking: 'parking',
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

  const missing = mustHaves.filter((facility) => !facilities.includes(facility));
  if (!missing.length) return null;

  const label = missing.map((facility) => FACILITY_NAMES[facility] ?? facility).join(' and ');
  return `Missing ${label}, which you said your family needs`;
}
