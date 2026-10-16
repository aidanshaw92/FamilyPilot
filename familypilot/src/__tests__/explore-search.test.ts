import { describe, expect, it } from 'vitest';

import { Venue, VenueCategory } from '@/src/types';
import { searchVenues } from '@/src/utils/explore-search';

const v = (id: string, name: string, category: VenueCategory, extra: Partial<Venue> = {}): Venue =>
  ({ id, name, category, latitude: 51.5, longitude: -0.1, driveMinutes: 20, imageUrl: '', address: 'London', familyScore: { score: 70, factors: {} as never, explanation: [] }, ...extra }) as Venue;

// The six stored "soft play" venues, with their real ids (reviewed in docs/CATALOGUE_CORRECTIONS.md), and neighbours.
const BABYLON = v('fp-google-ChIJ7_PV980bdkgROekbwOVWVfo', 'Babylon Park London', 'soft_play');
const BRENT = v('fp-google-ChIJb5wm6eQQdkgR-qbm_aXw0xw', 'Flip Out Brent Cross', 'soft_play');
const CANARY = v('fp-google-ChIJ2fFKeuMDdkgRLHMNKVOxX_s', 'Flip Out Canary Wharf', 'soft_play');
const WATFORD = v('fp-google-ChIJ0ZZcI7hrdkgR4ooSY3kKOMo', 'Flip Out Watford', 'soft_play');
const AIRHOP = v('fp-google-ChIJbe-XLh0fdkgRnjEVL2_qP3E', 'AirHop Adventure & Trampoline Park Enfield', 'soft_play');
const JUMP_IN = v('fp-google-ChIJi3VUUWoWdkgRluIRG5hbIlY', 'Jump In by AirHop Adventure & Trampoline Park Elstree', 'soft_play');
const UNREVIEWED = v('x-play-house', 'Kettleford Play House', 'soft_play');
const LONDON_EYE = v('x-eye', 'London Eye', 'attraction');
const MUSEUM = v('x-museum', 'The Postal Museum', 'museum', { address: 'Phoenix Place, London' });
const FARM = v('x-farm', 'Hackney City Farm', 'farm', { address: 'Hackney, London' });
const ZOO = v('x-zoo', 'London Zoo', 'zoo');
const PARK = v('x-park', 'Clissold Park', 'park', { trustedFacts: { playground: 'unknown' } as never });
const PARK_PG = v('x-park-pg', 'Gladstone Park', 'park', { trustedFacts: { playground: 'yes' } as never });
const ALL = [PARK, PARK_PG, BABYLON, BRENT, CANARY, WATFORD, AIRHOP, JUMP_IN, UNREVIEWED, LONDON_EYE, MUSEUM, FARM, ZOO];

const names = (list: Venue[]) => list.map((x) => x.name);

describe('searching "soft play"', () => {
  const out = searchVenues(ALL, 'soft play');

  it('lists the places whose own pages say they have soft play, and only those, as soft play', () => {
    expect(names(out.primary).sort()).toEqual(['Babylon Park London', 'Flip Out Brent Cross', 'Flip Out Canary Wharf', 'Flip Out Watford']);
  });

  it('never lists a trampoline park as soft play: it goes under its own heading', () => {
    expect(out.primary.some((x) => x.id === AIRHOP.id || x.id === JUMP_IN.id)).toBe(false);
    const group = out.also.find((g) => g.id === 'trampoline_only');
    expect(group?.label).toBe('Also: trampoline parks, soft play not on record');
    expect(names(group!.venues).sort()).toEqual([AIRHOP.name, JUMP_IN.name].sort());
  });

  it('keeps an unreviewed indoor play venue apart, saying soft play is not confirmed', () => {
    expect(out.also.find((g) => g.id === 'indoor_play')?.venues.map((x) => x.id)).toEqual([UNREVIEWED.id]);
  });

  it('says what it took the words to mean, and treats a place word as a place', () => {
    expect(out.interpretation).toBe('Soft play');
    expect(names(searchVenues([...ALL, v('x-sp-camden', 'Tiny Tots Soft Play', 'soft_play', { address: 'Camden, London' })], 'soft play camden').primary)).toEqual(['Tiny Tots Soft Play']);
  });
});

describe('searching "trampoline"', () => {
  it('lists the places with trampolines and not one that says it has none', () => {
    const out = searchVenues(ALL, 'trampoline');
    expect(names(out.primary).sort()).toEqual(['AirHop Adventure & Trampoline Park Enfield', 'Flip Out Brent Cross', 'Flip Out Watford', 'Jump In by AirHop Adventure & Trampoline Park Elstree']);
    expect(out.primary.some((x) => x.id === CANARY.id)).toBe(false);
  });
});

describe('other searches', () => {
  it('lists a place by name first, wherever it is', () => {
    const out = searchVenues(ALL, 'london eye');
    expect(names(out.primary)[0]).toBe('London Eye');
  });

  it('finds the kind of place a parent means', () => {
    expect(names(searchVenues(ALL, 'museum').primary)).toEqual(['The Postal Museum']);
    expect(names(searchVenues(ALL, 'farm').primary)).toContain('Hackney City Farm');
    expect(names(searchVenues(ALL, 'zoo').primary)[0]).toBe('London Zoo');
  });

  it('puts parks with a confirmed playground first when asked for a playground, and keeps the other parks', () => {
    const out = searchVenues(ALL, 'playground');
    expect(names(out.primary)).toEqual(['Gladstone Park', 'Clissold Park']);
  });

  it('finds a place by where it is', () => {
    expect(names(searchVenues(ALL, 'hackney').primary)).toEqual(['Hackney City Farm']);
  });

  it('returns everything for an empty search and nothing for words that match nothing', () => {
    expect(searchVenues(ALL, '   ').active).toBe(false);
    expect(searchVenues(ALL, '   ').primary).toHaveLength(ALL.length);
    expect(searchVenues(ALL, 'zzzz nothing').primary).toEqual([]);
  });
});
