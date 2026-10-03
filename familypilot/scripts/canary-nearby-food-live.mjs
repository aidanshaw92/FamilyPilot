/**
 * The Section 16 restaurant canary, driven through a DEPLOYED build rather than from a runner.
 *
 * Usage: node scripts/canary-nearby-food-live.mjs <baseUrl> [bypassSecret]
 *
 * WHY THIS EXISTS WHEN `canary-nearby-food.mjs` ALREADY DID. That one calls the provider in-process, so
 * the Overpass request leaves from wherever the script runs. From a GitHub runner that is shared cloud
 * address space, which Overpass rate-limits heavily and entirely within its rights -- three attempts
 * established that the numbers described the runner's standing with Overpass, not the product's.
 *
 * Hitting the deployment instead moves the Overpass request to Vercel's egress, with the real
 * User-Agent, the real cache, and the real code path a parent's phone would use. That is a better
 * measurement AND a politer one: it is the request the product makes anyway.
 *
 * COST: zero Google. `intent=nearby-food` returns before anything billable, and every response is
 * checked for `googleCalls: 0` rather than trusted to be free.
 *
 * OVERPASS LOAD: five lookups plus one deliberate repeat, which must be a cache hit and therefore costs
 * Overpass nothing. It does not retry a failed anchor. If an anchor fails, that is the measurement.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [baseUrl, bypass] = process.argv.slice(2);
if (!baseUrl) {
  console.error('usage: canary-nearby-food-live.mjs <baseUrl> [bypassSecret]');
  process.exit(2);
}

/** The five anchors from docs/canary/README.md, in the documented order. */
const ANCHORS = [
  { placeId: 'fp-google-ChIJeclqF84EdkgRtKAjTmWFr0I', name: 'The National Gallery', lat: 51.5089, lng: -0.1283, covers: 'central / urban, dense' },
  { placeId: 'fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54', name: 'Victoria and Albert Museum', lat: 51.4966, lng: -0.1722, covers: 'inner urban museum' },
  { placeId: 'fp-google-ChIJIzJDyggadkgROFAV19Ti070', name: 'Hampstead Heath', lat: 51.5608, lng: -0.1629, covers: 'large park' },
  { placeId: 'fp-google-ChIJ99IK4v8QdkgRZNGsdKK0pb8', name: 'Gladstone Park', lat: 51.5574, lng: -0.236, covers: 'suburban park, sparse' },
  { placeId: 'fp-osm-679119297', name: 'Chiswick House', lat: 51.4837, lng: -0.2586, covers: 'suburban, sparse, OSM-sourced anchor' },
];

const headers = { Accept: 'application/json' };
if (bypass) {
  headers['x-vercel-protection-bypass'] = bypass;
  headers['x-vercel-set-bypass-cookie'] = 'true';
}

async function lookup(anchor) {
  const url = new URL('/api/places/search', baseUrl);
  url.searchParams.set('intent', 'nearby-food');
  url.searchParams.set('lat', String(anchor.lat));
  url.searchParams.set('lng', String(anchor.lng));
  url.searchParams.set('placeId', anchor.placeId);

  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(url.toString(), { headers, redirect: 'follow' });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'request failed', latencyMs: Date.now() - startedAt };
  }
  const latencyMs = Date.now() - startedAt;
  const text = await response.text();
  if (!response.ok) {
    return { error: `HTTP ${response.status}`, body: text.slice(0, 300), latencyMs, status: response.status };
  }
  try {
    return { body: JSON.parse(text), latencyMs, status: response.status };
  } catch {
    return { error: 'unparseable JSON', body: text.slice(0, 300), latencyMs };
  }
}

const failures = [];
const fail = (label, detail) => {
  console.log(`  [FAIL] ${label}${detail ? `: ${detail}` : ''}`);
  failures.push(label);
};
const ok = (label, detail) => console.log(`  [ok] ${label}${detail ? `: ${detail}` : ''}`);

const report = {
  takenAt: new Date().toISOString(),
  baseUrl,
  anchors: [],
  overpass: { lookups: 0, httpRequests: 0, queries: 0, retries: 0, errors: 0, saturated: 0 },
  google: { calls: 0 },
  cache: { hits: 0, misses: 0, stale: 0 },
  product: { withCandidates: 0, noResults: 0, lookupErrors: 0, displayedTotal: 0 },
};

console.log(`Section 16 restaurant canary, against ${baseUrl}`);
console.log(`Anchors: ${ANCHORS.length}. Predicted Overpass lookups: ${ANCHORS.length} + 1 repeat that must be cached.`);
console.log('Predicted Google calls: 0.\n');

