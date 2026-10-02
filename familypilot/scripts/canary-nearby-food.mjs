/**
 * The production canary for OpenStreetMap restaurant discovery.
 *
 * Collects every metric the brief's Section 16 asks for, against a deliberately small set of real
 * production anchors, and writes both a JSON record and a readable summary.
 *
 * WHAT IT WILL NOT DO
 *
 * - It makes ZERO Google calls. It reads the usage counters before and after and FAILS if any moved,
 *   rather than asserting the zero it expects.
 * - It makes at most ONE Overpass request per anchor. "Do not repeatedly hit Overpass simply to gather
 *   statistics" is the rule, so every metric below is derived from that one response per anchor plus the
 *   stored cache row; nothing is re-requested to measure it.
 * - It does not widen on a defect. A validation failure stops the run, because the brief says fix it
 *   rather than collect more of it.
 *
 * WHAT IT NEEDS
 *
 * Outbound access to overpass-api.de (or the fallback endpoint), and Supabase credentials if the cache
 * metrics are to mean anything. Without Supabase the lookup still works and every read is a miss, which
 * the report states rather than hides.
 *
 * Usage:
 *   node scripts/canary-nearby-food.mjs            # the real thing
 *   node scripts/canary-nearby-food.mjs --plan     # print what it would do, make no request
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(process.cwd(), '..');
const { getNearbyFood } = require(resolve(root, 'server/places/lib/nearby-food.js'));
const osmFood = require(resolve(root, 'server/places/lib/osm-food.js'));
const budget = require(resolve(root, 'server/places/lib/places-budget.js'));

const PLAN_ONLY = process.argv.includes('--plan');
const OUT = join(root, 'docs', 'canary');

/**
 * Five real production venues, chosen for geographic spread rather than convenience.
 *
 * Section M asks for 3-5 covering central/urban, suburban, park/attraction, a dense restaurant area and
 * a sparse one. `venuesWithin2km` is a density proxy measured from the production place table, and
 * distance from central London tracks restaurant density closely in practice.
 *
 * Deliberately NOT all 67 venues: that would be a bulk sweep of public Overpass infrastructure to
 * produce a statistic, which is the thing the brief forbids.
 */
const ANCHORS = [
  {
    placeId: 'fp-google-ChIJeclqF84EdkgRtKAjTmWFr0I',
    name: 'The National Gallery',
    latitude: 51.5089,
    longitude: -0.1283,
    covers: 'central / urban, dense restaurant area',
  },
  {
    placeId: 'fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54',
    name: 'Victoria and Albert Museum',
    latitude: 51.4966,
    longitude: -0.1722,
    covers: 'inner urban museum',
  },
  {
    placeId: 'fp-google-ChIJIzJDyggadkgROFAV19Ti070',
    name: 'Hampstead Heath',
    latitude: 51.5608,
    longitude: -0.1629,
    covers: 'large park, outer-inner boundary',
  },
  {
    placeId: 'fp-google-ChIJ99IK4v8QdkgRZNGsdKK0pb8',
    name: 'Gladstone Park',
    latitude: 51.5574,
    longitude: -0.236,
    covers: 'suburban park, sparse restaurant area',
  },
  {
    placeId: 'fp-osm-679119297',
    name: 'Chiswick House',
    latitude: 51.4837,
    longitude: -0.2586,
    covers: 'suburban, sparse, and an OpenStreetMap-sourced anchor',
  },
];

