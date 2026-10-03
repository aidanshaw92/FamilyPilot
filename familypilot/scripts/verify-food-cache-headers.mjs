/**
 * Proves, against a deployed build, that the two cache fixes from PR #141 are live.
 *
 * Usage: node scripts/verify-food-cache-headers.mjs <miss-h> <miss-b> <hit-h> <hit-b> <edge-h> <edge-b>
 *
 * WHY THIS IS NOT COVERED BY THE UNIT TESTS. The unit tests prove the handler sets the right header for
 * each cacheState, and four killed mutants prove they discriminate. What they cannot prove is that the
 * code answering production requests today is that code. This reads two real responses.
 *
 * WHY A FRESH RADIUS. The cache key includes the radius in whole kilometres, so asking a known anchor at
 * an unused radius is a genuinely cold key without inventing a fake place. The anchor used is the
 * SPARSEST of the five Section 16 anchors -- it answered in 9.4s with 8 candidates -- so this costs
 * Overpass exactly ONE query, which is one more than the product makes when a parent opens that venue.
 * That is the whole budget: one request to a donated service, to check a fix that exists to stop
 * overstating how many we make.
 *
 * WHAT A FAILURE HERE MEANS. If the miss is edge-cacheable, the deployed build still replays a body
 * claiming an Overpass request was made when none was. If the hit is NOT edge-cacheable, the fix went
 * too far and threw away the repeat-load protection it was meant to preserve. Both directions fail.
 *
 * WHY THERE IS A THIRD REQUEST, AND WHY `Cache-Control` IS NOT THE EVIDENCE ON THE HIT PATH.
 *
 * The first version of this asserted `s-maxage=21600` on the hit response and failed against production
 * reporting `Cache-Control: public`. The handler definitely sets the full directive -- the unit tests
 * assert it on the response object and mutants kill them -- so something between rewrote it, and the only
 * thing between is Vercel's CDN: `s-maxage` is a directive addressed TO the CDN, which consumes it and
 * does not pass it on. So that assertion was testing a header that cannot be observed from outside, which
 * is a defect in the check rather than in the product.
 *
 * The replacement is stricter, not looser, because it tests the behaviour instead of the instruction: a
 * third identical request must come back `x-vercel-cache: HIT`. The edge can only serve that if it
 * accepted an `s-maxage` it could only have got from our response. And the second request is itself the
 * proof for the miss path: it came back `cacheState: hit` after 366ms, meaning it reached the function
 * and read the store. Under the old code it was a 12ms edge replay still claiming `cacheState: miss`.
 */
import { readFileSync } from 'node:fs';

const [missHeaderPath, missBodyPath, hitHeaderPath, hitBodyPath, edgeHeaderPath, edgeBodyPath] =
  process.argv.slice(2);
if (!missHeaderPath || !missBodyPath || !hitHeaderPath || !hitBodyPath || !edgeHeaderPath || !edgeBodyPath) {
  console.error('usage: verify-food-cache-headers.mjs <miss-h> <miss-b> <hit-h> <hit-b> <edge-h> <edge-b>');
  process.exit(2);
}

const failures = [];
const check = (ok, label, detail) => {
  if (ok) console.log(`  [ok] ${label}${detail ? `: ${detail}` : ''}`);
  else {
    console.log(`  [FAIL] ${label}${detail ? `: ${detail}` : ''}`);
    failures.push(label);
  }
};

const read = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    return null;
  }
};

/** The LAST Cache-Control in the dump, because curl -L appends a header block per hop. */
function cacheControl(raw) {
  if (!raw) return null;
  const matches = [...raw.matchAll(/^cache-control:\s*(.+)$/gim)].map((m) => m[1].trim());
  return matches.length ? matches[matches.length - 1] : null;
}

/** Vercel's own report of whether IT served the response, which is the only visible proof of s-maxage. */
function vercelCache(raw) {
  if (!raw) return null;
  const matches = [...raw.matchAll(/^x-vercel-cache:\s*(.+)$/gim)].map((m) => m[1].trim().toUpperCase());
  return matches.length ? matches[matches.length - 1] : null;
}

function body(path) {
  const raw = read(path);
  if (!raw) return { __unreadable: `could not read ${path}` };
  try {
    return JSON.parse(raw);
  } catch (error) {
    return { __unreadable: raw.slice(0, 200) };
  }
}

const missBody = body(missBodyPath);
const hitBody = body(hitBodyPath);
const edgeBody = body(edgeBodyPath);
const missCc = cacheControl(read(missHeaderPath));
const hitCc = cacheControl(read(hitHeaderPath));
const missEdge = vercelCache(read(missHeaderPath));
const hitEdge = vercelCache(read(hitHeaderPath));
const edgeEdge = vercelCache(read(edgeHeaderPath));

