import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The DAILY CAP as enforced across instances, with a shared in-memory ledger standing in for `google_places_usage` and each
 * "instance" a fresh copy of the budget module (a serverless process). Covers the three opt-in guarantees
 * (GOOGLE_PLACES_REQUIRE_LEDGER, GOOGLE_PLACES_MAX_TOTAL_PER_DAY, fail-closed unusable caps) and states what remains a bound
 * rather than an exact ceiling. Nothing here calls Google: only the gate is exercised.
 */
const req = createRequire(import.meta.url);
const budgetPath = '../../../server/places/lib/places-budget.js';
const adminPath = '../../../server/enrichment/_lib/supabase-admin.js';
type Budget = typeof import('../../../server/places/lib/places-budget.js');

const ENV = ['GOOGLE_PLACES_ENABLED', 'GOOGLE_PLACES_DETAILS_ENABLED', 'GOOGLE_PLACES_DISCOVERY_ENABLED', 'GOOGLE_PLACES_ALLOW_LIVE_TEST', 'GOOGLE_PLACES_MAX_CALLS_PER_DAY', 'GOOGLE_PLACES_MAX_CALLS_PER_WINDOW', 'GOOGLE_PLACES_MAX_TOTAL_PER_DAY', 'GOOGLE_PLACES_REQUIRE_LEDGER', 'VERCEL_ENV'];
let saved: Record<string, string | undefined> = {};
let ledger: Record<string, number>;
let ledgerReadFails: boolean;
let clientAvailable: boolean;

function installLedger() {
  const resolved = req.resolve(adminPath);
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ eq: async () => (ledgerReadFails ? { data: null, error: { message: 'ledger unreachable' } } : { data: Object.entries(ledger).map(([scope, calls]) => ({ scope, calls })), error: null }) }) }) }),
    rpc: (_name: string, a: { p_scope: string; p_calls: number }) => { ledger[a.p_scope] = (ledger[a.p_scope] ?? 0) + a.p_calls; return Promise.resolve({ error: null }); },
  };
  req.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: { getSupabaseAdmin: () => (clientAvailable ? client : null) }, children: [], paths: [], path: '' } as never;
}

/** A new serverless process: a fresh budget module that has not yet read the ledger. */
function newInstance(): Budget {
  delete req.cache[req.resolve(budgetPath)];
  return req(budgetPath) as Budget;
}
const spend = (b: Budget, scope: string, n: number) => {
  let allowed = 0;
  for (let i = 0; i < n; i++) { try { b.assertPlacesAllowed({ scope, reason: 'test' }); allowed += 1; } catch { /* refused */ } }
  return allowed;
};
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  process.env.GOOGLE_PLACES_ENABLED = 'true'; process.env.GOOGLE_PLACES_DETAILS_ENABLED = 'true'; process.env.GOOGLE_PLACES_DISCOVERY_ENABLED = 'true';
  process.env.GOOGLE_PLACES_ALLOW_LIVE_TEST = 'true'; process.env.GOOGLE_PLACES_MAX_CALLS_PER_DAY = '50'; process.env.GOOGLE_PLACES_MAX_CALLS_PER_WINDOW = '100000';
  ledger = {}; ledgerReadFails = false; clientAvailable = true; installLedger();
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } vi.restoreAllMocks(); });

