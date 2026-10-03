/**
 * The six confirmations the owner required BEFORE the first real Google Routes request.
 *
 * Usage: node scripts/preflight-routes-canary.mjs
 *
 * Makes ZERO requests to anything. Every confirmation is read off the code that would run, the budget
 * module's own arithmetic, or the require graph — not off a document describing them. Exits non-zero if
 * any confirmation fails, so it is a gate rather than a report.
 *
 * The point is to be able to say what the canary will cost before it costs it, and to be wrong loudly
 * rather than quietly.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(process.cwd(), '..');

const failures = [];
let n = 0;
const confirm = (ok, label, detail) => {
  const line = `${ok ? '[ok]  ' : '[FAIL]'} ${label}${detail ? ` -> ${detail}` : ''}`;
  console.log(`  ${line}`);
  if (!ok) failures.push(label);
};
const section = (title) => console.log(`\n${++n}. ${title}`);

// The canary's shape. One origin, one destination: the smallest matrix that can exist.
const CANARY_ORIGINS = 1;
const CANARY_DESTINATIONS = 1;

console.log('Routes API canary pre-flight. No request is made by this script.');

// ---------------------------------------------------------------------------------------------------
section('How many billable route-matrix elements the canary will consume');

const budget = require(resolve(root, 'server/places/lib/places-budget.js'));
const units = budget.billableUnitsFor('journeys', {
  origins: CANARY_ORIGINS,
  destinations: CANARY_DESTINATIONS,
});
confirm(
  units === 1,
  `the budget itself computes the cost of a ${CANARY_ORIGINS}x${CANARY_DESTINATIONS} matrix`,
  `${units} billable element(s)`,
);
console.log(`     PREDICTED: ${units} billable element, 1 HTTP request.`);
console.log('     At Essentials pricing ($5.00/1,000 after 10,000 free/month) that is $0.005 at most,');
console.log('     and inside the free tier it is $0.00.');

// An element-billed scope must refuse to guess. A request shape it was not told must throw rather than
// default to one, because defaulting to one is how 25 elements became 1 unit of budget.
let threwWithoutShape = false;
try {
  budget.billableUnitsFor('journeys', {});
} catch {
  threwWithoutShape = true;
}
confirm(threwWithoutShape, 'an element-billed scope refuses to guess a shape it was not given');

// ---------------------------------------------------------------------------------------------------
section('The request is TRAFFIC_UNAWARE');

const routeMatrixSource = readFileSync(resolve(root, 'server/context/lib/route-matrix.js'), 'utf8');
confirm(
  /routingPreference:\s*'TRAFFIC_UNAWARE'/.test(routeMatrixSource),
  'routingPreference is set explicitly to TRAFFIC_UNAWARE',
);

// Not just the source: the request this code actually builds. A comment cannot be billed; a body can.
const routeMatrix = require(resolve(root, 'server/context/lib/route-matrix.js'));
let built = null;
await routeMatrix
  .computeRouteMatrix(
    [{ latitude: 51.5, longitude: -0.12 }],
    [{ latitude: 51.52, longitude: -0.1 }],
    'preflight-not-a-real-key',
    {
      fetchImpl: async (url, init) => {
        built = { url: String(url), body: JSON.parse(init.body), headers: init.headers };
        return { ok: true, status: 200, json: async () => [] };
      },
    },
  )
  .catch(() => {});

confirm(built !== null, 'the request body was captured for inspection');
confirm(built?.body?.routingPreference === 'TRAFFIC_UNAWARE', 'the BUILT request body says TRAFFIC_UNAWARE', built?.body?.routingPreference);
confirm(built?.body?.travelMode === 'DRIVE', 'the built request asks for DRIVE', built?.body?.travelMode);

/**
 * The three spellings that reach the Pro tier, checked against WHAT IS SENT rather than against the
 * source text.
 *
 * The first version of this grepped the source and failed on all three -- because the module's header
 * comment explains what the legacy call used to do, and a comment naming `departure_time` is not a
 * request containing it. Grepping prose was the wrong instrument: it cannot distinguish documentation
 * from behaviour, and it would equally have passed a file that sent the field while never mentioning
 * it. The serialized request is the only thing Google can bill.
 */
