import { mockVenueDetails } from '@/src/data/mock-data';
import { FamilyMetadataField, FieldProvenance, VenueFamilyMetadata } from '@/src/types/places';

const FP_SOURCE: FieldProvenance = {
  source: 'familypilot',
  updatedAt: '2026-08-01T00:00:00.000Z',
  reliability: 'familypilot',
  label: 'FamilyPilot editorial',
};

function metaForVenue(venueId: string): VenueFamilyMetadata | null {
  const detail = mockVenueDetails[venueId];
  if (!detail) return null;

  const provenance: Partial<Record<FamilyMetadataField, FieldProvenance>> = {
    bestAges: FP_SOURCE,
    terrain: FP_SOURCE,
    facilities: FP_SOURCE,
    parkingInfo: FP_SOURCE,
    visitDurationMinutes: FP_SOURCE,
    goodToKnow: FP_SOURCE,
    warnings: detail.warnings?.length ? FP_SOURCE : undefined,
    communityTips: detail.communityTips?.length ? { ...FP_SOURCE, reliability: 'community' } : undefined,
    estimatedSpend: detail.estimatedSpend ? { ...FP_SOURCE, reliability: 'estimated' } : undefined,
  };

  return {
    familypilotPlaceId: venueId,
    bestAges: detail.bestAges,
    terrain: detail.terrain,
    facilities: detail.facilities,
    parkingInfo: detail.parkingInfo,
    visitDurationMinutes: detail.visitDurationMinutes,
    warnings: detail.warnings,
    goodToKnow: detail.goodToKnow,
    communityTips: detail.communityTips,
    estimatedSpend: detail.estimatedSpend,
    pushchairAccess: detail.facilities.includes('pushchair_friendly') ? 'confirmed' : 'not_confirmed',
    babyChanging: detail.facilities.includes('baby_changing') ? 'confirmed' : 'not_confirmed',
    provenance,
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

/** FamilyPilot-owned metadata keyed by canonical place ID — separate from provider cache. */
export const familyPlaceMetadata: Record<string, VenueFamilyMetadata> = Object.fromEntries(
  Object.keys(mockVenueDetails)
    .map((id) => [id, metaForVenue(id)] as const)
    .filter((entry): entry is [string, VenueFamilyMetadata] => entry[1] !== null),
);

export function getFamilyPlaceMetadata(familypilotPlaceId: string): VenueFamilyMetadata | null {
  return familyPlaceMetadata[familypilotPlaceId] ?? null;
}
