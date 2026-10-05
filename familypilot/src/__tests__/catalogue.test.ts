import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require_ = createRequire(import.meta.url);
const cataloguePath = '../../../server/places/lib/catalogue.js';
const adminPath = require_.resolve('../../../server/enrichment/_lib/supabase-admin.js');

const NOW = Date.parse('2026-10-05T12:00:00Z');
const day = 86400000;

function row(over: Record<string, unknown> = {}) {
  return {
    familypilot_place_id: 'fp-google-A',
    external_id: 'google:A',
    provider: 'google',
    name: 'Hackney City Farm',
    category: 'farm',
    lat: 51.532,
    lng: -0.067,
    address: '1a Goldsmiths Row',
    description: null,
    opening_hours: { source: 'google', timezone: 'Europe/London', periods: [{ open: { day: 0, hour: 10, minute: 0 }, close: { day: 0, hour: 16, minute: 30 } }] },
    website: null,
    phone: null,
    photos: ['/api/places/photo?id=A&index=0&credit=Someone'],
    is_open: false,
    fetched_at: new Date(NOW - 2 * day).toISOString(),
    field_provenance: { googlePrimaryType: 'farm', googleTypes: ['farm'] },
    ...over,
  };
}

/** A query builder that records what was asked of it and resolves to the given rows. */
function fakeClient(rows: unknown[]) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'gte', 'limit', 'order', 'or', 'neq', 'is', 'gt']) {
    chain[method] = (...args: unknown[]) => { calls.push([method, args]); return chain; };
  }
  chain.maybeSingle = async () => ({ data: null, error: null });
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  const client = { from: (table: string) => { calls.push(['from', [table]]); return chain; }, rpc: async () => ({ data: 1, error: null }) };
  return { client, calls };
}

