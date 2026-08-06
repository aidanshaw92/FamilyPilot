import {
  mockCarFit,
  mockFamilyProfile,
  mockHolidayOffers,
  mockPackingItems,
  mockRecentVenues,
  mockRecommendations,
  mockSavedItems,
  mockStores,
  mockTrips,
  mockVenueDetails,
  mockVenues,
  mockWeather,
} from '@/src/data/mock-data';
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

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const familyService = {
  async getProfile(): Promise<FamilyProfile> {
    await delay(200);
    return mockFamilyProfile;
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
    return mockVenues;
  },

  async getById(id: string): Promise<VenueDetail | null> {
    await delay(200);
    return mockVenueDetails[id] ?? null;
  },
};

export const recommendationService = {
  async getHomeRecommendations(): Promise<RecommendationSection[]> {
    await delay(400);
    return mockRecommendations;
  },

  async getRecentVenues(): Promise<Venue[]> {
    await delay(200);
    return mockRecentVenues;
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
    return mockSavedItems;
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
    return mockCarFit;
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
