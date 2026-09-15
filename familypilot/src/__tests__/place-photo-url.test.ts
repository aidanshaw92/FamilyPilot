import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  apiOrigin,
  photoCredit,
  resolvePlacePhotoUrl,
  resolvePlacePhotoUrls,
} from '@/src/services/places/place-photo-url';

/**
 * A real production row, taken from `place_records` in the pilot project. Google photo references
 * expire and cannot be resolved client-side without leaking the API key, so the sync worker stores
 * a path to our own proxy. This is what the Home deck is actually handed.
 */
const PRODUCTION_PHOTOS = [
  '/api/places/photo?id=ChIJr9KR08Q9dkgR_4iyIzFBRwk&index=0&credit=Richard%20Goldschmidt',
  '/api/places/photo?id=ChIJr9KR08Q9dkgR_4iyIzFBRwk&index=1&credit=mike%20Mevin',
  '/api/places/photo?id=ChIJr9KR08Q9dkgR_4iyIzFBRwk&index=2&credit=Dominic%20Flach',
];

const ORIGINAL_BASE = process.env.EXPO_PUBLIC_PLACES_API_URL;

afterEach(() => {
  if (ORIGINAL_BASE === undefined) delete process.env.EXPO_PUBLIC_PLACES_API_URL;
  else process.env.EXPO_PUBLIC_PLACES_API_URL = ORIGINAL_BASE;
  vi.unstubAllGlobals();
});

function withWindowOrigin(origin: string) {
  vi.stubGlobal('window', { location: { origin } });
}

describe('place photo urls', () => {
  it('turns a stored proxy path into something a native build can fetch', () => {
    // The bug this guards: on native there is no page to resolve "/api/..." against, so every
    // real venue photograph failed and the deck fell back to category gradients.
    process.env.EXPO_PUBLIC_PLACES_API_URL = 'https://familypilot.example/api/places';
    expect(resolvePlacePhotoUrl(PRODUCTION_PHOTOS[0])).toBe(
      'https://familypilot.example/api/places/photo?id=ChIJr9KR08Q9dkgR_4iyIzFBRwk&index=0&credit=Richard%20Goldschmidt',
    );
  });

  it('falls back to the page origin on web, where no base is configured', () => {
    delete process.env.EXPO_PUBLIC_PLACES_API_URL;
    withWindowOrigin('https://family-pilot.vercel.app');
    expect(resolvePlacePhotoUrl(PRODUCTION_PHOTOS[1])).toBe(
      'https://family-pilot.vercel.app/api/places/photo?id=ChIJr9KR08Q9dkgR_4iyIzFBRwk&index=1&credit=mike%20Mevin',
    );
  });

  it('keeps the credit query intact, so attribution still renders', () => {
    process.env.EXPO_PUBLIC_PLACES_API_URL = 'https://familypilot.example/api/places';
    const url = resolvePlacePhotoUrl(PRODUCTION_PHOTOS[2]);
    expect(new URL(url).searchParams.get('credit')).toBe('Dominic Flach');
    expect(url).toContain('/api/places/photo?');
  });

  it('leaves an absolute url alone', () => {
    const absolute = 'https://lh3.googleusercontent.com/place-photo/abc';
    expect(resolvePlacePhotoUrl(absolute)).toBe(absolute);
  });

  it('reports no photograph rather than an unusable one', () => {
    // A row with no photos, and a path with nowhere to resolve against, must both read as
    // "no photograph" so VenueImage draws the designed fallback instead of failing a request.
    delete process.env.EXPO_PUBLIC_PLACES_API_URL;
    vi.stubGlobal('window', undefined);
    expect(resolvePlacePhotoUrl(PRODUCTION_PHOTOS[0])).toBe('');
    expect(resolvePlacePhotoUrl(undefined)).toBe('');
    expect(resolvePlacePhotoUrl('')).toBe('');
    expect(apiOrigin()).toBeNull();
  });

  it('resolves a whole photo list and drops what it cannot resolve', () => {
    process.env.EXPO_PUBLIC_PLACES_API_URL = 'https://familypilot.example/api/places';
    const resolved = resolvePlacePhotoUrls([...PRODUCTION_PHOTOS, 'not-a-path', '']);
    expect(resolved).toHaveLength(3);
    expect(resolved.every((url) => url.startsWith('https://familypilot.example/'))).toBe(true);
    expect(resolvePlacePhotoUrls(null)).toEqual([]);
  });

  it('takes the bare origin from a configured base that carries a path', () => {
    process.env.EXPO_PUBLIC_PLACES_API_URL = 'https://staging.familypilot.example/api/places/';
    expect(apiOrigin()).toBe('https://staging.familypilot.example');
  });
});

describe('photo attribution', () => {
  it('names the photographer Google requires us to credit', () => {
    expect(photoCredit(PRODUCTION_PHOTOS[0])).toBe('Richard Goldschmidt');
    expect(photoCredit('https://host/api/places/photo?id=x&index=0&credit=Babs%20Kehinde')).toBe(
      'Babs Kehinde',
    );
  });

  it('has no credit to show for anything that is not one of our proxied photos', () => {
    expect(photoCredit('https://lh3.googleusercontent.com/x')).toBeNull();
    expect(photoCredit('/api/places/photo?id=x&index=0&credit=')).toBeNull();
    expect(photoCredit(undefined)).toBeNull();
    expect(photoCredit('')).toBeNull();
  });
});
