import { ExternalPlaceRecord, PlaceSearchParams } from '@/src/types/places';
import { PlacesProvider } from '@/src/services/providers/places-provider';

/**
 * Google Places provider — server-side only.
 * Requires GOOGLE_PLACES_API_KEY (never EXPO_PUBLIC_*).
 */
export class GooglePlacesProvider implements PlacesProvider {
  readonly name = 'google' as const;

  private get apiKey(): string {
    const key = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      throw new Error('GOOGLE_PLACES_API_KEY is not configured on the server');
    }
    return key;
  }

  async searchNearby(_params: PlaceSearchParams): Promise<ExternalPlaceRecord[]> {
    void this.apiKey;
    throw new Error('Google Places provider is not yet implemented — use osm or mock');
  }

  async getPlace(_familypilotId: string): Promise<ExternalPlaceRecord | null> {
    throw new Error('Google Places provider is not yet implemented');
  }

  async getPlaceByExternalId(_externalId: string): Promise<ExternalPlaceRecord | null> {
    throw new Error('Google Places provider is not yet implemented');
  }
}

export const googlePlacesProvider = new GooglePlacesProvider();
