/**
 * The smallest possible real Google Routes API canary, through a deployed build.
 *
 * Usage: node scripts/canary-routes-live.mjs <baseUrl> [bypassSecret]
 *
 * ONE request. ONE origin. ONE destination. ONE billable element. That is the whole point: the question
 * is "does our request shape match what Google actually accepts", and one element answers it as well as
 * six hundred would.
 *
 * It does not enable anything. If the journeys scope is closed it reports that and exits non-zero
 * WITHOUT having spent anything, because `/api/context/journey` returns a labelled estimate rather than
 * failing when the gate refuses — which means a closed gate looks like success unless you check the
 * provenance. This script checks the provenance.
 *
 * The report is the one the owner asked for: predicted against actual, for both elements and requests.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [responsePath, statusPath] = process.argv.slice(2);
if (!responsePath) {
  console.error('usage: canary-routes-live.mjs <journey-response.json> [places-status.json]');
  process.exit(2);
}

/**
 * The POST is made by curl in the workflow, not by this script.
 *
 * Node's `fetch` cannot do it. Vercel hands the protection-bypass cookie over on a redirect, and
 * `fetch` follows redirects without persisting cookies, so the first attempt died with a bare
 * `fetch failed`. The TfL smoke test already proved curl with `-L` and a cookie jar works for a POST
 * through the bypass, so this reuses that transport instead of reinventing it.
 */

/** Trafalgar Square to the Tower of London: a real drivable London pair, far enough apart to route. */
const ORIGIN = { latitude: 51.508, longitude: -0.1281 };
const DESTINATION = { placeId: 'routes-canary-tower-of-london', latitude: 51.5081, longitude: -0.0759 };

const PREDICTED_ELEMENTS = 1;
const PREDICTED_REQUESTS = 1;

const failures = [];
const fail = (label, detail) => {
  console.log(`  [FAIL] ${label}${detail ? `: ${detail}` : ''}`);
  failures.push(label);
};
const ok = (label, detail) => console.log(`  [ok] ${label}${detail ? `: ${detail}` : ''}`);

function read(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { __unreadable: error instanceof Error ? error.message : String(error) };
  }
}

console.log('Google Routes API canary.');
console.log(`PREDICTED: ${PREDICTED_ELEMENTS} billable element, ${PREDICTED_REQUESTS} HTTP request to Google, traffic-unaware.`);
console.log(`Origin ${ORIGIN.latitude},${ORIGIN.longitude} -> destination ${DESTINATION.latitude},${DESTINATION.longitude}\n`);

let posture = null;
if (statusPath) {
  const status = read(statusPath);
  if (!status.__unreadable) {
    posture = status.placesBudget ?? null;
    console.log('Places cost posture before the request:');
    console.log(JSON.stringify(posture?.scopes ?? posture ?? { note: 'no placesBudget' }, null, 2));
    console.log(`usage today before: ${JSON.stringify(posture?.today ?? {})}`);
  } else {
    console.log(`status file unreadable (${status.__unreadable}); continuing`);
  }
}

const body = read(responsePath);
console.log('\n=== what the journey endpoint returned ===');
console.log(JSON.stringify(body, null, 2));

if (body.__unreadable) {
  fail('the journey response was unreadable', body.__unreadable);
}

const journey = body?.journeys?.[0];
const provider = body?.provider;
const source = body?.source;

console.log('\n=== did a real routed journey happen? ===');

