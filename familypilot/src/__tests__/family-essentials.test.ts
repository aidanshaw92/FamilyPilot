import { describe, expect, it } from 'vitest';

import { NOT_CONFIRMED, familyEssentialRows } from '@/src/utils/family-essentials';
import { VenueDetail } from '@/src/types';

const base = {
  id: 'v1', name: 'Test Park', category: 'park', openingHours: '', facilities: [],
} as unknown as VenueDetail;

const byKey = (venue: VenueDetail) => Object.fromEntries(familyEssentialRows(venue).map((r) => [r.key, r]));

describe('family essentials rows', () => {
  it('says Not confirmed for everything when nothing has been established', () => {
    const rows = familyEssentialRows(base);
    expect(rows.map((r) => r.label)).toEqual(['Baby changing', 'Buggy access', 'Toilets', 'Parking', 'Food', 'Best for ages', 'Terrain', 'Opening hours']);
    expect(rows.every((r) => r.value === NOT_CONFIRMED && r.confirmed === false)).toBe(true);
  });

  it('a category never implies a facility: a park with no facts has no toilets row value', () => {
    expect(byKey({ ...base, category: 'park' } as VenueDetail).toilets.value).toBe(NOT_CONFIRMED);
  });

  it('reads reviewed tri-states, including a reviewed no', () => {
    const venue = { ...base, trustedFacts: { babyChanging: 'yes', toilets: 'no', parking: 'unknown', pushchairSuitability: 'difficult' } } as unknown as VenueDetail;
    const rows = byKey(venue);
    expect(rows['baby-changing']).toMatchObject({ value: 'Available', confirmed: true });
    expect(rows.toilets).toMatchObject({ value: 'None on site', confirmed: true });
    expect(rows.parking).toMatchObject({ value: NOT_CONFIRMED, confirmed: false });
    expect(rows.buggy).toMatchObject({ value: 'Reviewed as difficult', confirmed: true });
  });

  it('a confirmed facility counts, and reviewed parking detail wins over the generic value', () => {
    const venue = { ...base, facilities: ['parking', 'cafe', 'picnic', 'toilets'], parkingInfo: 'Free car park, 120 spaces' } as unknown as VenueDetail;
    const rows = byKey(venue);
    expect(rows.parking.value).toBe('Free car park, 120 spaces');
    expect(rows.food.value).toBe('Café and picnic area');
    expect(rows.toilets.value).toBe('On site');
    const free = { ...base, facilities: ['parking'], trustedFacts: { freeParking: 'yes' } } as unknown as VenueDetail;
    expect(byKey(free).parking.value).toBe('Free, on site');
  });

  it('ages come from reviewed facts first, then the venue summary, and are otherwise unknown', () => {
    expect(byKey({ ...base, trustedFacts: { minRecommendedAge: 2, maxRecommendedAge: 10 } } as unknown as VenueDetail).ages.value).toBe('Ages 2 to 10');
    expect(byKey({ ...base, trustedFacts: { minRecommendedAge: 3, maxRecommendedAge: null } } as unknown as VenueDetail).ages.value).toBe('Ages 3 and up');
    expect(byKey({ ...base, bestAges: '2 to 10' } as unknown as VenueDetail).ages.value).toBe('2 to 10');
    expect(byKey(base).ages.value).toBe(NOT_CONFIRMED);
  });

  it('terrain reads the reviewed label and is otherwise unknown', () => {
    expect(byKey({ ...base, terrain: 'flat' } as VenueDetail).terrain.value).toBe('Mostly flat');
    expect(byKey(base).terrain.confirmed).toBe(false);
  });

  it('opening hours show only when the record has them', () => {
    expect(byKey({ ...base, openingHours: 'Mon-Sun 9:00-17:00' } as VenueDetail).hours).toMatchObject({ value: 'Mon-Sun 9:00-17:00', confirmed: true });
    expect(byKey({ ...base, openingHours: '  ' } as VenueDetail).hours.confirmed).toBe(false);
  });
});
