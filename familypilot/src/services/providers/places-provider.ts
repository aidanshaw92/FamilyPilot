import {
  ExternalPlaceRecord,
  PlaceSearchParams,
  PlacesProviderName,
} from '@/src/types/places';

/**
 * Provider-agnostic interface for external place data.
 * Implementations run server-side only — never embed provider API keys in the client.
 */
export interface PlacesProvider {
  readonly name: PlacesProviderName;

  searchNearby(params: PlaceSearchParams): Promise<ExternalPlaceRecord[]>;

  getPlace(familypilotId: string): Promise<ExternalPlaceRecord | null>;

  /** Resolve by provider-native ID (e.g. Google place_id, OSM node id). */
  getPlaceByExternalId(externalId: string): Promise<ExternalPlaceRecord | null>;
}

export interface PlacesProviderHealth {
  name: PlacesProviderName;
  available: boolean;
  message?: string;
}
