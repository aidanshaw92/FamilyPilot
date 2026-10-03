/**
 * Proves, against a deployed build, that the two cache fixes from PR #141 are live.
 *
 * Usage: node scripts/verify-food-cache-headers.mjs <miss-headers> <miss-body> <hit-headers> <hit-body>
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
 */
import { readFileSync } from 'node:fs';

const [missHeaderPath, missBodyPath, hitHeaderPath, hitBodyPath] = process.argv.slice(2);
if (!missHeaderPath || !missBodyPath || !hitHeaderPath || !hitBodyPath) {
  console.error('usage: verify-food-cache-headers.mjs <miss-headers> <miss-body> <hit-headers> <hit-body>');
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
const missCc = cacheControl(read(missHeaderPath));
const hitCc = cacheControl(read(hitHeaderPath));

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

console.log(`\n  Cache-Control on the miss: ${missCc ?? '(none)'}`);
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

console.log(`\n  Cache-Control on the hit: ${hitCc ?? '(none)'}`);
check(
  /s-maxage=21600/.test(hitCc ?? ''),
  'the hit IS edge-cacheable, so the repeat-load protection was preserved rather than thrown away',
  hitCc ?? '(none)',
);

console.log('');
if (failures.length) {
  console.log(`::error::${failures.length} cache check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('Both cache fixes are live: a miss is never replayed, a hit still is.');
