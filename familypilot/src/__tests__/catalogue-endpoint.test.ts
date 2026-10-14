import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * `intent=catalogue` returns the stored catalogue a page at a time, nearest first, with the true total. These tests prove the three things that
 * matter at thousands of places: nothing is hidden by a cap (walking the cursor returns every match exactly once), nothing unneeded is sent
 * (a page is at most 100, and a radius sends only what is inside it), and it can neither discover through Google nor spend.
 */

const req = createRequire(import.meta.url);
const root = resolve(process.cwd(), '..');
const endpoint = () => req(resolve(root, 'server/places/lib/catalogue-endpoint.js'));
const catalogueLib = () => req(resolve(root, 'server/places/lib/catalogue.js'));
const searchHandler = () => req(resolve(root, 'api/places/search.js'));

const CATEGORIES = ['park', 'museum', 'zoo', 'farm', 'attraction', 'activity', 'soft_play'];
/** A deterministic London-wide catalogue of `n` places, some with no position. */
function makeCatalogue(n: number, withoutPosition = 0) {
  let x = 12345;
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: n }, (_, i) => {
    const noPos = i < withoutPosition;
    return {
      familypilotId: `fp-osm-way-${String(i).padStart(5, '0')}`,
      name: i % 50 === 0 ? `Camden Fixture ${i}` : `Fixture Place ${i}`,
      category: CATEGORIES[i % CATEGORIES.length],
      provider: 'osm',
      latitude: noPos ? undefined : 51.5074 + (rnd() - 0.5) * 0.7,
      longitude: noPos ? undefined : -0.1278 + (rnd() - 0.5) * 1.1,
      photos: [],
      enrichmentStatus: 'provider_only',
    };
  });
}

