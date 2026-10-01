import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * These tests exist because of a £104.11 Google Places bill for September 2026, produced by a
 * codebase with no kill switch, no server-side cache and no attribution.
 *
 * They are written to answer one question for each protection: can money still be spent? So almost
 * every assertion is about `fetch` NOT having been called, rather than about a return value. A test
 * that only checked the thrown error would pass against an implementation that threw after making
 * the request.
 */

const budgetPath = '../../../server/places/lib/places-budget.js';
const googlePath = '../../../server/places/lib/google-places.js';
const fallbackPath = '../../../server/places/lib/fallback.js';

type Budget = typeof import('../../../server/places/lib/places-budget.js');

const PLACES_ENV_KEYS = [
  'GOOGLE_PLACES_ENABLED',
  'GOOGLE_PLACES_DISCOVERY_ENABLED',
  'GOOGLE_PLACES_DETAILS_ENABLED',
  'GOOGLE_PLACES_PHOTOS_ENABLED',
  'GOOGLE_PLACES_REFRESH_ENABLED',
  'GOOGLE_PLACES_PROBE_ENABLED',
  'GOOGLE_GEOCODING_ENABLED',
  'GOOGLE_JOURNEYS_ENABLED',
  'GOOGLE_PLACES_ALLOW_LIVE_TEST',
  'GOOGLE_PLACES_MAX_CALLS_PER_DAY',
  'GOOGLE_PLACES_MAX_CALLS_PER_WINDOW',
  'VERCEL_ENV',
];

let savedEnv: Record<string, string | undefined> = {};

/** Loads a fresh copy of the gate, so module-level counters start clean for each test. */
async function loadBudget(): Promise<Budget> {
  vi.resetModules();
  return (await import(budgetPath)) as Budget;
}

/**
 * A fetch spy that fails loudly if it is reached. Every "the switch works" test installs this, so
 * the assertion is "no request happened", not "an error was thrown".
 */
