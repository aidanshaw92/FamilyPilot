import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The layer that stops every Venue Detail render issuing a fresh Overpass request, and that decides
 * what travel figures a surface is allowed to show.
 *
 * The cache is mocked rather than hitting Supabase, so these are about the POLICY: how many provider
 * requests a given sequence of reads costs, and which travel numbers exist at all.
 */

const anchor = { latitude: 51.5074, longitude: -0.1278, placeId: 'fp-google-anchor' };

const candidate = (over: Record<string, any> = {}) => ({
  familypilotId: `fp-osm-node-${over.id ?? 1}`,
  externalId: `osm:node/${over.id ?? 1}`,
  provider: 'osm',
  name: over.name ?? 'Corner Cafe',
  category: over.category ?? 'cafe',
  latitude: over.latitude ?? 51.5085,
  longitude: over.longitude ?? -0.1285,
  distanceKm: over.distanceKm ?? 0.14,
  cuisine: over.cuisine ?? null,
  openingHours: over.openingHours ?? null,
  address: null,
  website: null,
  phone: null,
  tagged: over.tagged ?? {},
});

let searchCalls: any[] = [];
let cacheReads: string[] = [];
let cacheWrites: Array<{ key: string; payload: any; meta: any }> = [];
let stored: Map<string, { payload: any; fresh: boolean }>;
let discovery: () => any;
let writeSucceeds = true;

/**
 * The collaborators, injected rather than mocked at the module boundary.
 *
 * An earlier version of this file used `vi.mock` on the provider path. It did not intercept, because
 * nearby-food.js is CommonJS and requires its sibling directly -- so the suite was calling the REAL
 * Overpass client. That is the abuse of public infrastructure this design exists to avoid, and it is
 * why the module takes a deps argument now.
 */
const deps = () => ({
  search: async (a: any, opts: any) => {
    searchCalls.push({ anchor: a, opts });
    return discovery();
  },
  readCache: async (key: string) => {
    cacheReads.push(key);
    const row = stored.get(key);
    return row ? { payload: row.payload, provider: 'osm', ageHours: 1, fresh: row.fresh } : null;
  },
  writeCache: async (key: string, payload: any, meta: any) => {
    cacheWrites.push({ key, payload, meta });
    if (!writeSucceeds) return false;
    stored.set(key, { payload, fresh: true });
    return true;
  },
});

let getNearbyFood: any;

