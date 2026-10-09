/**
 * Proves a deployed build will refuse every paid Google scope.
 *
 * Usage: node scripts/assert-places-fail-closed.mjs <places-status.json> [--profile=production] [--expect-master-off]
 *        [--expect-off=photos,refresh] [--expect-atomic=50,60,900]
 *
 * WHY THIS EXISTS. The Routes canary needed `GOOGLE_PLACES_ENABLED=true` and
 * `GOOGLE_JOURNEYS_ENABLED=true` in Preview for exactly one request. The owner's instruction was to
 * restore the configuration immediately afterwards and then VERIFY Preview is fail-closed again --
 * not to assert it from having edited the variables.
 *
 * Editing a Vercel environment variable is not the same event as a build observing it: values are
 * baked at build time, so the running Preview keeps the old posture until something redeploys. "I set
 * it back to false" is therefore a claim about the dashboard, not about the deployment. This reads the
 * deployment's own `/api/places/status` and fails unless every scope reports `allowed: false`.
 *
 * It makes NO provider request. `/api/places/status` without `?probe=live` reports configuration only.
 *
 * A caveat worth stating plainly: this proves the gate refuses, which is the control that stands
 * between an unset variable and a bill. It cannot prove no key exists, and it is not a substitute for
 * the Google-side quota -- the code-level controls remain defence in depth.
 *
 * TWO PROFILES, BECAUSE PRODUCTION AND PREVIEW HAVE DIFFERENT CORRECT ANSWERS.
 *
 * The first version of this took only one posture: every scope must refuse. That is right for Preview,
 * and WRONG for production, where Google Places discovery IS the product -- `masterEnabled()` defaults to
 * true when VERCEL_ENV is production precisely so the product works without a variable being set. Run
 * against production, the one-posture version reported six failures for six scopes behaving as designed.
 *
 * Being wrong about the expectation is not the same as being wrong to look, and that run is why this file
 * now has two profiles: it also found `probeEnabled: true` in production, which was a real defect. So the
 * `production` profile is NOT a relaxation. It still demands that the scopes an unset variable must never
 * open are closed, and it still fails on an empty scope map. It just stops calling the product a defect.
 */
import { readFileSync } from 'node:fs';

/**
 * The scopes that must refuse in production however the variables are set, because each is reachable
 * from a public unauthenticated endpoint and neither is something the product needs to function.
 */
const MUST_FAIL_CLOSED = ['journeys', 'probe'];

const args = process.argv.slice(2);
const statusPath = args.find((a) => !a.startsWith('--'));
const expectMasterOff = args.includes('--expect-master-off');
const profile = args.includes('--profile=production') ? 'production' : 'closed';
/**
 * Scopes an operator has switched off by name, e.g. `--expect-off=photos` after setting
 * `GOOGLE_PLACES_PHOTOS_ENABLED=false`. Setting the variable changes the dashboard; only the redeployed build's own
 * snapshot shows the running code refuses, so the change is not "done" until this passes against it.
 */
const expectOff = (args.find((a) => a.startsWith('--expect-off=')) ?? '--expect-off=')
  .slice('--expect-off='.length)
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

/**
 * `--expect-atomic=<per-scope per day>,<total per day>,<total per month>`: the deployed build must be running the
 * atomic reservation with exactly these ceilings. Like `--expect-off`, this reads the redeployed build's own snapshot,
 * because setting a Vercel variable is not the same event as a build observing it.
 */
const expectAtomicArg = args.find((a) => a.startsWith('--expect-atomic='));
const expectAtomic = expectAtomicArg ? expectAtomicArg.slice('--expect-atomic='.length).split(',').map((n) => Number(n.trim())) : null;

if (!statusPath) {
  console.error('usage: assert-places-fail-closed.mjs <places-status.json> [--profile=production] [--expect-master-off] [--expect-off=scope,...] [--expect-atomic=day,total,month]');
  process.exit(2);
}

const failures = [];
const check = (ok, label, detail) => {
  if (ok) console.log(`  [ok] ${label}${detail ? `: ${detail}` : ''}`);
  else {
    console.log(`  [FAIL] ${label}${detail ? `: ${detail}` : ''}`);
    failures.push(detail ? `${label} [${detail}]` : label);
  }
};

