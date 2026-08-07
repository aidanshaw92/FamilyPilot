import { ExternalPlaceRecord, PlaceDetailResult, PlacesSearchResult } from '../../src/types/places';
import { getFamilyPlaceMetadata } from '../../src/data/family-place-metadata';
import { PlaceSearchParams } from '../../src/types/places';

import { createPlacesProvider, getConfiguredProviderName, getPlacesRuntimeStatus } from './provider-factory';
import { mockPlacesProvider } from './mock-places-provider';
import { googlePlacesProvider } from './google-places-provider';
import { overpassPlacesProvider } from './overpass-places-provider';
import { searchPlacesWithFallback } from './places-fallback';

const CACHE_TTL_MS = 1000 * 60 * 15;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const searchCache = new Map<string, CacheEntry<PlacesSearchResult>>();
const placeCache = new Map<string, CacheEntry<PlaceDetailResult>>();

function cacheKey(prefix: string, payload: unknown): string {
  return `${prefix}:${JSON.stringify(payload)}`;
}

function getCached<T>(store: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function setCached<T>(store: Map<string, CacheEntry<T>>, key: string, value: T): void {
  store.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function searchWithFallback(params: PlaceSearchParams): Promise<PlacesSearchResult> {
  const fetchedAt = new Date().toISOString();
  const result = await searchPlacesWithFallback(params);
  return {
    places: result.places,
    provider: result.provider,
    cached: false,
    fetchedAt,
    fallbackUsed: result.fallbackUsed,
    fallbackReason: result.fallbackReason,
  };
}

export async function searchPlaces(params: PlaceSearchParams): Promise<PlacesSearchResult> {
  const key = cacheKey('search', params);
  const cached = getCached(searchCache, key);
  if (cached) return { ...cached, cached: true };

  const result = await searchWithFallback(params);
  setCached(searchCache, key, result);
  return result;
}

export async function getPlaceDetail(familypilotId: string): Promise<PlaceDetailResult | null> {
  const key = cacheKey('place', familypilotId);
  const cached = getCached(placeCache, key);
  if (cached) return { ...cached, cached: true };

  const fetchedAt = new Date().toISOString();
  const primary = createPlacesProvider();

  let place: ExternalPlaceRecord | null = null;
  let fallbackUsed = false;
  let fallbackReason: string | undefined;
  let provider = primary.name;
  const errors: string[] = [];

  const detailChain =
    primary.name === 'google'
      ? [googlePlacesProvider, overpassPlacesProvider, mockPlacesProvider]
      : primary.name === 'osm'
        ? [overpassPlacesProvider, mockPlacesProvider]
        : [mockPlacesProvider];

  for (let i = 0; i < detailChain.length; i += 1) {
    const candidate = detailChain[i];
    try {
      place = await candidate.getPlace(familypilotId);
      if (place) {
        provider = candidate.name;
        fallbackUsed = i > 0;
        fallbackReason = i > 0 ? errors.join(' → ') : undefined;
        break;
      }
    } catch (error) {
      errors.push(
        `${candidate.name}: ${error instanceof Error ? error.message : 'provider failed'}`,
      );
    }
  }

  if (!place && errors.length > 0) {
    fallbackUsed = true;
    fallbackReason = errors.join(' → ');
  }

  if (!place) return null;

  const metadata = getFamilyPlaceMetadata(familypilotId);
  const result: PlaceDetailResult = {
    place,
    metadata,
    provider,
    cached: false,
    fetchedAt,
    fallbackUsed,
    fallbackReason,
  };

  setCached(placeCache, key, result);
  return result;
}

export function clearPlacesCache(): void {
  searchCache.clear();
  placeCache.clear();
}

export { getPlacesRuntimeStatus };
