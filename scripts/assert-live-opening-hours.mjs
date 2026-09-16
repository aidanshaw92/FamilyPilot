/**
 * Asserts that a real provider response, mapped by this branch, carries the structured schedule
 * the planner needs — and prints the mapped shape as evidence.
 *
 * The unit tests pin the mapper to Google's published discovery schema. This pins that schema to
 * what Google actually sends, which is the half a fixture can never prove.
 *
 * Reads a saved `/api/places/detail` response. Nothing here touches a credential: the endpoint
 * returns a mapped record, and its photo fields are paths to our own proxy rather than provider
 * URLs, so the output is safe to attach to a pull request.
 *
 * Usage: node scripts/assert-live-opening-hours.mjs <detail-response.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('usage: node scripts/assert-live-opening-hours.mjs <detail-response.json>');
  process.exit(2);
}

const payload = JSON.parse(readFileSync(path, 'utf8'));
const place = payload.place ?? {};
const hours = place.openingHours ?? null;

console.log('\n=== live provider evidence ===');
console.log('venue           :', place.name ?? '(none)');
console.log('familypilot id  :', place.familypilotId ?? '(none)');
console.log('provider        :', payload.provider ?? '(none)');
console.log('fallback used   :', payload.fallbackUsed === true);

// A preview that quietly served mock data would make every assertion below meaningless, so this
// is checked before anything else rather than left to look like a pass.
if (payload.provider !== 'google') {
  console.error(
    `::error::preview served "${payload.provider}" rather than google` +
      (payload.fallbackReason ? ` — ${payload.fallbackReason}` : '') +
      '. The Preview environment probably has no Google credentials, so this proves nothing.',
  );
  process.exit(1);
}

console.log('\nmapped opening_hours:');
console.log(JSON.stringify(hours, null, 2));

const periods = hours?.periods;
const checks = [
  ['mapped opening_hours is present', Boolean(hours)],
  ['periods is an array', Array.isArray(periods)],
  ['periods is non-empty where Google publishes hours', Array.isArray(periods) && periods.length > 0],
  [
    'every period has a day/hour/minute open point',
    Array.isArray(periods) &&
      periods.length > 0 &&
      periods.every(
        (p) =>
          p &&
          p.open &&
          Number.isInteger(p.open.day) &&
          p.open.day >= 0 &&
          p.open.day <= 6 &&
          Number.isInteger(p.open.hour) &&
          Number.isInteger(p.open.minute),
      ),
  ],
  [
    'closes are either absent (always open) or well-formed points',
    Array.isArray(periods) &&
      periods.every(
        (p) =>
          !p.close ||
          (Number.isInteger(p.close.day) &&
            p.close.day >= 0 &&
            p.close.day <= 6 &&
            Number.isInteger(p.close.hour) &&
            Number.isInteger(p.close.minute)),
      ),
  ],
  ['timezone mapped from timeZone.id', typeof hours?.timezone === 'string' && hours.timezone.includes('/')],
  ['utcOffsetMinutes mapped', Number.isInteger(hours?.utcOffsetMinutes)],
  ['display text still present', Array.isArray(hours?.weekdayText) && hours.weekdayText.length > 0],
];

console.log('');
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`);
}

writeFileSync(
  '/tmp/opening-hours-evidence.json',
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      venue: place.name,
      familypilotId: place.familypilotId,
      provider: payload.provider,
      openingHours: hours,
      checks: checks.map(([name, passed]) => ({ name, passed })),
    },
    null,
    2,
  ),
);

const ok = checks.every(([, passed]) => passed);
if (!ok) {
  console.error('\n::error::the live provider shape does not match what the mapper expects');
}
process.exit(ok ? 0 : 1);
