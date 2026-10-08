import { getFamilyPlaceMetadata } from '@/src/data/family-place-metadata';
import { mockVenueDetails, mockVenues } from '@/src/data/mock-data';
import { MockPlacesProvider } from '@/src/services/providers/mock-places-provider';
import { mergePlaceToVenue, mergePlaceToVenueDetail } from '@/src/services/places/merge-place';
import { PlacesApiError, placesApiClient } from '@/src/services/places/places-api-client';
import { BetweenHome, fetchBetween } from '@/src/services/places/between-client';
import {
  getCachedDetail,
  getCachedSearch,
  getShowableSearch,
  setCachedDetail,
  setCachedSearch,
} from '@/src/services/places/places-cache';
import { resolveHomeCoordinates } from '@/src/services/places/geo-utils';
import { FamilyProfile, Venue, VenueDetail, VenueCategory } from '@/src/types';
import { PlaceDetailResult, PlaceSearchParams } from '@/src/types/places';

const clientMockProvider = new MockPlacesProvider();

type Coordinates = { latitude: number; longitude: number };

function searchCacheKey(params: PlaceSearchParams): string {
  return JSON.stringify(params);
}

async function fallbackSearch(params: PlaceSearchParams, home: Coordinates): Promise<Venue[]> {
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
  const home = resolveHomeCoordinates(profile);
  const metadata = getFamilyPlaceMetadata(id);
  return mergePlaceToVenueDetail(record, metadata, home.latitude, home.longitude);
}

function mapLivePlacesToVenues(
  places: Awaited<ReturnType<typeof placesApiClient.search>>['places'],
  home: Coordinates,
): Venue[] {
  return places.map((place) =>
    mergePlaceToVenue(
      place,
      place.familyMetadata ?? getFamilyPlaceMetadata(place.familypilotId),
      home.latitude,
      home.longitude,
    ),
  );
}

/**
 * Home's and Explore's search. Deliberately London-wide and the SAME for every family: cards still calculate travel from
 * the family's real home afterwards, on the device. Because nothing about the family is in it, it can be started before
 * Home exists (see `prefetchNearby`) and shown from the cache while a fresh copy loads.
 */
function londonSearchParams(categories?: VenueCategory[]): PlaceSearchParams {
  return { latitude: 51.5074, longitude: -0.1278, radiusKm: 40, categories, intent: 'explore' };
}

/**
 * One request per search at a time. Without this, a prefetch still in flight when Home mounts (or Home and Explore
 * mounting together) would each send the same request; with it, the second caller waits for the first. Never cached
 * beyond the request itself: the result goes through the ordinary cache.
 */
const inFlight = new Map<string, Promise<Awaited<ReturnType<typeof placesApiClient.search>>>>();

