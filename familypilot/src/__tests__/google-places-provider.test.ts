import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GooglePlacesError } from '../../server/places/google-places-errors';
import {
  googlePlaceToRecord,
  googleTypesForCategories,
  mapGoogleCategory,
  parseGoogleExternalId,
  parseGoogleFamilypilotId,
} from '../../server/places/google-places-mapper';
import { GooglePlacesProvider } from '../../server/places/google-places-provider';

const SAMPLE_PLACE = {
  id: 'ChIJTestPlace123',
  displayName: { text: 'Bushey Museum' },
  location: { latitude: 51.6456, longitude: -0.3652 },
  formattedAddress: 'High Street, Bushey',
  primaryType: 'museum',
  types: ['museum', 'point_of_interest', 'establishment'],
  businessStatus: 'OPERATIONAL',
};

const SAMPLE_DETAIL = {
  ...SAMPLE_PLACE,
  websiteUri: 'https://busheymuseum.org',
  nationalPhoneNumber: '+44 1923 123456',
  regularOpeningHours: {
    weekdayDescriptions: ['Monday: 10:00 AM – 4:00 PM'],
  },
  editorialSummary: { text: 'Local history museum.' },
};

function mockFetchResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('google-places-mapper', () => {
  it('maps a complete Google place payload into ExternalPlaceRecord', () => {
    const record = googlePlaceToRecord(SAMPLE_DETAIL, 'explore');
    expect(record).not.toBeNull();
    expect(record?.familypilotId).toBe('fp-google-ChIJTestPlace123');
    expect(record?.externalId).toBe('google:ChIJTestPlace123');
    expect(record?.provider).toBe('google');
    expect(record?.name).toBe('Bushey Museum');
    expect(record?.category).toBe('museum');
    expect(record?.website).toBe('https://busheymuseum.org');
    expect(record?.phone).toBe('+44 1923 123456');
    expect(record?.openingHours?.source).toBe('google');
    expect(record?.description).toBe('Local history museum.');
    expect(record?.isOpen).toBe(true);
    expect(record?.provenance.name?.source).toBe('google');
  });

  it('returns null when required fields are missing', () => {
    expect(googlePlaceToRecord({ id: 'x' })).toBeNull();
    expect(googlePlaceToRecord({ ...SAMPLE_PLACE, displayName: undefined })).toBeNull();
    expect(googlePlaceToRecord({ ...SAMPLE_PLACE, location: undefined })).toBeNull();
  });

  it('maps Google types to FamilyPilot categories', () => {
    expect(mapGoogleCategory('restaurant', ['food'])).toBe('restaurant');
    expect(mapGoogleCategory('coffee_shop', [])).toBe('cafe');
    expect(mapGoogleCategory('zoo', [])).toBe('zoo');
    expect(mapGoogleCategory('unknown_type', [])).toBeNull();
  });

  it('builds includedTypes for explore by default', () => {
    expect(googleTypesForCategories(undefined, 'explore')).toContain('park');
    expect(googleTypesForCategories(undefined, 'explore')).not.toContain('restaurant');
  });

  it('builds includedTypes for restaurant intent', () => {
    const types = googleTypesForCategories(['restaurant', 'cafe'], 'restaurant');
    expect(types).toContain('restaurant');
    expect(types).toContain('cafe');
    expect(types).toContain('coffee_shop');
  });

  it('parses Google IDs from external and FamilyPilot IDs', () => {
    expect(parseGoogleExternalId('google:ChIJabc')).toBe('ChIJabc');
    expect(parseGoogleFamilypilotId('fp-google-ChIJabc')).toBe('ChIJabc');
    expect(parseGoogleExternalId('osm:node/1')).toBeNull();
  });
});

describe('GooglePlacesProvider', () => {
  const originalKey = process.env.GOOGLE_PLACES_API_KEY;

  beforeEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-google-key';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) {
      delete process.env.GOOGLE_PLACES_API_KEY;
    } else {
      process.env.GOOGLE_PLACES_API_KEY = originalKey;
    }
  });

  it('returns nearby places on successful search', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchResponse(200, { places: [SAMPLE_PLACE, SAMPLE_PLACE] }),
    );

    const provider = new GooglePlacesProvider();
    const places = await provider.searchNearby({
      latitude: 51.643,
      longitude: -0.36,
      radiusKm: 8,
      intent: 'explore',
    });

    expect(places).toHaveLength(1);
    expect(places[0].externalId).toBe('google:ChIJTestPlace123');
    expect(places[0].enrichmentStatus).toBe('provider_only');
    expect(fetch).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places:searchNearby',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Goog-Api-Key': 'test-google-key',
          'X-Goog-FieldMask': expect.stringContaining('places.id'),
        }),
        body: expect.stringContaining('includedPrimaryTypes'),
      }),
    );
  });

  it('loads place detail by FamilyPilot ID', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse(200, SAMPLE_DETAIL));

    const provider = new GooglePlacesProvider();
    const place = await provider.getPlace('fp-google-ChIJTestPlace123');

    expect(place?.name).toBe('Bushey Museum');
    expect(place?.website).toBe('https://busheymuseum.org');
    expect(fetch).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places/ChIJTestPlace123',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('throws rate limit error on HTTP 429', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchResponse(429, { error: { message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } }),
    );

    const provider = new GooglePlacesProvider();
    await expect(
      provider.searchNearby({ latitude: 51.643, longitude: -0.36, radiusKm: 8 }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('throws provider unavailable on server errors', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchResponse(503, { error: { message: 'Service unavailable' } }),
    );

    const provider = new GooglePlacesProvider();
    await expect(
      provider.searchNearby({ latitude: 51.643, longitude: -0.36, radiusKm: 8 }),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('throws network error when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'));

    const provider = new GooglePlacesProvider();
    await expect(
      provider.searchNearby({ latitude: 51.643, longitude: -0.36, radiusKm: 8 }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('throws when API key is missing', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', '');
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
    const provider = new GooglePlacesProvider();
    await expect(
      provider.searchNearby({ latitude: 0, longitude: 0, radiusKm: 1 }),
    ).rejects.toThrow('GOOGLE_PLACES_API_KEY is not configured');
    expect(fetch).not.toHaveBeenCalled();
  });
});
