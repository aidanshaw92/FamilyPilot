import { PlaceDetailResult, PlaceSearchParams, PlacesSearchResult } from '@/src/types/places';

function getApiBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_PLACES_API_URL) {
    return process.env.EXPO_PUBLIC_PLACES_API_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/places`;
  }
  return '/api/places';
}

export class PlacesApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? getApiBaseUrl();
  }

  async search(params: PlaceSearchParams): Promise<PlacesSearchResult> {
    const query = new URLSearchParams({
      lat: String(params.latitude),
      lng: String(params.longitude),
      radiusKm: String(params.radiusKm),
    });
    if (params.categories?.length) {
      query.set('categories', params.categories.join(','));
    }
    if (params.intent) {
      query.set('intent', params.intent);
    }

    const response = await fetch(`${this.baseUrl}/search?${query.toString()}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Places API error ${response.status}`);
    }
    return response.json() as Promise<PlacesSearchResult>;
  }

  async getDetail(familypilotId: string): Promise<PlaceDetailResult> {
    const response = await fetch(
      `${this.baseUrl}/detail?id=${encodeURIComponent(familypilotId)}`,
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Places API error ${response.status}`);
    }
    return response.json() as Promise<PlaceDetailResult>;
  }
}

export const placesApiClient = new PlacesApiClient();
