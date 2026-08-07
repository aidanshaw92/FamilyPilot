import { ExternalPlaceRecord, StructuredOpeningHours, VenueFamilyMetadata } from '@/src/types/places';
import { EnrichmentStatus, TrustMetadata, Venue, VenueDetail } from '@/src/types';

import { deriveEnrichmentStatus } from '@/src/utils/places-enrichment';
import { estimateDriveMinutes } from './geo-utils';

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
  return deriveEnrichmentStatus(metadata);
}

function buildTrust(
  place: ExternalPlaceRecord,
  metadata: VenueFamilyMetadata | null,
  enrichmentStatus: EnrichmentStatus,
): TrustMetadata {
  return {
    source: enrichmentStatus === 'provider_only' ? 'estimated' : 'provider',
    lastChecked: place.fetchedAt.slice(0, 10),
  };
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
    estimatedSpend: metadata?.estimatedSpend,
    isOpen: place.isOpen,
    address: place.address,
    goodToKnow: metadata?.goodToKnow,
    facilities: metadata?.facilities,
    trust: buildTrust(place, metadata, enrichmentStatus),
    enrichmentStatus,
  };
}

export function mergePlaceToVenueDetail(
  place: ExternalPlaceRecord,
  metadata: VenueFamilyMetadata | null,
  homeLat: number,
  homeLng: number,
): VenueDetail {
  const base = mergePlaceToVenue(place, metadata, homeLat, homeLng);
  const isProviderOnly = base.enrichmentStatus === 'provider_only';

  return {
    ...base,
    photos: place.photos.length > 0 ? place.photos : base.imageUrl ? [base.imageUrl] : [],
    facilities: metadata?.facilities ?? [],
    openingHours: formatOpeningHours(place.openingHours),
    terrain: metadata?.terrain ?? (isProviderOnly ? undefined : 'mixed'),
    bestAges: metadata?.bestAges,
    parkingInfo: metadata?.parkingInfo,
    description:
      metadata?.familyNotes ??
      place.description ??
      (isProviderOnly
        ? `${place.name} — live place data from ${place.provider === 'osm' ? 'OpenStreetMap' : 'Google'}. Family suitability has not yet been reviewed.`
        : `${place.name} — details from ${place.provider === 'osm' ? 'OpenStreetMap' : place.provider}.`),
    visitDurationMinutes: metadata?.visitDurationMinutes,
    warnings: metadata?.warnings,
    goodToKnow: metadata?.goodToKnow,
    communityTips: metadata?.communityTips,
    trust: buildTrust(place, metadata, base.enrichmentStatus ?? 'provider_only'),
  };
}
