import { ExternalPlaceRecord, StructuredOpeningHours, VenueFamilyMetadata } from '@/src/types/places';
import { TrustMetadata, Venue, VenueDetail } from '@/src/types';

import { estimateDriveMinutes } from './geo-utils';

function formatOpeningHours(hours?: StructuredOpeningHours): string {
  if (!hours) return 'Opening hours not confirmed';
  if (hours.weekdayText?.length) {
    return `${hours.weekdayText[0]} · Hours from ${hours.source === 'osm' ? 'OpenStreetMap' : hours.source}`;
  }
  return `Opening hours from ${hours.source}`;
}

function buildTrust(place: ExternalPlaceRecord, metadata: VenueFamilyMetadata | null): TrustMetadata {
  const nameProv = place.provenance.name;
  const hoursProv = place.provenance.openingHours;
  return {
    source: nameProv?.reliability === 'provider' ? 'provider' : 'estimated',
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
    trust: buildTrust(place, metadata),
  };
}

export function mergePlaceToVenueDetail(
  place: ExternalPlaceRecord,
  metadata: VenueFamilyMetadata | null,
  homeLat: number,
  homeLng: number,
): VenueDetail {
  const base = mergePlaceToVenue(place, metadata, homeLat, homeLng);

  return {
    ...base,
    photos: place.photos.length > 0 ? place.photos : [base.imageUrl],
    facilities: metadata?.facilities ?? [],
    openingHours: formatOpeningHours(place.openingHours),
    terrain: metadata?.terrain ?? 'mixed',
    bestAges: metadata?.bestAges ?? 'All ages',
    parkingInfo: metadata?.parkingInfo ?? 'Parking information not confirmed',
    description:
      metadata?.familyNotes ??
      place.description ??
      `${place.name} — details from ${place.provider === 'osm' ? 'OpenStreetMap' : place.provider}. Family suitability from FamilyPilot.`,
    visitDurationMinutes: metadata?.visitDurationMinutes,
    warnings: metadata?.warnings,
    goodToKnow: metadata?.goodToKnow,
    communityTips: metadata?.communityTips,
    trust: buildTrust(place, metadata),
  };
}
