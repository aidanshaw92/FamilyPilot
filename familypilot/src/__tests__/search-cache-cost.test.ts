import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What a stored search row RECORDS ABOUT ITS OWN COST.
 *
 * This exists because of a defect found by reading production rather than by reading code. All four
 * `nearby-food` rows in the production cache carried `billable_calls = 1`, and every one of them came
 * from OpenStreetMap, which is free. `docs/canary/reconcile.sql` asserts "nearby-food rows recording a
 * billable call (must be 0)" — so that check could not have passed on a single row, because
 * `writeSearchCache` stored `Math.max(1, Number(billableCalls) || 1)` and zero was unreachable.
 *
 * A cost-reconciliation query that can never pass is worse than no query. The first reader dismisses it
 * as noise and the second stops running it, and by then it is no longer watching the thing it was
 * written to watch.
 *
 * Supabase is intercepted through `require.cache` rather than with `vi.mock`, because search-cache.js
 * is CommonJS and reaches for its client lazily inside the function. Mocking the ESM namespace does not
 * replace what a `require` inside a CommonJS function body resolves to.
 */

const req = createRequire(import.meta.url);
const root = resolve(process.cwd(), '..');
const CACHE_PATH = resolve(root, 'server/places/lib/search-cache.js');
const ADMIN_PATH = resolve(root, 'server/enrichment/_lib/supabase-admin.js');

let upserts: any[] = [];

function installFakeSupabase() {
  const client = {
    from() {
      return {
        upsert(row: any) {
          upserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  req.cache[ADMIN_PATH] = {
    id: ADMIN_PATH,
    filename: ADMIN_PATH,
    loaded: true,
    children: [],
    paths: [],
    exports: { getSupabaseAdmin: () => client },
  } as any;
}

function loadCache() {
  delete req.cache[CACHE_PATH];
  installFakeSupabase();
  return req(CACHE_PATH);
}

const write = (billableCalls: unknown, provider = 'osm') =>
  loadCache().writeSearchCache('nearby-food|restaurant|51.5074|-0.1278|1|cafe', { candidates: [] }, {
    provider,
    billableCalls,
  });

describe('a stored search row records what it actually cost', () => {
  beforeEach(() => {
    upserts = [];
  });

  afterEach(() => {
    delete req.cache[ADMIN_PATH];
    delete req.cache[CACHE_PATH];
  });

  it('records zero for a free OpenStreetMap row, because zero is the true answer', async () => {
    await write(0);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].billable_calls).toBe(0);
  });

  it('lets the reconciliation check that demands zero actually pass', async () => {
    // The exact predicate in docs/canary/reconcile.sql: `billable_calls > 0` must find nothing.
    await write(0);
    const rowsRecordingSpend = upserts.filter((row) => row.billable_calls > 0);
    expect(rowsRecordingSpend).toHaveLength(0);
  });

  it('still records a real billable count for a paid provider', async () => {
    await write(40, 'google');
    expect(upserts[0].billable_calls).toBe(40);
    expect(upserts[0].provider).toBe('google');
  });

  it('records one for a single paid request', async () => {
    await write(1, 'google');
    expect(upserts[0].billable_calls).toBe(1);
  });

  /**
   * The floor existed for a reason worth keeping: "nobody said" must not read as "free". An absent or
   * unparseable count is a gap in our knowledge, and recording a gap as zero spend would understate the
   * bill, which is the failure direction that matters.
   */
  it('defaults to one when the count is missing, because unknown must not read as free', async () => {
    await write(undefined, 'google');
    expect(upserts[0].billable_calls).toBe(1);
  });

  it('defaults to one when the count is unparseable', async () => {
    await write('not a number', 'google');
    expect(upserts[0].billable_calls).toBe(1);
  });

  it('never records a negative cost', async () => {
    await write(-5, 'google');
    expect(upserts[0].billable_calls).toBe(0);
  });

  it('records a whole number, because the column is an integer', async () => {
    await write(2.6, 'google');
    expect(Number.isInteger(upserts[0].billable_calls)).toBe(true);
    expect(upserts[0].billable_calls).toBe(3);
  });
});