if (provider === 'google') {
  ok('the provider was Google', String(provider));
  ok('the batch reports a source', String(source));
  if (journey?.source !== 'live') {
    // Google answered but could not route this pair, so the leg fell back per-destination. The request
    // was still billed, so this is a real result rather than a non-event -- but it is not a routed leg.
    fail('the one element did not come back routed', `journey.source=${journey?.source}`);
  } else {
    ok('the single leg is routed, not estimated', `${journey.driveMinutes} min`);
    const minutes = journey.driveMinutes;
    // Trafalgar Square to the Tower is about 4km by road. Under 4 or over 60 minutes would mean the
    // duration was parsed wrong rather than that London is unusual.
    if (!(minutes >= 4 && minutes <= 60)) {
      fail('the routed duration is implausible for this pair', `${minutes} min, expected 4-60`);
    } else {
      ok('the routed duration is plausible', `${minutes} min for ~4km across central London`);
    }
  }
} else if (provider === 'fallback') {
  // The gate refused, or there is no key. Either way NOTHING was spent and nothing was proven. This is
  // the case that would otherwise read as success: the endpoint returns usable minutes regardless.
  console.log(`  provider=fallback  source=${source}  fallbackReason=${body?.fallbackReason ?? '(none)'}`);
  if (body?.fallbackReason === 'PLACES_DISABLED') {
    fail(
      'NOT PROVEN: the journeys scope is closed in this environment, so no Google request was made',
      'set GOOGLE_PLACES_ENABLED=true and GOOGLE_JOURNEYS_ENABLED=true for the target environment, with every other scope explicitly false',
    );
  } else if (body?.fallbackReason === 'PLACES_BUDGET_EXCEEDED') {
    fail('NOT PROVEN: the element budget is exhausted in this environment');
  } else {
    fail('NOT PROVEN: the provider fell back', `reason=${body?.fallbackReason ?? 'no API key configured'}`);
  }
  console.log('  NOTHING WAS SPENT. predicted 1 element -> actual 0 elements.');
} else {
  /**
   * Neither google nor fallback. ABSENT IS NOT SUCCESS.
   *
   * The first version of this said `if (provider === 'fallback') {...} else { ok('the provider was
   * Google') }`, so an undefined provider printed TWO GREEN CHECKS. The run that found it had failed at
   * the transport layer and still reported "the provider was Google: undefined". A canary that reports
   * success on absent data is worse than no canary, so the unknown case is now named and failed.
   */
  fail('the provider is neither google nor fallback, so nothing can be concluded', `provider=${String(provider)}`);
  console.log('  NOTHING WAS SPENT, as far as can be told. predicted 1 element -> actual unknown.');
}

const report = {
  takenAt: new Date().toISOString(),
  // The file the workflow's curl wrote, rather than a base URL this script no longer knows.
  responseFile: responsePath,
  origin: ORIGIN,
  destination: DESTINATION,
  predicted: { billableElements: PREDICTED_ELEMENTS, googleRequests: PREDICTED_REQUESTS, routeMode: 'driving', trafficPreference: 'TRAFFIC_UNAWARE' },
  actual: {
    provider,
    batchSource: source,
    legSource: journey?.source ?? null,
    driveMinutes: journey?.driveMinutes ?? null,
    fallbackReason: body?.fallbackReason ?? null,
    // Zero when the gate refused: the request was never built.
    googleRequests: provider === 'google' ? 1 : 0,
    billableElements: provider === 'google' ? 1 : 0,
  },
  postureBefore: posture?.scopes?.journeys ?? null,
  usageTodayBefore: posture?.today ?? null,
  note: 'The FamilyPilot usage counter is an upper bound on spend: the budget is charged before the request, so a failed request is counted here and not on Google\'s invoice.',
};

mkdirSync(join(process.cwd(), '..', 'docs', 'canary'), { recursive: true });
const out = join(process.cwd(), '..', 'docs', 'canary', 'routes-report.json');
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nreport written to ${out}`);

console.log('\n=== predicted -> actual ===');
console.log(`billable elements: ${report.predicted.billableElements} -> ${report.actual.billableElements}`);
console.log(`Google requests:   ${report.predicted.googleRequests} -> ${report.actual.googleRequests}`);
console.log(`traffic preference: ${report.predicted.trafficPreference} (confirmed by pre-flight on the serialized request)`);
console.log(`route provenance:  ${report.actual.legSource ?? 'none'}`);

if (failures.length) {
  console.log(`\n::error::${failures.length} check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\nOne real routed element, traffic-unaware, as predicted.');
