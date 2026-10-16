import { describe, expect, it, vi } from 'vitest';

import { lookupArea, AREA_HELP } from '@/src/services/explore/area-lookup';
import { requestDeviceLocation, deviceLocationSupported } from '@/src/services/explore/device-location';
import { useFiltersStore } from '@/src/stores/filters-store';
import { Venue } from '@/src/types';
import {
  areaDisplayName, coverageAround, DEFAULT_RADIUS_MILES, formatMiles, homeAnchor, KM_PER_MILE, locate, milesBetween, RADIUS_MILES,
  widerRadiusWithMore,
} from '@/src/utils/explore-geo';

const at = (lat: number, lng: number, id = 'v'): Venue => ({ id, name: id, category: 'park', latitude: lat, longitude: lng, driveMinutes: 10, imageUrl: '', familyScore: { score: 1, factors: {} as never, explanation: [] } }) as Venue;

describe('miles', () => {
  it('measures the great-circle distance in miles, from the same coordinates the kilometres come from', () => {
    // Charing Cross to the Greenwich Observatory: about 9.4 km, 5.87 miles.
    const miles = milesBetween({ latitude: 51.5074, longitude: -0.1278 }, { latitude: 51.4769, longitude: -0.0005 });
    expect(miles).toBeGreaterThan(5.8);
    expect(miles).toBeLessThan(5.95);
    expect(KM_PER_MILE).toBeCloseTo(1.609344, 6);
  });

  it('words a distance the way a parent says it', () => {
    expect(formatMiles(0.04)).toBe('0 miles');
    expect(formatMiles(0.24)).toBe('0.2 miles');
    expect(formatMiles(1)).toBe('1 mile');
    expect(formatMiles(4.16)).toBe('4.2 miles');
    expect(formatMiles(12.4)).toBe('12 miles');
    expect(formatMiles(Number.NaN)).toBe('distance not known');
  });

  it('offers 2, 5 and 10 miles, and 5 by default', () => {
    expect([...RADIUS_MILES]).toEqual([2, 5, 10]);
    expect(DEFAULT_RADIUS_MILES).toBe(5);
  });
});

describe('the anchor', () => {
  it('uses the family\'s own home coordinates, and shows a postcode as its first half', () => {
    const a = homeAnchor({ homeLocation: 'NW5 1TL', homeLatitude: 51.55, homeLongitude: -0.14 });
    expect(a).toMatchObject({ kind: 'home', label: 'Near NW5', latitude: 51.55, longitude: -0.14 });
    expect(a.standIn).toBeUndefined();
    expect(areaDisplayName('nw5 1tl')).toBe('NW5');
    expect(areaDisplayName('Camden')).toBe('Camden');
  });

  it('never presents central London as the family\'s home: with nothing known it says so', () => {
    const a = homeAnchor({ homeLocation: '', homeLatitude: null, homeLongitude: null });
    expect(a.standIn).toBe(true);
    expect(a.label).toBe('Central London');
    expect(a.detail).toMatch(/Add your postcode/);
  });

  it('knows a few towns without any lookup', () => {
    expect(homeAnchor({ homeLocation: 'Richmond', homeLatitude: null, homeLongitude: null }).standIn).toBeUndefined();
  });
});

describe('coverage around a point', () => {
  const anchor = { kind: 'home' as const, label: 'x', detail: 'x', latitude: 51.5, longitude: -0.1 };
  // About 1 mile, 4 miles and 8 miles east of the anchor (a degree of longitude is about 43 miles here).
  const venues = [at(51.5, -0.1 + 1 / 43.2, 'a'), at(51.5, -0.1 + 4 / 43.2, 'b'), at(51.5, -0.1 + 8 / 43.2, 'c')];

  it('counts what is within 2, 5 and 10 miles and finds the nearest', () => {
    const c = coverageAround(locate(venues, anchor));
    expect([c.within2, c.within5, c.within10, c.total]).toEqual([1, 2, 3, 3]);
    expect(c.nearestMiles).toBeGreaterThan(0.9);
    expect(c.nearestMiles).toBeLessThan(1.1);
  });

  it('offers the next radius only when it holds something new', () => {
    const c = coverageAround(locate(venues, anchor));
    expect(widerRadiusWithMore(c, 2)).toBe(5);
    expect(widerRadiusWithMore(c, 5)).toBe(10);
    expect(widerRadiusWithMore(c, 10)).toBeNull();
    expect(widerRadiusWithMore(coverageAround([]), 2)).toBeNull();
  });
});

