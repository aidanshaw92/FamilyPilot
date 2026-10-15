/**
 * When the venue service cannot be reached, a parent is told so. The app used to answer an outage with its bundled demo venues, whose
 * "Café on site" and "Free" would read as recommendations about real places. Now the repository returns the last real list this device
 * may still show (the one Home shows while a fresh list loads), and otherwise lets the failure reach the screen, which says it could not
 * load and offers a retry. Demo venues never stand in for the catalogue.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { placesApiClient } from '@/src/services/places/places-api-client';
import { clearClientPlacesCache, setCachedSearch } from '@/src/services/places/places-cache';
import { getPlacesRepository, resetPlacesRepository } from '@/src/services/places/places-repository';
import { FamilyProfile } from '@/src/types';
import { ExternalPlaceRecord, PlacesSearchResult } from '@/src/types/places';

const PROFILE: FamilyProfile = {
  id: 'p1', parentName: 'Aidan', homeLocation: 'Bushey', homeLatitude: 51.64, homeLongitude: -0.36, maxDriveMinutes: 60, budgetTier: 'moderate',
  completionPercent: 100, members: [{ id: 'c1', name: 'Ozzie', role: 'child', dateOfBirth: '2025-03-01', age: 1 }],
};
const place = (id: string, name: string): ExternalPlaceRecord => ({
  familypilotId: id, externalId: id, provider: 'google', name, latitude: 51.6, longitude: -0.3, category: 'park', photos: [], provenance: {},
  fetchedAt: '2026-10-06T08:00:00Z',
});
const RESULT: PlacesSearchResult = { places: [place('fp-google-a', 'Aldenham Country Park')], provider: 'google', cached: false, fetchedAt: '2026-10-06T08:00:00Z', fallbackUsed: false };
const LONDON_KEY = JSON.stringify({ latitude: 51.5074, longitude: -0.1278, radiusKm: 40, intent: 'explore' });

beforeEach(async () => {
  await AsyncStorage.clear();
  clearClientPlacesCache();
  resetPlacesRepository();
  vi.restoreAllMocks();
});

describe('the venue service is down', () => {
  it('with nothing kept on the device, the failure reaches the screen: no demo venues are returned', async () => {
    vi.spyOn(placesApiClient, 'search').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getPlacesRepository().searchNearby(PROFILE)).rejects.toThrow('Failed to fetch');
  });

  it('a 503 from the service is the same: an error, not a list', async () => {
    vi.spyOn(placesApiClient, 'search').mockRejectedValue(new Error('catalogue 503'));
    await expect(getPlacesRepository().searchNearby(PROFILE)).rejects.toThrow('catalogue 503');
  });

  it('an answer that is itself demo data is refused, not shown', async () => {
    vi.spyOn(placesApiClient, 'search').mockResolvedValue({ ...RESULT, provider: 'mock' });
    await expect(getPlacesRepository().searchNearby(PROFILE)).rejects.toThrow();
  });

  it('with a real list kept on the device, that list is shown (it is what Home shows while a fresh one loads)', async () => {
    await setCachedSearch(LONDON_KEY, RESULT);
    clearClientPlacesCache(); // past its fresh window, inside its showable window
    vi.spyOn(placesApiClient, 'search').mockRejectedValue(new TypeError('Failed to fetch'));
    const venues = await getPlacesRepository().searchNearby(PROFILE);
    expect(venues.map((v) => v.name)).toEqual(['Aldenham Country Park']);
    expect(venues.every((v) => v.provider !== 'mock')).toBe(true);
  });

  it('a kept list that is itself demo data is never shown', async () => {
    await setCachedSearch(LONDON_KEY, { ...RESULT, provider: 'mock' });
    clearClientPlacesCache();
    vi.spyOn(placesApiClient, 'search').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getPlacesRepository().searchNearby(PROFILE)).rejects.toThrow();
  });

  it('the next request asks the live service again, and a recovered service answers', async () => {
    const search = vi.spyOn(placesApiClient, 'search').mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(RESULT);
    await expect(getPlacesRepository().searchNearby(PROFILE)).rejects.toThrow();
    const venues = await getPlacesRepository().searchNearby(PROFILE);
    expect(venues.map((v) => v.name)).toEqual(['Aldenham Country Park']);
    expect(search).toHaveBeenCalledTimes(2);
  });
});
