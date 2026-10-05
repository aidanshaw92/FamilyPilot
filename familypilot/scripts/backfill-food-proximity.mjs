/**
 * One-off, bounded, restartable backfill of "food near this venue" (see server/places/lib/food-backfill.js for the
 * rules and why). Reads the stored venue catalogue, de-duplicates anchors, skips any anchor already stored, and asks
 * OpenStreetMap's Overpass API one anchor at a time with a pause between each. It never calls Google or any paid
 * provider, stops on the first error or back-off signal, and writes its ledger to docs/food-backfill/.
 *
 *   node scripts/backfill-food-proximity.mjs                 # PLAN: lists the anchors, makes no request
 *   node scripts/backfill-food-proximity.mjs --apply         # the run (needs SUPABASE_URL + service-role key)
 *   node scripts/backfill-food-proximity.mjs --apply --limit 40 --delay-s 12
 *
 * Needs outbound access to overpass-api.de (the sandbox this was written in has none) and the Supabase credentials
 * the other server scripts use. Run it once. A second run is a no-op because every anchor is then stored.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(process.cwd(), '..');
const { runFoodBackfill, DEFAULT_LIMIT, DEFAULT_DELAY_S } = require(resolve(root, 'server/places/lib/food-backfill.js'));
const { getNearbyFood } = require(resolve(root, 'server/places/lib/nearby-food.js'));
const { readSearchCache } = require(resolve(root, 'server/places/lib/search-cache.js'));
const { getSupabaseAdmin } = require(resolve(root, 'server/enrichment/_lib/supabase-admin.js'));

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const apply = flag('--apply');
const limit = value('--limit', DEFAULT_LIMIT);
const delaySeconds = value('--delay-s', DEFAULT_DELAY_S);

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
    limit,
    delaySeconds,
    lookup: (a) => getNearbyFood({ latitude: a.latitude, longitude: a.longitude, placeId: a.id }, {}),
    isStored: async (key) => Boolean(await readSearchCache(key)),
    canPersist: () => Boolean(admin),
    // Overpass publishes its load on /api/status; a run that starts while it reports no free slot is pointless.
    preflight: async () => {
      try {
        const res = await fetch('https://overpass-api.de/api/status', { headers: { 'User-Agent': 'FamilyPilot/1.0 (https://family-pilot-seven.vercel.app; nearby-food backfill)' } });
        const text = await res.text();
        if (!res.ok) return { ok: false, reason: `status endpoint answered ${res.status}` };
        const slots = /(\d+)\s+slots?\s+available\s+now/i.exec(text);
        if (!slots) return { ok: false, reason: 'no free slot reported' };
        if (Number(slots[1]) < 1) return { ok: false, reason: 'no free slot' };
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