describe('looking up an area costs nothing and never guesses', () => {
  const body = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ status: 200, result }) }) as unknown as Response;

  it('looks a postcode up on postcodes.io only, and shows its first half', async () => {
    const fetchImpl = vi.fn(async () => body({ latitude: 51.5512, longitude: -0.1469, outcode: 'NW5' }));
    const out = await lookupArea('nw5 1tl', fetchImpl as never);
    expect(out).toMatchObject({ ok: true, label: 'Near NW5', latitude: 51.5512 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toBe('https://api.postcodes.io/postcodes/NW51TL');
  });

  it('accepts just the first half of a postcode', async () => {
    const fetchImpl = vi.fn(async () => body({ latitude: 51.55, longitude: -0.14 }));
    const out = await lookupArea('NW5', fetchImpl as never);
    expect(out).toMatchObject({ ok: true, label: 'Near NW5' });
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toBe('https://api.postcodes.io/outcodes/NW5');
  });

  it('answers a well-known town from the built-in list, with no request at all', async () => {
    const fetchImpl = vi.fn();
    const out = await lookupArea('richmond', fetchImpl as never);
    expect(out.ok).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not send any other town name to a geocoder: it says what it can look up', async () => {
    const fetchImpl = vi.fn();
    const out = await lookupArea('Grimsby', fetchImpl as never);
    expect(out).toEqual({ ok: false, message: AREA_HELP });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('says plainly when a postcode is not found or the lookup is unreachable', async () => {
    const notFound = await lookupArea('ZZ9 9ZZ', (async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response) as never);
    expect(notFound).toMatchObject({ ok: false, message: expect.stringMatching(/could not find that postcode/i) });
    const down = await lookupArea('NW5 1TL', (async () => { throw new Error('offline'); }) as never);
    expect(down).toMatchObject({ ok: false, message: expect.stringMatching(/try again/i) });
  });
});

describe('the device location', () => {
  it('is asked for only when called, and a refusal is an ordinary answer', async () => {
    const denied = await requestDeviceLocation({ getCurrentPosition: (_ok: unknown, fail: (e: { code: number }) => void) => fail({ code: 1 }) } as never);
    expect(denied).toEqual({ ok: false, reason: 'denied' });
    const timeout = await requestDeviceLocation({ getCurrentPosition: (_ok: unknown, fail: (e: { code: number }) => void) => fail({ code: 3 }) } as never);
    expect(timeout).toEqual({ ok: false, reason: 'timeout' });
    expect(await requestDeviceLocation(undefined)).toEqual({ ok: false, reason: 'unavailable' });
    expect(deviceLocationSupported(undefined)).toBe(false);
  });

  it('returns the coordinates to the caller and keeps nothing itself', async () => {
    const geo = { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 51.5, longitude: -0.1 } }) };
    expect(await requestDeviceLocation(geo as never)).toEqual({ ok: true, latitude: 51.5, longitude: -0.1 });
  });
});

describe('Explore\'s one state', () => {
  it('keeps the search, group and filters when the mode or the view changes', () => {
    const s = useFiltersStore.getState();
    s.clearAllExplore();
    s.setExploreQuery('soft play');
    s.setCategoryFilter('play');
    s.toggleAdvancedFilter('parking');
    s.setExploreScope('all');
    s.setExploreView('map');
    const after = useFiltersStore.getState();
    expect([after.exploreQuery, after.categoryFilter, after.advancedFilters]).toEqual(['soft play', 'play', ['parking']]);
    s.setExploreScope('nearby');
    s.setExploreView('list');
    const back = useFiltersStore.getState();
    expect([back.exploreQuery, back.categoryFilter, back.advancedFilters]).toEqual(['soft play', 'play', ['parking']]);
  });

  it('removes only the filter that was removed, and Clear all clears the search, group, filters and distance but not the place', () => {
    const s = useFiltersStore.getState();
    s.clearAllExplore();
    s.toggleAdvancedFilter('parking');
    s.toggleAdvancedFilter('baby_changing');
    s.toggleAdvancedFilter('parking');
    expect(useFiltersStore.getState().advancedFilters).toEqual(['baby_changing']);
    s.setExploreRadius(10);
    s.setExploreQuery('farm');
    s.setExploreAnchor({ kind: 'area', label: 'Near NW5', detail: 'x', latitude: 51.5, longitude: -0.1 });
    s.clearAllExplore();
    const cleared = useFiltersStore.getState();
    expect([cleared.exploreQuery, cleared.categoryFilter, cleared.advancedFilters, cleared.exploreRadius]).toEqual(['', 'all', [], 5]);
    expect(cleared.exploreAnchor?.label).toBe('Near NW5');
    s.setExploreAnchor(null);
  });
});
