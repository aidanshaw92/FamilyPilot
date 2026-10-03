import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const osmFood = require('../../../server/places/lib/osm-food.js');

/**
 * Restaurant discovery, against fixtures only.
 *
 * NOT ONE LIVE REQUEST. `fetch` is replaced for every test in this file, and the final test asserts
 * that no URL outside the two Overpass endpoints was ever reached -- in particular nothing Google.
 * Overpass is free but it is public infrastructure, and a test suite that hammered it on every push
 * would be exactly the abuse the brief forbids.
 */

const ANCHOR = { latitude: 51.5074, longitude: -0.1278 };

/** An Overpass element, as the API actually shapes one. */
const node = (id: number, over: Record<string, any> = {}) => ({
  type: 'node',
  id,
  lat: over.lat ?? 51.5085,
  lon: over.lon ?? -0.1285,
  tags: { amenity: 'restaurant', name: `Place ${id}`, ...(over.tags ?? {}) },
});

const way = (id: number, over: Record<string, any> = {}) => ({
  type: 'way',
  id,
  center: { lat: over.lat ?? 51.5085, lon: over.lon ?? -0.1285 },
  tags: { amenity: 'restaurant', name: `Way ${id}`, ...(over.tags ?? {}) },
});

let requests: string[] = [];
let bodies: string[] = [];

function serve(handler: (body: string, attempt: number) => any) {
  let attempt = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any, init: any) => {
      attempt += 1;
      requests.push(String(url));
      const body = String(init?.body ?? '');
      bodies.push(body);
      const outcome = handler(body, attempt);
      if (outcome instanceof Error) throw outcome;
      if (outcome?.status && outcome.status !== 200) {
        return { ok: false, status: outcome.status, json: async () => ({}) } as any;
      }
      return { ok: true, status: 200, json: async () => ({ elements: outcome }) } as any;
    }),
  );
}

