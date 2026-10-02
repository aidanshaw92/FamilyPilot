import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Distance Matrix bills per origin-destination ELEMENT, and the budget used to count HTTP CALLS.
 *
 * One call carries up to 25 destinations, so the journeys scope could have passed 50,000 billable
 * elements while its daily counter read its 2,000 limit. These lock the two fixes: the ceiling applies
 * to billable units, and the paid routing scope must be enabled by name rather than inherited.
 *
 * Written the same way as the other cost-control tests: the assertions are about what the GATE
 * charged and about `fetch` not being reached, because a test that only checked a thrown error would
 * pass against an implementation that threw after making the request.
 */

const budgetPath = '../../../server/places/lib/places-budget.js';
const journeyPath = '../../../server/context/lib/journey-provider.js';

type Budget = typeof import('../../../server/places/lib/places-budget.js');

const ENV_KEYS = [
  'GOOGLE_PLACES_ENABLED',
  'GOOGLE_JOURNEYS_ENABLED',
  'GOOGLE_PLACES_ALLOW_LIVE_TEST',
  'GOOGLE_PLACES_MAX_CALLS_PER_DAY',
  'GOOGLE_PLACES_MAX_CALLS_PER_WINDOW',
  'GOOGLE_MAPS_API_KEY',
  'VERCEL_ENV',
];

let savedEnv: Record<string, string | undefined> = {};

async function loadBudget(): Promise<Budget> {
  vi.resetModules();
  return (await import(budgetPath)) as Budget;
}

/**
 * Today's billable units for one scope.
 *
 * The snapshot keys them by `YYYY-MM-DD:scope`, so this reads the figure rather than assuming a
 * flatter shape -- which is what my first version of this file did, and it read undefined.
 */
function unitsToday(budget: Budget, scope: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const snapshot = budget.placesBudgetSnapshot() as { today: Record<string, number> };
  return snapshot.today[`${today}:${scope}`] ?? 0;
}

/** The gate open and spending permitted, which is the only state these numbers matter in. */
function openTheGate() {
  process.env.VERCEL_ENV = 'production';
  process.env.GOOGLE_PLACES_ENABLED = 'true';
  process.env.GOOGLE_JOURNEYS_ENABLED = 'true';
  process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
}

