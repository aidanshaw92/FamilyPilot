import { ExternalPlaceRecord, PlaceSearchParams, PlacesProviderName } from '../../src/types/places';

import { googlePlacesProvider } from './google-places-provider';
import { mockPlacesProvider } from './mock-places-provider';
import { overpassPlacesProvider } from './overpass-places-provider';
import { getConfiguredProviderName } from './provider-factory';

export interface FallbackSearchResult {
  places: ExternalPlaceRecord[];
  provider: PlacesProviderName;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

const PROVIDER_CHAIN: Record<PlacesProviderName, PlacesProviderName[]> = {
  google: ['google', 'osm', 'mock'],
  osm: ['osm', 'mock'],
  mock: ['mock'],
  familypilot: ['mock'],
};

function chainForConfigured(configured: PlacesProviderName): PlacesProviderName[] {
  return PROVIDER_CHAIN[configured] ?? ['mock'];
}

async function searchWithProvider(
  providerName: PlacesProviderName,
  params: PlaceSearchParams,
): Promise<ExternalPlaceRecord[]> {
  switch (providerName) {
    case 'google':
      return googlePlacesProvider.searchNearby(params);
    case 'osm':
      return overpassPlacesProvider.searchNearby(params);
    default:
      return mockPlacesProvider.searchNearby(params);
  }
}

export async function searchPlacesWithFallback(
  params: PlaceSearchParams,
  configuredProvider?: PlacesProviderName,
): Promise<FallbackSearchResult> {
  const configured = configuredProvider ?? getConfiguredProviderName();
  const chain = chainForConfigured(configured);
  const errors: string[] = [];

  for (let i = 0; i < chain.length; i += 1) {
    const providerName = chain[i];
    try {
      const places = await searchWithProvider(providerName, params);
      return {
        places,
        provider: providerName,
        fallbackUsed: i > 0,
        fallbackReason: i > 0 ? errors.join(' → ') : undefined,
      };
    } catch (error) {
      errors.push(
        `${providerName}: ${error instanceof Error ? error.message : 'provider failed'}`,
      );
    }
  }

  return {
    places: [],
    provider: 'mock',
    fallbackUsed: true,
    fallbackReason: errors.join(' → '),
  };
}
