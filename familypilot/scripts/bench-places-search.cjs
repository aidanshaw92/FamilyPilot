/**
 * Home's search request, timed in-process against a fake database that COUNTS queries and charges latency for each.
 *
 * Why: the real-device run showed ~10-12 s to the first Home card. Production cannot be reached from the development
 * sandbox, so this measures the one thing the repository can measure honestly: how many database round trips the REAL
 * handler (api/places/search.js) makes for a London search, and what that costs under a stated latency model. It is a
 * model, not a production measurement, and reports itself as one.
 *
 * Zero spend: the search cache holds a fresh London result (the common path once the CDN misses), so no provider is
 * reached; PLACES_PROVIDER is forced to 'mock' as a second guard, and global fetch throws on any provider host.
 *
 * usage: node scripts/bench-places-search.cjs [--places 160] [--latency 25] [--concurrency 10] [--json]
 */
const path = require('node:path');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : fallback; };
const PLACES = opt('--places', 160);
const LATENCY_MS = opt('--latency', 25);
const CONCURRENCY = opt('--concurrency', Infinity);
const JSON_OUT = args.includes('--json');

process.env.PLACES_PROVIDER = 'mock';
process.env.VERCEL_ENV = 'preview';
const realFetch = global.fetch;
global.fetch = (url, ...rest) => {
  if (/googleapis|overpass|openstreetmap/i.test(String(url))) throw new Error(`provider call blocked in bench: ${url}`);
  return realFetch(url, ...rest);
};

// ---- a fake Supabase admin that counts and charges every round trip (shared with the equivalence test) -----------
const { createCountingClient } = require('./fixtures/counting-supabase.cjs');
const { client, stats } = createCountingClient({ latencyMs: LATENCY_MS, concurrency: CONCURRENCY });

// ---- a realistic catalogue -----------------------------------------------------------------------------------------
const CATS = ['park', 'museum', 'zoo', 'farm', 'attraction', 'activity', 'soft_play'];
const now = new Date();
const iso = (d) => d.toISOString();
const day = (offset) => iso(new Date(now.getTime() + offset * 86400000)).slice(0, 10);
const tables = client.tables;
Object.assign(tables, { place_records: [], venue_family_metadata: [], venue_claims: [], venue_visit_reports: [], planning_connections: [], place_search_cache: [], google_places_usage: [], canonical_venues: [], canonical_venue_links: [] });
for (let i = 0; i < PLACES; i += 1) {
  const id = `fp-google-BENCH${String(i).padStart(4, '0')}`;
  tables.place_records.push({
    familypilot_place_id: id, external_id: `BENCH${i}`, provider: 'google', name: `Bench Place ${i}`, category: CATS[i % CATS.length],
    lat: 51.45 + (i % 20) * 0.01, lng: -0.3 + Math.floor(i / 20) * 0.04, address: 'London', description: null, opening_hours: null,
    website: null, phone: null, photos: [], is_open: null, fetched_at: iso(now), field_provenance: {},
  });
  // About half the catalogue has reviewed evidence, as production does.
  if (i % 2 === 0) {
    tables.venue_family_metadata.push({ familypilot_place_id: id, enrichment_status: 'enriched', last_checked: day(-10), checked_by: 'editor' });
    for (const [k, field] of ['familyFacilities.toilets', 'familyFacilities.babyChanging', 'familyFacilities.parking', 'pushchairSuitability', 'minRecommendedAge', 'maxRecommendedAge', 'environment', 'visitDurationMinutes'].entries()) {
      tables.venue_claims.push({
        id: `${id}-c${k}`, familypilot_place_id: id, field_key: field,
        value_json: field.startsWith('familyFacilities') ? 'yes' : field === 'pushchairSuitability' ? 'good' : field === 'environment' ? 'outdoor' : field.endsWith('Age') ? (field.startsWith('min') ? 0 : 12) : 90,
        confidence: 'high', source_url: `https://example.org/${id}`, evidence_excerpt: 'x', source_type: 'official', checked_at: day(-10),
        valid_until: day(60), approved_at: iso(now), approved_by: 'editor', status: 'active', created_at: iso(now), updated_at: iso(now),
      });
    }
  }
  if (i % 25 === 0) {
    tables.venue_visit_reports.push({ familypilot_place_id: id, user_id: `u${i}`, visit_date: day(-5), answers: { toilets: 'yes' }, status: 'active', created_at: iso(now) });
    tables.venue_visit_reports.push({ familypilot_place_id: id, user_id: `u${i + 1}`, visit_date: day(-4), answers: { toilets: 'no' }, status: 'active', created_at: iso(now) });
  }
}

const root = path.join(__dirname, '..', '..');
const adminPath = require.resolve(path.join(root, 'server', 'enrichment', '_lib', 'supabase-admin.js'));
require.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true, exports: { getSupabaseAdmin: () => client, isSupabaseConfigured: () => true } };

const { buildSearchCacheKey } = require(path.join(root, 'server', 'places', 'lib', 'search-cache.js'));
const key = buildSearchCacheKey({ scope: 'london', intent: 'explore', lat: 51.5074, lng: -0.1278, radiusKm: 40, categories: [] });
tables.place_search_cache.push({ cache_key: key, payload: { places: [], provider: 'google', fallbackUsed: false }, provider: 'google', fetched_at: iso(now), cached_until: iso(new Date(now.getTime() + 6 * 3600000)) });

const handler = require(path.join(root, 'api', 'places', 'search.js'));

async function run() {
  let body = null;
  let status = 0;
  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { status = code; return this; },
    json(b) { body = b; return this; },
    end() { return this; },
  };
  const req = { method: 'GET', query: { lat: '51.5074', lng: '-0.1278', radiusKm: '40', scope: 'london', intent: 'explore' } };
  const started = process.hrtime.bigint();
  await handler(req, res);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { status, ms, body };
}

(async () => {
  const { status, ms, body } = await run();
  const withEvidence = (body?.places ?? []).filter((p) => p.familyMetadata).length;
  const result = {
    model: { places: PLACES, latencyMsPerQuery: LATENCY_MS, concurrency: Number.isFinite(CONCURRENCY) ? CONCURRENCY : 'unlimited' },
    status,
    placesReturned: body?.places?.length ?? 0,
    placesWithEvidence: withEvidence,
    queries: stats.queries,
    byTable: stats.byTable,
    peakConcurrentQueries: stats.peak,
    handlerMs: Math.round(ms),
    payloadKb: Math.round(Buffer.byteLength(JSON.stringify(body ?? {})) / 1024),
  };
  if (JSON_OUT) console.log(JSON.stringify(result));
  else console.log(JSON.stringify(result, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