function installFetchTripwire() {
  const spy = vi.fn(async () => {
    throw new Error('fetch must not be reached');
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.GOOGLE_PLACES_API_KEY = 'test-key-never-sent';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('a matrix request costs what it actually bills', () => {
  it('charges 25 units for one call with 25 destinations, not 1', async () => {
    openTheGate();
    const budget = await loadBudget();
    const charged = budget.assertPlacesAllowed({
      scope: 'journeys',
      reason: 'test',
      origins: 1,
      destinations: 25,
      routeMode: 'driving',
    });
    // THE DEFECT, stated as a number: this was 1.
    expect(charged.units).toBe(25);
    expect(charged.billingUnit).toBe('element');
    expect(unitsToday(budget, 'journeys')).toBe(25);
  });

  it('a request containing 25 billable elements cannot consume only 1 unit of budget', async () => {
    openTheGate();
    const budget = await loadBudget();
    budget.assertPlacesAllowed({ scope: 'journeys', reason: 'test', origins: 1, destinations: 25 });
    const used = unitsToday(budget, 'journeys');
    expect(used).not.toBe(1);
    expect(used).toBe(25);
  });

  it('multiplies origins by destinations for a genuine matrix', async () => {
    openTheGate();
    const budget = await loadBudget();
    // Four origins (three stops and a home) against five destinations is twenty elements.
    const charged = budget.assertPlacesAllowed({
      scope: 'journeys',
      reason: 'test',
      origins: 4,
      destinations: 5,
    });
    expect(charged.units).toBe(20);
  });

  it('still charges one unit for a scope that genuinely bills per call', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_PLACES_ENABLED = 'true';
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    const budget = await loadBudget();
    const charged = budget.assertPlacesAllowed({ scope: 'discovery', reason: 'test' });
    expect(charged.units).toBe(1);
    expect(charged.billingUnit).toBe('call');
  });

  it('refuses an element-billed request that does not say its shape, rather than assuming one', async () => {
    // Assuming one is the defect. A caller that forgets to pass the shape must fail loudly at the
    // gate, not quietly undercount by 25x.
    openTheGate();
    const budget = await loadBudget();
    expect(() => budget.assertPlacesAllowed({ scope: 'journeys', reason: 'test' })).toThrow(
      /needs units, or origins and destinations/i,
    );
    expect(unitsToday(budget, 'journeys')).toBe(0);
  });
});

describe('the daily ceiling is a ceiling, not a trigger', () => {
  it('refuses a 25-element request that would cross the cap rather than overshooting it', async () => {
    openTheGate();
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_DAY = '30';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_WINDOW = '1000';
    const budget = await loadBudget();

    budget.assertPlacesAllowed({ scope: 'journeys', reason: 'first', origins: 1, destinations: 25 });
    expect(unitsToday(budget, 'journeys')).toBe(25);

    // 25 used, 30 allowed. A second 25-element request must be refused outright: the old `used >= max`
    // test would have waved it through and spent 50 against a ceiling of 30.
    expect(() =>
      budget.assertPlacesAllowed({ scope: 'journeys', reason: 'second', origins: 1, destinations: 25 }),
    ).toThrow(/needs 25 more/);
    expect(unitsToday(budget, 'journeys')).toBe(25);
  });

  it('allows a smaller request that still fits under the cap', async () => {
    openTheGate();
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_DAY = '30';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_WINDOW = '1000';
    const budget = await loadBudget();
    budget.assertPlacesAllowed({ scope: 'journeys', reason: 'first', origins: 1, destinations: 25 });
    // Five more fits exactly.
    budget.assertPlacesAllowed({ scope: 'journeys', reason: 'second', origins: 1, destinations: 5 });
    expect(unitsToday(budget, 'journeys')).toBe(30);
  });

  it('applies the per-minute window to units too', async () => {
    openTheGate();
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_DAY = '10000';
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_WINDOW = '20';
    const budget = await loadBudget();
    expect(() =>
      budget.assertPlacesAllowed({ scope: 'journeys', reason: 'burst', origins: 1, destinations: 25 }),
    ).toThrow(/in the last 60s/);
  });
});

describe('the paid routing scope must be asked for by name', () => {
  it('refuses journeys in production when the flag is unset', async () => {
    // The audit found this live purely because nobody had set the variable. An unset flag inherits the
    // master switch for every other scope, which is right for a capability in daily use; it is wrong
    // for a paid routing path that has never been called.
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_PLACES_ENABLED = 'true';
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    const budget = await loadBudget();
    expect(budget.isPlacesEnabled('journeys')).toBe(false);
    expect(budget.describeScope('journeys').reason).toMatch(/must be enabled by name/i);
  });

  it('still lets the other scopes inherit the master switch', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_PLACES_ENABLED = 'true';
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    const budget = await loadBudget();
    // Narrow fix, not a blanket tightening: discovery, details and photos are unaffected.
    expect(budget.isPlacesEnabled('discovery')).toBe(true);
    expect(budget.isPlacesEnabled('details')).toBe(true);
    expect(budget.isPlacesEnabled('photos')).toBe(true);
    expect(budget.isPlacesEnabled('geocoding')).toBe(true);
  });

  it('opens only on an explicit true', async () => {
    openTheGate();
    const budget = await loadBudget();
    expect(budget.isPlacesEnabled('journeys')).toBe(true);
  });

  it('an absent journeys flag cannot issue a Distance Matrix request', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_PLACES_ENABLED = 'true';
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    // GOOGLE_JOURNEYS_ENABLED deliberately unset.
    const fetchSpy = installFetchTripwire();
    vi.resetModules();
    const { getDriveTimes } = await import(journeyPath);

    const result = await getDriveTimes(
      { latitude: 51.5, longitude: -0.12 },
      [{ placeId: 'a', latitude: 51.52, longitude: -0.1 }],
    );

    // The request was never made, and the parent still gets a usable day.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.provider).toBe('fallback');
    expect(result.source).toBe('estimated');
    expect(result.journeys[0].source).toBe('estimated');
    expect(result.fallbackReason).toBeTruthy();
  });

  it('leaves the free estimated journey working, which is the point of failing closed safely', async () => {
    // Failing closed must degrade accuracy, not break the planner: a closed gate still returns a
    // labelled estimate for every destination asked about.
    process.env.VERCEL_ENV = 'production';
    process.env.GOOGLE_PLACES_ENABLED = 'true';
    process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true';
    installFetchTripwire();
    vi.resetModules();
    const { getDriveTimes } = await import(journeyPath);
    const result = await getDriveTimes({ latitude: 51.5, longitude: -0.12 }, [
      { placeId: 'a', latitude: 51.52, longitude: -0.1 },
      { placeId: 'b', latitude: 51.56, longitude: -0.2 },
    ]);
    expect(result.journeys).toHaveLength(2);
    expect(result.journeys.every((j: { driveMinutes: number }) => j.driveMinutes > 0)).toBe(true);
    expect(result.journeys.every((j: { source: string }) => j.source === 'estimated')).toBe(true);
  });
});

describe('what a billable routing call records', () => {
  it('logs the provider, SKU, scope, shape, billed elements, mode and a timestamp', async () => {
    openTheGate();
    const budget = await loadBudget();
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(String(line));
    });

    budget.assertPlacesAllowed({
      scope: 'journeys',
      reason: 'drive_times',
      origins: 2,
      destinations: 4,
      routeMode: 'driving',
    });
    log.mockRestore();

    const entry = JSON.parse(lines.find((l) => l.includes('google_places_billable')) ?? '{}');
    expect(entry.provider).toBe('google');
    expect(entry.sku).toBe('distance_matrix');
    expect(entry.scope).toBe('journeys');
    expect(entry.billingUnit).toBe('element');
    expect(entry.requestCount).toBe(1);
    expect(entry.originCount).toBe(2);
    expect(entry.destinationCount).toBe(4);
    expect(entry.billedElements).toBe(8);
    expect(entry.routeMode).toBe('driving');
    expect(typeof entry.timestamp).toBe('string');
  });

  it('never carries the API key or a request URL', async () => {
    openTheGate();
    const budget = await loadBudget();
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    budget.assertPlacesAllowed({ scope: 'journeys', reason: 'test', origins: 1, destinations: 3 });
    log.mockRestore();
    const joined = lines.join('\n');
    expect(joined).not.toContain('test-key-never-sent');
    expect(joined).not.toMatch(/https?:\/\//);
  });
});
