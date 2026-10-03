/**
 * Proves a deployed build will refuse every paid Google scope.
 *
 * Usage: node scripts/assert-places-fail-closed.mjs <places-status.json> [--expect-master-off]
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
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const statusPath = args.find((a) => !a.startsWith('--'));
const expectMasterOff = args.includes('--expect-master-off');

if (!statusPath) {
  console.error('usage: assert-places-fail-closed.mjs <places-status.json> [--expect-master-off]');
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

console.log('\n=== every paid scope must refuse ===');
for (const name of names) {
  const scope = scopes[name];
  check(scope?.allowed === false, `${name} is refused`, `allowed=${scope?.allowed} reason=${scope?.reason ?? '(none)'}`);
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

// A live probe must not have happened: this is meant to be a free read.
console.log('\n=== this check spent nothing ===');
check(body.probe === null || body.probe === undefined, 'no live provider probe was made', JSON.stringify(body.probe ?? null));
check(body.probeEnabled === false, 'the probe scope is also closed', `probeEnabled=${body.probeEnabled}`);

console.log('');
if (failures.length) {
  console.log(`::error::${failures.length} fail-closed check(s) failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log(`Fail-closed confirmed: all ${names.length} Google scopes refuse in "${budget.environment}".`);