function liveSearchOnce(params: PlaceSearchParams) {
  const key = searchCacheKey(params);
  const running = inFlight.get(key);
  if (running) return running;
  const request = placesApiClient
    .search(params)
    .then(async (result) => {
      if (result.provider === 'mock' || result.places.length === 0) {
        throw new Error('Live places unavailable');
      }
      await setCachedSearch(key, result);
      return result;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}


/** Carries the server's "a parent report could still correct this page" flag onto the detail; absent when it was not sent. */
function withReportsFlag(detail: VenueDetail, result: Pick<PlaceDetailResult, 'hasRecentParentReports'>): VenueDetail {
  return result.hasRecentParentReports === undefined ? detail : { ...detail, hasRecentParentReports: result.hasRecentParentReports };
}

export class PlacesRepository {
  async searchNearby(profile: FamilyProfile, categories?: VenueCategory[]): Promise<Venue[]> {
    const home = resolveHomeCoordinates(profile);
    const params = londonSearchParams(categories);

    const cacheKey = searchCacheKey(params);
    const cached = await getCachedSearch(cacheKey);
    if (cached && cached.provider !== 'mock' && cached.places.length > 0) {
      return mapLivePlacesToVenues(cached.places, home);
    }

    try {
      const result = await liveSearchOnce(params);
      return mapLivePlacesToVenues(result.places, home);
    } catch (error) {
      if (__DEV__) {
        console.warn('[PlacesRepository] API unavailable, using safe fallback:', error);
      }
      // Do not leave Home/Explore blank during a provider outage. The UI labels these records as
      // unreviewed/mock data, while the next query will retry the live API rather than cache them.
      return fallbackSearch(params, home);
    }
  }

  /**
   * The last live London search this device holds that may still be SHOWN (stale-while-revalidate), or null. Read from
   * the device only: no request is made. Never demo data, never empty. The caller must still load a fresh one.
   */
  async cachedNearby(profile: FamilyProfile): Promise<Venue[] | null> {
    const kept = await getShowableSearch(searchCacheKey(londonSearchParams()));
    if (!kept || kept.provider === 'mock' || kept.places.length === 0) return null;
    return mapLivePlacesToVenues(kept.places, resolveHomeCoordinates(profile));
  }

  /**
   * Starts Home's search before Home exists, so the wait overlaps the last moments of setup instead of following it.
   * It is exactly the request Home sends next (same URL, answered by the CDN and the server's search cache like any
   * other), it is skipped when a fresh copy is already held, and a Home that mounts while it is running waits for it
   * rather than sending its own. Failures are silent: Home's own load reports them.
   */
  prefetchNearby(): void {
    const params = londonSearchParams();
    void getCachedSearch(searchCacheKey(params))
      .then((cached) => (cached && cached.provider !== 'mock' && cached.places.length > 0 ? null : liveSearchOnce(params)))
      .catch(() => undefined);
  }

  /** Search around a user-entered London town/postcode without substituting demo venues. */
  async searchAround(
    profile: FamilyProfile,
    latitude: number,
    longitude: number,
    radiusKm = 8,
  ): Promise<Venue[]> {
    const home = resolveHomeCoordinates(profile);
    const params: PlaceSearchParams = {
      latitude,
      longitude,
      radiusKm,
      intent: 'explore',
    };
    const cacheKey = searchCacheKey(params);
    const cached = await getCachedSearch(cacheKey);
    if (cached && cached.provider !== 'mock' && cached.places.length > 0) {
      return mapLivePlacesToVenues(cached.places, home);
    }

    const result = await placesApiClient.search(params);
    if (result.provider === 'mock' || result.places.length === 0) {
      throw new Error('No live places were returned for that area.');
    }
    await setCachedSearch(cacheKey, result);
    return mapLivePlacesToVenues(result.places, home);
  }

  /**
   * Stored-catalogue places in the corridor between two homes (Meet Halfway's candidates). A database read on the server:
   * no discovery and no spend. Throws when the catalogue cannot be reached, so "unavailable" is never shown as "nothing".
   * Distances on each Venue are from the SIGNED-IN family's home; Meet Halfway re-measures both journeys itself.
   */
  async searchBetween(profile: FamilyProfile, a: BetweenHome, b: BetweenHome): Promise<Venue[]> {
    const home = resolveHomeCoordinates(profile);
    const result = await fetchBetween(a, b);
    return mapLivePlacesToVenues(result.places, home);
  }

  async getVenueDetail(id: string, profile: FamilyProfile): Promise<VenueDetail | null> {
    const home = resolveHomeCoordinates(profile);

    const cached = await getCachedDetail(id);
    if (cached) {
      return withReportsFlag(
        mergePlaceToVenueDetail(
          cached.place,
          cached.metadata ?? cached.place.familyMetadata ?? getFamilyPlaceMetadata(id),
          home.latitude,
          home.longitude,
        ),
        cached,
      );
    }

    try {
      const result = await placesApiClient.getDetail(id);
      await setCachedDetail(id, result);
      return withReportsFlag(
        mergePlaceToVenueDetail(
          result.place,
          result.metadata ?? result.place.familyMetadata ?? getFamilyPlaceMetadata(id),
          home.latitude,
          home.longitude,
        ),
        result,
      );
    } catch (error) {
      // Mock and legacy ids are served locally whatever the API says. For a real id the two
      // failures mean different things to a parent: a 404 is "this place is not in our data" (null,
      // and the screen says not found); anything else is OUR lookup failing, so it is rethrown and
      // the screen says so with a retry, rather than telling them the place may have been removed.
      const fallback = await fallbackDetail(id, profile);
      if (fallback) return fallback;
      if (error instanceof PlacesApiError && error.status === 404) return null;
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[PlacesRepository] Detail API unavailable:', error);
      }
      throw error;
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
