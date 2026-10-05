/**
 * One-off, bounded, restartable backfill of "food near this venue" in a handful of BATCHED Overpass queries (see
 * server/places/lib/food-backfill.js for the rules and why). Reads the stored venue catalogue, skips every anchor that
 * already has a stored answer, and asks OpenStreetMap's public Overpass instance ONE question per ~70 venues. It never
 * calls Google or any paid provider, uses one endpoint with no failover and no retry, stops on the first error or
 * back-off signal, and writes its ledger to docs/food-backfill/.
 *
 *   node scripts/backfill-food-proximity.mjs                 # PLAN: lists the anchors and the number of queries, makes no request
 *   node scripts/backfill-food-proximity.mjs --apply         # the run (needs SUPABASE_URL + service-role key): 1 status read + ~2 queries
 *   node scripts/backfill-food-proximity.mjs --apply --per-request 50 --max-requests 3 --pause-s 120
 *
 * Needs outbound access to overpass-api.de (the sandbox this was written in has none) and the Supabase credentials the
 * other server scripts use. Run it once. A second run is a no-op because every anchor is then stored.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(process.cwd(), '..');
const { runFoodBackfill, DEFAULT_ANCHORS_PER_REQUEST, DEFAULT_MAX_REQUESTS, DEFAULT_PAUSE_S } = require(resolve(root, 'server/places/lib/food-backfill.js'));
const { buildBatchFoodQuery, OVERPASS_USER_AGENT } = require(resolve(root, 'server/places/lib/osm-food.js'));
const { keyFor } = require(resolve(root, 'server/places/lib/food-proximity.js'));
const { readSearchCache, writeSearchCache } = require(resolve(root, 'server/places/lib/search-cache.js'));
const { getSupabaseAdmin } = require(resolve(root, 'server/enrichment/_lib/supabase-admin.js'));

const ENDPOINT = 'https://overpass-api.de/api/interpreter'; // one endpoint, deliberately: no mirror failover
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const apply = flag('--apply');

const admin = getSupabaseAdmin();
if (!admin) {
  console.error('No Supabase admin credentials in the environment: nothing can be read or stored. Stopping.');
  process.exit(2);
}

const CATEGORIES = ['park', 'museum', 'zoo', 'farm', 'attraction', 'activity', 'soft_play', 'beach'];
const { data, error } = await admin.from('place_records').select('familypilot_place_id, name, lat, lng').in('category', CATEGORIES);
if (error) {
  console.error('Could not read the venue catalogue:', error.message);
  process.exit(2);
}
const places = (data ?? []).map((r) => ({ id: r.familypilot_place_id, name: r.name, latitude: Number(r.lat), longitude: Number(r.lng) }));

const ledger = await runFoodBackfill(
  { places },
  {
    apply,
    perRequest: value('--per-request', DEFAULT_ANCHORS_PER_REQUEST),
    maxRequests: value('--max-requests', DEFAULT_MAX_REQUESTS),
    pauseSeconds: value('--pause-s', DEFAULT_PAUSE_S),
    fetchBatch: async (anchors, radiusM) => {
      const query = buildBatchFoodQuery(anchors, radiusM);
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': OVERPASS_USER_AGENT, Accept: 'application/json' },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(150_000),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}${res.status === 429 || res.status === 406 ? ' (back-off signal: wait at least 30 s)' : ''}`);
      const json = await res.json();
      if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) throw new Error(`Overpass remark: ${String(json.remark).slice(0, 120)}`);
      return { elements: Array.isArray(json.elements) ? json.elements : [], httpRequests: 1 };
    },
    store: async (anchor, payload) => {
      await writeSearchCache(keyFor(anchor), payload, { provider: 'osm', billableCalls: 0 });
    },
    isStored: async (key) => Boolean(await readSearchCache(key)),
    canPersist: () => Boolean(admin),
    // Overpass publishes its load on /api/status; a run that starts while it reports no free slot is pointless.
    preflight: async () => {
      try {
        const res = await fetch('https://overpass-api.de/api/status', { headers: { 'User-Agent': OVERPASS_USER_AGENT } });
        const text = await res.text();
        if (!res.ok) return { ok: false, reason: `status endpoint answered ${res.status}` };
        const slots = /(\d+)\s+slots?\s+available\s+now/i.exec(text);
        if (!slots || Number(slots[1]) < 1) return { ok: false, reason: 'no free slot reported' };
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `status endpoint unreachable: ${e.message}` };
      }
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (entry) => console.log(JSON.stringify(entry)),
  },
);

const out = join(root, 'docs', 'food-backfill');
mkdirSync(out, { recursive: true });
const file = join(out, `${new Date().toISOString().replace(/[:.]/g, '-')}${apply ? '' : '-plan'}.json`);
writeFileSync(file, JSON.stringify(ledger, null, 2));
const { entries, ...summary } = ledger;
console.log('\n' + JSON.stringify(summary, null, 2));
console.log(`Ledger written to ${file}`);
process.exit(ledger.failed > 0 ? 1 : 0);
