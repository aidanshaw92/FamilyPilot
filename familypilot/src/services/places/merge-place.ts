import { ExternalPlaceRecord, StructuredOpeningHours, VenueFamilyMetadata } from '@/src/types/places';
import { EnrichmentStatus, TrustMetadata, Venue, VenueDetail } from '@/src/types';

import { deriveEnrichmentStatusFromRecord, mapExtendedTerrainToLegacy, toConsumerEnrichmentStatus } from '@/src/utils/enrichment-rules';
import { estimateDriveMinutes } from './geo-utils';

function buildBestAgesLabelFromMeta(metadata: VenueFamilyMetadata | null): string | undefined {
  if (!metadata) return undefined;
  if (metadata.bestAges) return metadata.bestAges;
  const min = metadata.minRecommendedAge;
  const max = metadata.maxRecommendedAge;
  if (min != null && max != null) return `${min} – ${max} years`;
  if (min != null) return `${min}+ years`;
  if (max != null) return `Up to ${max} years`;
  return undefined;
}

function formatOpeningHours(hours?: StructuredOpeningHours): string {
  if (!hours) return 'Opening hours not confirmed';
  if (hours.weekdayText?.length) {
    return `${hours.weekdayText[0]} · Hours from ${hours.source === 'osm' ? 'OpenStreetMap' : hours.source}`;
  }
  return `Opening hours from ${hours.source}`;
}

function resolveEnrichmentStatus(
  place: ExternalPlaceRecord,
  metadata: VenueFamilyMetadata | null,
): EnrichmentStatus {
  if (place.enrichmentStatus && place.enrichmentStatus !== 'provider_only') {
    return place.enrichmentStatus;
  }
  return deriveEnrichmentStatusFromRecord(metadata);
}

function buildTrust(
  place: ExternalPlaceRecord,
  metadata: VenueFamilyMetadata | null,
  enrichmentStatus: EnrichmentStatus,
): TrustMetadata {
  const consumerStatus = toConsumerEnrichmentStatus(enrichmentStatus);
  return {
    source: consumerStatus === 'provider_only' ? 'estimated' : 'provider',
    lastChecked: metadata?.lastChecked ?? place.fetchedAt.slice(0, 10),
  };
}

/** ai_draft metadata is internal-only — do not merge family fields into consumer views. */
function consumerMetadata(metadata: VenueFamilyMetadata | null, enrichmentStatus: EnrichmentStatus) {
  if (enrichmentStatus === 'ai_draft') return null;
  return metadata;
}

export function mergePlaceToVenue(
  place: ExternalPlaceRecord,
  metadata: VenueFamilyMetadata | null,
  homeLat: number,
  homeLng: number,
): Venue {
  const driveMinutes = estimateDriveMinutes(homeLat, homeLng, place.latitude, place.longitude);
  const imageUrl = place.photos[0] ?? '';
  const enrichmentStatus = resolveEnrichmentStatus(place, metadata);
  const consumerStatus = toConsumerEnrichmentStatus(enrichmentStatus);
  const trustedMeta = consumerMetadata(metadata, enrichmentStatus);

  return {
    id: place.familypilotId,
    name: place.name,
    category: place.category,
    latitude: place.latitude,
    longitude: place.longitude,
    driveMinutes,
    imageUrl,
    familyScore: {
      score: 0,
      factors: {
        ageSuitability: 0,
        accessibility: 0,
        distance: 0,
        weatherFit: 0,
        budgetFit: 0,
        facilitiesMatch: 0,
        popularity: 0,
      },
      explanation: [],
    },
    estimatedSpend: trustedMeta?.estimatedSpend,
    isOpen: place.isOpen,
    address: place.address,
    goodToKnow: trustedMeta?.goodToKnow,
    facilities: trustedMeta?.facilities,
    trust: buildTrust(place, metadata, enrichmentStatus),
    enrichmentStatus: consumerStatus,
  };
}

export function mergePlaceToVenueDetail(
  place: ExternalPlaceRecord,
  metadata: VenueFamilyMetadata | null,
  homeLat: number,
  homeLng: number,
): VenueDetail {
  const base = mergePlaceToVenue(place, metadata, homeLat, homeLng);
  const rawStatus = resolveEnrichmentStatus(place, metadata);
  const trustedMeta = consumerMetadata(metadata, rawStatus);
  const isProviderOnly = base.enrichmentStatus === 'provider_only';

  return {
    ...base,
    photos: place.photos.length > 0 ? place.photos : base.imageUrl ? [base.imageUrl] : [],
    facilities: trustedMeta?.facilities ?? [],
    openingHours: formatOpeningHours(place.openingHours),
    terrain: trustedMeta?.terrain ?? mapExtendedTerrainToLegacy(trustedMeta?.extendedTerrain),
    bestAges: trustedMeta?.bestAges ?? buildBestAgesLabelFromMeta(trustedMeta),
    parkingInfo: trustedMeta?.parkingInfo,
    description:
      trustedMeta?.familyNotes ??
      place.description ??
      (isProviderOnly
        ? `${place.name} — live place data from ${place.provider === 'osm' ? 'OpenStreetMap' : 'Google'}. Family suitability has not yet been reviewed.`
        : `${place.name} — details from ${place.provider === 'osm' ? 'OpenStreetMap' : place.provider}.`),
    visitDurationMinutes: trustedMeta?.visitDurationMinutes,
    warnings: trustedMeta?.warnings,
    goodToKnow: trustedMeta?.goodToKnow,
    communityTips: trustedMeta?.communityTips,
    trust: buildTrust(place, metadata, rawStatus),
  };
}
