import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The Routes API `computeRouteMatrix` client, against fixtures only.
 *
 * NOT ONE LIVE REQUEST, and not only because it would cost money: `routes.googleapis.com` is denied by
 * this environment's egress policy, so a suite that reached for it would fail for the wrong reason and
 * teach us nothing. Every request here is served by an injected `fetchImpl`.
 *
 * The assertions that matter are the two the owner decided (`docs/routing-decisions.md`): the request
 * must go to the Routes API rather than legacy Distance Matrix, and it must be traffic-UNAWARE, because
 * traffic awareness moves the call into a tier that doubles the unit price and halves the free
 * allowance. Both are the kind of thing that is invisible until a bill arrives, so both are asserted on
 * the request actually built rather than on a constant.
 */

const routeMatrix = require('../../../server/places/../context/lib/route-matrix.js');

const ORIGIN = { latitude: 51.5074, longitude: -0.1278 };
const DEST = [
  { placeId: 'a', latitude: 51.52, longitude: -0.1 },
  { placeId: 'b', latitude: 51.48, longitude: -0.16 },
];

/** Captures the single request the client makes, and answers with the given elements. */
function serve(elements: any) {
  const calls: Array<{ url: string; init: any }> = [];
  const fetchImpl = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => elements } as any;
  });
  return { fetchImpl, calls };
}

const element = (o: number, d: number, seconds: number | null, over: Record<string, any> = {}) => ({
  originIndex: o,
  destinationIndex: d,
  ...(seconds === null ? {} : { duration: `${seconds}s` }),
  condition: 'ROUTE_EXISTS',
  ...over,
});

describe('the request goes to the Routes API, traffic-unaware', () => {
  it('posts to computeRouteMatrix, not to legacy Distance Matrix', async () => {
    const { fetchImpl, calls } = serve([element(0, 0, 600), element(0, 1, 900)]);
    await routeMatrix.computeRouteMatrix([ORIGIN], DEST, 'fake-key', { fetchImpl });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix');
    // The endpoint the owner decided against. New projects cannot enable it.
    expect(calls[0].url).not.toContain('maps/api/distancematrix');
  });

  it('asks for TRAFFIC_UNAWARE explicitly rather than trusting a default', async () => {
    // The whole cost decision. A default is not a commitment, and being wrong here doubles the unit
    // price silently: $10.00 per 1,000 elements against $5.00, with half the free monthly allowance.
    const { fetchImpl, calls } = serve([element(0, 0, 600)]);
    await routeMatrix.computeRouteMatrix([ORIGIN], DEST, 'fake-key', { fetchImpl });
    const body = JSON.parse(calls[0].init.body);
    expect(body.routingPreference).toBe('TRAFFIC_UNAWARE');
    expect(body.travelMode).toBe('DRIVE');
  });

  it('asks for no traffic-aware behaviour by any other name', async () => {
    const { fetchImpl, calls } = serve([element(0, 0, 600)]);
    await routeMatrix.computeRouteMatrix([ORIGIN], DEST, 'fake-key', { fetchImpl });
    const raw = String(calls[0].init.body);
    // The legacy call reached the same tier through departure_time + duration_in_traffic, so the absence
    // of those is part of the same assertion rather than a separate concern.
    expect(raw).not.toMatch(/TRAFFIC_AWARE/);
    expect(raw).not.toMatch(/departure_?[Tt]ime/);
    expect(raw).not.toMatch(/duration_in_traffic/);
  });

  it('sends a field mask, which the API requires', async () => {
    const { fetchImpl, calls } = serve([element(0, 0, 600)]);
    await routeMatrix.computeRouteMatrix([ORIGIN], DEST, 'fake-key', { fetchImpl });
    const mask = calls[0].init.headers['X-Goog-FieldMask'];
    expect(mask).toBeTruthy();
    // Enough to place an element and read its outcome, and nothing the product does not show.
    expect(mask).toContain('originIndex');
    expect(mask).toContain('destinationIndex');
    expect(mask).toContain('duration');
    expect(mask).toContain('condition');
    expect(mask).not.toContain('polyline');
  });

  it('sends the key as a header, never in the URL', async () => {
    const { fetchImpl, calls } = serve([element(0, 0, 600)]);
    await routeMatrix.computeRouteMatrix([ORIGIN], DEST, 'super-secret', { fetchImpl });
    expect(calls[0].init.headers['X-Goog-Api-Key']).toBe('super-secret');
    // A key in a query string ends up in logs, proxies and error messages.
    expect(calls[0].url).not.toContain('super-secret');
  });
});

describe('a duration is read exactly, or not at all', () => {
  it('parses the protobuf duration string', () => {
    expect(routeMatrix.durationSeconds('842s')).toBe(842);
    expect(routeMatrix.durationSeconds('0s')).toBe(0);
    expect(routeMatrix.durationSeconds('12.5s')).toBe(12.5);
  });

  it('returns null rather than zero for anything it cannot read', () => {
    // A zero would schedule a day around an instant journey, which is worse than falling back to the
    // distance estimate the caller already holds.
    for (const bad of ['', 'soon', '842', 's', null, undefined, {}, '842ms']) {
      expect(routeMatrix.durationSeconds(bad as any)).toBeNull();
    }
  });

  it('refuses an element with no route, however healthy its status', () => {
    expect(routeMatrix.elementHasRoute(element(0, 0, 600))).toBe(true);
    // The request was fine; there is simply no drivable route. Using it would put a missing number
    // into a plan.
    expect(routeMatrix.elementHasRoute(element(0, 0, 600, { condition: 'ROUTE_NOT_FOUND' }))).toBe(false);
    expect(routeMatrix.elementHasRoute(element(0, 0, null))).toBe(false);
    expect(routeMatrix.elementHasRoute({ ...element(0, 0, 600), status: { code: 3 } })).toBe(false);
    expect(routeMatrix.elementHasRoute(null as any)).toBe(false);
    expect(routeMatrix.elementHasRoute('nonsense' as any)).toBe(false);
  });

  it('drops an unusable element without dropping the rest of the matrix', async () => {
    const { fetchImpl } = serve([
      element(0, 0, 600),
      element(0, 1, 900, { condition: 'ROUTE_NOT_FOUND' }),
    ]);
    const seconds = await routeMatrix.computeRouteMatrix([ORIGIN], DEST, 'k', { fetchImpl });
    expect(seconds.get('0:0')).toBe(600);
    expect(seconds.has('0:1')).toBe(false);
  });
});

