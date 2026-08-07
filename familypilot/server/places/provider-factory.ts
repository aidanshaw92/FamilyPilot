import { PlacesProvider, PlacesProviderHealth } from '@/src/services/providers/places-provider';
import { PlacesProviderName } from '@/src/types/places';

import { googlePlacesProvider } from './google-places-provider';
import { mockPlacesProvider } from './mock-places-provider';
import { overpassPlacesProvider } from './overpass-places-provider';

export function getConfiguredProviderName(): PlacesProviderName {
  const configured = (process.env.PLACES_PROVIDER ?? 'mock').toLowerCase();
  if (configured === 'google') return 'google';
  if (configured === 'osm' || configured === 'overpass') return 'osm';
  return 'mock';
}

export function createPlacesProvider(name?: PlacesProviderName): PlacesProvider {
  const provider = name ?? getConfiguredProviderName();
  switch (provider) {
    case 'google':
      return googlePlacesProvider;
    case 'osm':
      return overpassPlacesProvider;
    default:
      return mockPlacesProvider;
  }
}

export async function checkProviderHealth(name?: PlacesProviderName): Promise<PlacesProviderHealth> {
  const providerName = name ?? getConfiguredProviderName();
  try {
    if (providerName === 'google') {
      const hasKey = Boolean(process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY);
      return {
        name: 'google',
        available: hasKey,
        message: hasKey ? undefined : 'GOOGLE_PLACES_API_KEY not set',
      };
    }
    if (providerName === 'osm') {
      return { name: 'osm', available: true };
    }
    return { name: 'mock', available: true };
  } catch (error) {
    return {
      name: providerName,
      available: false,
      message: error instanceof Error ? error.message : 'Provider unavailable',
    };
  }
}
