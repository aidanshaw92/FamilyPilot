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

/**
 * Seconds between anchors.
 *
 * DEFECT THIS FIXES. The first live run fired five lookups in about fifteen seconds and three of them
 * came back 503 after hitting the provider's twenty-second deadline, while two answered in under four.
 * That is the shape of Overpass rate-limiting a caller, and the caller was this canary: a real parent
 * opens one venue at a time, so five requests in fifteen seconds is a load profile the product never
 * generates. Measuring the product under a load it does not produce told us about the canary, and it
 * was impolite to a service funded by donations.
 *
 * Spacing is NOT retrying. The failed anchors are not re-requested; the next run simply asks at a rate
 * Overpass is willing to answer.
 */
const GAP_SECONDS = 12;

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

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

for (const [index, anchor] of ANCHORS.entries()) {
  if (index > 0) {
    console.log(`  (waiting ${GAP_SECONDS}s before the next anchor, so Overpass is asked politely)`);
    await sleep(GAP_SECONDS);
  }
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

/**
 * The cache measurement: an anchor that SUCCEEDED, asked again.
 *
 * DEFECT THIS FIXES. This used to repeat `ANCHORS[0]` unconditionally. On the first live run that anchor
 * had failed, so nothing was cached, the repeat failed too, and the cache metric was lost along with it
 * -- a second failure reported for the first failure's reason. Only an anchor with a cache row can
 * answer the cache question.
 */
/**
 * Below this, no serverless function ran and the answer came from Vercel's edge.
 *
 * A cold nearby-food lookup is an Overpass query plus a Postgres write -- seconds. Even a store hit is a
 * Postgres round trip from the function, which measured 262ms and 484ms on the run that set this. 150ms
 * is comfortably below both and far above an edge response, which measured 12ms.
 */
const CDN_REPLAY_MS = 150;

const cacheable = report.anchors.find((row) => !row.error && row.cacheState === 'miss');
console.log('');
if (!cacheable) {
  console.log('[note] no anchor produced a cache row, so the cache measurement could not be taken.');
  report.cache.repeatNote = 'no anchor succeeded, so there was nothing cached to re-read';
}
const repeat = cacheable ? await lookup(cacheable) : { error: 'skipped: nothing was cached' };
if (!cacheable) {
  // Already reported above. Not a failure in its own right: it is the consequence of an earlier one.
} else if (repeat.error) {
  fail('cache repeat — lookup failed', repeat.error);
} else {
  console.log(`Cache check: ${cacheable.name} again, which must be served from cache.`);
  const body = repeat.body;
  report.cache.repeat = {
    cacheState: body.cacheState,
    overpassRequests: body.overpassRequests,
    latencyMs: repeat.latencyMs,
    firstLatencyMs: cacheable?.latencyMs,
    anchorName: cacheable?.name,
  };
  if (body.cacheState === 'hit' || body.cacheState === 'stale') {
    ok('the repeat was served from cache', `${body.cacheState}, ${repeat.latencyMs}ms vs ${cacheable.latencyMs}ms uncached`);
  } else if (repeat.latencyMs < CDN_REPLAY_MS) {
    /**
     * A MISS THIS FAST IS THE EDGE REPLAYING THE FIRST MISS, NOT A COLD LOOKUP.
     *
     * The previous version called any non-hit "caching is not in play in this environment" and moved on.
     * That conclusion was exactly inverted on the run that produced it: the repeat came back `miss` in
     * TWELVE MILLISECONDS, in a run where two other anchors had been served from the store. A round trip
     * to Postgres and Overpass is hundreds of milliseconds at the very least, so twelve means no function
     * ran -- the CDN answered, repeating a body that claimed an Overpass request had just been made.
     *
     * So the two cases are now separated by latency, which is the one measurement that distinguishes
     * them, and the CDN case is a FAILURE rather than a note: the product fix is to stop sending
     * `s-maxage` on a miss, and if this fires again that fix has regressed.
     */
    fail(
      'the repeat was a CDN replay of the miss, so the body misreports Overpass load',
      `${body.cacheState} in ${repeat.latencyMs}ms (under ${CDN_REPLAY_MS}ms means no function ran), overpassRequests=${body.overpassRequests}`,
    );
    report.cache.repeatNote = `repeat returned ${body.cacheState} in ${repeat.latencyMs}ms: an edge replay, not a cold lookup`;
  } else {
    // Slow AND a miss: the row genuinely was not found. That needs Supabase credentials in the
    // deployment environment, so it is reported rather than failed, and named so it is checkable.
    console.log(`  [note] the repeat was a ${body.cacheState} after ${repeat.latencyMs}ms, so the store did not answer`);
    report.cache.repeatNote = 'repeat was a slow miss; check Supabase credentials in the deployment environment';
  }
  if ((body.overpassRequests ?? 0) > 0 && body.cacheState === 'hit') {
    fail('a cache hit still issued an Overpass request', String(body.overpassRequests));
  }
}

console.log('\n=== Section 16 summary ===');
console.log(`Overpass lookups:        ${report.overpass.lookups}/${ANCHORS.length}`);
console.log(`Overpass queries:        ${report.overpass.queries}`);
const httpShown = report.overpass.httpRequests > 0 ? String(report.overpass.httpRequests) : 'not reported';
console.log(`Overpass HTTP requests:  ${httpShown}  (endpoint failover makes this >= queries)`);
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