console.log('=== first request: must be a cold miss, or this verifies nothing ===');
if (missBody.__unreadable) {
  check(false, 'the first response was readable', missBody.__unreadable);
} else {
  console.log(`  cacheState=${missBody.cacheState}  overpassRequests=${missBody.overpassRequests}  overpassHttpRequests=${missBody.overpassHttpRequests}  googleCalls=${missBody.googleCalls}  found=${missBody.totalFound}`);
  // A hit here means the radius was not fresh after all, and nothing below is a test of the miss path.
  check(missBody.cacheState === 'miss', 'the chosen radius really was a cold key', `cacheState=${missBody.cacheState}`);
  check(missBody.googleCalls === 0, 'the cold lookup made no Google call', `googleCalls=${missBody.googleCalls}`);
  // The defect that started all of this: the field existed in the provider and never reached the API.
  check(
    Number.isFinite(missBody.overpassHttpRequests),
    'overpassHttpRequests reaches the API, so our load on Overpass is reportable',
    String(missBody.overpassHttpRequests),
  );
  check(
    (missBody.overpassHttpRequests ?? 0) >= (missBody.overpassRequests ?? 0),
    'HTTP requests are at least the query count, since failover sends one query twice',
    `${missBody.overpassHttpRequests} http vs ${missBody.overpassRequests} queries`,
  );
}

console.log(`\n  Cache-Control on the miss: ${missCc ?? '(none)'}  x-vercel-cache: ${missEdge ?? '(none)'}`);
check(missCc !== null, 'the miss response carried a Cache-Control header at all', missCc ?? '(none)');
check(
  !/s-maxage/i.test(missCc ?? ''),
  'the miss is NOT edge-cacheable, so no replay can claim an Overpass request that never happened',
  missCc ?? '(none)',
);

console.log('\n=== second request, same key: must be a hit, and must still be edge-cacheable ===');
if (hitBody.__unreadable) {
  check(false, 'the second response was readable', hitBody.__unreadable);
} else {
  console.log(`  cacheState=${hitBody.cacheState}  overpassRequests=${hitBody.overpassRequests}  googleCalls=${hitBody.googleCalls}`);
  check(
    hitBody.cacheState === 'hit' || hitBody.cacheState === 'stale',
    'the repeat was served from the store, which is what the whole cache exists for',
    `cacheState=${hitBody.cacheState}`,
  );
  check(hitBody.overpassRequests === 0, 'the repeat issued no Overpass request', String(hitBody.overpassRequests));
  check(hitBody.googleCalls === 0, 'the repeat made no Google call', String(hitBody.googleCalls));
}

console.log(`  Cache-Control as the client sees it: ${hitCc ?? '(none)'}  x-vercel-cache: ${hitEdge ?? '(none)'}`);
// The decisive one for the MISS fix. Under the old code this second request was an edge replay of the
// miss: ~12ms, and still claiming cacheState "miss" and one Overpass request. Reaching the function and
// reading the store is the behaviour the fix exists to produce.
check(
  hitEdge !== 'HIT',
  'the second request was NOT served by the edge, so no replay of the miss happened',
  `x-vercel-cache=${hitEdge ?? '(none)'}`,
);

console.log('\n=== third request: the edge must now serve the HIT, or the protection was thrown away ===');
if (edgeBody.__unreadable) {
  check(false, 'the third response was readable', edgeBody.__unreadable);
} else {
  console.log(`  cacheState=${edgeBody.cacheState}  overpassRequests=${edgeBody.overpassRequests}  x-vercel-cache=${edgeEdge ?? '(none)'}`);
  // Whatever served it, it must not claim a provider request.
  check(
    edgeBody.cacheState === 'hit' || edgeBody.cacheState === 'stale',
    'whatever served the third request, the body still reports a cache read rather than a miss',
    `cacheState=${edgeBody.cacheState}`,
  );
  check(edgeBody.overpassRequests === 0, 'the third request issued no Overpass request', String(edgeBody.overpassRequests));
}
/**
 * The only observable proof that we still send `s-maxage` on a hit. Vercel strips the directive from the
 * client-facing `Cache-Control`, so the header cannot show it -- but the edge can only serve a HIT if it
 * accepted an `s-maxage` that came from our response. STALE counts: it means the edge holds the entry.
 */
check(
  edgeEdge === 'HIT' || edgeEdge === 'STALE',
  'the edge now serves the hit, which it could only do from an s-maxage we sent',
  `x-vercel-cache=${edgeEdge ?? '(none)'}`,
);

console.log('');
if (failures.length) {
  console.log(`::error::${failures.length} cache check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('Both cache fixes are live: the miss reached the function, and the edge serves only the hit.');