const wire = `${JSON.stringify(built?.body ?? {})} ${JSON.stringify(built?.headers ?? {})}`;
for (const token of ['TRAFFIC_AWARE', 'departure_time', 'departureTime', 'duration_in_traffic']) {
  confirm(!wire.includes(token), `the request actually sent contains no ${token}`);
}

// ---------------------------------------------------------------------------------------------------
section('The request uses computeRouteMatrix');

confirm(
  built?.url === 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
  'the URL the client actually posts to',
  built?.url,
);
confirm(typeof built?.headers?.['X-Goog-FieldMask'] === 'string', 'a field mask is sent, which the API requires', built?.headers?.['X-Goog-FieldMask']);
confirm(typeof built?.headers?.['X-Goog-Api-Key'] === 'string', 'the key travels as a header, not in the URL');
confirm(!String(built?.url).includes('preflight-not-a-real-key'), 'the key is absent from the URL');

// ---------------------------------------------------------------------------------------------------
section('The application-side element budget is active');

const snapshot = budget.placesBudgetSnapshot ? budget.placesBudgetSnapshot() : null;
confirm(
  typeof budget.assertPlacesAllowed === 'function',
  'the gate function the journey provider calls exists',
);
const journeysScope = budget.SCOPES ? budget.SCOPES.journeys : null;
confirm(journeysScope?.billingUnit === 'element', 'the journeys scope bills per element, not per call', journeysScope?.billingUnit);
confirm(journeysScope?.sku === 'route_matrix', 'the SKU recorded will be route_matrix', journeysScope?.sku);
// The defect this replaced: 25 destinations consuming one unit of a 2,000-unit ceiling.
const twentyFive = budget.billableUnitsFor('journeys', { origins: 1, destinations: 25 });
confirm(twentyFive === 25, 'a 25-destination request costs 25 units of budget, not 1', `${twentyFive} units`);
if (snapshot) console.log(`     snapshot: ${JSON.stringify(snapshot)}`);

// ---------------------------------------------------------------------------------------------------
section('The journeys scope fails closed');

