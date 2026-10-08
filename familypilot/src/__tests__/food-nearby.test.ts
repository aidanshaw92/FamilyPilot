import { describe, expect, it } from 'vitest';

import { filterVenues } from '@/src/utils/filter-venues';
import { countFoodUnknown, foodNearbyLine, foodRankBonus, matchesFoodFilter } from '@/src/utils/food-nearby';
import { Venue } from '@/src/types';

const { summariseFood, attachFoodProximity, keyFor } = require('../../../server/places/lib/food-proximity');

function venue(id: string, extra: Partial<Venue> = {}, score = 70): Venue {
  return {
    id, name: id, category: 'park', latitude: 51.5, longitude: -0.1, driveMinutes: 10, imageUrl: '',
    familyScore: { score, factors: {} as never, explanation: [] },
    ...extra,
  } as Venue;
}
const food = (nearest: number | null, w5: number, w10: number) => ({ checkedAt: 'x', nearestWalkMinutes: nearest, within5: w5, within10: w10, source: 'osm' as const });

describe('food nearby: filters keep only what is known', () => {
  const cafe = venue('cafe-on-site', { facilities: ['cafe'] as never });
  const close = venue('close', { foodNearby: food(4, 2, 4) });
  const mid = venue('mid', { foodNearby: food(8, 0, 1) });
  const none = venue('looked-nothing', { foodNearby: food(null, 0, 0) });
  const unknown = venue('never-looked');
  const all = [cafe, close, mid, none, unknown];

  it('café on site is only ever a confirmed facility', () => {
    expect(all.filter((v) => matchesFoodFilter(v, 'food_onsite')).map((v) => v.id)).toEqual(['cafe-on-site']);
  });
  it('within 5 and 10 minutes', () => {
    expect(all.filter((v) => matchesFoodFilter(v, 'food_5')).map((v) => v.id)).toEqual(['cafe-on-site', 'close']);
    expect(all.filter((v) => matchesFoodFilter(v, 'food_10')).map((v) => v.id)).toEqual(['cafe-on-site', 'close', 'mid']);
  });
  it('a place with no lookup is unknown, not "no food"; a looked-up empty place is simply not a match', () => {
    expect(countFoodUnknown(all)).toBe(1);
    expect(foodNearbyLine(unknown)).toBeNull();
    expect(foodNearbyLine(none)).toBeNull();
    expect(foodNearbyLine(close)).toBe('Food about 4 min walk');
    expect(foodNearbyLine(cafe)).toBe('Café on site');
  });
  it('the filter changes the order only among places that pass, and never above a much better fit', () => {
    const better = venue('much-better', { foodNearby: food(9, 0, 1) }, 90);
    const easy = venue('easy-lunch', { facilities: ['cafe'] as never }, 70);
    const ids = filterVenues([easy, better], 'all', ['food_10'], 'any', 'any').map((v) => v.id);
    expect(ids).toEqual(['much-better', 'easy-lunch']);
    const near = venue('near', { foodNearby: food(3, 1, 1) }, 70);
    const far = venue('far', { foodNearby: food(10, 0, 1) }, 71);
    expect(filterVenues([far, near], 'all', ['food_10'], 'any', 'any').map((v) => v.id)).toEqual(['near', 'far']);
    expect(foodRankBonus(unknown)).toBe(0);
  });
});

describe('food proximity overlay reads stored lookups and never a provider', () => {
  const anchor = { latitude: 51.5, longitude: -0.1 };
  it('summarises a stored payload into walk-minute counts', () => {
    const payload = { fetchedAt: 'then', candidates: [
      { latitude: 51.5005, longitude: -0.1 },   // ~55 m -> 1-2 min
      { latitude: 51.504, longitude: -0.1 },    // ~445 m -> ~8 min
      { latitude: 51.52, longitude: -0.1 },     // ~2.2 km -> beyond a walk
    ] };
    const out = summariseFood(anchor, payload, 'when');
    expect(out.within5).toBe(1);
    expect(out.within10).toBe(2);
    expect(out.nearestWalkMinutes).toBeLessThanOrEqual(3);
    expect(out.checkedAt).toBe('when');
    expect(summariseFood(anchor, {}, 'when')).toBeNull();
  });
  it('one query, only the cache table, and places without a row stay unknown', async () => {
    const calls: string[] = [];
    const a = { familypilotId: 'a', ...anchor };
    const b = { familypilotId: 'b', latitude: 51.6, longitude: -0.2 };
    const db = {
      from(table: string) {
        calls.push(table);
        return { select: () => ({ in: async (_c: string, keys: string[]) => ({ data: keys.filter((k) => k === keyFor(a)).map((k) => ({ cache_key: k, fetched_at: 'f', payload: { candidates: [{ latitude: 51.5005, longitude: -0.1 }] } })), error: null }) }) };
      },
    };
    const out = await attachFoodProximity([a, b], db);
    expect(calls).toEqual(['place_search_cache']);
    expect(out[0].foodNearby.within5).toBe(1);
    expect(out[1].foodNearby).toBeUndefined();
  });
});
