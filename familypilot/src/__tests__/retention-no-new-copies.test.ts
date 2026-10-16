import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildSavedBackup } from '@/src/services/saved/saved-backup-projection';
import { clearClientPlacesCache, getCachedDetail, getCachedSearch, getShowableSearch, setCachedDetail, setCachedSearch } from '@/src/services/places/places-cache';
import type { SavedItem, Venue } from '@/src/types';
import type { ExternalPlaceRecord, PlaceDetailResult, PlacesSearchResult } from '@/src/types/places';

/**
 * No new copy of Google's content is made while the catalogue is being replaced (docs/GOOGLE_RETENTION_AUDIT.md, steps 3 and 5, and the device half of step 2).
 * The Maps terms let an app keep a place ID, and a coordinate for 30 days; a name, an address, hours or a photograph may not be stored at all. This changes only
 * what is written from now on: nothing already saved on a device or in a database is touched, and no plan is altered.
 */
const root = join(__dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const place = (provider: ExternalPlaceRecord['provider'], id: string): ExternalPlaceRecord => ({
  familypilotId: id, externalId: id, provider, name: 'Some Park', latitude: 51.5, longitude: -0.1, category: 'park', photos: [], provenance: {}, fetchedAt: '2026-10-14T08:00:00Z',
});
const result = (...places: ExternalPlaceRecord[]): PlacesSearchResult => ({ places, provider: 'google', cached: false, fetchedAt: '2026-10-14T08:00:00Z', fallbackUsed: false });

beforeEach(async () => {
  await AsyncStorage.clear();
  clearClientPlacesCache();
});

describe('the device keeps nothing of Google\'s on disk', () => {
  it('keeps a result made of independently held venues, as before', async () => {
    await setCachedSearch('k', result(place('osm', 'fp-osm-1'), place('familypilot', 'fp-own-1')));
    clearClientPlacesCache(); // a restart: memory gone, only the disk remains
    expect((await getCachedSearch('k'))?.places).toHaveLength(2);
  });

  it('keeps a result that holds any Google place in memory for the session only', async () => {
    await setCachedSearch('k', result(place('osm', 'fp-osm-1'), place('google', 'fp-google-1')));
    expect((await getCachedSearch('k'))?.places).toHaveLength(2); // still served this session
    expect(await AsyncStorage.getItem('familypilot-places-v2:search:k')).toBeNull();
    clearClientPlacesCache(); // a restart
    expect(await getCachedSearch('k')).toBeNull();
    expect(await getShowableSearch('k')).toBeNull();
  });

  it('removes an older copy already on the device when a fresh Google result replaces it, so what was written before does not linger', async () => {
    await setCachedSearch('k', result(place('osm', 'fp-osm-1')));
    expect(await AsyncStorage.getItem('familypilot-places-v2:search:k')).not.toBeNull();
    await setCachedSearch('k', result(place('google', 'fp-google-1')));
    expect(await AsyncStorage.getItem('familypilot-places-v2:search:k')).toBeNull();
  });

  it('does the same for a venue\'s detail', async () => {
    const detail = (provider: ExternalPlaceRecord['provider']): PlaceDetailResult => ({ place: place(provider, `fp-${provider}-1`), metadata: null } as unknown as PlaceDetailResult);
    await setCachedDetail('own', detail('osm'));
    await setCachedDetail('g', detail('google'));
    clearClientPlacesCache();
    expect(await getCachedDetail('own')).not.toBeNull();
    expect(await getCachedDetail('g')).toBeNull();
  });
});

describe('a backup holds only the id of a place that came from Google', () => {
  const venue = (provider: Venue['provider'], id: string): Venue => ({ id, name: 'Kew Gardens', category: 'park', latitude: 51.4787, longitude: -0.2956, address: 'Richmond TW9 3AE', imageUrl: 'https://example.invalid/k.jpg', provider, driveMinutes: 20, familyScore: { score: 80, factors: {}, explanation: [] } } as unknown as Venue);
  const item = (v: Venue): SavedItem => ({ id: `saved-${v.id}`, type: 'place', venue: v, group: 'want', savedAt: '2026-10-01T09:00:00Z' });

  it('sends a Google place as an id alone, with nothing of its name, address, position or picture', () => {
    const google = venue('google', 'fp-google-kew');
    const wire = JSON.stringify(buildSavedBackup(['fp-google-kew'], [item(google)]));
    expect(JSON.parse(wire).items).toEqual([]);
    expect(JSON.parse(wire).idsWithoutSnapshot).toEqual(['fp-google-kew']);
    for (const content of ['Kew Gardens', 'Richmond', 'k.jpg', '51.4787', '-0.2956']) expect(wire).not.toContain(content);
  });

  it('still sends an independently held place whole (name and position), beside the Google one', () => {
    const payload = buildSavedBackup(['fp-google-kew', 'fp-os-1'], [item(venue('google', 'fp-google-kew')), item(venue('os-greenspace' as Venue['provider'], 'fp-os-1'))]);
    expect(payload.items.map((i) => i.venue.id)).toEqual(['fp-os-1']);
    expect(payload.idsWithoutSnapshot).toEqual(['fp-google-kew']);
  });
});

describe('the edge does not keep a copy of Google\'s content', () => {
  it('serves a search or a detail that holds Google content with no-store, and everything else as it did', () => {
    const search = read('api/places/search.js');
    expect(search).toMatch(/holdsGoogleContent = places\.some\(\(place\) => place && place\.provider === 'google'\)/);
    expect(search).toMatch(/holdsGoogleContent\s*\n?\s*\? 'no-store'\s*\n?\s*: `public, max-age=60, s-maxage=/);
    const detail = read('api/places/detail.js');
    expect(detail).toMatch(/holdsGoogleContent = provider === 'google' \|\| \(detail\.place && detail\.place\.provider === 'google'\)/);
    expect(detail).toMatch(/holdsGoogleContent \? 'no-store' : 'public, max-age=0, s-maxage=300/);
  });
});
