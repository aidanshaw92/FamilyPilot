import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * THE PRODUCT CONTRACT: `nearby-food` is OpenStreetMap-only.
 *
 * Not "nearby-food usually uses OSM", and emphatically not "restaurant = configured provider". These
 * exist because the boundary is weaker than it should be. Food discovery belongs in its own serverless
 * function, where reaching Google would be structurally impossible; Vercel's deployment budget is twelve
 * functions and a thirteenth fails the deploy. So the handling lives in an OSM-only module
 * (nearby-food-endpoint, whose whole import graph holds no API key, no budget gate and no Google
 * client) and the search handler's only involvement is one early `return` before anything billable.
 *
 * That one line is what these tests guard, with PLACES_PROVIDER=google set -- the production
 * configuration, under which searchGoogle runs first for every other intent and bills.
 *
 * Modules are reached through `createRequire`, not `await import`. The handler and these tests must
 * share ONE exports object for a replaced function to be the one the handler calls; vitest's ESM
 * namespace wrapper does not guarantee that for CommonJS, and an earlier version of this file silently
 * asserted nothing because of it.
 */

const req = createRequire(import.meta.url);
const root = resolve(process.cwd(), '..');
const searchHandler = () => req(resolve(root, 'api/places/search.js'));
const foodEndpoint = () => req(resolve(root, 'server/places/lib/nearby-food-endpoint.js'));
const budget = () => req(resolve(root, 'server/places/lib/places-budget.js'));
const google = () => req(resolve(root, 'server/places/lib/google-places.js'));
const fallback = () => req(resolve(root, 'server/places/lib/fallback.js'));

const ENV_KEYS = [
  'PLACES_PROVIDER',
  'GOOGLE_PLACES_ENABLED',
  'GOOGLE_PLACES_DISCOVERY_ENABLED',
  'GOOGLE_PLACES_ALLOW_LIVE_TEST',
  'VERCEL_ENV',
];

let savedEnv: Record<string, string | undefined> = {};
let restore: Array<() => void> = [];

const OSM_RESULT = {
  anchor: { latitude: 51.5, longitude: -0.12, placeId: null },
  candidates: [],
  totalFound: 0,
  provider: 'osm',
  googleCalls: 0,
  overpassRequests: 0,
  cacheState: 'hit',
  radiusM: 1200,
  fetchedAt: '2026-10-02T09:00:00.000Z',
  attribution: 'osm',
};

/** Replaces a property on a shared CommonJS exports object, and remembers how to put it back. */
function swap(target: any, key: string, value: unknown) {
  const original = target[key];
  target[key] = value;
  restore.push(() => {
    target[key] = original;
  });
  return original;
}

/**
 * Routes the endpoint's OSM lookup to a stub, through the injectable dependency the module already
 * takes, and records that the delegation happened.
 */
function stubFoodLookup(impl: (anchor: unknown, options: unknown) => Promise<unknown>) {
  const endpoint = foodEndpoint();
  const original = endpoint.handleNearbyFoodRequest;
  const calls: unknown[] = [];
  swap(endpoint, 'handleNearbyFoodRequest', async (request: any, response: any) => {
    calls.push(request);
    return original(request, response, { getNearbyFood: impl });
  });
  return calls;
}

