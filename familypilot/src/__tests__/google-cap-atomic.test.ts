import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GOOGLE_PLACES_ATOMIC_CAP: the application half. The database half (that reserve_google_places_usage is exact under
 * real concurrent connections) is proven in Postgres by supabase/checks/places_atomic_reserve_concurrency.sh. Here a fake
 * database applies the same rule and the tests cover what the app does with each answer, above all that a database
 * failure refuses the call instead of letting it through.
 */
const req = createRequire(import.meta.url);
const budgetPath = '../../../server/places/lib/places-budget.js';
const adminPath = '../../../server/enrichment/_lib/supabase-admin.js';
type Budget = typeof import('../../../server/places/lib/places-budget.js');

const ENV = ['GOOGLE_PLACES_ENABLED', 'GOOGLE_PLACES_DETAILS_ENABLED', 'GOOGLE_PLACES_DISCOVERY_ENABLED', 'GOOGLE_PLACES_ALLOW_LIVE_TEST', 'GOOGLE_PLACES_MAX_CALLS_PER_DAY', 'GOOGLE_PLACES_MAX_CALLS_PER_WINDOW', 'GOOGLE_PLACES_MAX_TOTAL_PER_DAY', 'GOOGLE_PLACES_MAX_TOTAL_PER_MONTH', 'GOOGLE_PLACES_ATOMIC_CAP', 'VERCEL_ENV'];
let saved: Record<string, string | undefined> = {};
let rows: Record<string, number>;
let priorDaysThisMonth = 0;
type Mode = 'ok' | 'error' | 'throw' | 'hang' | 'garbage' | 'noclient';
let mode: Mode;
let rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;

function installDb() {
  const resolved = req.resolve(adminPath);
  const client = {
    rpc: (name: string, a: Record<string, unknown>) => {
      rpcCalls.push({ name, args: a });
      if (mode === 'error') return Promise.resolve({ data: null, error: { message: 'connection refused' } });
      if (mode === 'throw') return Promise.reject(new Error('socket hang up'));
      if (mode === 'hang') return new Promise(() => undefined);
      if (mode === 'garbage') return Promise.resolve({ data: 'ok', error: null });
      if (name !== 'reserve_google_places_usage') return Promise.resolve({ data: null, error: null });
      // The same rule as the SQL function: check and increment in one step.
      const scope = a.p_scope as string; const units = a.p_units as number;
      const scopeUsed = rows[scope] ?? 0; const totalUsed = Object.values(rows).reduce((x, y) => x + y, 0);
      const scopeCap = a.p_scope_cap as number | null; const totalCap = a.p_total_cap as number | null; const monthCap = a.p_month_cap as number | null; const monthUsed = totalUsed + priorDaysThisMonth;
      if (scopeCap !== null && scopeUsed + units > scopeCap) return Promise.resolve({ data: { allowed: false, reason: 'scope_cap', scope_used: scopeUsed, total_used: totalUsed }, error: null });
      if (totalCap !== null && totalUsed + units > totalCap) return Promise.resolve({ data: { allowed: false, reason: 'total_cap', scope_used: scopeUsed, total_used: totalUsed }, error: null });
      if (monthCap !== null && monthUsed + units > monthCap) return Promise.resolve({ data: { allowed: false, reason: 'month_cap', scope_used: scopeUsed, total_used: totalUsed, month_used: monthUsed }, error: null });
      rows[scope] = scopeUsed + units;
      return Promise.resolve({ data: { allowed: true, reason: 'ok', scope_used: scopeUsed + units, total_used: totalUsed + units, month_used: monthUsed + units }, error: null });
    },
  };
  req.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: { getSupabaseAdmin: () => (mode === 'noclient' ? null : client) }, children: [], paths: [], path: '' } as never;
}
function instance(): Budget { delete req.cache[req.resolve(budgetPath)]; return req(budgetPath) as Budget; }
async function spend(b: Budget, scope: string, n: number) {
  let allowed = 0;
  for (let i = 0; i < n; i++) { try { await b.reservePlacesCall({ scope, reason: 'test' }); allowed += 1; } catch { /* refused */ } }
  return allowed;
}

beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  Object.assign(process.env, { GOOGLE_PLACES_ENABLED: 'true', GOOGLE_PLACES_DETAILS_ENABLED: 'true', GOOGLE_PLACES_DISCOVERY_ENABLED: 'true', GOOGLE_PLACES_ALLOW_LIVE_TEST: 'true', GOOGLE_PLACES_MAX_CALLS_PER_DAY: '50', GOOGLE_PLACES_MAX_CALLS_PER_WINDOW: '100000', GOOGLE_PLACES_MAX_TOTAL_PER_DAY: '60', GOOGLE_PLACES_ATOMIC_CAP: 'true' });
  rows = {}; priorDaysThisMonth = 0; mode = 'ok'; rpcCalls = []; installDb();
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } vi.restoreAllMocks(); vi.useRealTimers(); });