describe('the stored catalogue', () => {
  beforeEach(() => vi.resetModules());

  it('turns stored rows into places, with the schedule and the snapshot kept apart', async () => {
    const { readCatalogue } = await import(cataloguePath);
    const { client } = fakeClient([row()]);
    const [place] = await readCatalogue({ client, now: NOW });
    expect(place).toMatchObject({
      familypilotId: 'fp-google-A', category: 'farm', provider: 'google', latitude: 51.532, enrichmentStatus: 'provider_only',
    });
    expect(place.openingHours.periods).toHaveLength(1);
    expect(place.photos).toEqual(['/api/places/photo?id=A&index=0&credit=Someone']);
    // The stored flag travels WITH the time it was taken, so the app can tell it is a snapshot.
    expect(place.isOpen).toBe(false);
    expect(place.fetchedAt).toBe(new Date(NOW - 2 * day).toISOString());
  });

  it('only asks for Google venues in browsable categories no older than the 30 day hard stop', async () => {
    const { readCatalogue, EXPLORE_CATEGORIES } = await import(cataloguePath);
    const { client, calls } = fakeClient([row()]);
    await readCatalogue({ client, now: NOW });
    expect(calls).toContainEqual(['from', ['place_records']]);
    expect(calls).toContainEqual(['eq', ['provider', 'google']]);
    const inCall = calls.find(([m]) => m === 'in')!;
    expect(inCall[1][1]).toEqual(EXPLORE_CATEGORIES);
    expect(EXPLORE_CATEGORIES).not.toContain('restaurant');
    expect(EXPLORE_CATEGORIES).not.toContain('cafe');
    const gte = calls.find(([m]) => m === 'gte')!;
    expect(gte[1][0]).toBe('fetched_at');
    expect(Date.parse(gte[1][1] as string)).toBe(NOW - 30 * day);
  });

  it('leaves out anything outside the London scope or without coordinates', async () => {
    const { readCatalogue } = await import(cataloguePath);
    const { client } = fakeClient([
      row({ familypilot_place_id: 'near' }),
      row({ familypilot_place_id: 'manchester', lat: 53.48, lng: -2.24 }),
      row({ familypilot_place_id: 'nocoords', lat: null, lng: null }),
    ]);
    const places = await readCatalogue({ client, now: NOW });
    expect(places.map((p: { familypilotId: string }) => p.familypilotId)).toEqual(['near']);
  });

  it('degrades to an empty list when the database is unavailable, never an error', async () => {
    const { readCatalogue } = await import(cataloguePath);
    expect(await readCatalogue({ client: null as never })).toEqual([]);
    const broken = { from: () => { throw new Error('down'); } };
    expect(await readCatalogue({ client: broken })).toEqual([]);
  });

  it('merges by id, preferring the live copy, and respects the limit', async () => {
    const { mergeCatalogue } = await import(cataloguePath);
    const live = [{ familypilotId: 'a', name: 'live a' }];
    const stored = [{ familypilotId: 'a', name: 'stored a' }, { familypilotId: 'b', name: 'stored b' }, { familypilotId: 'c', name: 'stored c' }];
    const merged = mergeCatalogue(live, stored, 3);
    expect(merged.map((p: { name: string }) => p.name)).toEqual(['live a', 'stored b', 'stored c']);
    expect(mergeCatalogue(live, stored, 2)).toHaveLength(2);
  });

  it('never reaches Google: the module has no fetch, no key and no budget gate', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(require_.resolve(cataloguePath), 'utf8');
    expect(src).not.toMatch(/\bfetch\(|googleapis|GOOGLE_PLACES_API_KEY|assertPlacesAllowed/);
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const { readCatalogue } = await import(cataloguePath);
    await readCatalogue({ client: fakeClient([row()]).client, now: NOW });
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('the London search serves the catalogue alongside the cached search', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    vi.resetModules();
    for (const k of ['PLACES_PROVIDER', 'GOOGLE_PLACES_ENABLED', 'VERCEL_ENV']) { saved[k] = process.env[k]; delete process.env[k]; }
    process.env.PLACES_PROVIDER = 'google';
    process.env.GOOGLE_PLACES_API_KEY = 'never-sent';
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    delete require_.cache[adminPath];
    vi.unstubAllGlobals();
  });

  function stubAdmin(tables: Record<string, unknown[]>, cached: unknown) {
    const make = (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'gte', 'limit', 'order', 'or', 'neq', 'is', 'gt', 'upsert']) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: table === 'place_search_cache' ? cached : null, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: tables[table] ?? [], error: null });
      return chain;
    };
    const client = { from: make, rpc: async () => ({ data: 1, error: null }) };
    require_.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true, exports: { getSupabaseAdmin: () => client, isSupabaseConfigured: () => false } } as never;
  }

  function res() {
    const out: { statusCode: number; headers: Record<string, string>; body: any } = { statusCode: 200, headers: {}, body: undefined };
    return Object.assign(out, {
      setHeader: (k: string, v: string) => { out.headers[k] = v; },
      status: (c: number) => { out.statusCode = c; return out; },
      json: (b: unknown) => { out.body = b; return out; },
      end: () => out,
    });
  }

  const park = { familypilotId: 'fp-google-P', externalId: 'google:P', provider: 'google', name: 'A Park', category: 'park', latitude: 51.5, longitude: -0.1, photos: [], fetchedAt: new Date().toISOString(), enrichmentStatus: 'provider_only' };
  const query = { lat: '51.5074', lng: '-0.1278', radiusKm: '40', scope: 'london', intent: 'explore' };

  it('adds stored farms to a stale cached search, with Google switched off and nothing fetched', async () => {
    const fetchSpy = vi.fn(async () => { throw new Error('fetch must not be reached'); });
    vi.stubGlobal('fetch', fetchSpy);
    const stale = { payload: { places: [park], provider: 'google', fallbackUsed: false }, provider: 'google', fetched_at: new Date(Date.now() - 20 * 3600000).toISOString(), cached_until: new Date(Date.now() - 14 * 3600000).toISOString() };
    stubAdmin({ place_records: [row(), row({ familypilot_place_id: 'fp-google-S', name: 'Flip Out', category: 'soft_play' })] }, stale);
    const mod = require_('../../../api/places/search.js');
    const response = res();
    await (mod.default ?? mod)({ method: 'GET', query }, response);
    expect(response.statusCode).toBe(200);
    const categories = response.body.places.map((p: { category: string }) => p.category).sort();
    expect(categories).toEqual(['farm', 'park', 'soft_play']);
    expect(response.body.cacheState).toBe('stale');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('serves the catalogue alone when there is no cached search and Google is off (instead of a 503)', async () => {
    const fetchSpy = vi.fn(async () => { throw new Error('fetch must not be reached'); });
    vi.stubGlobal('fetch', fetchSpy);
    stubAdmin({ place_records: [row()] }, null);
    const mod = require_('../../../api/places/search.js');
    const response = res();
    await (mod.default ?? mod)({ method: 'GET', query }, response);
    expect(response.statusCode).toBe(200);
    expect(response.body.places.map((p: { name: string }) => p.name)).toEqual(['Hackney City Farm']);
    expect(response.body.cacheState).toBe('catalogue');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