beforeEach(async () => {
  searchCalls = [];
  cacheReads = [];
  cacheWrites = [];
  stored = new Map();
  discovery = () => ({
    candidates: [candidate()],
    provider: 'osm',
    radiusM: 1200,
    overpassRequests: 1,
    fetchedAt: '2026-10-02T09:00:00.000Z',
  });
  writeSucceeds = true;
  ({ getNearbyFood } = await import('../../../server/places/lib/nearby-food.js'));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('one anchor costs one Overpass request, not one per render', () => {
  it('queries the provider on a cache miss and stores the result', async () => {
    const result = await getNearbyFood(anchor, undefined, deps());
    expect(searchCalls).toHaveLength(1);
    expect(cacheWrites).toHaveLength(1);
    expect(result.cacheState).toBe('miss');
    expect(result.overpassRequests).toBe(1);
  });

  it('serves a repeated render from the cache without touching Overpass at all', async () => {
    await getNearbyFood(anchor, undefined, deps());
    searchCalls = [];
    const second = await getNearbyFood(anchor, undefined, deps());
    const third = await getNearbyFood(anchor, undefined, deps());
    expect(searchCalls).toHaveLength(0);
    expect(second.cacheState).toBe('hit');
    expect(third.cacheState).toBe('hit');
    expect(second.overpassRequests).toBe(0);
  });

  it('shares one stored row between different parents at the same anchor', async () => {
    // The whole point of caching on the anchor rather than per user: the second family's lunch
    // options cost nothing.
    await getNearbyFood({ ...anchor, placeId: 'parent-one' }, undefined, deps());
    searchCalls = [];
    const other = await getNearbyFood({ ...anchor, placeId: 'parent-two' }, undefined, deps());
    expect(searchCalls).toHaveLength(0);
    expect(other.cacheState).toBe('hit');
  });

  it('keys on coordinates rounded to about eleven metres, so GPS noise is not a cache miss', async () => {
    await getNearbyFood(anchor, undefined, deps());
    searchCalls = [];
    await getNearbyFood({ ...anchor, latitude: anchor.latitude + 0.000002 }, undefined, deps());
    expect(searchCalls).toHaveLength(0);
  });

  it('keys food separately from venue discovery, so the two never collide', async () => {
    await getNearbyFood(anchor, undefined, deps());
    expect(cacheReads[0]).toContain('nearby-food');
    expect(cacheReads[0]).toContain('restaurant');
  });

  it('still answers when the cache write fails, rather than failing the lookup', async () => {
    writeSucceeds = false;
    const result = await getNearbyFood(anchor, undefined, deps());
    expect(result.candidates).toHaveLength(1);
    expect(cacheWrites).toHaveLength(1);
  });

  it('serves a stale row rather than nothing, and says it is stale', async () => {
    await getNearbyFood(anchor, undefined, deps());
    const key = cacheWrites[0].key;
    stored.set(key, { payload: cacheWrites[0].payload, fresh: false });
    searchCalls = [];
    const result = await getNearbyFood(anchor, undefined, deps());
    expect(searchCalls).toHaveLength(0);
    expect(result.cacheState).toBe('stale');
  });
});

describe('discovery first, routing second', () => {
  it('costs zero routing calls however many candidates there are', async () => {
    discovery = () => ({
      candidates: Array.from({ length: 20 }, (_, i) =>
        candidate({ id: i, name: `Place ${i}`, latitude: 51.5085 + i * 0.0005 }),
      ),
      provider: 'osm',
      radiusM: 1200,
      overpassRequests: 1,
      fetchedAt: '2026-10-02T09:00:00.000Z',
    });
    const result = await getNearbyFood(anchor, undefined, deps());
    // Twenty candidates across three modes would be sixty route calls. The design is that the number
    // is arithmetic, so it is zero.
    expect(result.googleCalls).toBe(0);
    expect(result.candidates.length).toBeGreaterThan(1);
    expect(
      result.candidates.every((c: any) =>
        c.travel.every((t: any) => t.source === 'estimated-distance'),
      ),
    ).toBe(true);
    // The claim that matters: nothing here may be presented as a measured journey.
    expect(
      result.candidates.every((c: any) =>
        c.travel.every((t: any) => t.source !== 'routed' && t.source !== 'cached-route'),
      ),
    ).toBe(true);
  });
});

describe('what the travel figures are allowed to claim', () => {
  it('labels every mode as an estimate, because not one of them was routed', async () => {
    const { candidates } = await getNearbyFood(anchor, undefined, deps());
    expect(candidates[0].travel.every((leg: any) => leg.source === 'estimated-distance')).toBe(true);
    expect(candidates[0].travel.some((leg: any) => leg.source === 'routed')).toBe(false);
    expect(candidates[0].travel.some((leg: any) => leg.source === 'cached-route')).toBe(false);
  });

  it('rates a walking estimate as less trustworthy than a driving one', async () => {
    // Not decoration. A detour factor on a straight line models a drive tolerably and a walk badly:
    // pedestrian routes bend around blocks, crossings and rivers, and a river in the way can double
    // the real journey while leaving the straight line untouched.
    const { candidates } = await getNearbyFood(anchor, undefined, deps());
    const walk = candidates[0].travel.find((leg: any) => leg.mode === 'walk');
    const drive = candidates[0].travel.find((leg: any) => leg.mode === 'drive');
    expect(walk.confidence).toBe('low');
    expect(drive.confidence).toBe('medium');
  });

  it('gives every leg a duration under the canonical field name', async () => {
    // `minutes` was a local shape that drifted from the product's TravelLeg. One name, one meaning.
    const { candidates } = await getNearbyFood(anchor, undefined, deps());
    for (const leg of candidates[0].travel) {
      expect(typeof leg.durationMinutes).toBe('number');
      expect(leg.durationMinutes).toBeGreaterThan(0);
      expect(leg).not.toHaveProperty('minutes');
    }
  });

  it('offers walking and driving for somewhere genuinely close', async () => {
    const { candidates } = await getNearbyFood(anchor, undefined, deps());
    expect(candidates[0].travel.map((o: any) => o.mode).sort()).toEqual(['drive', 'walk']);
  });

  it('omits walking rather than suggesting an hour on foot with a toddler', async () => {
    discovery = () => ({
      // 2.4km: inside the radius asked for, but 2.4km x 1.35 detour at a family's walking pace is
      // well past half an hour, so the walk option must not be offered.
      candidates: [candidate({ latitude: 51.5290, longitude: -0.1278, distanceKm: 2.4 })],
      provider: 'osm',
      radiusM: 2500,
      overpassRequests: 1,
      fetchedAt: '2026-10-02T09:00:00.000Z',
    });
    const { candidates } = await getNearbyFood(anchor, { radiusM: 2500 }, deps());
    expect(candidates[0].travel.map((o: any) => o.mode)).toEqual(['drive']);
  });

  it('NEVER estimates public transport from a straight line', async () => {
    // A straight line says nothing about whether a bus runs. Inventing a public-transport duration
    // from distance would be the worst kind of manufactured fact, so its absence is the answer.
    const { candidates } = await getNearbyFood(anchor, undefined, deps());
    expect(candidates[0].travel.some((o: any) => o.mode === 'transit')).toBe(false);
    expect(candidates[0].travel.some((o: any) => o.mode === 'bus')).toBe(false);
  });

  it('walking is slower than an adult pace, because the party includes children', async () => {
    const { estimateWalkMinutes } = await import('../../../server/places/lib/nearby-food.js');
    // 1km straight line. An adult at 5km/h would be 12 min; a family with a detour factor is more.
    const minutes = estimateWalkMinutes(51.5, -0.1, 51.509, -0.1);
    expect(minutes).toBeGreaterThan(12);
  });
});

describe('ranking is about a family journey, not a straight line', () => {
  it('puts a walkable place above a closer-by-road one that cannot be walked to', async () => {
    discovery = () => ({
      candidates: [
        // Further in a straight line, but comfortably walkable.
        candidate({ id: 1, name: 'Walkable', latitude: 51.5100, longitude: -0.1278, distanceKm: 0.29 }),
        // Nearer as the crow flies but across the radius, so no walk option.
        candidate({ id: 2, name: 'Drive Only', latitude: 51.5300, longitude: -0.1278, distanceKm: 2.5 }),
      ],
      provider: 'osm',
      radiusM: 2500,
      overpassRequests: 1,
      fetchedAt: '2026-10-02T09:00:00.000Z',
    });
    const { candidates } = await getNearbyFood(anchor, { radiusM: 2500 }, deps());
    expect(candidates[0].name).toBe('Walkable');
  });

  it('does not let a mapped opening_hours outrank being walkable', async () => {
    // The hours tag is a small nudge, not a dominant factor: it says we KNOW the hours, not that the
    // place is open, and a parent still has to get there.
    discovery = () => ({
      candidates: [
        candidate({ id: 1, name: 'Walkable No Hours', latitude: 51.5090, longitude: -0.1278, distanceKm: 0.18 }),
        candidate({ id: 2, name: 'Far With Hours', latitude: 51.5400, longitude: -0.1278, distanceKm: 3.6, openingHours: 'Mo-Su 08:00-20:00' }),
      ],
      provider: 'osm',
      radiusM: 2500,
      overpassRequests: 1,
      fetchedAt: '2026-10-02T09:00:00.000Z',
    });
    const { candidates } = await getNearbyFood(anchor, { radiusM: 2500 }, deps());
    expect(candidates[0].name).toBe('Walkable No Hours');
  });

  it('caps how many candidates a surface is handed', async () => {
    discovery = () => ({
      candidates: Array.from({ length: 50 }, (_, i) =>
        candidate({ id: i, name: `Place ${i}`, latitude: 51.5085 + i * 0.0002 }),
      ),
      provider: 'osm',
      radiusM: 1200,
      overpassRequests: 1,
      fetchedAt: '2026-10-02T09:00:00.000Z',
    });
    const { candidates, totalFound } = await getNearbyFood(anchor, undefined, deps());
    expect(candidates.length).toBeLessThanOrEqual(20);
    expect(totalFound).toBeGreaterThan(candidates.length);
  });

  it('drops a candidate outside the radius actually asked for', async () => {
    discovery = () => ({
      candidates: [
        candidate({ id: 1, name: 'Inside', distanceKm: 0.3 }),
        candidate({ id: 2, name: 'Outside', distanceKm: 2.2 }),
      ],
      provider: 'osm',
      radiusM: 2500,
      overpassRequests: 1,
      fetchedAt: '2026-10-02T09:00:00.000Z',
    });
    const { candidates } = await getNearbyFood(anchor, { radiusM: 600 }, deps());
    expect(candidates.map((c: any) => c.name)).toEqual(['Inside']);
  });
});

describe('the credit the result owes', () => {
  it('says the data is OpenStreetMap, so a surface cannot forget to credit it', async () => {
    const result = await getNearbyFood(anchor, undefined, deps());
    expect(result.attribution).toBe('osm');
    expect(result.provider).toBe('osm');
  });

  it('refuses an anchor that is not a coordinate instead of querying for it', async () => {
    await expect(getNearbyFood({ latitude: Number.NaN, longitude: 0 }, undefined, deps())).rejects.toThrow(/valid anchor/i);
    expect(searchCalls).toHaveLength(0);
  });
});
