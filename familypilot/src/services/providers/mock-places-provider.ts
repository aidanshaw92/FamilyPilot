import { mockVenueDetails, mockVenues } from '@/src/data/mock-data';
import {
  ExternalPlaceField,
  ExternalPlaceRecord,
  FieldProvenance,
  PlaceSearchParams,
  StructuredOpeningHours,
} from '@/src/types/places';
import { distanceKm } from '@/src/services/places/geo-utils';

import { PlacesProvider } from './places-provider';

const NOW = () => new Date().toISOString();

function providerProvenance(field: ExternalPlaceField): FieldProvenance {
  return {
    source: 'mock',
    updatedAt: NOW(),
    reliability: 'cached',
    label: 'Development mock layer',
  };
}

function toExternalRecord(venueId: string): ExternalPlaceRecord | null {
  const venue = mockVenues.find((v) => v.id === venueId);
  const detail = mockVenueDetails[venueId];
  if (!venue || !detail) return null;

  const openingHours: StructuredOpeningHours = {
    weekdayText: [detail.openingHours.replace(' · Hours from provider', '')],
    source: 'mock',
  };

  return {
    familypilotId: venue.id,
    externalId: `mock:${venue.id}`,
    provider: 'mock',
    name: venue.name,
    latitude: venue.latitude,
    longitude: venue.longitude,
    category: venue.category,
    address: venue.address,
    description: detail.description,
    openingHours,
    photos: detail.photos,
    isOpen: venue.isOpen,
    provenance: {
      name: providerProvenance('name'),
      coordinates: providerProvenance('coordinates'),
      category: providerProvenance('category'),
      address: venue.address ? providerProvenance('address') : undefined,
      description: providerProvenance('description'),
      openingHours: providerProvenance('openingHours'),
      photos: providerProvenance('photos'),
      isOpen: providerProvenance('isOpen'),
    },
    fetchedAt: NOW(),
  };
}

/** Reliable fallback provider — wraps existing mock venue layer. */
export class MockPlacesProvider implements PlacesProvider {
  readonly name = 'mock' as const;

  async searchNearby(params: PlaceSearchParams): Promise<ExternalPlaceRecord[]> {
    return mockVenues
      .map((v) => toExternalRecord(v.id))
      .filter((record): record is ExternalPlaceRecord => record !== null)
      .filter((record) => {
        const km = distanceKm(params.latitude, params.longitude, record.latitude, record.longitude);
        if (km > params.radiusKm) return false;
        if (params.categories?.length && !params.categories.includes(record.category)) return false;
        return true;
      });
  }

  async getPlace(familypilotId: string): Promise<ExternalPlaceRecord | null> {
    return toExternalRecord(familypilotId);
  }

  async getPlaceByExternalId(externalId: string): Promise<ExternalPlaceRecord | null> {
    const id = externalId.replace(/^mock:/, '');
    return toExternalRecord(id);
  }
}

export const mockPlacesProvider = new MockPlacesProvider();