describe('atomic cap on', () => {
  it('two instances share one ceiling with no priming: 50 for a scope in all, whichever instance asks', async () => {
    const a = instance(); const b = instance();
    const total = (await spend(a, 'details', 30)) + (await spend(b, 'details', 30));
    expect(total).toBe(50);
    expect(rows.details).toBe(50);
  });

  it('the total cap holds across scopes and instances: 60 in all', async () => {
    const a = instance(); const b = instance();
    const total = (await spend(a, 'details', 40)) + (await spend(b, 'discovery', 40)) + (await spend(a, 'refresh', 40));
    expect(total).toBe(60);
    expect(Object.values(rows).reduce((x, y) => x + y, 0)).toBe(60);
  });

  it('concurrent reservations from several instances never exceed the ceiling', async () => {
    const instances = Array.from({ length: 8 }, () => instance());
    const results = await Promise.all(instances.flatMap((i) => Array.from({ length: 20 }, () => i.reservePlacesCall({ scope: 'details', reason: 'test' }).then(() => 1, () => 0))));
    expect(results.reduce<number>((x, y) => x + y, 0)).toBe(50);
  });

  it('the monthly ceiling counts earlier days and refuses with a month message', async () => {
    process.env.GOOGLE_PLACES_MAX_TOTAL_PER_MONTH = '900';
    priorDaysThisMonth = 880;
    const a = instance();
    expect(await spend(a, 'details', 40)).toBe(20);
    await expect(a.reservePlacesCall({ scope: 'details', reason: 'test' })).rejects.toThrow(/monthly cap reached/);
  });

  it('an unusable monthly cap closes the gate', async () => {
    process.env.GOOGLE_PLACES_MAX_TOTAL_PER_MONTH = 'nine hundred';
    expect(await spend(instance(), 'details', 3)).toBe(0);
  });

  it('sends the caps and the billable units with the reservation', async () => {
    await instance().reservePlacesCall({ scope: 'details', reason: 'test' });
    expect(rpcCalls[0]).toMatchObject({ name: 'reserve_google_places_usage', args: { p_scope: 'details', p_units: 1, p_scope_cap: 50, p_total_cap: 60, p_month_cap: null } });
  });

  it('does not also record the call through the fire-and-forget counter (no double count)', async () => {
    await instance().reservePlacesCall({ scope: 'details', reason: 'test' });
    expect(rpcCalls.filter((c) => c.name === 'record_google_places_usage')).toHaveLength(0);
    expect(rows.details).toBe(1);
  });

  it('a switched-off scope is refused before the database is asked', async () => {
    process.env.GOOGLE_PLACES_PHOTOS_ENABLED = 'false';
    await expect(instance().reservePlacesCall({ scope: 'photos', reason: 'test' })).rejects.toMatchObject({ code: 'PLACES_DISABLED' });
    expect(rpcCalls).toHaveLength(0);
    delete process.env.GOOGLE_PLACES_PHOTOS_ENABLED;
  });

  it('the synchronous gate refuses, so a call site that was not migrated cannot spend outside the cap', () => {
    expect(() => instance().assertPlacesAllowed({ scope: 'details', reason: 'test' })).toThrow(/has not reserved its units/);
  });
});

describe('database failure refuses; it never lets the call through', () => {
  it.each<[Mode, string]>([
    ['error', 'the database returns an error'],
    ['throw', 'the connection throws'],
    ['garbage', 'the answer is unreadable'],
    ['noclient', 'no database client is configured'],
  ])('%s: %s', async (m) => {
    mode = m;
    await expect(instance().reservePlacesCall({ scope: 'details', reason: 'test' })).rejects.toMatchObject({ code: 'PLACES_BUDGET_EXCEEDED' });
    expect(rows.details ?? 0).toBe(0);
  });

  it('a database that never answers is abandoned after three seconds and refused', async () => {
    mode = 'hang';
    vi.useFakeTimers();
    const outcome = instance().reservePlacesCall({ scope: 'details', reason: 'test' }).then(() => 'allowed', (e: { code: string }) => e.code);
    await vi.advanceTimersByTimeAsync(3100);
    await expect(outcome).resolves.toBe('PLACES_BUDGET_EXCEEDED');
  });

  it('recovers on its own: once the database answers again, calls are allowed up to the ceiling', async () => {
    const a = instance();
    mode = 'error';
    expect(await spend(a, 'details', 5)).toBe(0);
    mode = 'ok';
    expect(await spend(a, 'details', 5)).toBe(5);
  });
});

describe('atomic cap off (the default)', () => {
  it('reservePlacesCall is the synchronous gate and never asks the reservation function', async () => {
    delete process.env.GOOGLE_PLACES_ATOMIC_CAP;
    const b = instance();
    await b.reservePlacesCall({ scope: 'details', reason: 'test' });
    expect(rpcCalls.filter((c) => c.name === 'reserve_google_places_usage')).toHaveLength(0);
    expect(rpcCalls.filter((c) => c.name === 'record_google_places_usage')).toHaveLength(1);
  });
});
