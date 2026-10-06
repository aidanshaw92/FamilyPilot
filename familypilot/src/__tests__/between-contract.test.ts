import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * THE PRODUCT CONTRACT: `intent=between` is a database read. It cannot discover through Google and it cannot spend.
 *
 * Meet Halfway must query the stored catalogue independently of Home, with no new paid provider behaviour. Like
 * `nearby-food`, it is served from `api/places/search.js` because the deployment budget is twelve functions, so the
 * guarantee is carried by ONE early `return` placed before `primePlacesBudget`, the provider choice and the search chain,
 * and by an import graph with no Google client and no budget gate. Both are asserted here, with PLACES_PROVIDER=google (the
 * production configuration, under which every other intent bills).
 */

const req = createRequire(import.meta.url);
const root = resolve(process.cwd(), '..');
const searchHandler = () => req(resolve(root, 'api/places/search.js'));
const betweenEndpoint = () => req(resolve(root, 'server/places/lib/between-endpoint.js'));
const betweenLib = () => req(resolve(root, 'server/places/lib/between.js'));
const budget = () => req(resolve(root, 'server/places/lib/places-budget.js'));
const google = () => req(resolve(root, 'server/places/lib/google-places.js'));
const fallback = () => req(resolve(root, 'server/places/lib/fallback.js'));

const ENV_KEYS = ['PLACES_PROVIDER', 'GOOGLE_PLACES_ENABLED', 'GOOGLE_PLACES_DISCOVERY_ENABLED', 'GOOGLE_PLACES_ALLOW_LIVE_TEST', 'VERCEL_ENV'];
let savedEnv: Record<string, string | undefined> = {};
let restore: Array<() => void> = [];

