import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as liveContext from '@/src/services/context/live-context';
import { HOME_WEATHER_WAIT_MS, loadHomeList, loadKeptHomeList, prefetchHomeList } from '@/src/services/places/home-list';
import { placesApiClient } from '@/src/services/places/places-api-client';
import {
  clearClientPlacesCache,
  getCachedSearch,
  getShowableSearch,
  setCachedSearch,
} from '@/src/services/places/places-cache';
import { getPlacesRepository, resetPlacesRepository } from '@/src/services/places/places-repository';
import { FamilyProfile } from '@/src/types';
import { ExternalPlaceRecord, PlacesSearchResult } from '@/src/types/places';
import { deckMetrics } from '@/src/utils/home-deck-geometry';
import { resolveHomeVenues } from '@/src/utils/home-venues-state';

/**
 * Home must never look broken while it loads.
 *
 * Real-device test: straight after onboarding, Home's recommendation area sat as one large blank grey block for about ten
 * seconds. The causes, each pinned below:
 *   1. the only loading state was a single plain grey rectangle the size of the whole deck;
 *   2. nothing the device already held was shown: the client cache was discarded after ten minutes, so every later
 *      visit waited on the network too;
 *   3. Home's request only started once Home existed, although it does not depend on the family at all;
 *   4. the list also waited, with no limit, for the weather (a soft ranking input), and for a fixed 300ms delay;
 *   5. a card's photograph showed a grey block (a 120pt pulse strip on grey) until it arrived.
 * No new request and no provider call is added by any of it: everything here either reads the device or is the request
 * Home already sends.
 */

const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const PROFILE: FamilyProfile = {
  id: 'p1',
  parentName: 'Aidan',
  homeLocation: 'Bushey',
  homeLatitude: 51.64,
  homeLongitude: -0.36,
  maxDriveMinutes: 60,
  budgetTier: 'moderate',
  completionPercent: 100,
  members: [{ id: 'c1', name: 'Ozzie', role: 'child', dateOfBirth: '2025-03-01', age: 1 }],
};

const place = (id: string, name: string): ExternalPlaceRecord => ({
  familypilotId: id,
  externalId: id,
  provider: 'google',
  name,
  latitude: 51.6,
  longitude: -0.3,
  category: 'park',
  photos: [],
  provenance: {},
  fetchedAt: '2026-10-06T08:00:00Z',
});

const RESULT: PlacesSearchResult = {
  places: [place('fp-google-a', 'Aldenham Country Park'), place('fp-google-b', 'Canons Park')],
  provider: 'google',
  cached: false,
  fetchedAt: '2026-10-06T08:00:00Z',
  fallbackUsed: false,
};

/** The key the repository uses for Home's London-wide search. */
const LONDON_KEY = JSON.stringify({ latitude: 51.5074, longitude: -0.1278, radiusKm: 40, intent: 'explore' });

