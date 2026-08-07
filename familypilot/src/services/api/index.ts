import {
  mockCarFit,
  mockHolidayOffers,
  mockPackingItems,
  mockSavedItems,
  mockStores,
  mockTrips,
  mockVenueDetails,
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
  Venue,
  VenueDetail,
  WeatherInfo,
} from '@/src/types';
import { withCompletion } from '@/src/utils/profile-defaults';
import { buildHomeRecommendations, personaliseVenue, personaliseVenues } from '@/src/utils/personalise-venues';

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
    return personaliseVenues(mockVenues, getProfile());
  },

  async getById(id: string): Promise<VenueDetail | null> {
    await delay(200);
    const base = mockVenueDetails[id];
    if (!base) return null;
    return { ...base, ...personaliseVenue(base, getProfile()) };
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
    return personaliseVenues([mockVenues[0], mockVenues[4]], profile);
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

export const holidayService = {
  async getOffers(): Promise<HolidayOffer[]> {
    await delay(400);
    return mockHolidayOffers;
  },
};
