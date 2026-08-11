import { EnrichmentStatus } from '@/src/types';
import { TriState, VenueEnergyLevel, VenueEnvironment } from '@/src/types/enrichment';
import { VenueFamilyMetadata } from '@/src/types/places';

import { MatchableVenueFacts } from '@/src/types/day-request';
import { isUnreviewedEnrichmentStatus } from '@/src/utils/enrichment-rules';

const UNKNOWN_TRI: TriState | 'unknown' = 'unknown';
const UNKNOWN_ENV: VenueEnvironment = 'unknown';
const UNKNOWN_ENERGY: VenueEnergyLevel = 'unknown';

function triStateOrUnknown(value?: TriState): TriState | 'unknown' {
  if (value === 'yes' || value === 'no' || value === 'unknown') return value;
  return UNKNOWN_TRI;
}

function environmentOrUnknown(value?: VenueEnvironment): VenueEnvironment {
  if (value === 'indoor' || value === 'outdoor' || value === 'mixed' || value === 'unknown') {
    return value;
  }
  return UNKNOWN_ENV;
}

function energyOrUnknown(value?: VenueEnergyLevel): VenueEnergyLevel {
  if (
    value === 'low' ||
    value === 'moderate' ||
    value === 'high' ||
    value === 'mixed' ||
    value === 'unknown'
  ) {
    return value;
  }
  return UNKNOWN_ENERGY;
}

/**
 * Extract trusted facts from projected metadata only.
 * Never reads category, goodToKnow, or familyNotes for suitability.
 */
export function extractMatchableFacts(
  placeId: string,
  name: string,
  category: string,
  driveMinutes: number,
  enrichmentStatus: EnrichmentStatus | undefined,
  metadata: VenueFamilyMetadata | null,
): MatchableVenueFacts {
  const status = enrichmentStatus ?? metadata?.enrichmentStatus ?? 'provider_only';
  const unreviewed = isUnreviewedEnrichmentStatus(status);

  if (unreviewed || !metadata) {
    return {
      placeId,
      name,
      category,
      driveMinutes,
      enrichmentStatus: status === 'ai_draft' ? 'provider_only' : status,
      minRecommendedAge: null,
      maxRecommendedAge: null,
      toilets: UNKNOWN_TRI,
      babyChanging: UNKNOWN_TRI,
      parking: UNKNOWN_TRI,
      freeParking: UNKNOWN_TRI,
      pushchairSuitability: 'unknown',
      environment: UNKNOWN_ENV,
      energyLevel: UNKNOWN_ENERGY,
      visitDurationMinutes: null,
      estimatedSpend: null,
      goodToKnow: [],
      warnings: [],
    };
  }

  return {
    placeId,
    name,
    category,
    driveMinutes,
    enrichmentStatus: status === 'verified' ? 'verified' : 'enriched',
    minRecommendedAge: metadata.minRecommendedAge ?? null,
    maxRecommendedAge: metadata.maxRecommendedAge ?? null,
    toilets: triStateOrUnknown(metadata.familyFacilities?.toilets),
    babyChanging: triStateOrUnknown(metadata.familyFacilities?.babyChanging),
    parking: triStateOrUnknown(metadata.familyFacilities?.parking),
    freeParking: triStateOrUnknown(metadata.familyFacilities?.freeParking),
    pushchairSuitability: metadata.pushchairSuitability ?? 'unknown',
    environment: environmentOrUnknown(metadata.environment),
    energyLevel: energyOrUnknown(metadata.energyLevel),
    visitDurationMinutes: metadata.visitDurationMinutes ?? null,
    estimatedSpend: metadata.estimatedSpend ?? null,
    goodToKnow: metadata.goodToKnow ?? [],
    warnings: metadata.warnings ?? [],
  };
}
