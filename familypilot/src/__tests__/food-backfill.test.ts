import { describe, expect, it } from 'vitest';

const { runFoodBackfill, planAnchors, planBatches, payloadForAnchor, MIN_PAUSE_S, HARD_MAX_REQUESTS, HARD_ANCHORS_PER_REQUEST } = require('../../../server/places/lib/food-backfill');
const { buildBatchFoodQuery } = require('../../../server/places/lib/osm-food');
const { keyFor } = require('../../../server/places/lib/food-proximity');

const place = (id: string, lat: number, lng: number) => ({ id, name: id, latitude: lat, longitude: lng });
const PLACES = [place('a', 51.5, -0.1), place('b', 51.51, -0.11), place('c', 51.52, -0.12), place('a-twin', 51.50001, -0.10001), place('no-coords', NaN, NaN)];
const cafe = (id: number, lat: number, lng: number, name = `Cafe ${id}`) => ({ type: 'node', id, lat, lon: lng, tags: { amenity: 'cafe', name } });
const many = (n: number) => Array.from({ length: n }, (_, i) => place(`p${String(i).padStart(3, '0')}`, 51.3 + (i % 20) * 0.01, -0.5 + Math.floor(i / 20) * 0.04));

function harness(over: Record<string, unknown> = {}) {
  const requests: Array<{ ids: string[]; radiusM: number }> = [];
  const stored = new Map<string, any>();
  const already = new Set<string>((over.stored as string[]) ?? []);
  const sleeps: number[] = [];
  const deps = {
    apply: true,
    fetchBatch: async (anchors: Array<{ id: string }>, radiusM: number) => {
      requests.push({ ids: anchors.map((a) => a.id), radiusM });
      if (over.failOn === requests.length) throw new Error('Overpass 429 (back-off signal)');
      return { elements: (over.elements as any[]) ?? [cafe(1, 51.5004, -0.1, 'Near A'), cafe(2, 51.5104, -0.11, 'Near B')], httpRequests: over.retryOn === requests.length ? 2 : 1 };
    },
    store: async (anchor: { id: string; key: string }, payload: unknown) => {
      if (over.storeFails) throw new Error('db down');
      stored.set(anchor.id, payload);
    },
    isStored: async (key: string) => already.has(key),
    canPersist: () => over.canPersist !== false,
    sleep: async (ms: number) => { sleeps.push(ms); },
    now: () => '2026-10-06T00:00:00.000Z',
    ...Object.fromEntries(Object.entries(over).filter(([k]) => !['canPersist', 'failOn', 'retryOn', 'stored', 'elements', 'storeFails'].includes(k))),
  };
  return { deps, requests, sleeps, stored };
}

