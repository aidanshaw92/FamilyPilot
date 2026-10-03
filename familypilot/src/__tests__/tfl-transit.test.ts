import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Public transport via TfL, against fixtures only.
 *
 * NOT ONE LIVE REQUEST, and here that is not merely good manners: `api.tfl.gov.uk` is denied by this
 * environment's egress policy, so a suite that reached for it would fail for the wrong reason. These
 * fixtures encode TfL's documented response shape. **They cannot prove the parser matches the real
 * service**, and the module says so too. What they can prove is every honesty rule the brief attached
 * to transit, and those are the assertions below.
 */

const tflPath = '../../../server/context/lib/tfl-transit.js';
const tfl = require(tflPath);

const SOUTHBANK = { latitude: 51.5074, longitude: -0.1278 };
const GREENWICH = { latitude: 51.4826, longitude: -0.0077 };
const MANCHESTER = { latitude: 53.4808, longitude: -2.2426 };

const ENV = ['TFL_TRANSIT_ENABLED', 'TFL_APP_KEY', 'TFL_MAX_REQUESTS_PER_MINUTE'];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  tfl.resetRateLimit();
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  tfl.resetRateLimit();
  vi.unstubAllGlobals();
});

const enable = () => {
  process.env.TFL_TRANSIT_ENABLED = 'true';
};

/** A TfL journey, in the shape the Journey Planner documents. */
const leg = (modeId: string) => ({ mode: { id: modeId, name: modeId } });
const journey = (duration: number, modes: string[]) => ({ duration, legs: modes.map(leg) });

function serve(body: any, status = 200) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: any) => {
    calls.push(String(url));
    return { ok: status >= 200 && status < 300, status, json: async () => body } as any;
  });
  return { fetchImpl, calls };
}

