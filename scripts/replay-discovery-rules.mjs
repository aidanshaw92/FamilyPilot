#!/usr/bin/env node
/**
 * Replays the discovery rules (server/places/lib/places-quality.js) against stored place rows and reports, per row, whether the
 * place would still be accepted for Explore and which group it would get, before and after a rule change. READ-ONLY: it reads a
 * JSON file and prints. It makes no network request, opens no database connection and writes nothing.
 *
 * The rows are Google content, so they are NOT committed. Export them from the database with the SQL below and keep the file out
 * of the repository.
 *
 *   select familypilot_place_id as id, name, category,
 *          field_provenance->>'googlePrimaryType' as primary_type, field_provenance->'googleTypes' as types
 *   from place_records
 *   where provider = 'google' and category in ('park','museum','zoo','farm','attraction','activity','soft_play','beach');
 *
 * Usage:
 *   node scripts/replay-discovery-rules.mjs rows.json [--before path/to/old/places-quality.js] [--all]
 *
 * "Before" is the module given by --before (for example `git show main:server/places/lib/places-quality.js > /tmp/old.js`). Without
 * it, "before" is the category already stored, which the old rules wrote, and every stored row counts as accepted.
 *
 * Expectations (scripts/fixtures/discovery-replay-expectations.json) say what a person decided each known row should be. Every
 * other row is expected to be left exactly as it is, so an unexpected change is reported as a false positive and an expected change
 * that did not happen is reported as a false negative.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const rowsPath = args.find((a) => !a.startsWith('--') && a !== option('--before'));
if (!rowsPath) {
  console.error('Usage: node scripts/replay-discovery-rules.mjs rows.json [--before old-places-quality.js] [--all]');
  process.exit(2);
}

const after = require(join(here, '../server/places/lib/places-quality.js'));
const beforeModule = option('--before') ? require(resolve(option('--before'))) : null;
const rows = JSON.parse(readFileSync(rowsPath, 'utf8'));
const expectations = JSON.parse(readFileSync(join(here, 'fixtures/discovery-replay-expectations.json'), 'utf8'));

const run = (mod, row) => {
  const types = row.types ?? [];
  const accepted = mod.isSupportedForIntent(row.primary_type, types, 'explore', row.name);
  return { accepted, group: accepted ? mod.mapGoogleCategory(row.primary_type, types, row.name) : null };
};

const results = rows.map((row) => {
  const before = beforeModule ? run(beforeModule, row) : { accepted: true, group: row.category };
  const now = run(after, row);
  const expected = expectations[row.id]?.expect ?? row.category;
  const outcome = now.accepted ? now.group : 'excluded';
  return { row, before, now, expected, outcome, changed: before.accepted !== now.accepted || before.group !== now.group };
});

const label = (r) => (r.accepted ? r.group : 'REJECTED');
const changed = results.filter((r) => r.changed);
console.log(`rows replayed: ${rows.length}`);
console.log(`accepted before: ${results.filter((r) => r.before.accepted).length}   after: ${results.filter((r) => r.now.accepted).length}`);
console.log(`rows that change: ${changed.length}`);
for (const r of changed) console.log(`  ${r.row.name} | ${label(r.before)} -> ${label(r.now)} | primary ${r.row.primary_type} | expected ${r.expected}`);

const mismatches = results.filter((r) => r.outcome !== r.expected);
// A place accepted, or put in a group, that a person decided should be excluded or somewhere else.
const falsePositives = mismatches.filter((r) => r.outcome !== 'excluded');
// A place rejected that a person decided is a legitimate destination.
const falseNegatives = mismatches.filter((r) => r.outcome === 'excluded');
const undecidedChanges = changed.filter((r) => !expectations[r.row.id]);
console.log(`\nagainst the decided outcomes (${Object.keys(expectations).length} decided, every other row expected unchanged):`);
console.log(`  rows whose outcome differs from the decision: ${mismatches.length}`);
for (const r of mismatches) console.log(`    ${r.row.name}: got ${r.outcome}, decided ${r.expected}`);
console.log(`  false positives (accepted or grouped against the decision): ${falsePositives.length}`);
console.log(`  false negatives (rejected against the decision): ${falseNegatives.length}`);
console.log(`  changes nobody decided: ${undecidedChanges.length}`);

if (flag('--all')) {
  console.log('\nevery row:');
  for (const r of results) console.log(`  ${label(r.before).padEnd(10)} -> ${label(r.now).padEnd(10)} ${r.row.name}`);
}
process.exit(mismatches.length || undecidedChanges.length ? 1 : 0);