/** Straight-line kilometres, for the duplicate-proximity check only. */
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Today's billable units per scope, from the in-process counters after priming. */
function googleUnits() {
  const day = new Date().toISOString().slice(0, 10);
  const snap = budget.placesBudgetSnapshot();
  const out = {};
  for (const scope of Object.keys(snap.scopes)) {
    out[scope] = snap.today?.[`${day}:${scope}`] ?? 0;
  }
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  if (PLAN_ONLY) {
    console.log('PLAN ONLY. No request will be made.\n');
    console.log(`Anchors: ${ANCHORS.length}`);
    for (const a of ANCHORS) {
      console.log(`  ${a.name.padEnd(28)} ${a.latitude},${a.longitude}  (${a.covers})`);
    }
    console.log(`\nMaximum Overpass requests: ${ANCHORS.length} (one per anchor, two if one retries)`);
    console.log('Expected Google calls: 0');
    console.log(`Overpass endpoints: ${osmFood.OVERPASS_ENDPOINTS.join(', ')}`);
    console.log(`User-Agent: ${osmFood.OVERPASS_USER_AGENT}`);
    console.log(`Radius: ${osmFood.DEFAULT_RADIUS_M}m (max ${osmFood.MAX_RADIUS_M}m)`);
    return;
  }

  // Load the shared daily totals before anything, so a Google delta would be visible rather than
  // invisible because this process started from zero.
  await budget.primePlacesBudget().catch(() => undefined);
  const googleBefore = googleUnits();

  const report = {
    startedAt: new Date().toISOString(),
    anchors: [],
    overpass: {
      requests: 0,
      // The provider reports attempts; it tries the primary endpoint first and the fallback only on
      // failure, so a request count above one per anchor means something went wrong.
      retries: 0,
      timeouts: 0,
      errors: 0,
      latenciesMs: [],
    },
    google: { before: googleBefore, after: null, delta: null },
    routing: {
      // Paid routing is refused unless GOOGLE_JOURNEYS_ENABLED=true by name, so this is reported as a
      // measured zero rather than as a missing metric.
      journeysScopeEnabled: budget.isPlacesEnabled('journeys'),
      paidRouteCalls: 0,
      paidRouteElements: 0,
      modes: {},
    },
  };

  for (const anchor of ANCHORS) {
    const started = Date.now();
    let result = null;
    let error = null;
    try {
      result = await getNearbyFood(anchor, { radiusM: osmFood.DEFAULT_RADIUS_M, limit: 20 });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      if (/abort|timeout/i.test(error)) report.overpass.timeouts += 1;
      else report.overpass.errors += 1;
    }
    const elapsed = Date.now() - started;
    report.overpass.latenciesMs.push(elapsed);

    if (!result) {
      report.anchors.push({ ...anchor, error, latencyMs: elapsed });
      // A defect stops the run rather than being collected five times over.
      console.error(`FAILED at ${anchor.name}: ${error}`);
      break;
    }

    report.overpass.requests += result.overpassRequests ?? 0;
    if ((result.overpassRequests ?? 0) > 1) report.overpass.retries += (result.overpassRequests ?? 0) - 1;

    const displayed = result.candidates;
    const modes = {};
    for (const candidate of displayed) {
      for (const leg of candidate.travel) {
        modes[leg.mode] = modes[leg.mode] ?? { count: 0, routed: 0, estimated: 0 };
        modes[leg.mode].count += 1;
        if (leg.source === 'estimated-distance') modes[leg.mode].estimated += 1;
        else modes[leg.mode].routed += 1;
      }
    }
    for (const [mode, counts] of Object.entries(modes)) {
      const bucket = (report.routing.modes[mode] = report.routing.modes[mode] ?? {
        provider: 'none (arithmetic)',
        displayed: 0,
        routed: 0,
        estimated: 0,
        billableCalls: 0,
        billableElements: 0,
        cacheHits: 0,
        cacheMisses: 0,
      });
      bucket.displayed += counts.count;
      bucket.routed += counts.routed;
      bucket.estimated += counts.estimated;
    }

    report.anchors.push({
      placeId: anchor.placeId,
      name: anchor.name,
      covers: anchor.covers,
      provider: result.provider,
      cacheState: result.cacheState,
      overpassRequests: result.overpassRequests,
      googleCalls: result.googleCalls,
      radiusM: result.radiusM,
      latencyMs: elapsed,
      // The funnel the brief asks for. `totalFound` is after validation, dedupe and the radius filter,
      // because the provider applies all three before returning; `displayed` is after ranking and the
      // display cap. Raw element count is not separable without a second request, and the brief
      // forbids making one to produce a statistic -- stated rather than guessed at.
      candidatesAfterValidationDedupeAndFilter: result.totalFound,
      candidatesDisplayed: displayed.length,
      withOpeningHours: displayed.filter((c) => c.openingHours).length,
      withAnyChildTag: displayed.filter((c) => Object.keys(c.tagged ?? {}).length > 0).length,
      walkable: displayed.filter((c) => c.travel.some((l) => l.mode === 'walk')).length,
      anyTransitLeg: displayed.some((c) => c.travel.some((l) => l.mode === 'transit' || l.mode === 'bus')),
      /**
       * A duplicate is the SAME PLACE shown twice, which means same name AND close together.
       *
       * The first version of this counted repeated names, and the first real run failed on it at the
       * National Gallery. That was the check being wrong, not the product: within 1.2km of Trafalgar
       * Square there are certainly several branches of the same chain, and osm-food's own unit test
       * asserts that two branches 300m apart must NOT be merged, because they are two real options a
       * parent can choose between. Counting them as duplicates would have had me "fix" correct
       * behaviour to satisfy a bad assertion.
       *
       * So this applies the actual dedupe contract -- same name within the 40m threshold -- and
       * reports same-name-further-apart separately as information rather than as a failure.
       */
      duplicateNames: (() => {
        let pairs = 0;
        for (let i = 0; i < displayed.length; i += 1) {
          for (let j = i + 1; j < displayed.length; j += 1) {
            if (displayed[i].name.toLowerCase() !== displayed[j].name.toLowerCase()) continue;
            const km = haversineKm(displayed[i], displayed[j]);
            if (km <= 0.04) pairs += 1;
          }
        }
        return pairs;
      })(),
      sameNameDifferentPlace: (() => {
        const byName = new Map();
        for (const c of displayed) {
          const key = c.name.toLowerCase();
          byName.set(key, (byName.get(key) ?? 0) + 1);
        }
        return [...byName.values()].filter((n) => n > 1).length;
      })(),
      attribution: result.attribution,
      names: displayed.slice(0, 5).map((c) => c.name),
    });

    console.log(
      `${anchor.name.padEnd(28)} ${String(result.totalFound).padStart(3)} found, ` +
        `${String(displayed.length).padStart(2)} shown, cache=${result.cacheState}, ` +
        `overpass=${result.overpassRequests}, google=${result.googleCalls}, ${elapsed}ms`,
    );
  }

  report.google.after = googleUnits();
  report.google.delta = Object.fromEntries(
    Object.keys(report.google.after).map((scope) => [
      scope,
      (report.google.after[scope] ?? 0) - (report.google.before[scope] ?? 0),
    ]),
  );
  report.finishedAt = new Date().toISOString();

  const path = join(OUT, 'nearby-food-canary.json');
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);

  // --- the verdict ------------------------------------------------------------------------------
  const googleMoved = Object.entries(report.google.delta).filter(([, delta]) => delta !== 0);
  const transitInvented = report.anchors.some((a) => a.anyTransitLeg);
  const duplicates = report.anchors.reduce((n, a) => n + (a.duplicateNames ?? 0), 0);
  const wrongProvider = report.anchors.filter((a) => a.provider && a.provider !== 'osm');

  // --- product metrics, over the anchors that were actually measured --------------------------------
  const measured = report.anchors.filter((a) => !a.error);
  report.product = {
    venuesTested: measured.length,
    venuesWithCandidates: measured.filter((a) => (a.candidatesDisplayed ?? 0) > 0).length,
    candidateCoverageRate: measured.length
      ? Number((measured.filter((a) => (a.candidatesDisplayed ?? 0) > 0).length / measured.length).toFixed(2))
      : null,
    averageDisplayedPerVenue: measured.length
      ? Number((measured.reduce((n, a) => n + (a.candidatesDisplayed ?? 0), 0) / measured.length).toFixed(1))
      : null,
    noResultsRate: measured.length
      ? Number((measured.filter((a) => (a.candidatesDisplayed ?? 0) === 0).length / measured.length).toFixed(2))
      : null,
    lookupErrorRate: report.anchors.length
      ? Number((report.anchors.filter((a) => a.error).length / report.anchors.length).toFixed(2))
      : null,
  };
  report.performance = {
    latenciesMs: report.overpass.latenciesMs,
    cachedLatencyMs: measured.filter((a) => a.cacheState === 'hit').map((a) => a.latencyMs),
    uncachedLatencyMs: measured.filter((a) => a.cacheState === 'miss').map((a) => a.latencyMs),
  };
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\nwritten to ${path}`);
  console.log('\n=== the checks that must hold ===');
  /**
   * THE FIRST CHECK IS THAT THE CANARY RAN AT ALL, and it is first because the absence of it was a real
   * defect in this script. With Overpass unreachable, the run failed at the first anchor and then
   * printed seven green checks and exited 0: Google had not moved, no transit leg had been invented, no
   * duplicate shown -- all true, and all vacuous, because nothing had been measured. A canary that
   * reports success having measured nothing is worse than no canary, so coverage is asserted before
   * anything else and a single failed anchor fails the run.
   */
  const completed = report.anchors.filter((a) => !a.error);
  const failedAnchors = report.anchors.filter((a) => a.error);
  const withCandidates = completed.filter((a) => (a.candidatesDisplayed ?? 0) > 0);

  const checks = [
    [
      'every anchor was actually measured',
      completed.length === ANCHORS.length,
      `${completed.length}/${ANCHORS.length} measured` +
        (failedAnchors.length ? `; failed: ${failedAnchors.map((a) => `${a.name} (${a.error})`).join('; ')}` : ''),
    ],
    [
      'the discovery produced candidates somewhere',
      // Not "at every anchor": a genuinely sparse area returning nothing is a correct answer, and the
      // coverage rate is reported rather than asserted. But zero candidates across five London anchors
      // means the lookup is broken, not that London has no restaurants.
      withCandidates.length > 0,
      `${withCandidates.length}/${completed.length} anchors had candidates`,
    ],
    ['Google billable units unchanged', googleMoved.length === 0, JSON.stringify(report.google.delta)],
    ['no transit leg invented', !transitInvented, transitInvented ? 'a transit leg appeared' : 'none'],
    [
      'no duplicate restaurant displayed',
      duplicates === 0,
      `${duplicates} same-place duplicates` +
        `; ${report.anchors.reduce((n, a) => n + (a.sameNameDifferentPlace ?? 0), 0)} chains with ` +
        'more than one branch shown, which is correct rather than duplication',
    ],
    ['every candidate attributed to OSM', wrongProvider.length === 0, wrongProvider.map((a) => a.provider).join(',') || 'all osm'],
    ['paid route calls are zero', report.routing.paidRouteCalls === 0, `${report.routing.paidRouteCalls}`],
    [
      'the paid routing scope is refused',
      report.routing.journeysScopeEnabled === false,
      report.routing.journeysScopeEnabled ? 'ENABLED -- unexpected' : 'refused, as intended',
    ],
    ['at most one Overpass request per anchor', report.overpass.retries === 0, `${report.overpass.retries} retries`],
  ];
  let failed = 0;
  for (const [name, ok, detail] of checks) {
    console.log(`  ${ok ? '[ok]  ' : '[FAIL]'} ${name}: ${detail}`);
    if (!ok) failed += 1;
  }
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