describe('with GOOGLE_PLACES_MAX_CALLS_PER_DAY=50', () => {
  it('a second instance sees what the first spent (the ledger is shared) and stops at 50 for that scope', async () => {
    const a = newInstance(); await a.primePlacesBudget();
    expect(spend(a, 'details', 80)).toBe(50);
    await flush();
    expect(ledger.details).toBe(50);
    const b = newInstance(); await b.primePlacesBudget();
    expect(spend(b, 'details', 10)).toBe(0);
  });

  it('the limit is PER SCOPE, not a total: details 50 and discovery 50 are both allowed (100 paid calls)', async () => {
    const a = newInstance(); await a.primePlacesBudget();
    expect(spend(a, 'details', 80)).toBe(50);
    expect(spend(a, 'discovery', 80)).toBe(50);
  });

  it('it is a bound, not an exact ceiling: two instances that read the ledger at 40 can each add 10 (60 in all)', async () => {
    ledger.details = 40;
    const a = newInstance(); const b = newInstance();
    await a.primePlacesBudget(); await b.primePlacesBudget();
    const total = spend(a, 'details', 30) + spend(b, 'details', 30);
    await flush();
    expect(total).toBe(20);
    expect(ledger.details).toBe(60);
  });

  it('without GOOGLE_PLACES_REQUIRE_LEDGER an unreadable ledger still lets a new instance count alone (the default is unchanged)', async () => {
    ledger.details = 49;
    ledgerReadFails = true;
    const a = newInstance();
    expect(await a.primePlacesBudget()).toBe(false);
    expect(spend(a, 'details', 80)).toBe(50);
  });

  it('with GOOGLE_PLACES_REQUIRE_LEDGER an unreadable ledger refuses every paid call', async () => {
    process.env.GOOGLE_PLACES_REQUIRE_LEDGER = 'true';
    ledgerReadFails = true;
    const a = newInstance();
    expect(await a.primePlacesBudget()).toBe(false);
    expect(spend(a, 'details', 5)).toBe(0);
  });

  it('with GOOGLE_PLACES_REQUIRE_LEDGER a missing database client refuses every paid call', async () => {
    process.env.GOOGLE_PLACES_REQUIRE_LEDGER = '1';
    clientAvailable = false;
    const a = newInstance();
    expect(await a.primePlacesBudget()).toBe(false);
    expect(spend(a, 'details', 5)).toBe(0);
  });

  it('with GOOGLE_PLACES_REQUIRE_LEDGER a call that never primed is refused, and a primed one is allowed', async () => {
    process.env.GOOGLE_PLACES_REQUIRE_LEDGER = 'true';
    const unprimed = newInstance();
    expect(spend(unprimed, 'details', 5)).toBe(0);
    const primed = newInstance();
    await primed.primePlacesBudget();
    expect(spend(primed, 'details', 5)).toBe(5);
  });

  it('with GOOGLE_PLACES_REQUIRE_LEDGER a ledger read older than five minutes stops being trusted', async () => {
    process.env.GOOGLE_PLACES_REQUIRE_LEDGER = 'true';
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-10T10:00:00Z'));
      const a = newInstance();
      await a.primePlacesBudget();
      expect(spend(a, 'details', 1)).toBe(1);
      vi.setSystemTime(new Date('2026-10-10T10:04:00Z'));
      expect(spend(a, 'details', 1)).toBe(1);
      vi.setSystemTime(new Date('2026-10-10T10:06:00Z'));
      expect(spend(a, 'details', 1)).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('GOOGLE_PLACES_MAX_TOTAL_PER_DAY caps all scopes together: 50 in all, not 50 per scope', async () => {
    process.env.GOOGLE_PLACES_MAX_TOTAL_PER_DAY = '50';
    const a = newInstance(); await a.primePlacesBudget();
    expect(spend(a, 'details', 30) + spend(a, 'discovery', 30)).toBe(50);
  });

  it('the total cap counts what other instances spent, through the ledger', async () => {
    process.env.GOOGLE_PLACES_MAX_TOTAL_PER_DAY = '50';
    ledger.details = 30; ledger.photos = 20;
    const a = newInstance(); await a.primePlacesBudget();
    expect(spend(a, 'discovery', 5)).toBe(0);
  });
});

describe('an unusable limit', () => {
  it.each(['fifty', '-5', '5o', '0', ' '])('%j closes the gate instead of falling back to the default of 2000', async (raw) => {
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_DAY = raw;
    const a = newInstance(); await a.primePlacesBudget();
    expect(spend(a, 'details', 5)).toBe(0);
    expect(a.placesBudgetSnapshot().maxUnitsPerDay).toBe(0);
  });
  it('an unusable total cap also closes the gate', async () => {
    process.env.GOOGLE_PLACES_MAX_TOTAL_PER_DAY = 'fifty';
    const a = newInstance(); await a.primePlacesBudget();
    expect(spend(a, 'details', 5)).toBe(0);
  });
  it('an unset limit still means the default of 2000', async () => {
    delete process.env.GOOGLE_PLACES_MAX_CALLS_PER_DAY;
    const a = newInstance();
    expect(a.placesBudgetSnapshot().maxUnitsPerDay).toBe(2000);
  });
});