describe('the client refuses what it should not send', () => {
  it('refuses a matrix above the provider ceiling without making a request', async () => {
    const { fetchImpl } = serve([]);
    const manyOrigins = Array.from({ length: 26 }, () => ORIGIN);
    const manyDests = Array.from({ length: 26 }, (_, i) => ({ placeId: `d${i}`, ...ORIGIN }));
    await expect(
      routeMatrix.computeRouteMatrix(manyOrigins, manyDests, 'k', { fetchImpl }),
    ).rejects.toThrow(/above the provider maximum/);
    // 676 elements would be rejected by the API, and a rejected request is still a request.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses an empty matrix without making a request', async () => {
    const { fetchImpl } = serve([]);
    await expect(routeMatrix.computeRouteMatrix([], DEST, 'k', { fetchImpl })).rejects.toThrow(/origin/);
    await expect(routeMatrix.computeRouteMatrix([ORIGIN], [], 'k', { fetchImpl })).rejects.toThrow(/destination/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never puts the key in the error it throws on a failure', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 400,
      // A 400 body can echo the request, key included.
      json: async () => ({ error: { message: 'key=super-secret is invalid' } }),
    }) as any);
    await expect(
      routeMatrix.computeRouteMatrix([ORIGIN], DEST, 'super-secret', { fetchImpl }),
    ).rejects.toThrow(/failed \(400\)/);
    await routeMatrix
      .computeRouteMatrix([ORIGIN], DEST, 'super-secret', { fetchImpl })
      .catch((error: Error) => {
        expect(error.message).not.toContain('super-secret');
      });
  });
});

describe('the journey provider degrades per destination, not wholesale', () => {
  const journeyPath = '../../../server/context/lib/journey-provider.js';
  const ENV = ['GOOGLE_PLACES_ENABLED', 'GOOGLE_JOURNEYS_ENABLED', 'GOOGLE_PLACES_API_KEY', 'VERCEL_ENV'];
  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
    vi.resetModules();
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.unstubAllGlobals();
  });

  const openTheGate = () => {
    process.env.GOOGLE_PLACES_ENABLED = 'true';
    process.env.GOOGLE_JOURNEYS_ENABLED = 'true';
    process.env.GOOGLE_PLACES_API_KEY = 'fake-key';
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
  };

  it('keeps the routed leg and estimates only the one with no route', async () => {
    openTheGate();
    const { fetchImpl } = serve([
      element(0, 0, 480),
      element(0, 1, 900, { condition: 'ROUTE_NOT_FOUND' }),
    ]);
    const { getDriveTimes } = await import(journeyPath);
    const result = await getDriveTimes(ORIGIN, DEST, { fetchImpl });

    expect(result.provider).toBe('google');
    expect(result.journeys[0]).toMatchObject({ placeId: 'a', driveMinutes: 8, source: 'live' });
    // Not 'live', and not absent: the honest answer for that one leg.
    expect(result.journeys[1].source).toBe('estimated');
    expect(result.journeys[1].driveMinutes).toBeGreaterThan(0);
    // One live element is enough for the batch to count as live overall.
    expect(result.source).toBe('live');
  });

  it('never rounds a short routed drive down to zero minutes', async () => {
    openTheGate();
    const { fetchImpl } = serve([element(0, 0, 20), element(0, 1, 25)]);
    const { getDriveTimes } = await import(journeyPath);
    const result = await getDriveTimes(ORIGIN, DEST, { fetchImpl });
    for (const journey of result.journeys) expect(journey.driveMinutes).toBeGreaterThanOrEqual(1);
  });

  it('cannot reach the Routes API with the journeys flag absent', async () => {
    // The fail-closed guarantee, asserted on the request never happening rather than on a thrown error.
    process.env.GOOGLE_PLACES_ENABLED = 'true';
    process.env.GOOGLE_PLACES_API_KEY = 'fake-key';
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    delete process.env.GOOGLE_JOURNEYS_ENABLED;

    const fetchImpl = vi.fn(async () => {
      throw new Error('the Routes API must not be reached');
    });
    const tripwire = vi.fn(async () => {
      throw new Error('global fetch must not be reached');
    });
    vi.stubGlobal('fetch', tripwire);

    const { getDriveTimes } = await import(journeyPath);
    const result = await getDriveTimes(ORIGIN, DEST, { fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(tripwire).not.toHaveBeenCalled();
    expect(result.provider).toBe('fallback');
    expect(result.source).toBe('estimated');
    expect(result.fallbackReason).toBe('PLACES_DISABLED');
    // The planner still gets usable numbers; a closed gate costs accuracy, not the feature.
    expect(result.journeys).toHaveLength(2);
    for (const journey of result.journeys) expect(journey.source).toBe('estimated');
  });
});
