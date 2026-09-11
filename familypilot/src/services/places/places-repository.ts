import { getFamilyPlaceMetadata } from '@/src/data/family-place-metadata';
import { mockVenueDetails, mockVenues } from '@/src/data/mock-data';
import { MockPlacesProvider } from '@/src/services/providers/mock-places-provider';
import { mergePlaceToVenue, mergePlaceToVenueDetail } from '@/src/services/places/merge-place';
import { placesApiClient } from '@/src/services/places/places-api-client';
import {
  getCachedDetail,
  getCachedSearch,
  setCachedDetail,
  setCachedSearch,
} from '@/src/services/places/places-cache';
import { resolveHomeCoordinates } from '@/src/services/places/geo-utils';
import { FamilyProfile, Venue, VenueDetail, VenueCategory } from '@/src/types';
import { PlaceSearchParams } from '@/src/types/places';

const clientMockProvider = new MockPlacesProvider();

function searchCacheKey(params: PlaceSearchParams): string {
  return JSON.stringify(params);
}

async function fallbackSearch(params: PlaceSearchParams): Promise<Venue[]> {
  const home = { latitude: params.latitude, longitude: params.longitude };
  const records = await clientMockProvider.searchNearby(params);
  return records.map((record) => {
    const metadata = getFamilyPlaceMetadata(record.familypilotId);
    return mergePlaceToVenue(record, metadata, home.latitude, home.longitude);
  });
}

async function fallbackDetail(id: string, profile: FamilyProfile): Promise<VenueDetail | null> {
  const record = await clientMockProvider.getPlace(id);
  if (!record) {
    const legacy = mockVenueDetails[id];
    return legacy ?? null;
  }
  const home = resolveHomeCoordinates(profile.homeLocation);
  const metadata = getFamilyPlaceMetadata(id);
  return mergePlaceToVenueDetail(record, metadata, home.latitude, home.longitude);
}

export class PlacesRepository {
  async searchNearby(profile: FamilyProfile, categories?: VenueCategory[]): Promise<Venue[]> {
    const home = resolveHomeCoordinates(profile.homeLocation);
    const params: PlaceSearchParams = {
      // Explore is deliberately London-wide. Cards still calculate travel from the family's real home.
      latitude: 51.5074,
      longitude: -0.1278,
      radiusKm: 40,
      categories,
      intent: 'explore',
    };

    const cacheKey = searchCacheKey(params);
    const cached = await getCachedSearch(cacheKey);
    if (cached && cached.provider !== 'mock' && cached.places.length > 0) {
      return cached.places.map((place) =>
        mergePlaceToVenue(
          place,
          place.familyMetadata ?? getFamilyPlaceMetadata(place.familypilotId),
          home.latitude,
          home.longitude,
        ),
      );
    }

    try {
      const result = await placesApiClient.search(params);
      if (result.provider === 'mock' || result.places.length === 0) {
        throw new Error('Live places unavailable');
      }
      await setCachedSearch(cacheKey, result);
      return result.places.map((place) =>
        mergePlaceToVenue(
          place,
          place.familyMetadata ?? getFamilyPlaceMetadata(place.familypilotId),
          home.latitude,
          home.longitude,
        ),
      );
    } catch (error) {
      if (__DEV__) {
        console.warn('[PlacesRepository] API unavailable, using safe fallback:', error);
      }
      // Do not leave Home/Explore blank during a provider outage. The UI labels these records as
      // unreviewed/mock data, while the next query will retry the live API rather than cache them.
      return fallbackSearch(params);
    }
  }

  async getVenueDetail(id: string, profile: FamilyProfile): Promise<VenueDetail | null> {
    const home = resolveHomeCoordinates(profile.homeLocation);

    const cached = await getCachedDetail(id);
    if (cached) {
      return mergePlaceToVenueDetail(
        cached.place,
        cached.metadata ?? getFamilyPlaceMetadata(id),
        home.latitude,
        home.longitude,
      );
    }

    try {
      const result = await placesApiClient.getDetail(id);
      await setCachedDetail(id, result);
      return mergePlaceToVenueDetail(
        result.place,
        result.metadata ?? getFamilyPlaceMetadata(id),
        home.latitude,
        home.longitude,
      );
    } catch (error) {
      if (__DEV__) {
        console.warn('[PlacesRepository] Detail API unavailable, using mock fallback:', error);
      }
      return fallbackDetail(id, profile);
    }
  }

  /** Legacy mock venues for recommendations when live search returns OSM-only IDs. */
  getLegacyMockVenues(): Venue[] {
    return mockVenues;
  }
}

let repository: PlacesRepository | null = null;

export function getPlacesRepository(): PlacesRepository {
  if (!repository) repository = new PlacesRepository();
  return repository;
}

export function resetPlacesRepository(): void {
  repository = null;
}