describe('transit is switched off until somebody has watched it work', () => {
  it('refuses when the flag is absent, without making a request', async () => {
    delete process.env.TFL_TRANSIT_ENABLED;
    const { fetchImpl } = serve({});
    await expect(tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl })).rejects.toThrow(
      /TFL_TRANSIT_ENABLED/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('is not turned on by the flag merely existing', async () => {
    process.env.TFL_TRANSIT_ENABLED = 'yes';
    const { fetchImpl } = serve({});
    await expect(tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('outside London is unknown, never "no public transport"', () => {
  it('answers unknown for a journey TfL does not cover, before asking', async () => {
    enable();
    const { fetchImpl } = serve({});
    const result = await tfl.getTransitJourney(SOUTHBANK, MANCHESTER, { fetchImpl });
    expect(result.state).toBe('unknown');
    expect(result.reason).toBe('outside-coverage');
    // Asking would have returned the same answer more slowly, and at TfL's expense.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never reports a coverage gap as an absence of service', async () => {
    enable();
    const { fetchImpl } = serve({});
    const result = await tfl.getTransitJourney(MANCHESTER, MANCHESTER, { fetchImpl });
    // The failure to avoid: a parent in Manchester told there is no public transport in Manchester.
    expect(result.state).not.toBe('unavailable');
    expect(JSON.stringify(result)).not.toMatch(/no service|no transport|none/i);
  });

  it('knows where London is', () => {
    expect(tfl.withinLondon(SOUTHBANK)).toBe(true);
    expect(tfl.withinLondon(GREENWICH)).toBe(true);
    expect(tfl.withinLondon(MANCHESTER)).toBe(false);
    expect(tfl.withinLondon({ latitude: NaN, longitude: 0 })).toBe(false);
    expect(tfl.withinLondon(undefined)).toBe(false);
  });
});

describe('🚌 is reserved for a journey that really is buses', () => {
  it('calls an all-bus journey a bus journey', () => {
    expect(tfl.journeyMode([leg('bus'), leg('walking'), leg('bus')])).toBe('bus');
  });

  it('calls a mixed journey public transport, not a bus', () => {
    // The brief's rule: "Do not call everything 'Bus'."
    expect(tfl.journeyMode([leg('bus'), leg('tube')])).toBe('transit');
    expect(tfl.journeyMode([leg('tube')])).toBe('transit');
    expect(tfl.journeyMode([leg('national-rail'), leg('bus')])).toBe('transit');
  });

  it('ignores walking legs when deciding, since almost every journey has one', () => {
    expect(tfl.journeyMode([leg('walking'), leg('bus'), leg('walk')])).toBe('bus');
  });

  it('calls a journey with no transit leg at all nothing', () => {
    expect(tfl.journeyMode([leg('walking')])).toBeNull();
    expect(tfl.journeyMode([])).toBeNull();
    expect(tfl.journeyMode(undefined as any)).toBeNull();
  });

  it('offers no transit option for a journey TfL answers entirely on foot', async () => {
    enable();
    const { fetchImpl } = serve({ journeys: [journey(12, ['walking'])] });
    const result = await tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl });
    // A walk is not public transport, and the walk is already offered elsewhere.
    expect(result.state).toBe('unknown');
    expect(result.reason).toBe('walking-only');
  });
});

describe('a TfL journey is routed, and carries its credit', () => {
  it('returns the quickest journey as a routed leg', async () => {
    enable();
    const { fetchImpl } = serve({
      journeys: [journey(48, ['bus']), journey(31, ['tube', 'bus']), journey(55, ['bus'])],
    });
    const result = await tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl });
    expect(result.state).toBe('available');
    expect(result.leg).toEqual({
      mode: 'transit',
      durationMinutes: 31,
      // A real plan over a real network may be stated plainly. This is the one non-driving mode that
      // earns that, and the reason transit was worth a provider rather than an estimate.
      source: 'routed',
      confidence: 'high',
    });
  });

  it('carries TfL’s required credit on every answer, including the unknown ones', async () => {
    enable();
    const { fetchImpl } = serve({ journeys: [journey(20, ['bus'])] });
    const available = await tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl });
    const unknown = await tfl.getTransitJourney(SOUTHBANK, MANCHESTER, { fetchImpl });
    for (const result of [available, unknown]) {
      expect(result.attribution).toBe('Powered by the Transport for London Journey Planner API');
    }
  });

  it('does not claim to be official or borrow TfL branding', () => {
    // TfL's terms: the credit is required, their branding is not ours to use.
    expect(tfl.TFL_ATTRIBUTION).toContain('Powered by');
    expect(tfl.TFL_ATTRIBUTION).not.toMatch(/official|partner|endorsed/i);
  });

  it('marks the result uncacheable, because it embeds departure times', async () => {
    enable();
    const { fetchImpl } = serve({ journeys: [journey(20, ['bus'])] });
    const result = await tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl });
    // A cached journey serves a parent yesterday's bus.
    expect(result.cacheable).toBe(false);
  });

  it('asks for public transport modes only', async () => {
    enable();
    const { fetchImpl, calls } = serve({ journeys: [journey(20, ['bus'])] });
    await tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl });
    const url = new URL(calls[0]);
    const modes = url.searchParams.get('mode') ?? '';
    expect(modes).toContain('bus');
    expect(modes).toContain('tube');
    // Without this TfL will plan a drive, which this module must never present as transit.
    expect(modes).not.toContain('car');
  });

  it('works without an app key, and sends one when it has it', async () => {
    enable();
    delete process.env.TFL_APP_KEY;
    const anonymous = serve({ journeys: [journey(20, ['bus'])] });
    await tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl: anonymous.fetchImpl });
    expect(new URL(anonymous.calls[0]).searchParams.has('app_key')).toBe(false);

    tfl.resetRateLimit();
    process.env.TFL_APP_KEY = 'registered-key';
    const registered = serve({ journeys: [journey(20, ['bus'])] });
    await tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl: registered.fetchImpl });
    expect(new URL(registered.calls[0]).searchParams.get('app_key')).toBe('registered-key');
  });
});

