import AsyncStorage from '@react-native-async-storage/async-storage';

import { PlaceDetailResult, PlacesSearchResult } from '@/src/types/places';

const CACHE_PREFIX = 'familypilot-places-cache:';
const SEARCH_TTL_MS = 1000 * 60 * 10;
const DETAIL_TTL_MS = 1000 * 60 * 30;

interface StoredEntry<T> {
  value: T;
  expiresAt: number;
}

const memorySearch = new Map<string, StoredEntry<PlacesSearchResult>>();
const memoryDetail = new Map<string, StoredEntry<PlaceDetailResult>>();

function memoryGet<T>(store: Map<string, StoredEntry<T>>, key: string): T | null {
  const entry = store.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet<T>(store: Map<string, StoredEntry<T>>, key: string, value: T, ttl: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttl });
}

async function diskGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as StoredEntry<T>;
    if (Date.now() > entry.expiresAt) {
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

async function diskSet<T>(key: string, value: T, ttl: number): Promise<void> {
  try {
    const entry: StoredEntry<T> = { value, expiresAt: Date.now() + ttl };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Ignore cache write failures
  }
}

export async function getCachedSearch(key: string): Promise<PlacesSearchResult | null> {
  return memoryGet(memorySearch, key) ?? (await diskGet<PlacesSearchResult>(`search:${key}`));
}

export async function setCachedSearch(key: string, value: PlacesSearchResult): Promise<void> {
  memorySet(memorySearch, key, value, SEARCH_TTL_MS);
  await diskSet(`search:${key}`, value, SEARCH_TTL_MS);
}

export async function getCachedDetail(id: string): Promise<PlaceDetailResult | null> {
  return memoryGet(memoryDetail, id) ?? (await diskGet<PlaceDetailResult>(`detail:${id}`));
}

export async function setCachedDetail(id: string, value: PlaceDetailResult): Promise<void> {
  memorySet(memoryDetail, id, value, DETAIL_TTL_MS);
  await diskSet(`detail:${id}`, value, DETAIL_TTL_MS);
}

export function clearClientPlacesCache(): void {
  memorySearch.clear();
  memoryDetail.clear();
}