describe('food backfill: the smallest responsible number of requests', () => {
  it('de-duplicates anchors on the key the lookup caches under and ignores venues with no coordinates', () => {
    const anchors = planAnchors(PLACES);
    expect(anchors.map((a: { id: string }) => a.id)).toEqual(['a', 'b', 'c']);
    expect(anchors[0].alsoFor).toEqual(['a-twin']);
  });

  it('138 venues are two queries, not 138, and never more than the hard ceiling however many there are', async () => {
    const h = harness();
    const ledger = await runFoodBackfill({ places: many(138) }, h.deps);
    expect(ledger.requests).toBe(2);
    expect(h.requests.map((r) => r.ids.length)).toEqual([70, 68]);
    const huge = harness({ maxRequests: 99, perRequest: 5 });
    const big = await runFoodBackfill({ places: many(138) }, huge.deps);
    expect(big.requests).toBe(HARD_MAX_REQUESTS);
    expect(big.stoppedBecause).toMatch(/request cap/);
    expect(Math.max(...huge.requests.map((r) => r.ids.length))).toBeLessThanOrEqual(HARD_ANCHORS_PER_REQUEST);
  });

  it('one batch query asks for each anchor on its own (not a line through them) and for food only', () => {
    const q = buildBatchFoodQuery([{ latitude: 51.5, longitude: -0.1 }, { latitude: 51.6, longitude: -0.2 }], 1200);
    expect((q.match(/around:/g) ?? []).length).toBe(2);
    expect(q).toMatch(/\(around:1200,51\.50000,-0\.10000\)/);
    expect(q).toMatch(/\^\(restaurant\|cafe\|fast_food\)\$/);
    expect(q).toMatch(/\[timeout:\d+\]\[maxsize:\d+\]/);
    expect(q).not.toMatch(/around:1200,51\.5,-0\.1,51\.6/);
  });

  it('plan mode makes no request, writes nothing, and says how many queries it would send', async () => {
    const h = harness({ apply: false });
    const ledger = await runFoodBackfill({ places: PLACES }, h.deps);
    expect(h.requests).toEqual([]);
    expect(h.stored.size).toBe(0);
    expect(ledger.plannedRequests).toBe(1);
    expect(ledger.stoppedBecause).toMatch(/plan only/);
  });

  it('refuses to start when results cannot be stored, or when the provider has no free slot', async () => {
    const a = harness({ canPersist: false });
    expect((await runFoodBackfill({ places: PLACES }, a.deps)).stoppedBecause).toMatch(/cannot be stored/);
    expect(a.requests).toEqual([]);
    const b = harness({ preflight: async () => ({ ok: false, reason: 'no free slot' }) });
    expect((await runFoodBackfill({ places: PLACES }, b.deps)).stoppedBecause).toMatch(/no free slot/);
    expect(b.requests).toEqual([]);
  });

  it('waits at least the floor between queries', async () => {
    const h = harness({ pauseSeconds: 1 });
    await runFoodBackfill({ places: many(138) }, h.deps);
    expect(h.sleeps).toHaveLength(1);
    expect(h.sleeps[0]).toBeGreaterThanOrEqual(MIN_PAUSE_S * 1000);
  });

  it('is idempotent and restartable: stored anchors cost nothing, so a complete run asks for nothing', async () => {
    const all = planAnchors(many(138)).map((a: { key: string }) => a.key);
    const done = harness({ stored: all });
    const ledger = await runFoodBackfill({ places: many(138) }, done.deps);
    expect(done.requests).toEqual([]);
    expect(ledger).toMatchObject({ requests: 0, attempted: 0, skipped: 138 });
    const partial = harness({ stored: all.slice(0, 100) });
    const rest = await runFoodBackfill({ places: many(138) }, partial.deps);
    expect(rest.requests).toBe(1);
    expect(partial.requests[0].ids).toHaveLength(38);
  });

  it('writes, for each anchor, what the venue page would have: its own food, nearest first, within the radius', async () => {
    const h = harness({ elements: [cafe(1, 51.5004, -0.1, 'Near A'), cafe(2, 51.5104, -0.11, 'Near B'), cafe(3, 51.5, -0.0, 'Far from all')] });
    const ledger = await runFoodBackfill({ places: PLACES }, h.deps);
    const a = h.stored.get('a');
    expect(a.candidates.map((c: { name: string }) => c.name)).toEqual(['Near A']);
    expect(a.radiusM).toBe(1200);
    expect(a.discovery).toMatchObject({ batched: true });
    expect(h.stored.get('b').candidates.map((c: { name: string }) => c.name)).toEqual(['Near B']);
    expect(h.stored.get('c').candidates).toEqual([]);
    expect(ledger).toMatchObject({ attempted: 3, succeeded: 3, failed: 0, withFoodWithin10: 2, nothingMapped: 1 });
  });

  it('an anchor with nothing mapped nearby is stored as nothing mapped, not skipped and not guessed', async () => {
    const h = harness({ elements: [] });
    const ledger = await runFoodBackfill({ places: PLACES }, h.deps);
    expect(ledger.nothingMapped).toBe(3);
    expect(h.stored.get('a').candidates).toEqual([]);
  });

  it('stops on the first provider error: nothing further is asked, nothing is stored, every anchor is accounted for', async () => {
    const h = harness({ failOn: 1 });
    const ledger = await runFoodBackfill({ places: many(138) }, h.deps);
    expect(h.requests).toHaveLength(1);
    expect(h.stored.size).toBe(0);
    expect(ledger.stoppedBecause).toMatch(/first provider error/);
    expect(ledger).toMatchObject({ failed: 70, skipped: 68, succeeded: 0 });
  });

  it('treats a retry or failover as a back-off signal and stops after storing what it was given', async () => {
    const h = harness({ retryOn: 1 });
    const ledger = await runFoodBackfill({ places: many(138) }, h.deps);
    expect(h.requests).toHaveLength(1);
    expect(ledger.stoppedBecause).toMatch(/retry or failover/);
  });

  it('stops if an answer cannot be stored', async () => {
    const h = harness({ storeFails: true });
    const ledger = await runFoodBackfill({ places: PLACES }, h.deps);
    expect(ledger.stoppedBecause).toMatch(/could not be stored/);
    expect(h.requests).toHaveLength(1);
  });

  it('every anchor is accounted for exactly once', async () => {
    for (const over of [{}, { failOn: 1 }, { maxRequests: 1 }, { stored: [keyFor(PLACES[0])] }, { apply: false }]) {
      const h = harness(over);
      const ledger = await runFoodBackfill({ places: many(138) }, h.deps);
      expect(ledger.succeeded + ledger.failed + ledger.skipped + (over.apply === false ? 138 : 0)).toBe(ledger.anchors);
      expect(new Set(ledger.entries.map((e: { anchor: string }) => e.anchor)).size).toBe(ledger.anchors);
    }
  });

  it('payloadForAnchor keeps the nearest sixty and says when it was saturated', () => {
    const elements = Array.from({ length: 80 }, (_, i) => cafe(i + 1, 51.5 + (i + 1) * 0.00008, -0.1, `C${i}`));
    const payload = payloadForAnchor({ latitude: 51.5, longitude: -0.1 }, elements, 1200, 'now');
    expect(payload.candidates).toHaveLength(60);
    expect(payload.discovery.saturatedCap).toBe(true);
    expect(payload.candidates[0].distanceKm).toBeLessThanOrEqual(payload.candidates[59].distanceKm);
  });

  it('the backfill module and script import no Google client, no paid provider and no mirror endpoint', () => {
    const fs = require('node:fs');
    const text = fs.readFileSync(require.resolve('../../../server/places/lib/food-backfill.js'), 'utf8') + fs.readFileSync(require.resolve('../../scripts/backfill-food-proximity.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//, '');
    expect(text).not.toMatch(/google-places|places\.googleapis|GOOGLE_PLACES|routes\.googleapis|searchWithFallback|kumi/i);
    expect((text.match(/overpass-api\.de\/api\/interpreter/g) ?? []).length).toBe(1);
  });
});
