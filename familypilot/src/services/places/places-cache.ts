import AsyncStorage from '@react-native-async-storage/async-storage';

import { PlaceDetailResult, PlacesSearchResult } from '@/src/types/places';

const CACHE_PREFIX = 'familypilot-places-v2:';
const SEARCH_TTL_MS = 1000 * 60 * 10;
const DETAIL_TTL_MS = 1000 * 60 * 30;
/**
 * How long a search may still be SHOWN while a fresh one loads (stale-while-revalidate). Never used to skip the network:
 * a stale search is only ever drawn first and replaced. Six hours is the server's own search-cache window
 * (`PLACES_SEARCH_CACHE_TTL_HOURS`, served by the CDN with `s-maxage` of the same length), so a parent is never shown a
 * list older than the one a fresh request could already be answered with.
 */
const SEARCH_STALE_MS = 1000 * 60 * 60 * 6;

interface StoredEntry<T> {
  value: T;
  expiresAt: number;
  /** Until when the entry may be shown while a fresh one loads. Absent on entries written before this existed: no stale use. */
  staleUntil?: number;
}

const memorySearch = new Map<string, StoredEntry<PlacesSearchResult>>();
/** The last search kept past its fresh window, for stale-while-revalidate. Separate so `memoryGet` stays strictly fresh. */
const memoryStaleSearch = new Map<string, StoredEntry<PlacesSearchResult>>();
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

async function diskEntry<T>(key: string): Promise<StoredEntry<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as StoredEntry<T>;
    // Removed only once it may no longer be shown at all, so a stale search survives to be drawn first next time.
    if (Date.now() > Math.max(entry.expiresAt, entry.staleUntil ?? 0)) {
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

async function diskGet<T>(key: string): Promise<T | null> {
  const entry = await diskEntry<T>(key);
  return entry && Date.now() <= entry.expiresAt ? entry.value : null;
}

async function diskSet<T>(key: string, value: T, ttl: number, staleMs?: number): Promise<void> {
  try {
    const now = Date.now();
    const entry: StoredEntry<T> = { value, expiresAt: now + ttl, ...(staleMs ? { staleUntil: now + staleMs } : {}) };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Ignore cache write failures
  }
}

/** A search still inside its fresh window: the network is skipped. */
export async function getCachedSearch(key: string): Promise<PlacesSearchResult | null> {
  return memoryGet(memorySearch, key) ?? (await diskGet<PlacesSearchResult>(`search:${key}`));
}

/**
 * A search that may be SHOWN while a fresh one loads: fresh, or past its fresh window but inside `SEARCH_STALE_MS`.
 * Never a reason to skip the network; the caller still asks for a fresh one.
 */
export async function getShowableSearch(key: string): Promise<PlacesSearchResult | null> {
  const fresh = memoryGet(memorySearch, key);
  if (fresh) return fresh;
  const kept = memoryStaleSearch.get(key);
  if (kept && Date.now() <= (kept.staleUntil ?? 0)) return kept.value;
  const entry = await diskEntry<PlacesSearchResult>(`search:${key}`);
  return entry ? entry.value : null;
}

export async function setCachedSearch(key: string, value: PlacesSearchResult): Promise<void> {
  memorySet(memorySearch, key, value, SEARCH_TTL_MS);
  memoryStaleSearch.set(key, { value, expiresAt: Date.now() + SEARCH_TTL_MS, staleUntil: Date.now() + SEARCH_STALE_MS });
  await diskSet(`search:${key}`, value, SEARCH_TTL_MS, SEARCH_STALE_MS);
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
  memoryStaleSearch.clear();
  memoryDetail.clear();
}
