import {
  mockCarFit,
  mockHolidayOffers,
  mockPackingItems,
  mockSavedItems,
  mockStores,
  mockTrips,
  mockVenues,
  mockWeather,
} from '@/src/data/mock-data';
import { useFamilyStore } from '@/src/stores/family-store';
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
import { buildHomeRecommendations, personaliseVenue, personaliseVenues } from '@/src/utils/personalise-venues';
import { filterRestaurants } from '@/src/utils/filter-restaurants';
import { ExploreBudgetFilter } from '@/src/stores/filters-store';
import { getAllRestaurants, getRestaurantById, getRestaurantsNearVenue } from '@/src/services/eat-nearby';
import { getPlacesRepository } from '@/src/services/places/places-repository';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function getProfile(): FamilyProfile {
  return withCompletion(useFamilyStore.getState().profile);
}

export const familyService = {
  async getProfile(): Promise<FamilyProfile> {
    await delay(200);
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
    return mockWeather;
  },
};

export const venueService = {
  async getNearby(): Promise<Venue[]> {
    await delay(300);
    const profile = getProfile();
    const venues = await getPlacesRepository().searchNearby(profile);
    return personaliseVenues(venues, profile);
  },

  async getById(id: string): Promise<VenueDetail | null> {
    await delay(200);
    const profile = getProfile();
    const detail = await getPlacesRepository().getVenueDetail(id, profile);
    if (!detail) return null;
    return { ...detail, ...personaliseVenue(detail, profile) };
  },
};

export const recommendationService = {
  async getHomeRecommendations(): Promise<RecommendationSection[]> {
    await delay(400);
    return buildHomeRecommendations(getProfile());
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
    await delay(200);
    const profile = getProfile();
    return mockSavedItems.map((item) => ({
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
    return filterRestaurants(all, advancedIds, maxDrive, profile.maxDriveMinutes, budget);
  },
};

export const holidayService = {
  async getOffers(): Promise<HolidayOffer[]> {
    await delay(400);
    return mockHolidayOffers;
  },
};
