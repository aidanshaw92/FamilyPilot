import { describe, expect, it } from 'vitest';

const { runFoodBackfill, planAnchors, MIN_DELAY_S, HARD_LIMIT } = require('../../../server/places/lib/food-backfill');
const { keyFor } = require('../../../server/places/lib/food-proximity');

const place = (id: string, lat: number, lng: number) => ({ id, name: id, latitude: lat, longitude: lng });
const PLACES = [place('a', 51.5, -0.1), place('b', 51.51, -0.11), place('c', 51.52, -0.12), place('a-twin', 51.50001, -0.10001), place('no-coords', NaN, NaN)];

function harness(over: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const stored = new Set<string>((over.stored as string[]) ?? []);
  const deps = {
    apply: true,
    lookup: async (a: { id: string }) => {
      calls.push(a.id);
      if (over.failOn === a.id) throw new Error('HTTP 429 Too Many Requests');
      return { cacheState: 'miss', overpassRequests: 1, overpassHttpRequests: over.retryOn === a.id ? 2 : 1, totalFound: a.id === 'b' ? 0 : 3, candidates: [] };
    },
    isStored: async (key: string) => stored.has(key),
    canPersist: () => over.canPersist !== false,
    sleep: async (ms: number) => { sleeps.push(ms); },
    ...Object.fromEntries(Object.entries(over).filter(([k]) => !['canPersist', 'failOn', 'retryOn', 'stored'].includes(k))),
  };
  return { deps, calls, sleeps, stored };
}

describe('food backfill: bounded, polite, restartable', () => {
  it('de-duplicates anchors on the key the lookup caches under and ignores venues with no coordinates', () => {
    const anchors = planAnchors(PLACES);
    expect(anchors.map((a: { id: string }) => a.id)).toEqual(['a', 'b', 'c']);
    expect(anchors[0].alsoFor).toEqual(['a-twin']);
  });

  it('plan mode makes no request and writes nothing', async () => {
    const h = harness({ apply: false });
    const ledger = await runFoodBackfill({ places: PLACES }, h.deps);
    expect(h.calls).toEqual([]);
    expect(h.sleeps).toEqual([]);
    expect(ledger.attempted).toBe(0);
    expect(ledger.stoppedBecause).toMatch(/plan only/);
  });

  it('refuses to start when results cannot be stored', async () => {
    const h = harness({ canPersist: false });
    const ledger = await runFoodBackfill({ places: PLACES }, h.deps);
    expect(h.calls).toEqual([]);
    expect(ledger.stoppedBecause).toMatch(/cannot be stored/);
  });

  it('does not start while the provider reports it is not ready', async () => {
    const h = harness({ preflight: async () => ({ ok: false, reason: 'no free slot' }) });
    const ledger = await runFoodBackfill({ places: PLACES }, h.deps);
    expect(h.calls).toEqual([]);
    expect(ledger.stoppedBecause).toMatch(/no free slot/);
  });

  it('runs one anchor at a time with a pause between each, and never a pause shorter than the floor', async () => {
    const h = harness({ delaySeconds: 1 });
    const ledger = await runFoodBackfill({ places: PLACES }, h.deps);
    expect(h.calls).toEqual(['a', 'b', 'c']);
    expect(h.sleeps).toHaveLength(2);
    expect(Math.min(...h.sleeps)).toBeGreaterThanOrEqual(MIN_DELAY_S * 1000);
    expect(ledger).toMatchObject({ attempted: 3, succeeded: 3, failed: 0, withFoodWithin10: 2, nothingMapped: 1 });
  });

  it('is restartable: anchors already stored are skipped, so a second run is a no-op', async () => {
    const stored = planAnchors(PLACES).map((a: { key: string }) => a.key);
    const h = harness({ stored });
    const ledger = await runFoodBackfill({ places: PLACES }, h.deps);
    expect(h.calls).toEqual([]);
    expect(ledger).toMatchObject({ attempted: 0, skipped: 3 });
    expect(h.sleeps).toEqual([]);
  });

  it('honours the request cap and accounts for what it did not reach', async () => {
    const h = harness({ limit: 2 });
    const ledger = await runFoodBackfill({ places: PLACES }, h.deps);
    expect(h.calls).toEqual(['a', 'b']);
    expect(ledger.skipped).toBe(1);
    expect(ledger.entries.find((e: { anchor: string }) => e.anchor === 'c').reason).toMatch(/cap of 2/);
  });

  it('can never be asked for more than the hard ceiling', async () => {
    const many = Array.from({ length: HARD_LIMIT + 50 }, (_, i) => place(`p${String(i).padStart(3, '0')}`, 51 + i * 0.001, -0.1));
    const h = harness({ limit: 9999 });
    await runFoodBackfill({ places: many }, h.deps);
    expect(h.calls.length).toBe(HARD_LIMIT);
  });

  it('stops on the first provider error and does not try anything else', async () => {
    const h = harness({ failOn: 'b' });
    const ledger = await runFoodBackfill({ places: PLACES }, h.deps);
    expect(h.calls).toEqual(['a', 'b']);
    expect(ledger).toMatchObject({ attempted: 2, succeeded: 1, failed: 1 });
    expect(ledger.stoppedBecause).toMatch(/first provider error/);
    expect(ledger.entries.find((e: { anchor: string }) => e.anchor === 'c').outcome).toBe('skipped');
  });

  it('treats a retry or failover as a back-off signal and stops', async () => {
    const h = harness({ retryOn: 'a' });
    const ledger = await runFoodBackfill({ places: PLACES }, h.deps);
    expect(h.calls).toEqual(['a']);
    expect(ledger.stoppedBecause).toMatch(/retry or failover/);
  });

  it('every anchor is accounted for exactly once', async () => {
    for (const over of [{}, { failOn: 'b' }, { limit: 1 }, { stored: [keyFor(PLACES[0])] }]) {
      const h = harness(over);
      const ledger = await runFoodBackfill({ places: PLACES }, h.deps);
      expect(ledger.succeeded + ledger.failed + ledger.skipped).toBe(ledger.anchors);
      expect(new Set(ledger.entries.map((e: { anchor: string }) => e.anchor)).size).toBe(ledger.anchors);
    }
  });

  it('the backfill module imports no Google client and no paid provider', () => {
    const fs = require('node:fs');
    const text = fs.readFileSync(require.resolve('../../../server/places/lib/food-backfill.js'), 'utf8') + fs.readFileSync(require.resolve('../../scripts/backfill-food-proximity.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//, '');
    expect(text).not.toMatch(/google-places|places\.googleapis|GOOGLE_PLACES|routes\.googleapis|searchWithFallback/i);
  });
});