function installFetchTripwire() {
  const spy = vi.fn(async () => {
    throw new Error('fetch must not be reached');
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

beforeEach(() => {
  savedEnv = {};
  for (const key of PLACES_ENV_KEYS) savedEnv[key] = process.env[key];
  for (const key of PLACES_ENV_KEYS) delete process.env[key];
  process.env.GOOGLE_PLACES_API_KEY = 'test-key-never-sent';
});

afterEach(() => {
  for (const key of PLACES_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the gate is closed by default', () => {
  it('refuses every scope under a test runtime', async () => {
    const budget = await loadBudget();
    for (const scope of Object.keys(budget.SCOPES)) {
      expect(budget.isPlacesEnabled(scope), scope).toBe(false);
    }
  });

  it('cannot be opened in a test runtime by the master switch alone', async () => {
    // The point of the override being a separate variable: setting the production switch while
    // running tests -- in a shell, a CI env block, a .env file -- must not make the suite spend.
    process.env.GOOGLE_PLACES_ENABLED = 'true';
    process.env.VERCEL_ENV = 'production';
    const budget = await loadBudget();
    expect(budget.isPlacesEnabled('discovery')).toBe(false);
    expect(budget.describeScope('discovery').reason).toContain('GOOGLE_PLACES_ALLOW_LIVE_TEST');
  });

  it('opens only when a developer asks for a live test by name', async () => {
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.GOOGLE_PLACES_ENABLED = 'true';
    const budget = await loadBudget();
    expect(budget.isPlacesEnabled('discovery')).toBe(true);
  });

  it('stays closed outside production even with the override, unless asked', async () => {
    // Preview deployments are the case this protects: vercel.json sets PLACES_PROVIDER=google for
    // every environment, so before this gate a Preview build billed exactly like production.
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'preview';
    const budget = await loadBudget();
    expect(budget.isPlacesEnabled('discovery')).toBe(false);
    expect(budget.describeScope('discovery').reason).toContain('preview');
  });

  it('is on in production without any flag being set', async () => {
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    const budget = await loadBudget();
    expect(budget.isPlacesEnabled('discovery')).toBe(true);
  });

  it('reads an unrecognised flag value as off rather than on', async () => {
    // A typo must cost nothing. `'flase'` is not `false`, and a truthiness check would have read it
    // as enabled.
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_PLACES_DISCOVERY_ENABLED = 'flase';
    const budget = await loadBudget();
    expect(budget.isPlacesEnabled('discovery')).toBe(false);
  });

  it('refuses a scope it has never heard of', async () => {
    // The gate lives inside googleRequest, so a function added later that forgets to name its scope
    // is refused rather than billed.
    const budget = await loadBudget();
    expect(() => budget.assertPlacesAllowed({ scope: undefined as never, reason: 'none' })).toThrow(
      /unknown scope/,
    );
  });

  it('switches discovery off independently of details', async () => {
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_PLACES_DISCOVERY_ENABLED = 'false';
    const budget = await loadBudget();
    expect(budget.isPlacesEnabled('discovery')).toBe(false);
    expect(budget.isPlacesEnabled('details')).toBe(true);
  });
});

describe('no outbound request is made when the gate is closed', () => {
  it('searchGoogle throws before reaching fetch', async () => {
    const spy = installFetchTripwire();
    vi.resetModules();
    const { searchGoogle } = await import(googlePath);
    await expect(searchGoogle(51.5074, -0.1278, 12, { intent: 'explore' })).rejects.toThrow(
      /Google Places is disabled/,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('getGooglePlace throws before reaching fetch', async () => {
    const spy = installFetchTripwire();
    vi.resetModules();
    const { getGooglePlace } = await import(googlePath);
    await expect(getGooglePlace('fp-google-ChIJtest')).rejects.toThrow(/Google Places is disabled/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('the photo proxy answers 503 without reaching fetch', async () => {
    const spy = installFetchTripwire();
    vi.resetModules();
    const handler = (await import('../../../api/places/photo.js')).default ??
      (await import('../../../api/places/photo.js'));
    const res = createMockResponse();
    await (handler as (req: unknown, res: unknown) => Promise<unknown>)(
      { method: 'GET', query: { id: 'ChIJtest', index: '0' } },
      res,
    );
    expect(res.statusCode).toBe(503);
    expect(res.body?.code).toBe('PLACES_DISABLED');
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('a cost control is never laundered into a provider outage', () => {
  it('searchWithFallback re-throws instead of degrading to OpenStreetMap or mock', async () => {
    // This is the hole that would have made the whole switch pointless: the chain catches every
    // provider error and falls through to OSM and then demo venues, so a disabled Google would have
    // looked like a data outage and the caller would have served mock London.
    const spy = installFetchTripwire();
    vi.resetModules();
    const { searchWithFallback } = await import(fallbackPath);
    await expect(searchWithFallback(51.5074, -0.1278, 12, 'google', { intent: 'explore' })).rejects.toThrow(
      /Google Places is disabled/,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('still falls back for a real provider failure', async () => {
    // The chain must keep working for the thing it was built for. Google is allowed here and fails
    // with a network error, which is an outage, so OSM should be tried.
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    const spy = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('places.googleapis.com')) throw new Error('socket hang up');
      return {
        ok: true,
        status: 200,
        json: async () => ({ elements: [] }),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', spy);
    vi.resetModules();
    const { searchWithFallback } = await import(fallbackPath);
    const result = await searchWithFallback(51.5074, -0.1278, 12, 'google', { intent: 'explore' });
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toContain('socket hang up');
    // It really did try Google first, which is what distinguishes this from the disabled case.
    expect(spy.mock.calls.some(([input]) => String(input).includes('places.googleapis.com'))).toBe(true);
  });
});

describe('ceilings bound a runaway loop', () => {
  it('stops a scope once the rolling window limit is reached', async () => {
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_WINDOW = '3';
    const budget = await loadBudget();
    for (let i = 0; i < 3; i += 1) {
      budget.assertPlacesAllowed({ scope: 'discovery', reason: 'loop' });
    }
    expect(() => budget.assertPlacesAllowed({ scope: 'discovery', reason: 'loop' })).toThrow(
      /budget exceeded/i,
    );
  });

  it('counts the window across scopes, so a loop cannot escape by switching SKU', async () => {
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_WINDOW = '2';
    const budget = await loadBudget();
    budget.assertPlacesAllowed({ scope: 'discovery', reason: 'loop' });
    budget.assertPlacesAllowed({ scope: 'details', reason: 'loop' });
    expect(() => budget.assertPlacesAllowed({ scope: 'photos', reason: 'loop' })).toThrow(
      /budget exceeded/i,
    );
  });

  it('stops a scope once the daily limit is reached', async () => {
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_DAY = '2';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_WINDOW = '1000';
    const budget = await loadBudget();
    budget.assertPlacesAllowed({ scope: 'refresh', reason: 'cron' });
    budget.assertPlacesAllowed({ scope: 'refresh', reason: 'cron' });
    expect(() => budget.assertPlacesAllowed({ scope: 'refresh', reason: 'cron' })).toThrow(
      /calls already made today/,
    );
  });

  it('keeps the daily limit per scope, so one job cannot starve another', async () => {
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_DAY = '1';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_WINDOW = '1000';
    const budget = await loadBudget();
    budget.assertPlacesAllowed({ scope: 'refresh', reason: 'cron' });
    expect(() => budget.assertPlacesAllowed({ scope: 'details', reason: 'parent' })).not.toThrow();
  });

  it('reports the ceilings it is enforcing', async () => {
    const budget = await loadBudget();
    const snapshot = budget.placesBudgetSnapshot();
    expect(snapshot.maxCallsPerDay).toBeGreaterThan(0);
    expect(snapshot.maxCallsPerWindow).toBeGreaterThan(0);
    expect(snapshot.testRuntime).toBe(true);
  });
});

describe('concurrent requests do not buy the same lookup twice', () => {
  it('coalesces identical in-flight Place Details lookups into one request', async () => {
    // Home renders three deck layers at once and each used to resolve its own photo and detail. The
    // coalescing is what makes a simultaneous render cost one call rather than three.
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    const spy = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'ChIJtest',
            displayName: { text: 'Test Park' },
            location: { latitude: 51.5, longitude: -0.1 },
            primaryType: 'park',
            types: ['park'],
          }),
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', spy);
    vi.resetModules();
    const { getGooglePlace } = await import(googlePath);
    const results = await Promise.all([
      getGooglePlace('fp-google-ChIJtest'),
      getGooglePlace('fp-google-ChIJtest'),
      getGooglePlace('fp-google-ChIJtest'),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result?.name === 'Test Park')).toBe(true);
  });

  it('does not coalesce different places', async () => {
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    const spy = vi.fn(async (input: unknown) => {
      const id = String(input).split('/').pop() ?? 'x';
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id,
          displayName: { text: `Park ${id}` },
          location: { latitude: 51.5, longitude: -0.1 },
          primaryType: 'park',
          types: ['park'],
        }),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', spy);
    vi.resetModules();
    const { getGooglePlace } = await import(googlePath);
    await Promise.all([getGooglePlace('fp-google-AAA'), getGooglePlace('fp-google-BBB')]);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('every billable request is attributed', () => {
  it('logs the SKU, scope, reason and environment, and never the key', async () => {
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    const budget = await loadBudget();
    const lines: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((line) => {
      lines.push(String(line));
    });
    budget.assertPlacesAllowed({
      scope: 'discovery',
      reason: 'london_grid',
      subject: '51.5074,-0.1278 r=12km explore',
    });
    logSpy.mockRestore();

    const entry = JSON.parse(lines.at(-1) as string);
    expect(entry.tag).toBe('google_places_billable');
    expect(entry.sku).toBe('nearby_search');
    expect(entry.scope).toBe('discovery');
    expect(entry.reason).toBe('london_grid');
    expect(entry.environment).toBe('production');
    expect(entry.dayCount).toBe(1);
    // Attribution must never become a leak. The whole line is checked, not just the fields above.
    expect(lines.join('\n')).not.toContain('test-key-never-sent');
  });

  it('logs a blocked request too, so a closed switch is visible rather than silent', async () => {
    const budget = await loadBudget();
    const lines: string[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((line) => {
      lines.push(String(line));
    });
    expect(() => budget.assertPlacesAllowed({ scope: 'discovery', reason: 'london_grid' })).toThrow();
    warnSpy.mockRestore();

    const entry = JSON.parse(lines.at(-1) as string);
    expect(entry.tag).toBe('google_places_blocked');
    expect(entry.scope).toBe('discovery');
    expect(entry.sku).toBe('nearby_search');
    // Under vitest the test-runtime rule is reached before the master switch, so this is the reason
    // that is actually true here -- and it is the more useful one, because it names the override.
    expect(entry.detail).toContain('GOOGLE_PLACES_ALLOW_LIVE_TEST');
  });

  it('names the master switch when that is what is holding the gate shut', async () => {
    // The reason a reader of production logs will see. Checked separately from the test-runtime case
    // above, because asserting only one of them would leave the other free to say anything.
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'preview';
    const budget = await loadBudget();
    const lines: string[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((line) => {
      lines.push(String(line));
    });
    expect(() => budget.assertPlacesAllowed({ scope: 'discovery', reason: 'london_grid' })).toThrow();
    warnSpy.mockRestore();

    const entry = JSON.parse(lines.at(-1) as string);
    expect(entry.detail).toContain('GOOGLE_PLACES_ENABLED');
    expect(entry.detail).toContain('preview');
    expect(entry.environment).toBe('preview');
  });
});


describe('repeat renders are absorbed rather than re-bought', () => {
  /**
   * These pin the cache headers, because the headers ARE the saving. A mutation test showed that
   * putting `Cache-Control: no-store` back on the photo proxy broke no test at all -- which is how
   * the September bill happened in the first place: `no-store` meant every render of every card
   * bought two Google requests again. A header with no test on it is a header that will come back.
   */
  async function loadPhotoHandler() {
    vi.resetModules();
    const mod = await import('../../../api/places/photo.js');
    return (mod.default ?? mod) as (req: unknown, res: unknown) => Promise<unknown>;
  }

  it('the photo proxy lets the CDN cache a resolved redirect', async () => {
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes('/media')) {
          return {
            ok: true,
            json: async () => ({ photoUri: 'https://lh3.googleusercontent.com/signed-photo' }),
          } as unknown as Response;
        }
        return {
          ok: true,
          json: async () => ({ photos: [{ name: 'places/ChIJtest/photos/REF' }] }),
        } as unknown as Response;
      }),
    );
    const handler = await loadPhotoHandler();
    const res = createMockResponse();
    await handler({ method: 'GET', query: { id: 'ChIJtest', index: '0' } }, res);

    expect(res.statusCode).toBe(302);
    expect(res.headers.Location).toBe('https://lh3.googleusercontent.com/signed-photo');
    const cacheControl = res.headers['Cache-Control'];
    expect(cacheControl).not.toContain('no-store');
    expect(cacheControl).toMatch(/\bpublic\b/);
    // s-maxage is the figure that stops a repeat render reaching this function at all.
    const sMaxAge = Number(/s-maxage=(\d+)/.exec(cacheControl ?? '')?.[1]);
    expect(sMaxAge).toBeGreaterThanOrEqual(600);
  });

  it('the photo proxy still refuses to cache a failure', async () => {
    // A cached 502 or 503 would outlive the switch or the outage that produced it.
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response));
    const handler = await loadPhotoHandler();
    const res = createMockResponse();
    await handler({ method: 'GET', query: { id: 'ChIJtest', index: '0' } }, res);
    expect(res.statusCode).toBe(404);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('the photo proxy rejects a malformed place id without reaching fetch', async () => {
    const spy = installFetchTripwire();
    const handler = await loadPhotoHandler();
    const res = createMockResponse();
    await handler({ method: 'GET', query: { id: '../../etc/passwd', index: '0' } }, res);
    expect(res.statusCode).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('the photo proxy rejects an out-of-range index without reaching fetch', async () => {
    const spy = installFetchTripwire();
    const handler = await loadPhotoHandler();
    const res = createMockResponse();
    await handler({ method: 'GET', query: { id: 'ChIJtest', index: '99' } }, res);
    expect(res.statusCode).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('three layers of the same venue buy one reference lookup, not three', async () => {
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    const spy = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('/media')) {
        return {
          ok: true,
          json: async () => ({ photoUri: 'https://lh3.googleusercontent.com/signed-photo' }),
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({
          photos: [
            { name: 'places/ChIJtest/photos/A' },
            { name: 'places/ChIJtest/photos/B' },
            { name: 'places/ChIJtest/photos/C' },
          ],
        }),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', spy);
    const handler = await loadPhotoHandler();
    const responses = [createMockResponse(), createMockResponse(), createMockResponse()];
    await Promise.all(
      responses.map((res, index) =>
        handler({ method: 'GET', query: { id: 'ChIJtest', index: String(index) } }, res),
      ),
    );

    expect(responses.every((res) => res.statusCode === 302)).toBe(true);
    const detailCalls = spy.mock.calls.filter(([input]) => !String(input).includes('/media'));
    const mediaCalls = spy.mock.calls.filter(([input]) => String(input).includes('/media'));
    // The Place Details lookup is shared; each distinct photo still needs its own media call.
    expect(detailCalls).toHaveLength(1);
    expect(mediaCalls).toHaveLength(3);
  });

  it('the search endpoint refuses to cache a gate refusal', async () => {
    const spy = installFetchTripwire();
    vi.resetModules();
    const mod = await import('../../../api/places/search.js');
    const handler = (mod.default ?? mod) as (req: unknown, res: unknown) => Promise<unknown>;
    const res = createMockResponse();
    process.env.PLACES_PROVIDER = 'google';
    await handler(
      { method: 'GET', query: { lat: '51.5074', lng: '-0.1278', radiusKm: '40', scope: 'london', intent: 'explore' } },
      res,
    );
    delete process.env.PLACES_PROVIDER;

    expect(res.statusCode).toBe(503);
    expect(res.body?.code).toBe('PLACES_DISABLED');
    // Critically NOT mock London: a cost control must not look like a provider outage.
    expect(res.body?.fallbackAvailable).toBe(false);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(spy).not.toHaveBeenCalled();
  });
});


describe('the daily cap counts what other instances have spent', () => {
  /**
   * The per-process counters bound a loop inside one warm serverless instance. They are not a daily
   * cap on their own, because ten instances each counting to the limit spend ten times it. The cap
   * becomes real only because `primePlacesBudget` loads the shared total from Postgres first, and
   * these tests are what hold that distinction in place.
   */
  /**
   * The shape `primePlacesBudget` reads: one `from().select().eq().eq()` chain that resolves to
   * today's rows for this environment.
   */
  function usageClient(rows: Array<{ scope: string; calls: number }>) {
    const client: { from: ReturnType<typeof vi.fn>; [key: string]: unknown } = {
      from: vi.fn(),
    };
    let eqCalls = 0;
    client.from = vi.fn(() => client);
    client.select = vi.fn(() => client);
    client.eq = vi.fn(() => {
      eqCalls += 1;
      return eqCalls >= 2 ? Promise.resolve({ data: rows, error: null }) : client;
    });
    client.rpc = vi.fn(async () => ({ data: 1, error: null }));
    return client;
  }

  it('refuses a call that is under this process\'s count but over the shared total', async () => {
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_DAY = '10';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_WINDOW = '1000';

    const budget = await loadBudget();

    // Before priming, this process has spent nothing, so the gate would allow it.
    expect(budget.isPlacesEnabled('discovery')).toBe(true);
    const primed = await budget.primePlacesBudget({ client: usageClient([{ scope: 'discovery', calls: 10 }]) });
    expect(primed).toBe(true);

    expect(() => budget.assertPlacesAllowed({ scope: 'discovery', reason: 'london_grid' })).toThrow(
      /calls already made today/,
    );
  });

  it('never lowers a count the shared store has not caught up with', async () => {
    // The store lags, so taking its figure as gospel would let a process that has just spent forget
    // that it did. Max, not assignment.
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_DAY = '3';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_WINDOW = '1000';

    const budget = await loadBudget();

    for (let i = 0; i < 3; i += 1) {
      budget.assertPlacesAllowed({ scope: 'discovery', reason: 'london_grid' });
    }
    await budget.primePlacesBudget({ client: usageClient([{ scope: 'discovery', calls: 0 }]) });
    expect(() => budget.assertPlacesAllowed({ scope: 'discovery', reason: 'london_grid' })).toThrow(
      /calls already made today/,
    );
  });

  it('a failed read keeps the counts it already had, and retries next time', async () => {
    // A mutation test showed the error path was untested: making it report success broke nothing.
    // What actually matters on that path is that the count this process has accrued survives, and
    // that the failure is not cached as "primed" -- otherwise a transient error would blind the cap
    // for a full TTL window.
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_DAY = '2';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_WINDOW = '1000';
    const budget = await loadBudget();

    budget.assertPlacesAllowed({ scope: 'discovery', reason: 'london_grid' });

    const failing: Record<string, unknown> = {};
    failing.from = vi.fn(() => failing);
    failing.select = vi.fn(() => failing);
    let eqCalls = 0;
    failing.eq = vi.fn(() => {
      eqCalls += 1;
      return eqCalls >= 2 ? Promise.resolve({ data: null, error: { message: 'connection reset' } }) : failing;
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await budget.primePlacesBudget({ client: failing })).toBe(false);
    warnSpy.mockRestore();

    // The accrued count survived, so the cap still bites after one more call.
    budget.assertPlacesAllowed({ scope: 'discovery', reason: 'london_grid' });
    expect(() => budget.assertPlacesAllowed({ scope: 'discovery', reason: 'london_grid' })).toThrow(
      /calls already made today/,
    );

    // The failure was not recorded as a successful prime, so the next call reads again rather than
    // sitting behind the one-minute TTL. Asserted on the client being QUERIED, not on the returned
    // boolean: a mutant that cached the failure as primed returned true from the TTL short-circuit
    // and passed an earlier version of this test without ever reading anything.
    const recovered = usageClient([{ scope: 'discovery', calls: 0 }]);
    expect(await budget.primePlacesBudget({ client: recovered })).toBe(true);
    expect(recovered.from).toHaveBeenCalledWith('google_places_usage');
  });

  it('does not open the gate when the shared store is unreachable', async () => {
    // A counter outage must not become a spending licence. With no Supabase configured, priming
    // reports false and the per-process ceilings stay in force.
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_WINDOW = '1';
    const budget = await loadBudget();
    expect(await budget.primePlacesBudget()).toBe(false);
    budget.assertPlacesAllowed({ scope: 'discovery', reason: 'london_grid' });
    expect(() => budget.assertPlacesAllowed({ scope: 'discovery', reason: 'london_grid' })).toThrow(
      /budget exceeded/i,
    );
  });
});

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
  setHeader(name: string, value: string): void;
  status(code: number): MockResponse;
  json(body: Record<string, unknown>): MockResponse;
  end(): MockResponse;
  redirect(code: number, url: string): MockResponse;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) {
      res.headers[name] = value;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
    end() {
      return res;
    },
    redirect(code, url) {
      res.statusCode = code;
      res.headers.Location = url;
      return res;
    },
  };
  return res;
}