function makeRes() {
  return {
    headers: {} as Record<string, string>,
    code: 0,
    body: undefined as any,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    status(code: number) {
      this.code = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

const foodRequest = (query: Record<string, string>) => ({
  method: 'GET',
  query: { intent: 'nearby-food', ...query },
});

function unitsToday(scope: string): number {
  const day = new Date().toISOString().slice(0, 10);
  const snap = budget().placesBudgetSnapshot() as { today: Record<string, number> };
  return snap.today[`${day}:${scope}`] ?? 0;
}

beforeEach(() => {
  savedEnv = {};
  restore = [];
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  // Production's own configuration: Google first for everything that goes through the chain.
  process.env.PLACES_PROVIDER = 'google';
  process.env.GOOGLE_PLACES_API_KEY = 'test-key-never-sent';
});

afterEach(() => {
  while (restore.length) restore.pop()!();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
});

describe('intent=nearby-food cannot reach Google, with PLACES_PROVIDER=google', () => {
  it('does not call the Google search client', async () => {
    const searched: unknown[] = [];
    swap(google(), 'searchGoogle', async (...args: unknown[]) => {
      searched.push(args);
      return [];
    });
    stubFoodLookup(async () => OSM_RESULT);

    const res = makeRes();
    await searchHandler()(foodRequest({ lat: '51.5', lng: '-0.12' }), res);

    expect(searched).toHaveLength(0);
    expect(res.code).toBe(200);
  });

  it('returns before primePlacesBudget, asserted on the source rather than by a spy', () => {
    /**
     * A SPY CANNOT TEST THIS, and the first version of this test pretended it could.
     *
     * search.js destructures `primePlacesBudget` from the budget module at require time, so replacing
     * the property afterwards leaves the handler holding the original binding. The spy never fired, the
     * test passed, and a mutation that moved the branch BELOW the priming call also passed -- which is
     * the definition of an assertion that asserts nothing.
     *
     * The ordering is the guarantee, and ordering is a property of the source, so the source is what is
     * read. Crude, and it genuinely fails when the guarantee is broken, which the spy did not.
     */
    const source = readFileSync(resolve(root, 'api/places/search.js'), 'utf8');
    const branchAt = source.indexOf("intent === 'nearby-food'");
    const primeAt = source.indexOf('await primePlacesBudget()');

    expect(branchAt, 'the nearby-food branch must exist').toBeGreaterThan(-1);
    expect(primeAt, 'primePlacesBudget must still be called for the billable path').toBeGreaterThan(-1);
    expect(
      branchAt,
      'the nearby-food branch must return BEFORE anything that can spend',
    ).toBeLessThan(primeAt);
  });

  it('does not reach the Google provider selection either', () => {
    // Same reasoning: the branch must sit above the point where a provider is chosen, because the
    // chosen provider in production is Google.
    const source = readFileSync(resolve(root, 'api/places/search.js'), 'utf8');
    const branchAt = source.indexOf("intent === 'nearby-food'");
    const providerAt = source.indexOf('getConfiguredProvider()', branchAt);
    expect(providerAt).toBeGreaterThan(branchAt);
  });

  it('leaves every Google billable counter untouched', async () => {
    const scopes = ['discovery', 'details', 'photos', 'journeys', 'geocoding'];
    const before = scopes.map(unitsToday);
    stubFoodLookup(async () => OSM_RESULT);

    await searchHandler()(foodRequest({ lat: '51.5', lng: '-0.12' }), makeRes());

    expect(scopes.map(unitsToday)).toEqual(before);
  });

  it('never touches the provider chain, which is what starts at Google', async () => {
    const chained: unknown[] = [];
    swap(fallback(), 'searchWithFallback', async (...args: unknown[]) => {
      chained.push(args);
      return { places: [], provider: 'google', fallbackUsed: false };
    });
    const calls = stubFoodLookup(async () => OSM_RESULT);

    await searchHandler()(foodRequest({ lat: '51.5', lng: '-0.12' }), makeRes());

    expect(chained).toHaveLength(0);
    // And the food path is what served it: a test where neither ran would pass the line above for the
    // wrong reason.
    expect(calls).toHaveLength(1);
  });

  it('answers from OSM, and says so in the payload', async () => {
    stubFoodLookup(async () => ({ ...OSM_RESULT, overpassRequests: 1, cacheState: 'miss' }));
    const res = makeRes();
    await searchHandler()(foodRequest({ lat: '51.5', lng: '-0.12' }), res);

    expect(res.body.provider).toBe('osm');
    expect(res.body.googleCalls).toBe(0);
    expect(res.body.attribution).toBe('osm');
  });

  it('passes the clamped radius and limit through, so a hand-edited URL cannot widen the sweep', async () => {
    const seen: any[] = [];
    stubFoodLookup(async (anchor, options) => {
      seen.push({ anchor, options });
      return OSM_RESULT;
    });

    await searchHandler()(
      foodRequest({ lat: '51.5', lng: '-0.12', radiusM: '999999', limit: '500' }),
      makeRes(),
    );

    expect(seen[0].options.radiusM).toBeLessThanOrEqual(2500);
    expect(seen[0].options.limit).toBeLessThanOrEqual(20);
  });
});

describe('the branch cannot be bypassed by a bad request', () => {
  it('refuses a malformed anchor with a 400 rather than falling through to the chain', async () => {
    const chained: unknown[] = [];
    swap(fallback(), 'searchWithFallback', async (...args: unknown[]) => {
      chained.push(args);
      return { places: [], provider: 'google', fallbackUsed: false };
    });

    const res = makeRes();
    await searchHandler()(foodRequest({ lat: 'north', lng: '-0.12' }), res);

    // Falling through would hand a food request to Google. A 400 is the only safe answer.
    expect(res.code).toBe(400);
    expect(res.body.code).toBe('INVALID_ANCHOR');
    expect(chained).toHaveLength(0);
  });

  it('refuses an out-of-range anchor the same way', async () => {
    const res = makeRes();
    await searchHandler()(foodRequest({ lat: '950', lng: '-0.12' }), res);
    expect(res.code).toBe(400);
  });

  it('reports a provider outage as 503 with googleCalls 0, never as an empty list', async () => {
    stubFoodLookup(async () => {
      throw new Error('Overpass unavailable');
    });

    const res = makeRes();
    await searchHandler()(foodRequest({ lat: '51.5', lng: '-0.12' }), res);

    expect(res.code).toBe(503);
    expect(res.body.code).toBe('FOOD_PROVIDER_UNAVAILABLE');
    expect(res.body.googleCalls).toBe(0);
    // An outage is not an empty neighbourhood, so there is no candidates array to misread.
    expect(res.body.candidates).toBeUndefined();
  });

  it('does not cache an outage at the edge', async () => {
    stubFoodLookup(async () => {
      throw new Error('Overpass unavailable');
    });
    const res = makeRes();
    await searchHandler()(foodRequest({ lat: '51.5', lng: '-0.12' }), res);
    expect(res.headers['Cache-Control']).not.toMatch(/s-maxage=2\d{4}/);
  });

  /**
   * THE CDN MAY ONLY REPLAY A BODY THAT STAYS TRUE WHEN REPLAYED.
   *
   * Found by the live Section 16 canary, not by reasoning: it re-asked an anchor sixteen seconds after
   * a miss, got `cacheState: "miss"` back in twelve milliseconds, and concluded that caching was not in
   * play -- in a run where two other anchors had been served from the store. Twelve milliseconds is not
   * a round trip to Postgres and Overpass. The edge was replaying the miss, and with it the claim that
   * an Overpass request had just been made.
   *
   * The consequence is a lie about our load on a donated service, repeated once per replay for six
   * hours, which is exactly the metric `overpassHttpRequests` was added to tell the truth about.
   */
  const cacheStateResponse = (cacheState: string) => async () => ({
    anchor: { latitude: 51.5, longitude: -0.12, placeId: null },
    candidates: [],
    totalFound: 0,
    provider: 'osm',
    googleCalls: 0,
    cacheState,
    overpassRequests: cacheState === 'miss' ? 1 : 0,
    overpassHttpRequests: cacheState === 'miss' ? 1 : 0,
  });

  it('does not let the edge replay a miss, whose body is only true when it is produced', async () => {
    stubFoodLookup(cacheStateResponse('miss'));
    const res = makeRes();
    await searchHandler()(foodRequest({ lat: '51.5', lng: '-0.12' }), res);

    expect(res.code).toBe(200);
    expect(res.body.cacheState).toBe('miss');
    // The body says one Overpass request happened. A replay would repeat that to a reader for whom it
    // is false, so this one response must reach the function every time.
    expect(res.body.overpassRequests).toBe(1);
    expect(res.headers['Cache-Control']).not.toMatch(/s-maxage=2\d{4}/);
  });

  it('does cache a hit at the edge, because a hit stays a hit however often it is replayed', async () => {
    stubFoodLookup(cacheStateResponse('hit'));
    const res = makeRes();
    await searchHandler()(foodRequest({ lat: '51.5', lng: '-0.12' }), res);

    expect(res.body.cacheState).toBe('hit');
    expect(res.body.overpassRequests).toBe(0);
    // The repeat-load protection the header exists for is intact for the response that carries it.
    expect(res.headers['Cache-Control']).toMatch(/s-maxage=21600/);
  });

  it('does cache a stale read at the edge, for the same reason', async () => {
    stubFoodLookup(cacheStateResponse('stale'));
    const res = makeRes();
    await searchHandler()(foodRequest({ lat: '51.5', lng: '-0.12' }), res);

    expect(res.body.cacheState).toBe('stale');
    expect(res.headers['Cache-Control']).toMatch(/s-maxage=21600/);
  });
});

describe('the OSM-only module really is OSM-only', () => {
  it('reaches nothing Google-shaped anywhere in its import graph', () => {
    // A structural check, not a behavioural one: if a later edit imports the Google client or the
    // budget gate into this graph, the boundary is gone whatever the behaviour looks like that day.
    const seen = new Set<string>();
    const offenders: string[] = [];

    const walk = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      if (/google|places-budget/i.test(id)) {
        offenders.push(id.replace(root, ''));
        return;
      }
      const mod = req.cache[id];
      for (const child of mod?.children ?? []) walk(child.id);
    };

    req(resolve(root, 'server/places/lib/nearby-food-endpoint.js'));
    walk(req.resolve(resolve(root, 'server/places/lib/nearby-food-endpoint.js')));

    expect(offenders).toEqual([]);
  });
});
