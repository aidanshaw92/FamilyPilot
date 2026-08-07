import { ExternalPlaceRecord, PlaceSearchParams } from '../../src/types/places';
import { PlacesProvider } from '../../src/services/providers/places-provider';
import { distanceKm } from '../../src/services/places/geo-utils';

import { GooglePlacesError, mapHttpStatusToError } from './google-places-errors';
import {
  EXPLORE_MAX_CANDIDATES,
  GOOGLE_DETAIL_FIELD_MASK,
  GOOGLE_SEARCH_FIELD_MASK,
  GOOGLE_SEARCH_RANK_PREFERENCE,
  googlePlaceToRecord,
  googleTypesForCategories,
  GooglePlacePayload,
  parseGoogleExternalId,
  parseGoogleFamilypilotId,
  processGoogleSearchResults,
  RESULT_LIMIT,
} from './google-places-mapper';

const PLACES_BASE_URL = 'https://places.googleapis.com/v1';

/**
 * Google Places provider — server-side only.
 * Requires GOOGLE_PLACES_API_KEY (never EXPO_PUBLIC_*).
 */
export class GooglePlacesProvider implements PlacesProvider {
  readonly name = 'google' as const;

  private get apiKey(): string {
    const key = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      throw new GooglePlacesError('GOOGLE_PLACES_API_KEY is not configured on the server', 'PROVIDER_UNAVAILABLE');
    }
    return key;
  }

  async searchNearby(params: PlaceSearchParams): Promise<ExternalPlaceRecord[]> {
    const intent = params.intent ?? (this.isRestaurantSearch(params) ? 'restaurant' : 'explore');
    const radiusM = Math.min(Math.max(Math.round(params.radiusKm * 1000), 500), 50000);
    const includedTypes = googleTypesForCategories(params.categories, intent);

    const response = await this.request(`${PLACES_BASE_URL}/places:searchNearby`, {
      method: 'POST',
      fieldMask: GOOGLE_SEARCH_FIELD_MASK,
      body: {
        includedPrimaryTypes: includedTypes,
        maxResultCount: intent === 'explore' ? EXPLORE_MAX_CANDIDATES : RESULT_LIMIT,
        rankPreference: GOOGLE_SEARCH_RANK_PREFERENCE,
        locationRestriction: {
          circle: {
            center: { latitude: params.latitude, longitude: params.longitude },
            radius: radiusM,
          },
        },
      },
    });

    const data = (await response.json()) as { places?: GooglePlacePayload[] };
    const seen = new Set<string>();

    const mapped = (data.places ?? [])
      .map((place) => googlePlaceToRecord(place, intent))
      .filter((record): record is ExternalPlaceRecord => record !== null)
      .filter((record) => {
        if (seen.has(record.externalId)) return false;
        seen.add(record.externalId);
        const km = distanceKm(params.latitude, params.longitude, record.latitude, record.longitude);
        if (km > params.radiusKm) return false;
        if (params.categories?.length && !params.categories.includes(record.category)) return false;
        return true;
      });

    return processGoogleSearchResults(
      mapped,
      params.latitude,
      params.longitude,
      intent,
    );
  }

  async getPlace(familypilotId: string): Promise<ExternalPlaceRecord | null> {
    const placeId = parseGoogleFamilypilotId(familypilotId);
    if (!placeId) return null;
    return this.getPlaceByExternalId(`google:${placeId}`);
  }

  async getPlaceByExternalId(externalId: string): Promise<ExternalPlaceRecord | null> {
    const placeId = parseGoogleExternalId(externalId);
    if (!placeId) return null;

    try {
      const response = await this.request(`${PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}`, {
        method: 'GET',
        fieldMask: GOOGLE_DETAIL_FIELD_MASK,
      });
      const place = (await response.json()) as GooglePlacePayload;
      return (
        googlePlaceToRecord(place, 'explore', { skipIntentFilter: true }) ??
        googlePlaceToRecord(place, 'restaurant', { skipIntentFilter: true })
      );
    } catch (error) {
      if (error instanceof GooglePlacesError && error.code === 'NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  private isRestaurantSearch(params: PlaceSearchParams): boolean {
    if (params.intent === 'restaurant') return true;
    if (!params.categories?.length) return false;
    return params.categories.every((c) => c === 'restaurant' || c === 'cafe');
  }

  private async request(
    url: string,
    options: { method: 'GET' | 'POST'; fieldMask: string; body?: unknown },
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': options.fieldMask,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      throw new GooglePlacesError(
        error instanceof Error ? error.message : 'Google Places network error',
        'NETWORK_ERROR',
      );
    }

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        error?: { message?: string; status?: string };
      } | null;
      const message =
        errorBody?.error?.message ??
        errorBody?.error?.status ??
        `Google Places API error: ${response.status}`;
      throw mapHttpStatusToError(response.status, message);
    }

    return response;
  }
}

export const googlePlacesProvider = new GooglePlacesProvider();
