import {
  mockCarFit,
  mockHolidayOffers,
  mockPackingItems,
  mockStores,
  mockTrips,
  mockVenues,
} from '@/src/data/mock-data';
import { useFamilyStore } from '@/src/stores/family-store';
import { useSavedStore } from '@/src/stores/saved-store';
import {
  CarFitResult,
  FamilyProfile,
  HolidayOffer,
  PackingItem,
  RecommendationSection,
  SavedItem,
  StoreLocation,
  Trip,
  RestaurantDetail,
  Venue,
  VenueDetail,
  WeatherInfo,
  EatNearbyRecommendation,
} from '@/src/types';
import { withCompletion } from '@/src/utils/profile-defaults';
import { compareVenuesForFamily } from '@/src/services/places/fit-order';
import { BetweenHome } from '@/src/services/places/between-client';
import { buildHomeRecommendations, personaliseVenue, personaliseVenues } from '@/src/utils/personalise-venues';
import type { ParentObservations } from '@/src/services/matching/parent-observations';
import { fetchLiveWeather } from '@/src/services/context/live-context';
import { isListableVenue } from '@/src/utils/opening-today';
import { getFocusedRecommendations } from '@/src/services/recommendation/focused-recommendations';
import { parseDayRequest, parseDayRequestMock } from '@/src/services/recommendation/parse-day-request-client';
import { DayRequest } from '@/src/types/day-request';
import { filterRestaurants } from '@/src/utils/filter-restaurants';
import { ExploreBudgetFilter } from '@/src/stores/filters-store';
import { getAllRestaurants, getRestaurantById, getRestaurantsNearVenue } from '@/src/services/eat-nearby';
import { getPlacesRepository } from '@/src/services/places/places-repository';
import { loadHomeList, loadKeptHomeList, prefetchHomeList } from '@/src/services/places/home-list';
import { distanceKm } from '@/src/services/places/geo-utils';
import { resolveUkLocation } from '@/src/services/location/location-client';
import { withDerivedAges } from '@/src/utils/child-age';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// The one read path for hooks: ages are derived from dates of birth here, so every consumer behind
// `useFamilyProfile` sees today's age whatever was last stored.
function getProfile(): FamilyProfile {
  return withDerivedAges(withCompletion(useFamilyStore.getState().profile));
}

export const familyService = {
  async getProfile(): Promise<FamilyProfile> {
    await delay(200);
    return getProfile();
  },

  /**
   * The same profile, synchronously. It lives in the on-device store, so there is nothing to wait for: screens use it as
   * the query's initial data and draw the family's own name on the first frame instead of "there" and then the name.
   */
  getProfileNow(): FamilyProfile {
    return getProfile();
  },

  async updateProfile(updates: Partial<FamilyProfile>): Promise<FamilyProfile> {
    await delay(150);
    useFamilyStore.getState().updateProfile(updates);
    return getProfile();
  },
};

export const weatherService = {
  async getCurrent(): Promise<WeatherInfo> {
    await delay(100);
    return fetchLiveWeather(getProfile());
  },
};