beforeEach(async () => {
  await AsyncStorage.clear();
  clearClientPlacesCache();
  resetPlacesRepository();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('what Home shows, from the fresh list and the list the device kept', () => {
  const live = (over: Partial<Parameters<typeof resolveHomeVenues>[0]['live']> = {}) => ({
    data: undefined, isLoading: false, isError: false, isFetching: false, ...over,
  });
  const kept = (data: string[] | null | undefined, isLoading = false) => ({ data, isLoading });

  it('first run, nothing kept: loading (the skeleton), never an error or an empty state', () => {
    expect(resolveHomeVenues({ live: live({ isLoading: true, isFetching: true }), kept: kept(null) })).toEqual({
      venues: undefined, isLoading: true, isError: false, isRefreshing: false,
    });
  });

  it('cached recommendation path: the kept list is shown at once while the fresh one loads', () => {
    const state = resolveHomeVenues({ live: live({ isLoading: true, isFetching: true }), kept: kept(['kept']) });
    expect(state).toEqual({ venues: ['kept'], isLoading: false, isError: false, isRefreshing: true });
  });

  it('the fresh list replaces the kept one when it arrives', () => {
    const state = resolveHomeVenues({ live: live({ data: ['fresh'] }), kept: kept(['kept']) });
    expect(state.venues).toEqual(['fresh']);
    expect(state.isRefreshing).toBe(false);
  });

  it('a failed refresh never takes away picks the parent can already see', () => {
    expect(resolveHomeVenues({ live: live({ isError: true }), kept: kept(['kept']) })).toEqual({
      venues: ['kept'], isLoading: false, isError: false, isRefreshing: false,
    });
  });

  it('a failure with nothing kept is an error with a retry, not a blank', () => {
    expect(resolveHomeVenues({ live: live({ isError: true }), kept: kept(null) })).toMatchObject({ isError: true, isLoading: false });
  });
});

describe('the device keeps the last list to show first (stale-while-revalidate), within the server’s own window', () => {
  it('fresh for ten minutes (the network is skipped), then still SHOWABLE for six hours, then gone', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T08:00:00Z'));
    await setCachedSearch(LONDON_KEY, RESULT);
    expect(await getCachedSearch(LONDON_KEY)).not.toBeNull();

    vi.setSystemTime(new Date('2026-10-06T08:11:00Z'));
    clearClientPlacesCache(); // a new session: only the device's storage remains
    expect(await getCachedSearch(LONDON_KEY)).toBeNull();
    expect((await getShowableSearch(LONDON_KEY))?.places).toHaveLength(2);

    vi.setSystemTime(new Date('2026-10-06T14:01:00Z'));
    expect(await getShowableSearch(LONDON_KEY)).toBeNull();
  });

  it('the kept list is re-ranked for the family as it is now, from the device only', async () => {
    await setCachedSearch(LONDON_KEY, RESULT);
    clearClientPlacesCache();
    const search = vi.spyOn(placesApiClient, 'search');
    const venues = await loadKeptHomeList(PROFILE);
    expect(venues?.map((v) => v.name).sort()).toEqual(['Aldenham Country Park', 'Canons Park']);
    expect(venues?.every((v) => typeof v.familyScore.score === 'number')).toBe(true);
    expect(search).not.toHaveBeenCalled();
  });

  it('nothing kept, or only demo data: nothing to show early (never demo venues dressed as picks)', async () => {
    expect(await loadKeptHomeList(PROFILE)).toBeNull();
    await setCachedSearch(LONDON_KEY, { ...RESULT, provider: 'mock' });
    clearClientPlacesCache();
    expect(await getPlacesRepository().cachedNearby(PROFILE)).toBeNull();
  });
});

describe('Home’s request starts early and is only ever sent once', () => {
  it('a prefetch still running when Home asks is shared, not repeated', async () => {
    let release: (value: PlacesSearchResult) => void = () => {};
    const search = vi
      .spyOn(placesApiClient, 'search')
      .mockImplementation(() => new Promise<PlacesSearchResult>((resolve) => { release = resolve; }));
    vi.spyOn(liveContext, 'fetchLiveWeatherSafe').mockResolvedValue(null);

    prefetchHomeList();
    await new Promise((r) => setTimeout(r, 0));
    const home = loadHomeList(PROFILE);
    await new Promise((r) => setTimeout(r, 0));
    release(RESULT);
    const venues = await home;

    expect(search).toHaveBeenCalledTimes(1);
    expect(venues.map((v) => v.name).sort()).toEqual(['Aldenham Country Park', 'Canons Park']);
  });

  it('a prefetch with a fresh copy already held sends nothing', async () => {
    await setCachedSearch(LONDON_KEY, RESULT);
    const search = vi.spyOn(placesApiClient, 'search');
    prefetchHomeList();
    await new Promise((r) => setTimeout(r, 0));
    expect(search).not.toHaveBeenCalled();
  });

  it('a failed prefetch is silent and leaves Home to load and report for itself', async () => {
    vi.spyOn(placesApiClient, 'search').mockRejectedValue(new TypeError('Failed to fetch'));
    expect(() => prefetchHomeList()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('setup starts it when the family is complete, and nowhere earlier', () => {
    const setup = read('app/(onboarding)/setup.tsx');
    expect(setup.match(/venueService\.prefetchNearby\(\)/g)).toHaveLength(1);
    const finish = setup.slice(setup.indexOf('const finish = () => {'), setup.indexOf('const handleNext'));
    expect(finish).toContain('venueService.prefetchNearby()');
    expect(finish.indexOf('completeOnboarding()')).toBeLessThan(finish.indexOf('venueService.prefetchNearby()'));
  });
});

describe('a slow response does not hold Home’s list back', () => {
  it('slow weather: the list ranks without it after HOME_WEATHER_WAIT_MS instead of waiting', async () => {
    vi.spyOn(placesApiClient, 'search').mockResolvedValue(RESULT);
    vi.spyOn(liveContext, 'fetchLiveWeatherSafe').mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    const home = loadHomeList(PROFILE);
    await vi.advanceTimersByTimeAsync(HOME_WEATHER_WAIT_MS + 10);
    const venues = await home;
    expect(venues).toHaveLength(2);
    expect(HOME_WEATHER_WAIT_MS).toBeLessThanOrEqual(3000);
  });

  it('no fixed delay before the list: a held list is returned straight away', async () => {
    await setCachedSearch(LONDON_KEY, RESULT);
    vi.spyOn(liveContext, 'fetchLiveWeatherSafe').mockResolvedValue(null);
    const started = Date.now();
    await loadHomeList(PROFILE);
    expect(Date.now() - started).toBeLessThan(200);
  });
});

describe('the loading state is the deck’s own shape, in the deck’s own place', () => {
  const home = read('app/(tabs)/index.tsx');
  const skeleton = read('src/components/home/RecommendationDeckSkeleton.tsx');

  it('Home no longer draws one plain block the height of the deck', () => {
    expect(home).not.toMatch(/<Skeleton height=\{deckHeight\}/);
    expect(home).toContain('<RecommendationDeckSkeleton');
  });

  it('the skeleton is placed exactly where the deck goes (same slot, same top gap, no extra gutter)', () => {
    const slot = (marker: string) => {
      const at = home.indexOf(marker);
      return home.slice(home.lastIndexOf('<View', at), at);
    };
    const skeletonSlot = slot('<RecommendationDeckSkeleton');
    const deckSlot = slot('<RecommendationDeck\n');
    expect(skeletonSlot).toContain('style={[styles.deckSlot, { marginTop: deckTopGap(mode) }]}');
    expect(deckSlot).toContain('style={[styles.deckSlot, { marginTop: deckTopGap(mode) }]}');
  });

  it('it is sized by the deck’s own geometry, so the cards arrive without anything moving', () => {
    expect(skeleton).toContain('deckMetrics(viewportWidth, maxHeight)');
    expect(skeleton).toContain('deckSlot(d, geometry)');
    expect(skeleton).toContain('height: deckHeight');
    expect(home).toMatch(/<RecommendationDeckSkeleton\s+viewportWidth=\{width\}\s+maxHeight=\{room\}/);
    // The same numbers the deck uses, at every established phone width.
    for (const width of [360, 390, 393, 430]) {
      const m = deckMetrics(width, undefined);
      expect(m.deckHeight).toBe(m.activeHeight);
      expect(m.activeWidth).toBeLessThan(width);
    }
  });

  it('it says what is happening, for this family, to the eye and to a screen reader', () => {
    expect(home).toContain('message={`Finding today’s best places for ${pickedForNames}…`}');
    expect(skeleton).toContain('accessibilityRole="progressbar"');
    expect(skeleton).toContain('accessibilityLabel={message}');
  });

  it('the header (the family’s name) is right on the first frame: the profile is read from the device', () => {
    expect(read('src/hooks/use-queries.ts')).toContain('initialData: familyService.getProfileNow');
  });
});

describe('slow photo and no-photo paths', () => {
  const image = read('src/components/ui/VenueImage.tsx');

  it('slow photo: the category illustration sits underneath while it loads, not a grey block', () => {
    expect(image).not.toContain('<Skeleton height={120}');
    const pending = image.slice(image.indexOf('{pending?'), image.indexOf('<Image source'));
    expect(pending).toContain('<CategoryArt category={category} />');
    // Not announced: it is not what the place looks like, and the photo's own label is what is read.
    expect(pending).toContain('accessibilityElementsHidden');
    expect(pending).toContain('importantForAccessibility="no-hide-descendants"');
  });

  it('no photo: unchanged, the labelled illustration', () => {
    expect(image).toContain('{!uri||failed?');
    expect(image).toContain('photo not available. Illustration of ${withIndefiniteArticle(categoryNoun(category))}');
  });
});