describe('every failure is unknown, never a fact about the area', () => {
  const cases: Array<[string, number, string]> = [
    ['a rate limit from TfL', 429, 'provider-rate-limited'],
    ['no journey found', 404, 'no-journey-found'],
    ['a server error', 500, 'provider-error'],
  ];

  for (const [label, status, reason] of cases) {
    it(`reports ${label} as unknown`, async () => {
      enable();
      const { fetchImpl } = serve({}, status);
      const result = await tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl });
      expect(result.state).toBe('unknown');
      expect(result.reason).toBe(reason);
    });
  }

  it('does not retry a 429, because a retry is another request against the limit', async () => {
    enable();
    const { fetchImpl } = serve({}, 429);
    await tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports a network failure as unknown rather than throwing at the screen', async () => {
    enable();
    const fetchImpl = vi.fn(async () => {
      throw new Error('socket hang up');
    });
    const result = await tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl });
    expect(result.state).toBe('unknown');
    expect(result.reason).toBe('provider-unavailable');
  });

  it('reports an unreadable body as unknown', async () => {
    enable();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    }) as any);
    const result = await tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl });
    expect(result.state).toBe('unknown');
    expect(result.reason).toBe('provider-unreadable');
  });

  it('ignores a journey with no usable duration', async () => {
    enable();
    const { fetchImpl } = serve({
      journeys: [{ duration: 0, legs: [leg('bus')] }, { duration: null, legs: [leg('bus')] }],
    });
    const result = await tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl });
    expect(result.state).toBe('unknown');
    expect(result.reason).toBe('no-journey-found');
  });
});

describe('TfL is a donated public service and the limit sits well under its ceiling', () => {
  it('defaults far below the documented anonymous ceiling', () => {
    delete process.env.TFL_MAX_REQUESTS_PER_MINUTE;
    // The two figures available disagree (roughly 500/day in one note, 50/minute in another) and
    // api.tfl.gov.uk cannot be reached from here to settle it. Sitting under both is the honest
    // response to an unresolved limit.
    expect(tfl.maxPerMinute()).toBe(20);
    expect(tfl.maxPerMinute()).toBeLessThan(50);
  });

  it('refuses once the window is spent, rather than queueing behind a waiting parent', async () => {
    enable();
    process.env.TFL_MAX_REQUESTS_PER_MINUTE = '2';
    const { fetchImpl } = serve({ journeys: [journey(20, ['bus'])] });
    await tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl });
    await tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl });
    await expect(tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl })).rejects.toThrow(
      /rate limit/i,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not let a configured limit exceed the registered ceiling', () => {
    process.env.TFL_MAX_REQUESTS_PER_MINUTE = '100000';
    expect(tfl.maxPerMinute()).toBe(500);
  });

  it('ignores a nonsense limit rather than treating it as unlimited', () => {
    for (const bad of ['', 'lots', '-5', '0']) {
      process.env.TFL_MAX_REQUESTS_PER_MINUTE = bad;
      expect(tfl.maxPerMinute()).toBe(20);
    }
  });

  it('does not count a refused request against the window', async () => {
    enable();
    process.env.TFL_MAX_REQUESTS_PER_MINUTE = '1';
    const { fetchImpl } = serve({ journeys: [journey(20, ['bus'])] });
    await tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl });
    await expect(tfl.getTransitJourney(SOUTHBANK, GREENWICH, { fetchImpl })).rejects.toThrow();
    // One slot used, not two: an out-of-coverage answer and a refusal never reached TfL.
    expect(tfl.rateLimitSnapshot().windowRequests).toBe(1);
  });

  it('spends no slot on a journey outside coverage', async () => {
    enable();
    await tfl.getTransitJourney(SOUTHBANK, MANCHESTER, { fetchImpl: serve({}).fetchImpl });
    expect(tfl.rateLimitSnapshot().windowRequests).toBe(0);
  });
});

describe('the transit module cannot reach anything billable', () => {
  it('has no Google client, API key or billing gate anywhere in its import graph', () => {
    // Structural, like the nearby-food contract: walking the require cache proves the absence rather
    // than a reader trusting that the imports are clean.
    const resolved = require.resolve(tflPath);
    const seen = new Set<string>();
    const walk = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const child of require.cache[id]?.children ?? []) walk(child.id);
    };
    walk(resolved);
    const graph = [...seen];
    expect(graph.length).toBeGreaterThan(0);
    for (const file of graph) {
      expect(file).not.toMatch(/places-budget|google|search-cache/i);
    }
  });

  it('names no Google host in its source', () => {
    const source = require('node:fs').readFileSync(require.resolve(tflPath), 'utf8');
    expect(source).not.toMatch(/googleapis|maps\.google/);
    expect(source).toContain('api.tfl.gov.uk');
  });
});