const savedEnv = {
  GOOGLE_PLACES_ENABLED: process.env.GOOGLE_PLACES_ENABLED,
  GOOGLE_JOURNEYS_ENABLED: process.env.GOOGLE_JOURNEYS_ENABLED,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VITEST: process.env.VITEST,
};
try {
  // Production conditions with NOTHING set: the posture production is in right now.
  delete process.env.GOOGLE_PLACES_ENABLED;
  delete process.env.GOOGLE_JOURNEYS_ENABLED;
  delete process.env.VITEST;
  process.env.VERCEL_ENV = 'production';

  const journeys = budget.describeScope('journeys');
  const discovery = budget.describeScope('discovery');
  confirm(journeys.allowed === false, 'journeys is REFUSED with no flag set', journeys.reason);
  confirm(
    /GOOGLE_JOURNEYS_ENABLED/.test(journeys.reason ?? ''),
    'refused BY NAME, rather than by inheriting the master switch',
    journeys.reason,
  );
  // The contrast that shows the fix is doing the work: an unset master switch is permissive in
  // production, so without requiresExplicitEnable journeys would be allowed here.
  confirm(discovery.allowed === true, 'discovery is ALLOWED under the same conditions, which is the contrast');
} finally {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// ---------------------------------------------------------------------------------------------------
section('No legacy Distance Matrix path can execute');

const journeyProviderPath = resolve(root, 'server/context/lib/journey-provider.js');
require(journeyProviderPath);
const seen = new Set();
const walk = (id) => {
  if (seen.has(id)) return;
  seen.add(id);
  for (const child of require.cache[id]?.children ?? []) walk(child.id);
};
walk(require.resolve(journeyProviderPath));

/**
 * Only STRING LITERALS are scanned, because only a string literal can become a request URL.
 *
 * A plain grep flagged `route-matrix.js`, whose header comment names the legacy endpoint while
 * explaining why it is not used. Stripping `//` comments instead would have been worse than useless:
 * it truncates every `https://` literal at the slashes, so the scan would have passed vacuously on a
 * file that really did contain the legacy URL. Extracting literals excludes comments by construction
 * and keeps every URL intact.
 */
function stripComments(source) {
  // Block comments first. Safe for URLs: no URL contains `/*`.
  let out = source.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Then line comments, but NOT the `//` in a scheme. Stripping `//` blindly truncates every
  // `https://` literal at the slashes, which would make this scan pass vacuously -- the worst possible
  // failure for a detector whose whole job is to find a URL.
  out = out
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
  return out;
}

function stringLiterals(source) {
  /**
   * Comments are stripped BEFORE literals are extracted, because JSDoc uses backticks for emphasis.
   *
   * The first version extracted literals straight from the source and flagged `route-matrix.js`, whose
   * header comment writes the legacy endpoint as `` `maps.googleapis.com/...` `` to explain why it is
   * NOT used. A backtick in prose is not a template literal, and a scanner that cannot tell the
   * difference reports documentation as behaviour.
   */
  const code = stripComments(source);
  const out = [];
  const pattern = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
  let match;
  while ((match = pattern.exec(code)) !== null) out.push(match[0]);
  return out;
}

const LEGACY = /maps\.googleapis\.com\/maps\/api\/distancematrix/;
const offenders = [];
let literalsScanned = 0;
for (const file of seen) {
  if (!file.startsWith(root)) continue;
  const literals = stringLiterals(readFileSync(file, 'utf8'));
  literalsScanned += literals.length;
  if (literals.some((literal) => LEGACY.test(literal))) offenders.push(file);
}

// The scan must be able to fail. A detector that cannot see a planted positive proves nothing, and an
// empty-sweep pass is exactly how the earlier canary printed seven green checks after measuring nothing.
const plantedCode = "const u = 'https://maps.googleapis.com/maps/api/distancematrix/json';";
confirm(
  stringLiterals(plantedCode).some((l) => LEGACY.test(l)),
  'the detector catches a planted legacy URL in real code',
);
// The discrimination that matters: prose naming the endpoint must NOT be flagged, or the check is
// unusable; code containing it MUST be, or the check is worthless. Both halves are asserted.
const plantedProse = [
  '/**',
  ' * The endpoint this replaces was `maps.googleapis.com/maps/api/distancematrix/json`, which is',
  ' * why nothing here calls it. See also https://routes.googleapis.com/ which IS used.',
  ' */',
  "const kept = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';",
].join('\n');
const proseLiterals = stringLiterals(plantedProse);
confirm(!proseLiterals.some((l) => LEGACY.test(l)), 'prose naming the endpoint is not mistaken for code');
confirm(
  proseLiterals.some((l) => l.includes('routes.googleapis.com/distanceMatrix')),
  'and the real endpoint literal survives comment stripping intact',
  proseLiterals.join(' | ') || '(none)',
);
confirm(literalsScanned > 10, 'literals were actually extracted and scanned', `${literalsScanned} literal(s)`);
confirm(
  offenders.length === 0,
  'no module reachable from the journey provider contains the legacy endpoint URL',
  offenders.length ? offenders.join(', ') : `${seen.size} module(s) walked`,
);
confirm(seen.size > 1, 'the walk actually traversed the graph, so a pass is not an empty sweep', `${seen.size} modules`);

const jpSource = readFileSync(journeyProviderPath, 'utf8');
confirm(!/fetchGoogleDistanceMatrix/.test(jpSource), 'the legacy client function no longer exists');
confirm(/fetchRoutedDriveTimes/.test(jpSource), 'the Routes API client is what the provider calls');

// ---------------------------------------------------------------------------------------------------
console.log('');
if (failures.length) {
  console.log(`::error::${failures.length} pre-flight confirmation(s) FAILED: ${failures.join('; ')}`);
  console.log('DO NOT run the canary until these are resolved.');
  process.exit(1);
}
console.log('All six pre-flight confirmations hold.');
console.log(`CLEARED TO SPEND: exactly ${units} billable element in 1 HTTP request, traffic-unaware.`);