for (const anchor of ANCHORS) {
  const result = await lookup(anchor);
  const row = { ...anchor, latencyMs: result.latencyMs };

  if (result.error) {
    // An error is a measurement, not a reason to retry. Overpass is a donated service.
    fail(`${anchor.name} — lookup failed`, `${result.error}${result.body ? ` ${result.body}` : ''}`);
    row.error = result.error;
    report.overpass.errors += 1;
    report.product.lookupErrors += 1;
    report.anchors.push(row);
    continue;
  }

  const body = result.body;
  row.provider = body.provider;
  row.attribution = body.attribution;
  row.cacheState = body.cacheState;
  row.googleCalls = body.googleCalls;
  row.overpassRequests = body.overpassRequests;
  row.overpassHttpRequests = body.overpassHttpRequests;
  row.discovery = body.discovery ?? null;
  row.totalFound = body.totalFound;
  row.displayed = Array.isArray(body.candidates) ? body.candidates.length : 0;

  report.overpass.lookups += 1;
  report.overpass.queries += body.overpassRequests ?? 0;
  report.overpass.httpRequests += body.overpassHttpRequests ?? 0;
  if ((body.overpassRequests ?? 0) > 1) report.overpass.retries += (body.overpassRequests ?? 0) - 1;
  if (body.discovery?.saturatedCap) report.overpass.saturated += 1;
  report.google.calls += body.googleCalls ?? 0;
  if (body.cacheState === 'hit') report.cache.hits += 1;
  else if (body.cacheState === 'stale') report.cache.stale += 1;
  else report.cache.misses += 1;
  report.product.displayedTotal += row.displayed;
  if (row.displayed > 0) report.product.withCandidates += 1;
  else report.product.noResults += 1;

  // The invariants. Checked per anchor rather than summed, so one bad anchor is visible.
  if (body.googleCalls !== 0) fail(`${anchor.name} — made a Google call`, String(body.googleCalls));
  if (body.provider !== 'osm') fail(`${anchor.name} — wrong provider`, String(body.provider));
  if (body.attribution !== 'osm') fail(`${anchor.name} — wrong attribution`, String(body.attribution));

  // No transit leg may be invented: OSM cannot tell us when a bus runs.
  const invented = (body.candidates ?? []).flatMap((c) => (c.travel ?? []))
    .filter((leg) => leg.mode === 'transit' || leg.mode === 'bus');
  if (invented.length) fail(`${anchor.name} — invented ${invented.length} transit leg(s)`);

  // Every leg must be labelled as the estimate it is.
  const unlabelled = (body.candidates ?? []).flatMap((c) => (c.travel ?? []))
    .filter((leg) => leg.source !== 'estimated-distance');
  if (unlabelled.length) fail(`${anchor.name} — ${unlabelled.length} leg(s) not labelled estimated-distance`);

  ok(
    `${anchor.name.padEnd(28)} ${String(row.displayed).padStart(2)} shown / ${String(row.totalFound ?? '?').padStart(2)} found`,
    `raw=${row.discovery?.rawElements ?? '?'}${row.discovery?.saturatedCap ? ' SATURATED' : ''}, ` +
      `overpass=${row.overpassRequests ?? '?'}q/${row.overpassHttpRequests ?? '?'}http, ` +
      `cache=${row.cacheState}, google=${row.googleCalls}, ${row.latencyMs}ms`,
  );
  report.anchors.push(row);
}

// The cache measurement: the SAME anchor again. One repeat, which must cost Overpass nothing.
console.log('\nCache check: the first anchor again, which must be served from cache.');
const repeat = await lookup(ANCHORS[0]);
if (repeat.error) {
  fail('cache repeat — lookup failed', repeat.error);
} else {
  const body = repeat.body;
  report.cache.repeat = {
    cacheState: body.cacheState,
    overpassRequests: body.overpassRequests,
    latencyMs: repeat.latencyMs,
    firstLatencyMs: report.anchors[0]?.latencyMs,
  };
  if (body.cacheState === 'hit' || body.cacheState === 'stale') {
    ok('the repeat was served from cache', `${body.cacheState}, ${repeat.latencyMs}ms vs ${report.anchors[0]?.latencyMs}ms uncached`);
  } else {
    // Not a product defect on its own: a cache write needs Supabase credentials in the environment.
    // Reported rather than failed, and named so the reason is checkable.
    console.log(`  [note] the repeat was a ${body.cacheState}, so caching is not in play in this environment`);
    report.cache.repeatNote = 'repeat was not a cache hit; check Supabase credentials in the deployment environment';
  }
  if ((body.overpassRequests ?? 0) > 0 && body.cacheState === 'hit') {
    fail('a cache hit still issued an Overpass request', String(body.overpassRequests));
  }
}

console.log('\n=== Section 16 summary ===');
console.log(`Overpass lookups:        ${report.overpass.lookups}/${ANCHORS.length}`);
console.log(`Overpass queries:        ${report.overpass.queries}`);
console.log(`Overpass HTTP requests:  ${report.overpass.httpRequests}  (endpoint failover makes this >= queries)`);
console.log(`Overpass retries:        ${report.overpass.retries}`);
console.log(`Overpass errors:         ${report.overpass.errors}`);
console.log(`Anchors at the element cap: ${report.overpass.saturated}`);
console.log(`Google calls:            ${report.google.calls}   (required: 0)`);
console.log(`Cache hits/stale/misses: ${report.cache.hits}/${report.cache.stale}/${report.cache.misses}`);
console.log(`Coverage:                ${report.product.withCandidates}/${report.overpass.lookups} anchors with candidates`);
console.log(`Displayed in total:      ${report.product.displayedTotal}`);
console.log(`Lookup errors:           ${report.product.lookupErrors}`);

// Coverage is asserted FIRST and on its own, because an earlier version of this canary printed seven
// green checks and exited 0 after measuring nothing at all.
if (report.overpass.lookups === 0) {
  fail('no anchor was measured, so this run proves nothing');
}
if (report.google.calls !== 0) {
  fail('the canary spent Google money', String(report.google.calls));
}

mkdirSync(join(process.cwd(), '..', 'docs', 'canary'), { recursive: true });
const out = join(process.cwd(), '..', 'docs', 'canary', 'live-report.json');
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nreport written to ${out}`);

if (failures.length) {
  console.log(`::error::${failures.length} canary check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('Every anchor measured, every invariant held, zero Google spend.');
