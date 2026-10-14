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

describe('play cafés, toddler play and the distinctions between kinds (Tranche C)', () => {
  const GAMBADO = v('fp-fhrs-346104', 'Gambado', 'soft_play', { address: 'Chelsea, London' });
  const ABUELA = v('fp-fhrs-1691253', 'Abuela Play Café', 'soft_play', { address: 'Coulsdon' });
  const BRENT_C = v('fp-fhrs-1434379', 'Flip Out Brent Cross', 'activity', { address: 'Brent Cross' });
  const JUMP_ZONE = v('fp-fhrs-1935590', 'The Jump Zone', 'activity', { address: 'Beckton' });
  const CLIP_O2 = v('fp-fhrs-1857771', "Clip 'n Climb at The O2", 'activity', { address: 'Greenwich' });
  const CLIP_CR = v('fp-fhrs-1937580', "Clip 'n Climb Croydon", 'activity', { address: 'Croydon' });
  const CHEEKY = v('fp-fhrs-1961932', 'Cheeky Chops Play Café', 'activity', { address: 'Twickenham' });
  const DREAMI = v('fp-fhrs-1677302', 'Dreami Play Café', 'activity', { address: 'Hackney' });
  const RAFFYS = v('fp-fhrs-1756533', 'Raffys Play Cafe', 'activity', { address: 'Bromley' });
  const C = [GAMBADO, ABUELA, BRENT_C, JUMP_ZONE, CLIP_O2, CLIP_CR, CHEEKY, DREAMI, RAFFYS, PARK, MUSEUM];

  it('"soft play" lists dedicated soft play first, then mixed venues whose own pages confirm a soft-play area, and never a play café as soft play', () => {
    const out = searchVenues(C, 'soft play');
    expect(names(out.primary)).toEqual(['Gambado', 'Abuela Play Café', 'Flip Out Brent Cross', "Clip 'n Climb Croydon"]);
    expect(out.primary.some((x) => [CHEEKY.id, DREAMI.id, RAFFYS.id].includes(x.id))).toBe(false);
  });

  it('"soft play" shows the play cafés separately, under a heading that says soft play is not on record', () => {
    const group = searchVenues(C, 'soft play').also.find((g) => g.id === 'play_cafes');
    expect(group?.label).toBe('Related: play cafés for under-5s, soft play not on record');
    expect(names(group!.venues).sort()).toEqual(['Cheeky Chops Play Café', 'Dreami Play Café', 'Raffys Play Cafe']);
  });

  it('"soft play" does not list a trampoline park with no soft play as soft play', () => {
    const out = searchVenues(C, 'soft play');
    expect(out.primary.some((x) => x.id === JUMP_ZONE.id)).toBe(false);
    expect(out.also.find((g) => g.id === 'trampoline_only')?.venues.map((x) => x.id)).toEqual([JUMP_ZONE.id]);
  });

  it.each(['play café', 'Play Café', 'play cafe', 'play cafes', 'PLAY CAFÉ'])('"%s" finds the play cafés, with soft play only as a related heading', (query) => {
    const out = searchVenues(C, query);
    expect(names(out.primary).sort()).toEqual(['Cheeky Chops Play Café', 'Dreami Play Café', 'Raffys Play Cafe']);
    expect(out.interpretation).toBe('Play cafés');
    expect(names(out.also.find((g) => g.id === 'soft_play_related')!.venues)).toEqual(['Gambado', 'Abuela Play Café']);
  });

  it.each(['toddler play', 'indoor toddler activities', 'under 5s', 'under 5 activities', 'under-5 activities', 'toddler activities', 'stay and play'])('"%s" finds soft play first and the play cafés under their own heading', (query) => {
    const out = searchVenues(C, query);
    expect(out.active).toBe(true);
    expect(out.primary.map((x) => x.id).slice(0, 2)).toEqual([GAMBADO.id, ABUELA.id]);
    expect(names(out.also.find((g) => g.id === 'play_cafes')!.venues).sort()).toEqual(['Cheeky Chops Play Café', 'Dreami Play Café', 'Raffys Play Cafe']);
    expect(out.interpretation).toBe('Toddler play: soft play and play cafés');
  });

  it('a place word narrows a play-café search', () => {
    expect(names(searchVenues(C, 'play café hackney').primary)).toEqual(['Dreami Play Café']);
  });

  it('"trampoline" finds the trampoline parks, and "climbing" or "activities" still reach the climbing centres', () => {
    expect(names(searchVenues(C, 'trampoline').primary).sort()).toEqual(['Flip Out Brent Cross', 'The Jump Zone']);
    expect(searchVenues(C, 'activities').primary.map((x) => x.id)).toEqual(expect.arrayContaining([CLIP_O2.id, CLIP_CR.id, CHEEKY.id]));
  });

  it('the old words keep their old meaning: "soft play" for the Google-era venues is unchanged', () => {
    const old = searchVenues(ALL, 'soft play');
    expect(names(old.primary).sort()).toEqual(['Babylon Park London', 'Flip Out Brent Cross', 'Flip Out Canary Wharf', 'Flip Out Watford']);
  });
});
