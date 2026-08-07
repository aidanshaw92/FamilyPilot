import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { searchPlacesWithFallback } from '../../server/places/places-fallback';

vi.mock('../../server/places/google-places-provider', () => ({
  googlePlacesProvider: {
    name: 'google',
    searchNearby: vi.fn(),
  },
}));

vi.mock('../../server/places/overpass-places-provider', () => ({
  overpassPlacesProvider: {
    name: 'osm',
    searchNearby: vi.fn(),
  },
}));

vi.mock('../../server/places/mock-places-provider', () => ({
  mockPlacesProvider: {
    name: 'mock',
    searchNearby: vi.fn(),
  },
}));

import { googlePlacesProvider } from '../../server/places/google-places-provider';
import { mockPlacesProvider } from '../../server/places/mock-places-provider';
import { overpassPlacesProvider } from '../../server/places/overpass-places-provider';

const PARAMS = { latitude: 51.643, longitude: -0.36, radiusKm: 8 };

describe('searchPlacesWithFallback', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns Google results when primary provider succeeds', async () => {
    vi.mocked(googlePlacesProvider.searchNearby).mockResolvedValueOnce([
      {
        familypilotId: 'fp-google-abc',
        externalId: 'google:abc',
        provider: 'google',
        name: 'Live Place',
        latitude: 51.64,
        longitude: -0.36,
        category: 'restaurant',
        photos: [],
        provenance: {},
        fetchedAt: new Date().toISOString(),
      },
    ]);

    const result = await searchPlacesWithFallback(PARAMS, 'google');
    expect(result.provider).toBe('google');
    expect(result.fallbackUsed).toBe(false);
    expect(result.places[0].name).toBe('Live Place');
  });

  it('falls back to OSM when Google fails', async () => {
    vi.mocked(googlePlacesProvider.searchNearby).mockRejectedValueOnce(new Error('Google down'));
    vi.mocked(overpassPlacesProvider.searchNearby).mockResolvedValueOnce([
      {
        familypilotId: 'fp-osm-1',
        externalId: 'osm:node/1',
        provider: 'osm',
        name: 'OSM Park',
        latitude: 51.64,
        longitude: -0.36,
        category: 'park',
        photos: [],
        provenance: {},
        fetchedAt: new Date().toISOString(),
      },
    ]);

    const result = await searchPlacesWithFallback(PARAMS, 'google');
    expect(result.provider).toBe('osm');
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toContain('google:');
  });

  it('falls back to mock when Google and OSM fail', async () => {
    vi.mocked(googlePlacesProvider.searchNearby).mockRejectedValueOnce(new Error('Google down'));
    vi.mocked(overpassPlacesProvider.searchNearby).mockRejectedValueOnce(new Error('Overpass 504'));
    vi.mocked(mockPlacesProvider.searchNearby).mockResolvedValueOnce([
      {
        familypilotId: 'venue-1',
        externalId: 'mock:venue-1',
        provider: 'mock',
        name: 'Mock Park',
        latitude: 51.64,
        longitude: -0.36,
        category: 'park',
        photos: [],
        provenance: {},
        fetchedAt: new Date().toISOString(),
      },
    ]);

    const result = await searchPlacesWithFallback(PARAMS, 'google');
    expect(result.provider).toBe('mock');
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toContain('osm:');
  });
});
