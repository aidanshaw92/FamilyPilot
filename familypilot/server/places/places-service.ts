import { ExternalPlaceRecord, PlaceDetailResult, PlacesSearchResult } from '@/src/types/places';
import { getFamilyPlaceMetadata } from '@/src/data/family-place-metadata';
import { PlaceSearchParams } from '@/src/types/places';

import { createPlacesProvider, getConfiguredProviderName } from './provider-factory';
import { mockPlacesProvider } from './mock-places-provider';

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
  const primary = createPlacesProvider();
  const fetchedAt = new Date().toISOString();

  try {
    const places = await primary.searchNearby(params);
    return {
      places,
      provider: primary.name,
      cached: false,
      fetchedAt,
      fallbackUsed: false,
    };
  } catch (primaryError) {
    if (primary.name === 'mock') throw primaryError;

    const places = await mockPlacesProvider.searchNearby(params);
    return {
      places,
      provider: 'mock',
      cached: false,
      fetchedAt,
      fallbackUsed: true,
      fallbackReason:
        primaryError instanceof Error ? primaryError.message : 'Primary provider failed',
    };
  }
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

  try {
    place = await primary.getPlace(familypilotId);
  } catch (error) {
    fallbackUsed = true;
    fallbackReason = error instanceof Error ? error.message : 'Primary provider failed';
  }

  if (!place) {
    place = await mockPlacesProvider.getPlace(familypilotId);
    if (place) {
      provider = 'mock';
      fallbackUsed = fallbackUsed || getConfiguredProviderName() !== 'mock';
    }
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