function makeRes() {
  return {
    headers: {} as Record<string, string>, code: 0, body: undefined as any,
    setHeader(k: string, v: string) { this.headers[k] = v; },
    status(c: number) { this.code = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    end() { return this; },
  };
}
async function call(query: Record<string, string>, places: any[]) {
  const res = makeRes();
  await endpoint().handleCatalogueRequest({ query }, res, { readCatalogue: async () => places });
  return res;
}
const km = (a: any, lat: number, lng: number) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(a.latitude - lat) / 2) ** 2 + Math.cos(r(lat)) * Math.cos(r(a.latitude)) * Math.sin(r(a.longitude - lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

describe('intent=catalogue: no hidden cap', () => {
  const places = makeCatalogue(3000, 12);

  it('walking the cursor returns every place exactly once, in distance order, with a constant total', async () => {
    const seen: string[] = []; const dists: number[] = [];
    let cursor: string | undefined; let pages = 0; let total = -1;
    do {
      const res = await call({ limit: '100', ...(cursor ? { cursor } : {}) }, places);
      expect(res.code).toBe(200);
      if (total >= 0) expect(res.body.total).toBe(total);
      total = res.body.total;
      expect(res.body.returned).toBe(res.body.places.length);
      expect(res.body.places.length).toBeLessThanOrEqual(100);
      for (const p of res.body.places) { seen.push(p.familypilotId); if (typeof p.distanceKm === 'number') dists.push(p.distanceKm); }
      cursor = res.body.nextCursor ?? undefined; pages += 1;
    } while (cursor && pages < 100);
    expect(total).toBe(3000);
    expect(seen).toHaveLength(3000);
    expect(new Set(seen).size).toBe(3000);
    expect([...dists].sort((a, b) => a - b)).toEqual(dists);
    expect(pages).toBe(30);
  });

  it('places with no position are never inside a radius, but are reachable in Search all, last', async () => {
    const inside = await call({ radiusKm: '40', limit: '100' }, places);
    expect(inside.body.total).toBe(places.filter((p) => p.latitude !== undefined && km(p, 51.5074, -0.1278) <= 40).length);
    expect(inside.body.places.every((p: any) => p.latitude !== undefined)).toBe(true);
    // Search all has no radius, so the 12 with no position are counted, and they come after every place that has one.
    const everything: any[] = []; let cursor: string | undefined;
    do {
      const res = await call({ limit: '100', ...(cursor ? { cursor } : {}) }, places);
      everything.push(...res.body.places); cursor = res.body.nextCursor ?? undefined;
    } while (cursor);
    expect(everything).toHaveLength(3000);
    expect(everything.slice(-12).every((p) => p.latitude === undefined)).toBe(true);
    expect(everything.slice(0, -12).every((p) => p.latitude !== undefined)).toBe(true);
  });

  it('a limit above 100 is clamped to 100 and an absent limit is 40', async () => {
    expect((await call({ limit: '5000' }, places)).body.places).toHaveLength(100);
    expect((await call({}, places)).body.places).toHaveLength(40);
  });
});

describe('intent=catalogue: only what is asked for is sent', () => {
  const places = makeCatalogue(3000, 0);

  it('a radius returns exactly the places inside it, nearest first, with their distance', async () => {
    const res = await call({ lat: '51.5390', lng: '-0.1426', radiusKm: '3', limit: '100' }, places);
    const expected = places.filter((p) => km(p, 51.539, -0.1426) <= 3);
    expect(res.body.total).toBe(expected.length);
    expect(res.body.radiusKm).toBe(3);
    expect(res.body.places.length).toBe(Math.min(100, expected.length));
    for (const p of res.body.places) expect(p.distanceKm).toBeLessThanOrEqual(3);
    expect(expected.length).toBeLessThan(3000 / 4);
  });

  it('the radius is capped at the app\'s 40 km scope', async () => {
    expect((await call({ radiusKm: '900' }, places)).body.radiusKm).toBe(40);
  });

  it('a category filter narrows the total, while the counts ignore it so a chip can say how many it would show', async () => {
    const all = await call({ radiusKm: '10' }, places);
    const parks = await call({ radiusKm: '10', categories: 'park' }, places);
    expect(parks.body.total).toBe(all.body.countsByCategory.park);
    expect(parks.body.countsByCategory).toEqual(all.body.countsByCategory);
    expect(parks.body.places.every((p: any) => p.category === 'park')).toBe(true);
    expect((await call({ categories: 'not-a-category' }, places)).body.total).toBe(all.body.total === 0 ? 0 : (await call({}, places)).body.total);
  });

  it('a search finds a named place anywhere in the catalogue, and says how many match', async () => {
    const res = await call({ q: 'camden fixture', limit: '100' }, places);
    expect(res.body.total).toBe(places.filter((p) => p.name.startsWith('Camden Fixture')).length);
    expect(res.body.places.every((p: any) => /camden fixture/i.test(p.name))).toBe(true);
  });

  it('a kind of place typed as words ("soft play", "zoo") matches by category', async () => {
    const soft = await call({ q: 'soft play', limit: '100' }, places);
    expect(soft.body.total).toBe(places.filter((p) => p.category === 'soft_play').length);
    const zoo = await call({ q: 'zoo' }, places);
    expect(zoo.body.total).toBe(places.filter((p) => p.category === 'zoo').length);
  });
});

describe('intent=catalogue: bad requests and outages', () => {
  it('rejects a bad location, radius or cursor with a 400 and no fall-through', async () => {
    for (const query of [{ lat: 'x', lng: '0' }, { lat: '91', lng: '0' }, { radiusKm: '-1' }, { radiusKm: 'far' }, { cursor: '!!!' }]) {
      const res = await call(query as any, makeCatalogue(5));
      expect(res.code).toBe(400);
    }
  });

  it('an unreadable catalogue is a 503, never an empty list, and is not cached', async () => {
    const res = makeRes();
    await endpoint().handleCatalogueRequest({ query: {} }, res, { readCatalogue: async () => { throw new Error('down'); } });
    expect(res.code).toBe(503);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.body.googleCalls).toBe(0);
  });

  it('responses are never cached by a shared cache', async () => {
    expect((await call({}, makeCatalogue(5))).headers['Cache-Control']).toBe('no-store');
  });
});

describe('intent=catalogue: it cannot reach Google', () => {
  const saved: Record<string, string | undefined> = {};
  afterEach(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

  it('the endpoint module imports no API key, no budget gate and no Google client', () => {
    const src = readFileSync(resolve(root, 'server/places/lib/catalogue-endpoint.js'), 'utf8');
    expect(src).not.toMatch(/google-places|places-budget|fallback|API_KEY|googleapis|fetch\(/);
  });

  it('through the search handler, with Google configured as in production, it answers from the catalogue and makes no outbound request', async () => {
    for (const k of ['PLACES_PROVIDER', 'GOOGLE_PLACES_ENABLED', 'GOOGLE_PLACES_DISCOVERY_ENABLED']) saved[k] = process.env[k];
    process.env.PLACES_PROVIDER = 'google'; process.env.GOOGLE_PLACES_ENABLED = 'true'; process.env.GOOGLE_PLACES_DISCOVERY_ENABLED = 'true';
    const lib = catalogueLib(); const original = lib.readCatalogue; const realFetch = globalThis.fetch;
    let outbound = 0;
    lib.readCatalogue = async () => makeCatalogue(30);
    globalThis.fetch = (async () => { outbound += 1; throw new Error('no outbound request is allowed'); }) as any;
    try {
      const res = makeRes();
      await searchHandler()({ query: { intent: 'catalogue', limit: '10' }, headers: {}, method: 'GET' }, res);
      expect(res.code).toBe(200);
      expect(res.body.intent).toBe('catalogue');
      expect(res.body.googleCalls).toBe(0);
      expect(res.body.total).toBe(30);
      expect(outbound).toBe(0);
    } finally { lib.readCatalogue = original; globalThis.fetch = realFetch; }
  });
});
