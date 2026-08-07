import { Venue, VenueDetail } from '@/src/types';
import { PlaceSearchParams } from '@/src/types/places';

/** @deprecated Use PlacesProvider from ./places-provider.ts */
export interface PlaceSearchParamsLegacy extends PlaceSearchParams {}

/** @deprecated Use PlacesProvider from ./places-provider.ts */
export interface IPlacesProvider {
  searchNearby(params: PlaceSearchParams): Promise<Venue[]>;
  getVenue(id: string): Promise<VenueDetail | null>;
}

export interface IWeatherProvider {
  getCurrent(lat: number, lng: number): Promise<{
    condition: 'sunny' | 'cloudy' | 'rainy' | 'partly_cloudy';
    temperature: number;
    description: string;
  }>;
}

export interface IMapsProvider {
  getDriveTime(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<number>;
  openDirections(lat: number, lng: number, label: string): void;
}

export interface IHolidayProvider {
  search(params: {
    destination: string;
    departureDate: string;
    returnDate: string;
    adults: number;
    children: number[];
  }): Promise<import('@/src/types').HolidayOffer[]>;
}

export interface IInventoryProvider {
  searchNearby(params: {
    latitude: number;
    longitude: number;
    productType: string;
  }): Promise<import('@/src/types').StoreLocation[]>;
}

export interface IAIProvider {
  recommend(params: {
    query: string;
    profileContext: Record<string, unknown>;
  }): Promise<{
    recommendations: Venue[];
    explanation: string;
  }>;
}