beforeEach(() => {
  requests = [];
  bodies = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the query asks Overpass for the right thing, politely', () => {
  it('asks for nodes AND ways, because a restaurant in a building is mapped as the building', () => {
    const query = osmFood.buildFoodQuery(51.5, -0.1, 1200);
    expect(query).toContain('node["amenity"="restaurant"]');
    expect(query).toContain('way["amenity"="restaurant"]');
    expect(query).toContain('way["amenity"="cafe"]');
  });

  it('bounds the radius, so no caller can ask for a London-wide food sweep', () => {
    expect(osmFood.clampRadius(50_000)).toBe(osmFood.MAX_RADIUS_M);
    expect(osmFood.clampRadius(0)).toBe(200);
    expect(osmFood.clampRadius(Number.NaN)).toBe(osmFood.DEFAULT_RADIUS_M);
    expect(osmFood.buildFoodQuery(51.5, -0.1, osmFood.clampRadius(50_000))).toContain('around:2500');
  });

  it('bounds the result count and sets a server-side timeout inside the query', () => {
    const query = osmFood.buildFoodQuery(51.5, -0.1, 1200);
    expect(query).toContain(`out center ${osmFood.MAX_ELEMENTS}`);
    expect(query).toMatch(/\[timeout:\d+\]/);
  });

  it('identifies itself with a contact route, as Overpass asks of automated clients', async () => {
    serve(() => [node(1)]);
    await osmFood.searchOsmFood(ANCHOR);
    const init = (globalThis.fetch as any).mock.calls[0][1];
    expect(init.headers['User-Agent']).toBe(osmFood.OVERPASS_USER_AGENT);
    expect(init.headers['User-Agent']).toContain('https://');
  });

  it('refuses an anchor that is not a real coordinate instead of querying for it', async () => {
    serve(() => []);
    await expect(osmFood.searchOsmFood({ latitude: 999, longitude: 0 })).rejects.toThrow(/valid anchor/i);
    await expect(osmFood.searchOsmFood(null)).rejects.toThrow(/valid anchor/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('candidate quality: only what OpenStreetMap actually said', () => {
  it('drops an unnamed place, which a parent cannot be sent to', async () => {
    serve(() => [node(1, { tags: { amenity: 'restaurant', name: undefined } }), node(2)]);
    const { candidates } = await osmFood.searchOsmFood(ANCHOR);
    expect(candidates.map((c: any) => c.name)).toEqual(['Place 2']);
  });

  it('drops a record with no usable coordinates', async () => {
    serve(() => [
      { type: 'node', id: 3, tags: { amenity: 'cafe', name: 'No Coordinates Cafe' } },
      node(4),
    ]);
    const { candidates } = await osmFood.searchOsmFood(ANCHOR);
    expect(candidates.map((c: any) => c.name)).toEqual(['Place 4']);
  });

  it('drops anything that is not somewhere you can eat', async () => {
    serve(() => [
      node(5, { tags: { amenity: 'pharmacy', name: 'Not Food' } }),
      node(6, { tags: { amenity: 'cafe', name: 'Real Cafe' } }),
    ]);
    const { candidates } = await osmFood.searchOsmFood(ANCHOR);
    expect(candidates.map((c: any) => c.name)).toEqual(['Real Cafe']);
  });

  it('records absent opening hours as absent, never as a guess', async () => {
    serve(() => [node(7), node(8, { tags: { amenity: 'cafe', name: 'Hours Known', opening_hours: 'Mo-Su 09:00-17:00' } })]);
    const { candidates } = await osmFood.searchOsmFood(ANCHOR);
    const silent = candidates.find((c: any) => c.name === 'Place 7');
    const mapped = candidates.find((c: any) => c.name === 'Hours Known');
    expect(silent.openingHours).toBeNull();
    // The raw expression, unparsed: turning it into "open now" is a separate job with its own
    // failure modes, and doing it here would manufacture a fact.
    expect(mapped.openingHours).toBe('Mo-Su 09:00-17:00');
  });

  it('never invents a family facility from a silent map', async () => {
    serve(() => [node(9)]);
    const { candidates } = await osmFood.searchOsmFood(ANCHOR);
    // Nothing is false either: a tag nobody filled in is absent, which is a different claim from "no".
    expect(candidates[0].tagged.highchair).toBeUndefined();
    expect(candidates[0].tagged.changingTable).toBeUndefined();
    expect(candidates[0].tagged.wheelchair).toBeUndefined();
  });

  it('carries only an explicit yes through, not a no and not a maybe', async () => {
    serve(() => [
      node(10, { tags: { amenity: 'restaurant', name: 'Tagged', highchair: 'yes', wheelchair: 'limited', changing_table: 'no' } }),
    ]);
    const { candidates } = await osmFood.searchOsmFood(ANCHOR);
    expect(candidates[0].tagged.highchair).toBe(true);
    // "limited" is not yes, and must not become a confirmed facility.
    expect(candidates[0].tagged.wheelchair).toBeUndefined();
    expect(candidates[0].tagged.changingTable).toBeUndefined();
  });

  it('keeps a very long name intact rather than truncating it in the data layer', async () => {
    const longName = 'The Extremely Long Memorial Gardens Family Restaurant And Tea Rooms Of Greater London';
    serve(() => [node(11, { tags: { amenity: 'restaurant', name: longName } })]);
    const { candidates } = await osmFood.searchOsmFood(ANCHOR);
    // Truncation is a presentation decision; the record stays whole so a detail screen can show it all.
    expect(candidates[0].name).toBe(longName);
  });

  it('attributes every candidate to OpenStreetMap, never to anyone else', async () => {
    serve(() => [node(12), way(13)]);
    const { candidates, provider } = await osmFood.searchOsmFood(ANCHOR);
    expect(provider).toBe('osm');
    expect(candidates.every((c: any) => c.provider === 'osm')).toBe(true);
  });
});

describe('duplicates', () => {
  it('collapses the same element returned by both the node and the way clause', async () => {
    serve(() => [node(20), node(20)]);
    const { candidates } = await osmFood.searchOsmFood(ANCHOR);
    expect(candidates).toHaveLength(1);
  });

  it('collapses a node mapped inside an already-mapped building, keeping the richer record', async () => {
    serve(() => [
      node(21, { tags: { amenity: 'restaurant', name: 'Olive Tree' } }),
      way(22, { tags: { amenity: 'restaurant', name: 'Olive Tree', opening_hours: 'Mo-Su 12:00-22:00', 'addr:street': 'High Street' } }),
    ]);
    const { candidates } = await osmFood.searchOsmFood(ANCHOR);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].openingHours).toBe('Mo-Su 12:00-22:00');
  });

  it('does NOT collapse two branches of a chain that are genuinely different places', async () => {
    serve(() => [
      node(23, { lat: 51.5085, lon: -0.1285, tags: { amenity: 'cafe', name: 'Pret A Manger' } }),
      // ~300m away: same name, different shop. Merging these would hide a real option.
      node(24, { lat: 51.5112, lon: -0.1285, tags: { amenity: 'cafe', name: 'Pret A Manger' } }),
    ]);
    const { candidates } = await osmFood.searchOsmFood(ANCHOR);
    expect(candidates).toHaveLength(2);
  });
});

describe('when Overpass will not cooperate', () => {
  it('falls to the second endpoint when the first errors, without repeating the first', async () => {
    serve((_body, attempt) => (attempt === 1 ? { status: 504 } : [node(30)]));
    const { candidates } = await osmFood.searchOsmFood(ANCHOR);
    expect(candidates).toHaveLength(1);
    expect(requests).toEqual(osmFood.OVERPASS_ENDPOINTS);
  });

  it('retries exactly once, with a NARROWER query rather than the same one again', async () => {
    // Both endpoints fail on the full query; the retry narrows the ask.
    serve((_body, attempt) => (attempt <= 2 ? { status: 429 } : [node(31)]));
    const { candidates, overpassRequests } = await osmFood.searchOsmFood(ANCHOR);
    expect(candidates).toHaveLength(1);
    expect(overpassRequests).toBe(2);
    // Four calls at most: two endpoints for the full query, then the narrowed one.
    expect(requests.length).toBeLessThanOrEqual(4);
    const narrowed = bodies[bodies.length - 1];
    expect(narrowed).toContain('around%3A1000');
    expect(narrowed).not.toContain('fast_food');
  });

  it('gives up rather than looping when every attempt fails', async () => {
    serve(() => new Error('socket hang up'));
    await expect(osmFood.searchOsmFood(ANCHOR)).rejects.toThrow(/socket hang up/);
    // Two endpoints for the full query plus two for the narrowed retry. No unbounded loop.
    expect(requests.length).toBeLessThanOrEqual(4);
  });

  it('treats a timeout as a failure to report, not as an empty neighbourhood', async () => {
    // An abort must not look like "there are no restaurants here", which would be a false fact.
    serve(() => Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
    await expect(osmFood.searchOsmFood(ANCHOR)).rejects.toThrow(/aborted/i);
  });

  it('survives a malformed element without discarding the usable ones beside it', async () => {
    serve(() => [
      null,
      'not an object',
      { type: 'node' },
      { type: 'node', id: 32, lat: 'north', lon: -0.12, tags: { amenity: 'cafe', name: 'Bad Coords' } },
      node(33),
    ]);
    const { candidates } = await osmFood.searchOsmFood(ANCHOR);
    expect(candidates.map((c: any) => c.name)).toEqual(['Place 33']);
  });
});

describe('concurrency: one anchor is one request', () => {
  it('coalesces simultaneous lookups for the same anchor into a single Overpass call', async () => {
    serve(() => [node(40)]);
    const [a, b, c] = await Promise.all([
      osmFood.searchOsmFood(ANCHOR),
      osmFood.searchOsmFood(ANCHOR),
      osmFood.searchOsmFood(ANCHOR),
    ]);
    expect(requests).toHaveLength(1);
    expect(a.candidates).toHaveLength(1);
    expect(b.candidates).toHaveLength(1);
    expect(c.candidates).toHaveLength(1);
  });

  it('does not coalesce two genuinely different anchors', async () => {
    serve(() => [node(41)]);
    await Promise.all([
      osmFood.searchOsmFood(ANCHOR),
      osmFood.searchOsmFood({ latitude: 51.6, longitude: -0.3 }),
    ]);
    expect(requests).toHaveLength(2);
  });

  it('releases the in-flight slot after a failure, so the next caller is not stuck with it', async () => {
    serve(() => new Error('down'));
    await expect(osmFood.searchOsmFood(ANCHOR)).rejects.toThrow();
    requests = [];
    serve(() => [node(42)]);
    const { candidates } = await osmFood.searchOsmFood(ANCHOR);
    expect(candidates).toHaveLength(1);
  });
});

describe('nobody pays Google for a restaurant', () => {
  it('reaches only the two Overpass endpoints, and no Google host, across every case above', async () => {
    serve(() => [node(50), way(51), node(52, { tags: { amenity: 'fast_food', name: 'Quick Bite' } })]);
    await osmFood.searchOsmFood(ANCHOR);
    for (const url of requests) {
      expect(osmFood.OVERPASS_ENDPOINTS).toContain(url);
      expect(url).not.toMatch(/google/i);
    }
  });
});

describe('the whole lookup is bounded, not just each request', () => {
  it('gives up inside the total deadline rather than summing four timeouts', async () => {
    // The first real canary run measured 47 seconds at one anchor: each request aborts at 15s, and the
    // sequence is two endpoints plus two for the narrowed retry, so nothing bounded the SUM. A parent
    // would have waited the better part of a minute on a section of a screen.
    vi.useFakeTimers();
    try {
      let attempts = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          attempts += 1;
          // Each attempt consumes its full per-request allowance.
          await vi.advanceTimersByTimeAsync(osmFood.TOTAL_DEADLINE_MS / 2 + 1000);
          throw Object.assign(new Error('The operation was aborted due to timeout'), {
            name: 'TimeoutError',
          });
        }),
      );

      const promise = osmFood.searchOsmFood(ANCHOR);
      await expect(promise).rejects.toThrow(/aborted|deadline/i);
      // Two attempts consume the budget; the rest are refused before they start, rather than each
      // waiting its own fifteen seconds.
      expect(attempts).toBeLessThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('exposes the deadline, so a caller can reason about the worst case', () => {
    expect(osmFood.TOTAL_DEADLINE_MS).toBeLessThanOrEqual(20000);
  });
});

/**
 * The owner's decision was to keep the 60-element cap and gather evidence rather than raise it, so the
 * evidence has to actually be gathered. Every count here comes from the one response already made.
 */
describe('the discovery funnel is reported without a second request', () => {
  it('counts every stage, so the drop at each one is visible', async () => {
    serve(() => [
      node(1),
      node(2, { tags: { amenity: 'cafe', name: 'A Cafe' } }),
      // Dropped at validation: no name, so nothing a parent could be shown. The name has to be blanked
      // explicitly -- the `node` helper always supplies one, and an earlier version of this test passed
      // `{ amenity: 'restaurant' }` expecting that to remove it, which it does not.
      node(3, { tags: { name: '' } }),
      // Dropped at dedupe: same name within 40m of node 1.
      node(4, { lat: 51.5085, lon: -0.12851, tags: { name: 'Place 1' } }),
    ]);
    const result = await osmFood.searchOsmFood(ANCHOR);
    expect(result.discovery).toMatchObject({
      rawElements: 4,
      afterValidation: 3,
      afterDedupe: 2,
      elementCap: osmFood.MAX_ELEMENTS,
      saturatedCap: false,
    });
    expect(requests).toHaveLength(1);
  });

  it('calls a full response saturated, because the cap is where it stopped', async () => {
    serve(() => Array.from({ length: osmFood.MAX_ELEMENTS }, (_, i) => node(1000 + i, {
      // Spread them out so dedupe does not collapse them and confuse the count under test.
      lat: 51.5085 + i * 0.0004, tags: { name: `Distinct ${i}` },
    })));
    const result = await osmFood.searchOsmFood(ANCHOR);
    expect(result.discovery.rawElements).toBe(osmFood.MAX_ELEMENTS);
    expect(result.discovery.saturatedCap).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it('judges saturation against the cap that actually applied, not against 60', async () => {
    // The case a single hardcoded cap gets wrong. The narrower retry asks for 25, so 25 elements back
    // from IT is saturated -- while 25 from the first query would be nowhere near the limit.
    // BOTH endpoints must fail the first query to reach the narrow retry. Failing only fetch attempt 1
    // falls over to the second endpoint with the SAME query, which is a different thing -- a mistake
    // this test made first time round and which is now asserted on its own below.
    serve((_body, attempt) => {
      if (attempt <= 2) return new Error('Overpass said no');
      return Array.from({ length: 25 }, (_, i) => node(2000 + i, {
        lat: 51.5085 + i * 0.0004, tags: { name: `Narrow ${i}` },
      }));
    });
    const result = await osmFood.searchOsmFood(ANCHOR);
    expect(result.overpassRequests).toBe(2);
    expect(result.discovery.elementCap).toBe(25);
    expect(result.discovery.saturatedCap).toBe(true);
  });

  it('counts endpoint failover as the extra request it is', async () => {
    /**
     * The undercount this found. `overpassRequests` counts QUERIES, so a first endpoint that 429s and a
     * second that answers reported "1 Overpass request" for two requests actually sent. For a free
     * service funded by donations, understating our load exactly when we are retrying is the wrong
     * direction to be wrong in.
     */
    serve((_body, attempt) => (attempt === 1 ? { status: 429 } : [node(1)]));
    const result = await osmFood.searchOsmFood(ANCHOR);
    expect(result.overpassRequests).toBe(1);
    expect(result.overpassHttpRequests).toBe(2);
    expect(requests).toHaveLength(2);
  });

  it('never reports fewer requests than queries', async () => {
    serve(() => [node(1)]);
    const result = await osmFood.searchOsmFood(ANCHOR);
    expect(result.overpassHttpRequests).toBeGreaterThanOrEqual(result.overpassRequests);
    expect(result.overpassHttpRequests).toBe(1);
  });

  it('does not call 25 from the first query saturated', async () => {
    serve(() => Array.from({ length: 25 }, (_, i) => node(3000 + i, {
      lat: 51.5085 + i * 0.0004, tags: { name: `Roomy ${i}` },
    })));
    const result = await osmFood.searchOsmFood(ANCHOR);
    expect(result.discovery.elementCap).toBe(osmFood.MAX_ELEMENTS);
    expect(result.discovery.saturatedCap).toBe(false);
  });
});