export const venueService = {
  async getNearby(): Promise<Venue[]> {
    return loadHomeList(getProfile());
  },

  /** What the device kept, re-ranked for the family now, to show while a fresh list loads (see home-list.ts). */
  async getNearbyCached(): Promise<Venue[] | null> {
    return loadKeptHomeList(getProfile());
  },

  /** Starts Home's (family-independent) search early: see `PlacesRepository.prefetchNearby`. */
  prefetchNearby(): void {
    prefetchHomeList();
  },

  async searchArea(area: string): Promise<Venue[]> {
    const profile = getProfile();
    const location = await resolveUkLocation(area);
    const fromCentralLondonKm = distanceKm(51.5074, -0.1278, location.latitude, location.longitude);
    if (fromCentralLondonKm > 45) {
      throw new Error('Explore currently searches London and nearby areas. Try a London town or postcode.');
    }
    const venues = await getPlacesRepository().searchAround(profile, location.latitude, location.longitude, 8);
    return venues
      .filter((venue) => isListableVenue(venue))
      .map((venue) => personaliseVenue(venue, profile))
      .sort((a, b) => compareVenuesForFamily(a, b));
  },

  /**
   * Places for Meet Halfway, chosen by where BOTH families are rather than by what Home loaded. They are personalised for
   * the signed-in family (so its Family Fit is real) and nothing else is applied: whether a place suits the other
   * family is decided by the engine, from what they shared.
   */
  async getBetween(a: BetweenHome, b: BetweenHome): Promise<Venue[]> {
    const profile = getProfile();
    const venues = await getPlacesRepository().searchBetween(profile, a, b);
    return venues.filter((venue) => isListableVenue(venue)).map((venue) => personaliseVenue(venue, profile));
  },

  /**
   * The venue's detail, personalised on the venue's own facts and nothing else. It waits for the detail request alone:
   * today's weather is not an input to Family Fit (it is a separate condition on the page), and parent reports arrive
   * afterwards through `withParentObservations`, so neither can hold the page back.
   */
  async getById(id: string): Promise<VenueDetail | null> {
    const profile = getProfile();
    const detail = await getPlacesRepository().getVenueDetail(id, profile);
    if (!detail) return null;
    return { ...detail, ...personaliseVenue(detail, profile) };
  },

  /**
   * The same detail, with parent reports taken into account once they have arrived. Pure and synchronous: a withdrawn
   * fact moves from "why it suits" to "to check" and a labelled parent-reported line is added, the official claim itself
   * is never touched. Applied to the detail the page already shows, so the page never waits for it.
   */
  withParentObservations(detail: VenueDetail, observations: ParentObservations | undefined): VenueDetail {
    if (!observations || Object.keys(observations).length === 0) return detail;
    return { ...detail, ...personaliseVenue(detail, getProfile(), observations) };
  },
};

export const recommendationService = {
  async getHomeRecommendations(): Promise<RecommendationSection[]> {
    await delay(400);
    return buildHomeRecommendations(getProfile());
  },

  async parseDayRequest(rawText: string): Promise<DayRequest> {
    const profile = getProfile();
    try {
      return await parseDayRequest(rawText, profile);
    } catch {
      return parseDayRequestMock(rawText, profile);
    }
  },

  async getFocusedRecommendations(request: DayRequest) {
    await delay(200);
    return getFocusedRecommendations(getProfile(), request);
  },

  async getRecentVenues(): Promise<Venue[]> {
    await delay(200);
    const profile = getProfile();
    return personaliseVenues([mockVenues[0], mockVenues[3]], profile);
  },
};

export const tripService = {
  async getTrips(): Promise<Trip[]> {
    await delay(200);
    return mockTrips;
  },
};

export const savedService = {
  async getSaved(): Promise<SavedItem[]> {
    const profile = getProfile();
    return useSavedStore.getState().items.map((item) => ({
      ...item,
      venue: personaliseVenue(item.venue, profile),
    }));
  },
};

export const inventoryService = {
  async getNearbyStores(): Promise<StoreLocation[]> {
    await delay(300);
    return mockStores;
  },
};

export const carFitService = {
  async getCarFit(): Promise<CarFitResult> {
    await delay(200);
    const profile = getProfile();
    return {
      ...mockCarFit,
      carName: profile.vehicle?.trim() || 'Add your car in Profile',
    };
  },
};

export const packingService = {
  async getPackingList(): Promise<PackingItem[]> {
    await delay(200);
    return mockPackingItems;
  },
};

export const restaurantService = {
  async getAll(): Promise<RestaurantDetail[]> {
    await delay(250);
    return getAllRestaurants(getProfile());
  },

  async getById(id: string, activityVenueId?: string): Promise<RestaurantDetail | null> {
    await delay(200);
    return getRestaurantById(id, getProfile(), { activityVenueId });
  },

  async getEatNearby(activityVenueId: string): Promise<EatNearbyRecommendation[]> {
    await delay(280);
    const activity = await venueService.getById(activityVenueId);
    if (!activity || activity.category === 'restaurant' || activity.category === 'cafe') {
      return [];
    }
    return getRestaurantsNearVenue(activity, getProfile());
  },

  async getFiltered(
    advancedIds: string[],
    maxDrive: number | 'any',
    budget: ExploreBudgetFilter,
  ): Promise<RestaurantDetail[]> {
    await delay(250);
    const profile = getProfile();
    const all = getAllRestaurants(profile);
    return filterRestaurants(all, advancedIds, maxDrive, budget);
  },
};

export const holidayService = {
  async getOffers(): Promise<HolidayOffer[]> {
    await delay(400);
    return mockHolidayOffers;
  },
};