let body;
try {
  body = JSON.parse(readFileSync(statusPath, 'utf8'));
} catch (error) {
  console.log(`::error::the status response was unreadable: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const budget = body?.placesBudget;
if (!budget) {
  console.log('::error::the status response carried no placesBudget, so the cost posture cannot be read');
  process.exit(1);
}

console.log(`environment: ${budget.environment}`);
console.log(`masterEnabled: ${budget.masterEnabled}`);
console.log(`usage today: ${JSON.stringify(budget.today ?? {})}\n`);

const scopes = budget.scopes ?? {};
const names = Object.keys(scopes);

// An empty scope map would pass a naive "every scope is closed" loop vacuously, which is the shape of
// a check that cannot fail. The product has seven scopes; fewer means the snapshot changed and this
// assertion is reading something other than what it thinks.
check(names.length >= 7, 'the snapshot lists every scope, so the sweep below is not vacuous', `${names.length} scope(s): ${names.join(', ')}`);

if (profile === 'production') {
  console.log('\n=== production: the product\u2019s own scopes may be open; these must not be ===');
  for (const name of names) {
    const scope = scopes[name];
    if (MUST_FAIL_CLOSED.includes(name)) {
      check(
        scope?.allowed === false,
        `${name} is refused, because it is publicly reachable and nothing in the product needs it`,
        `allowed=${scope?.allowed} reason=${scope?.reason ?? '(none)'}`,
      );
    } else {
      // Reported, not asserted. These are the product.
      console.log(`  [note] ${name}: allowed=${scope?.allowed}${scope?.reason ? ` (${scope.reason})` : ''}`);
    }
  }
  // The roster has to be present for the loop above to have asserted anything about it.
  for (const name of MUST_FAIL_CLOSED) {
    check(names.includes(name), `the ${name} scope is present, so it was actually checked`, names.includes(name) ? 'yes' : 'ABSENT');
  }
} else {
  console.log('\n=== every paid scope must refuse ===');
  for (const name of names) {
    const scope = scopes[name];
    check(scope?.allowed === false, `${name} is refused`, `allowed=${scope?.allowed} reason=${scope?.reason ?? '(none)'}`);
  }
}

// Named on its own because it is the one the canary turned on, and the one whose absence used to mean
// "allowed". An unset GOOGLE_JOURNEYS_ENABLED is a refusal by `requiresExplicitEnable`; an explicit
// false is a refusal one step earlier. Either is acceptable here -- being open is not.
console.log('\n=== the journeys scope specifically ===');
check(scopes.journeys !== undefined, 'the journeys scope still exists in the snapshot', JSON.stringify(scopes.journeys ?? null));
check(scopes.journeys?.allowed === false, 'the journeys scope is fail-closed', `reason=${scopes.journeys?.reason ?? '(none)'}`);

if (expectMasterOff) {
  check(budget.masterEnabled === false, 'the master switch is off', `masterEnabled=${budget.masterEnabled}`);
}

if (expectOff.length) {
  console.log('\n=== scopes switched off by name ===');
  for (const name of expectOff) {
    // An unknown name must fail rather than pass vacuously: a typo here would otherwise "prove" nothing.
    check(names.includes(name), `the ${name} scope exists in the snapshot`, names.includes(name) ? 'yes' : 'ABSENT');
    check(scopes[name]?.allowed === false, `${name} is refused`, `allowed=${scopes[name]?.allowed} reason=${scopes[name]?.reason ?? '(none)'}`);
  }
}

if (expectAtomic) {
  console.log('\n=== atomic spending cap ===');
  const [perScope, perDayTotal, perMonthTotal] = expectAtomic;
  check(expectAtomic.length === 3 && expectAtomic.every((n) => Number.isInteger(n) && n > 0), '--expect-atomic names three positive whole numbers', expectAtomic.join(','));
  check(budget.atomicCap === true, 'the atomic reservation is on', `atomicCap=${budget.atomicCap}`);
  check(budget.maxUnitsPerDay === perScope, 'the per-scope daily ceiling is as approved', `${budget.maxUnitsPerDay} (expected ${perScope})`);
  check(budget.maxUnitsTotalPerDay === perDayTotal, 'the all-scope daily ceiling is as approved', `${budget.maxUnitsTotalPerDay} (expected ${perDayTotal})`);
  check(budget.maxUnitsTotalPerMonth === perMonthTotal, 'the all-scope monthly ceiling is as approved', `${budget.maxUnitsTotalPerMonth} (expected ${perMonthTotal})`);
}

// A live probe must not have happened: this is meant to be a free read.
console.log('\n=== this check spent nothing, and the public probe cannot spend either ===');
check(body.probe === null || body.probe === undefined, 'no live provider probe was made', JSON.stringify(body.probe ?? null));
/**
 * Asserted in BOTH profiles, and the reason is the sharpest in this file.
 *
 * `/api/places/status` is public and unauthenticated, it takes `lat` and `lng` from the query string, and
 * `probeGoogle` reaches Nearby Search with no cache in between. So a `true` here means a stranger with one
 * URL and a loop can spend the product's whole daily discovery budget and bill us for it. A live check of
 * production found exactly that, which is how the probe scope came to require its variable by name.
 */
check(body.probeEnabled === false, 'the publicly reachable live probe is closed', `probeEnabled=${body.probeEnabled}`);

console.log('');
if (failures.length) {
  console.log(`::error::${failures.length} fail-closed check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
if (profile === 'production') {
  const named = expectOff.length ? `, and ${expectOff.join(' and ')} refuse${expectOff.length === 1 ? 's' : ''} as switched off` : '';
  console.log(`Confirmed in "${budget.environment}": ${MUST_FAIL_CLOSED.join(' and ')} refuse${named}, and the public live probe is closed.`);
} else {
  console.log(`Fail-closed confirmed: all ${names.length} Google scopes refuse in "${budget.environment}".`);
}
