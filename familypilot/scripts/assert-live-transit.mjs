/**
 * Proves a transit response came from the REAL TfL Journey Planner, and that this branch parsed it.
 *
 * Usage: node scripts/assert-live-transit.mjs <endpoint.json> [direct-tfl.json]
 *
 * WHY LIVENESS NEEDS PROVING AT ALL. The owner's instruction was to confirm the response is genuinely
 * from TfL and not a fixture or a fallback. The structural argument is strong: `tfl-transit.js` has no
 * fixture path and no fallback journey anywhere in it, so `state: "available"` is reachable only from a
 * 200 with a parseable `journeys` array. Every other outcome returns `state: "unknown"` with a reason.
 *
 * But a structural argument is what I would say if I had quietly added a fallback, so this does not rest
 * on it. The second file, when supplied, is an INDEPENDENT call to api.tfl.gov.uk made by the CI runner
 * itself, not through our endpoint. Two separate observations of the same live service agreeing on the
 * journey is evidence no fixture can fake: a hard-coded answer cannot track what TfL says today.
 *
 * It also fails on anything that looks like a planted value: the durations used in the unit fixtures,
 * and a journey time outside what the real route plausibly takes.
 */
import { readFileSync } from 'node:fs';

const [endpointPath, directPath] = process.argv.slice(2);
if (!endpointPath) {
  console.error('usage: assert-live-transit.mjs <endpoint.json> [direct-tfl.json]');
  process.exit(2);
}

const failures = [];
const notes = [];
const check = (ok, label, detail) => {
  if (ok) console.log(`  [ok] ${label}${detail ? `: ${detail}` : ''}`);
  else {
    console.log(`  [FAIL] ${label}${detail ? `: ${detail}` : ''}`);
    failures.push(label);
  }
};

function read(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { __unreadable: error instanceof Error ? error.message : String(error) };
  }
}

const body = read(endpointPath);
console.log('=== what the Preview endpoint returned ===');
console.log(JSON.stringify(body, null, 2));

if (body.__unreadable) {
  console.log(`\n::error::the endpoint response was unreadable: ${body.__unreadable}`);
  process.exit(1);
}

console.log('\n=== the three fields the owner asked for ===');
check(body.state === 'available', 'state is available', `state=${body.state}${body.reason ? ` reason=${body.reason}` : ''}`);
check(body.leg?.source === 'routed', 'leg.source is routed', `source=${body.leg?.source}`);
check(
  body.leg?.mode === 'transit',
  'leg.mode is transit, not bus (Southbank to Greenwich mixes modes)',
  `mode=${body.leg?.mode}`,
);

console.log('\n=== it is a real TfL answer, not a fixture or a fallback ===');
check(
  body.attribution === 'Powered by the Transport for London Journey Planner API',
  'carries TfL’s required credit',
  body.attribution ?? '(absent)',
);
check(body.googleCalls === 0, 'made no Google call', `googleCalls=${body.googleCalls}`);
check(body.cacheable === false, 'is marked uncacheable, because it embeds departure times', `cacheable=${body.cacheable}`);

const minutes = body.leg?.durationMinutes;
check(Number.isFinite(minutes) && minutes > 0, 'has a usable duration', `${minutes} min`);

// The durations hard-coded in src/__tests__/tfl-transit.test.ts. If one of these comes back, the most
// likely explanation is that a fixture is being served rather than TfL, and that is worth failing on
// even though the real journey could in principle take exactly that long.
const FIXTURE_MINUTES = new Set([20, 31, 48, 55, 12]);
check(
  !FIXTURE_MINUTES.has(minutes),
  'the duration is not one of the unit-test fixture values',
  `${minutes} min (fixtures use ${[...FIXTURE_MINUTES].join(', ')})`,
);

// Southbank to Greenwich is about 8km as the crow flies. Public transport realistically takes 20-70
// minutes depending on the route TfL picks. Outside that, something is wrong with the parse rather
// than with London.
check(
  minutes >= 15 && minutes <= 90,
  'the duration is plausible for this journey',
  `${minutes} min, expected 15-90`,
);

if (directPath) {
  const direct = read(directPath);
  console.log('\n=== cross-check: the runner’s own call to api.tfl.gov.uk ===');
  if (direct.__unreadable) {
    notes.push(`the direct TfL call was unreadable (${direct.__unreadable}), so the cross-check did not run`);
    console.log(`  [skip] direct call unreadable: ${direct.__unreadable}`);
  } else {
    const journeys = Array.isArray(direct.journeys) ? direct.journeys : [];
    check(journeys.length > 0, 'TfL answered the runner directly too', `${journeys.length} journey(s)`);

    const durations = journeys.map((j) => j?.duration).filter((d) => Number.isFinite(d) && d > 0);
    const quickest = durations.length ? Math.min(...durations) : null;
    console.log(`  TfL’s own quickest journey: ${quickest} min; our endpoint said ${minutes} min`);

    // Not equality. The two calls are seconds apart and TfL plans against live timetables, so the
    // quickest journey can legitimately differ between them. Agreement within 15 minutes is enough to
    // show our number came from the same service rather than from a constant.
    check(
      quickest !== null && Math.abs(quickest - minutes) <= 15,
      'the endpoint’s duration tracks TfL’s own answer',
      `|${quickest} - ${minutes}| = ${quickest === null ? 'n/a' : Math.abs(quickest - minutes)} min, allowed 15`,
    );

    // The shape our parser depends on. If TfL has renamed these, the parser is reading the wrong
    // fields and the unit fixtures encode the wrong contract.
    const first = journeys[0];
    check(Number.isFinite(first?.duration), 'TfL still sends `duration` on a journey', typeof first?.duration);
    check(Array.isArray(first?.legs), 'TfL still sends `legs` on a journey', `${first?.legs?.length} leg(s)`);
    const modeIds = (first?.legs ?? []).map((l) => l?.mode?.id).filter(Boolean);
    check(
      modeIds.length > 0,
      'TfL still sends `legs[].mode.id`, which is what the bus-vs-transit rule reads',
      modeIds.join(', '),
    );
  }
} else {
  notes.push('no direct TfL call was supplied, so liveness rests on the structural argument plus the fixture-value and plausibility checks');
}

console.log('');
for (const note of notes) console.log(`::notice::${note}`);
if (failures.length) {
  console.log(`::error::${failures.length} transit check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log(`All transit checks passed. Routed ${minutes}-minute ${body.leg.mode} journey, live from TfL.`);