function swap(target: any, key: string, value: unknown) {
  const original = target[key];
  target[key] = value;
  restore.push(() => {
    target[key] = original;
  });
  return original;
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

const betweenRequest = (query: Record<string, string> = {}) => ({
  method: 'GET',
  query: { intent: 'between', aLat: '51.643', aLng: '-0.36', bLat: '51.59', bLng: '-0.02', ...query },
});

const PLACE = { familypilotId: 'fp-barnet', name: 'Barnet Common Farm', category: 'farm', latitude: 51.625, longitude: -0.19 };

/** Routes the endpoint's catalogue read to a stub through the dependency it already takes, and records the call. */
function stubRead(impl: (options: any) => Promise<unknown>) {
  const endpoint = betweenEndpoint();
  const original = endpoint.handleBetweenRequest;
  const calls: any[] = [];
  swap(endpoint, 'handleBetweenRequest', async (request: any, response: any) =>
    original(request, response, {
      readBetween: async (options: any) => {
        calls.push(options);
        return impl(options);
      },
      enrich: async (places: unknown) => places,
    }),
  );
  return calls;
}

function unitsToday(scope: string): number {
  const day = new Date().toISOString().slice(0, 10);
  const snap = budget().placesBudgetSnapshot() as { today: Record<string, number> };
  return snap.today[`${day}:${scope}`] ?? 0;
}

beforeEach(() => {
  savedEnv = {};
  restore = [];
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.PLACES_PROVIDER = 'google';
  process.env.GOOGLE_PLACES_API_KEY = 'test-key-never-sent';
});

afterEach(() => {
  while (restore.length) restore.pop()!();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('intent=between cannot reach Google, with PLACES_PROVIDER=google', () => {
  it('does not call the Google search client, and the catalogue read is what answered', async () => {
    const searched: unknown[] = [];
    swap(google(), 'searchGoogle', async (...args: unknown[]) => {
      searched.push(args);
      return [];
    });
    const calls = stubRead(async () => ({ available: true, places: [PLACE], considered: 40 }));

    const res = makeRes();
    await searchHandler()(betweenRequest(), res);

    expect(searched).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(res.code).toBe(200);
    expect(res.body.places).toHaveLength(1);
  });

  it('returns before primePlacesBudget, the provider choice and the search chain: asserted on the source', () => {
    // A spy cannot test an ordering; the source can. Same method, and the same reason, as the nearby-food contract.
    const source = readFileSync(resolve(root, 'api/places/search.js'), 'utf8');
    const branchAt = source.indexOf("intent === 'between'");
    const primeAt = source.indexOf('await primePlacesBudget()');
    const providerAt = source.indexOf('getConfiguredProvider()', branchAt);
    expect(branchAt, 'the between branch must exist').toBeGreaterThan(-1);
    expect(primeAt, 'primePlacesBudget must still be called for the billable path').toBeGreaterThan(-1);
    expect(branchAt, 'the between branch must return BEFORE anything that can spend').toBeLessThan(primeAt);
    expect(providerAt).toBeGreaterThan(branchAt);
    // And it returns: a branch that only called the endpoint would fall through to the billable path.
    expect(source.slice(branchAt, primeAt)).toMatch(/return betweenEndpoint\.handleBetweenRequest\(req, res\)/);
  });

  it('leaves every Google billable counter untouched', async () => {
    const scopes = ['discovery', 'details', 'photos', 'journeys', 'geocoding'];
    const before = scopes.map(unitsToday);
    stubRead(async () => ({ available: true, places: [PLACE], considered: 1 }));
    await searchHandler()(betweenRequest(), makeRes());
    expect(scopes.map(unitsToday)).toEqual(before);
  });

  it('never touches the provider chain, which is what starts at Google', async () => {
    const chained: unknown[] = [];
    swap(fallback(), 'searchWithFallback', async (...args: unknown[]) => {
      chained.push(args);
      return { places: [], provider: 'google', fallbackUsed: false };
    });
    stubRead(async () => ({ available: true, places: [], considered: 0 }));
    await searchHandler()(betweenRequest(), makeRes());
    expect(chained).toHaveLength(0);
  });

  it('says in the payload that it was the stored catalogue and that nothing was bought', async () => {
    stubRead(async () => ({ available: true, places: [PLACE], considered: 12 }));
    const res = makeRes();
    await searchHandler()(betweenRequest(), res);
    expect(res.body.provider).toBe('stored-catalogue');
    expect(res.body.googleCalls).toBe(0);
    expect(res.body.intent).toBe('between');
    expect(res.body.considered).toBe(12);
  });
});

describe('what the request may ask for', () => {
  it('hands the first pass both homes, each family’s reach and a limit', async () => {
    const calls = stubRead(async () => ({ available: true, places: [], considered: 0 }));
    await searchHandler()(betweenRequest({ aMaxKm: '60', bMaxKm: '50', limit: '30' }), makeRes());
    expect(calls[0]).toMatchObject({ a: { latitude: 51.643, longitude: -0.36 }, b: { latitude: 51.59, longitude: -0.02 }, maxKmA: 60, maxKmB: 50, limit: '30' });
  });

  it('caps a hand-edited reach, so a URL cannot widen the read', async () => {
    const calls = stubRead(async () => ({ available: true, places: [], considered: 0 }));
    await searchHandler()(betweenRequest({ aMaxKm: '99999' }), makeRes());
    expect(calls[0].maxKmA).toBeLessThanOrEqual(200);
  });

  it('refuses malformed homes with a 400 rather than falling through to the chain', async () => {
    const chained: unknown[] = [];
    swap(fallback(), 'searchWithFallback', async (...args: unknown[]) => {
      chained.push(args);
      return { places: [], provider: 'google', fallbackUsed: false };
    });
    const res = makeRes();
    await searchHandler()(betweenRequest({ aLat: 'north' }), res);
    expect(res.code).toBe(400);
    expect(res.body.code).toBe('INVALID_HOMES');
    expect(chained).toHaveLength(0);
  });

  it('refuses out-of-range homes, and homes too far apart to meet between', async () => {
    const res = makeRes();
    await searchHandler()(betweenRequest({ bLat: '950' }), res);
    expect(res.code).toBe(400);
    const far = makeRes();
    await searchHandler()(betweenRequest({ bLat: '55.95', bLng: '-3.19' }), far);
    expect(far.code).toBe(400);
    expect(far.body.code).toBe('TOO_FAR_APART');
  });

  it('reports an unreachable catalogue as 503, never as an empty middle, and never caches it', async () => {
    stubRead(async () => ({ available: false, places: [], considered: 0 }));
    const res = makeRes();
    await searchHandler()(betweenRequest(), res);
    expect(res.code).toBe(503);
    expect(res.body.code).toBe('CATALOGUE_UNAVAILABLE');
    expect(res.body.googleCalls).toBe(0);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('a catalogue that answers with nothing in the corridor is a 200 with no places, which is different', async () => {
    stubRead(async () => ({ available: true, places: [], considered: 0 }));
    const res = makeRes();
    await searchHandler()(betweenRequest(), res);
    expect(res.code).toBe(200);
    expect(res.body.places).toEqual([]);
  });
});

describe('the stored read itself', () => {
  /** A client that records the query it was given and answers with rows. */
  const recordingClient = (rows: any[]) => {
    const filters: Array<[string, ...unknown[]]> = [];
    const chain: any = {
      select: () => chain,
      eq: (...a: unknown[]) => (filters.push(['eq', ...a]), chain),
      in: (...a: unknown[]) => (filters.push(['in', ...a]), chain),
      gte: (...a: unknown[]) => (filters.push(['gte', ...a]), chain),
      lte: (...a: unknown[]) => (filters.push(['lte', ...a]), chain),
      limit: (n: number) => (filters.push(['limit', n]), Promise.resolve({ data: rows, error: null })),
    };
    return { client: { from: (table: string) => (filters.push(['from', table]), chain) }, filters };
  };

  const row = (id: string, lat: number, lng: number) => ({
    familypilot_place_id: id, external_id: id, provider: 'google', name: id, category: 'farm', lat, lng, address: null, description: null,
    opening_hours: null, website: null, phone: null, photos: [], is_open: null, fetched_at: new Date().toISOString(), field_provenance: {},
  });

  it('reads only place_records, narrowed by a box round the two homes and bounded in size', async () => {
    const { client, filters } = recordingClient([row('barnet', 51.625, -0.19), row('croydon', 51.37, -0.1)]);
    const result = await betweenLib().readBetween({
      client, a: { latitude: 51.643, longitude: -0.36 }, b: { latitude: 51.59, longitude: -0.02 },
    });
    expect(filters[0]).toEqual(['from', 'place_records']);
    expect(filters.some((f) => f[0] === 'gte' && f[1] === 'lat')).toBe(true);
    expect(filters.some((f) => f[0] === 'lte' && f[1] === 'lng')).toBe(true);
    expect(filters.find((f) => f[0] === 'limit')![1]).toBe(betweenLib().STORED_ROW_CEILING);
    // The first pass then drops what the box let through but the corridor does not.
    expect(result.available).toBe(true);
    expect(result.places.map((p: any) => p.familypilotId)).toEqual(['barnet']);
    expect(result.considered).toBe(2);
  });

  it('says unavailable, not empty, when the database errors or is missing', async () => {
    const failing: any = { from: () => ({ select: () => ({ eq: () => ({ in: () => ({ gte: () => ({ gte: () => ({ lte: () => ({ gte: () => ({ lte: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'down' } }) }) }) }) }) }) }) }) }) }) };
    const a = { latitude: 51.643, longitude: -0.36 };
    const b = { latitude: 51.59, longitude: -0.02 };
    expect((await betweenLib().readBetween({ client: failing, a, b })).available).toBe(false);
  });
});

describe('the between module really is Google-free', () => {
  it('reaches nothing Google-shaped anywhere in its import graph', () => {
    // Structural, not behavioural: if a later edit imports the Google client or the budget gate into this graph, the
    // boundary is gone whatever the behaviour looks like that day. Reached through a call, because the enrichment readers
    // are required lazily and only enter the graph once used.
    const seen = new Set<string>();
    const offenders: string[] = [];
    const walk = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      if (/google|places-budget/i.test(id)) {
        offenders.push(id.replace(root, ''));
        return;
      }
      for (const child of req.cache[id]?.children ?? []) walk(child.id);
    };
    const entry = resolve(root, 'server/places/lib/between-endpoint.js');
    req(entry);
    walk(req.resolve(entry));
    expect(offenders).toEqual([]);
  });

  it('and the endpoint source names no Google client or budget gate', () => {
    for (const file of ['between.js', 'between-endpoint.js']) {
      const source = readFileSync(resolve(root, 'server/places/lib', file), 'utf8');
      const requires = [...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
      expect(requires.filter((id) => /google|places-budget|fallback|search-cache/i.test(id)), file).toEqual([]);
    }
  });
});
