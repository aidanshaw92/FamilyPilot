import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fitIsBeingChecked } from '@/src/utils/fit-checking';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A fact a parent has contradicted must not be shown as confirmed and then taken back.
 *
 * Parent reports are read after the venue's own facts are on screen (so they can never delay the page), and a report can only
 * LOWER confidence in a fact the venue states. For a venue with recent reports, the old order was: the venue's fact drawn as
 * confirmed (a tick, perhaps "Excellent"), then up to three seconds later "needs rechecking". The server now says, with the
 * detail, whether a recent report exists; only then does Family Fit show a neutral "checking" state until the reports arrive.
 */
const req = createRequire(import.meta.url);
const root = resolve(process.cwd(), '..');
const ADMIN_PATH = resolve(root, 'server/enrichment/_lib/supabase-admin.js');
const STORE_PATH = resolve(root, 'server/feedback/_lib/store.js');
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

function withAdmin(result: unknown, delayMs = 0) {
  const calls: Array<Record<string, unknown>> = [];
  const chain: any = {
    select: (_cols: string, opts: unknown) => { calls.push({ select: opts }); return chain; },
    eq: (col: string, value: unknown) => { calls.push({ eq: [col, value] }); return chain; },
    gte: (col: string, value: unknown) => { calls.push({ gte: [col, value] }); return chain; },
    then: (resolveFn: (v: unknown) => void) => { setTimeout(() => resolveFn(result), delayMs); },
  };
  req.cache[ADMIN_PATH] = { id: ADMIN_PATH, filename: ADMIN_PATH, loaded: true, exports: { getSupabaseAdmin: () => ({ from: () => chain }) } } as any;
  delete req.cache[STORE_PATH];
  return { store: req(STORE_PATH), calls };
}

afterEach(() => { delete req.cache[ADMIN_PATH]; delete req.cache[STORE_PATH]; });

describe('the server says whether a recent parent report exists', () => {
  it('true when there is at least one active report in the last 90 days, from a head-only count', async () => {
    const { store, calls } = withAdmin({ count: 2, error: null });
    expect(await store.venueHasRecentReports('fp-google-x')).toBe(true);
    expect(calls[0]).toEqual({ select: { count: 'exact', head: true } });
    expect(calls).toContainEqual({ eq: ['familypilot_place_id', 'fp-google-x'] });
    expect(calls).toContainEqual({ eq: ['status', 'active'] });
    const since = (calls.find((c) => c.gte) as any).gte[1] as string;
    expect(Date.now() - Date.parse(since)).toBeGreaterThan(89 * 86400000);
    expect(Date.now() - Date.parse(since)).toBeLessThan(91 * 86400000);
  });

  it('false when there are none, which is every venue today', async () => {
    expect(await withAdmin({ count: 0, error: null }).store.venueHasRecentReports('x')).toBe(false);
  });

  it('null, never false, when it cannot tell: an error, no count, no database, or a slow read', async () => {
    expect(await withAdmin({ count: null, error: { message: 'down' } }).store.venueHasRecentReports('x')).toBeNull();
    expect(await withAdmin({ error: null }).store.venueHasRecentReports('x')).toBeNull();
    expect(await withAdmin({ count: 5, error: null }, 300).store.venueHasRecentReports('x', { timeoutMs: 20 })).toBeNull();
    req.cache[ADMIN_PATH] = { id: ADMIN_PATH, filename: ADMIN_PATH, loaded: true, exports: { getSupabaseAdmin: () => null } } as any;
    delete req.cache[STORE_PATH];
    expect(await req(STORE_PATH).venueHasRecentReports('x')).toBeNull();
  });

  it('is sent with the detail as a sibling, read beside the metadata and unable to fail the page', () => {
    const detail = readFileSync(join(root, 'api/places/detail.js'), 'utf8');
    expect(detail).toMatch(/detail\.hasRecentParentReports = await reportsFlag/);
    // started before the metadata read so the two overlap
    expect(detail.indexOf('venueHasRecentReports(primaryId)')).toBeLessThan(detail.indexOf('getConsumerMetadata(primaryId)'));
  });
});

describe('when Family Fit shows "checking"', () => {
  const base = { pending: false, hasRecentParentReports: true as boolean | null | undefined, reportsLoading: true };

  it('only for the full detail, of a venue that has recent reports, while they load', () => {
    expect(fitIsBeingChecked(base)).toBe(true);
  });

  it('never for a venue with no recent reports, or one the server could not tell about: nothing waits for a correction nobody expects', () => {
    expect(fitIsBeingChecked({ ...base, hasRecentParentReports: false })).toBe(false);
    expect(fitIsBeingChecked({ ...base, hasRecentParentReports: null })).toBe(false);
    expect(fitIsBeingChecked({ ...base, hasRecentParentReports: undefined })).toBe(false);
  });

  it('never for the card standing in for the detail, and it ends the moment the reports have arrived, failed or timed out', () => {
    expect(fitIsBeingChecked({ ...base, pending: true })).toBe(false);
    expect(fitIsBeingChecked({ ...base, reportsLoading: false })).toBe(false);
  });

  it('the wait is bounded by the reports read’s own three second ceiling, after which the venue’s own facts are used', () => {
    const fetcher = read('src/services/planning/parent-observation-fetch.ts');
    expect(fetcher).toMatch(/setTimeout\(\(\) => reject\(new Error\('timeout'\)\), 3000\)/);
    expect(read('src/hooks/use-queries.ts')).toMatch(/retry: false/);
  });
});

describe('the neutral state claims nothing that could be withdrawn', () => {
  const src = read('src/components/venue/FamilyFitChecking.tsx');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  it('has no verdict, tick, star, number or fact in what it draws', () => {
    expect(code).not.toMatch(/checkmark|\bstar\b|Excellent|\bGood\b|Possible|verdict|score/i);
    expect(src).toMatch(/Checking recent parent reports/);
  });
  it('is wired to both places the page shows Family Fit (the badge beside the name and the card), and only through the helper', () => {
    const page = read('app/venue/[id].tsx');
    expect(page).toMatch(/fitIsBeingChecked\(/);
    expect(page).toMatch(/fitChecking \? \(\s*<FamilyFitCheckingBadge/);
    expect(page).toMatch(/fitChecking \? <FamilyFitCheckingCard/);
  });
  it('holds the card’s height so the swap changes words, not layout', () => {
    expect(src).toMatch(/minHeight: 200/);
  });
});
