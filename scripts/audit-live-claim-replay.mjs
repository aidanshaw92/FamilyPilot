#!/usr/bin/env node
/**
 * Replay live pushchairSuitability / freeParking claims through the current extractor.
 *
 * The point is reproducibility: the claim that "4 of 30 change and 26 do not" should be checkable
 * from the repository, not taken on trust from a report. The fixture holds each active claim as
 * production served it on 2026-09-30, together with the stored source text behind it, so running
 * this script against the working tree re-derives the before/after table from scratch.
 *
 *   node scripts/audit-live-claim-replay.mjs
 *   node scripts/audit-live-claim-replay.mjs --json
 *   node scripts/audit-live-claim-replay.mjs --fixture path/to/other.json
 *
 * Exits non-zero if the set of changed claims differs from EXPECTED_CHANGES below, so it also works
 * as a regression check rather than only as a report.
 *
 * The fixture text is public official-website content captured from `venue_source_evidence`. It is
 * inert data: it is fed to the extractor and never executed or interpreted as instructions.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const { extractEvidenceFromText, extractionSourceMeta } = require(
  resolve(repoRoot, 'server/enrichment/_lib/evidence-extractor.js'),
);

/** Claim field key -> the field name the extractor emits. */
const FIELD_BY_CLAIM_KEY = {
  pushchairSuitability: 'pushchairSuitability',
  'familyFacilities.freeParking': 'freeParking',
};

/** The only claims this correctness pass is meant to move. Anything else changing is a regression. */
const EXPECTED_CHANGES = [
  'Flip Out Canary Wharf|familyFacilities.freeParking',
  'Paradox Museum London|pushchairSuitability',
  'Stanborough Park Water Sports Centre|familyFacilities.freeParking',
  'Thorpe Park|familyFacilities.freeParking',
];

/**
 * Every claim the cohort must contain, so the run cannot pass by having fewer rows to disagree with.
 * Checking only "the changed set equals the expected four" would exit zero after deleting any of the
 * 26 unchanged rows, which is exactly the kind of quiet shrinkage this file exists to prevent.
 */
const EXPECTED_CLAIM_KEYS = [
  'Burgess Park|familyFacilities.freeParking',
  'Colne Valley Regional Park|familyFacilities.freeParking',
  'De Havilland Aircraft Museum|familyFacilities.freeParking',
  'Dulwich Park|familyFacilities.freeParking',
  'Flip Out Canary Wharf|familyFacilities.freeParking',
  'Gunnersbury Park|familyFacilities.freeParking',
  'Hatfield Park|familyFacilities.freeParking',
  'Headstone Manor and Museum|familyFacilities.freeParking',
  'Hillside Gardens Park|familyFacilities.freeParking',
  'Kentish Town City Farm|familyFacilities.freeParking',
  'Madame Tussauds London|pushchairSuitability',
  'Mayow Park|familyFacilities.freeParking',
  'Paradox Museum London|pushchairSuitability',
  'Queen Elizabeth Olympic Park|familyFacilities.freeParking',
  'Royal Air Force Museum London|familyFacilities.freeParking',
  'Royal Air Force Museum London|pushchairSuitability',
  'SEA LIFE London Aquarium|pushchairSuitability',
  'Stanborough Park Water Sports Centre|familyFacilities.freeParking',
  'Stockwood Park|familyFacilities.freeParking',
  'Sydenham Hill Wood|familyFacilities.freeParking',
  'Thorpe Park|familyFacilities.freeParking',
  'V&A East Storehouse|pushchairSuitability',
  'Verulamium Park|familyFacilities.freeParking',
  'Victoria Park|familyFacilities.freeParking',
  'Victoria and Albert Museum|pushchairSuitability',
  'Walthamstow Wetlands, London Wildlife Trust|familyFacilities.freeParking',
  'Whitechapel Gallery|familyFacilities.freeParking',
  'Woodside Animal Farm|familyFacilities.freeParking',
  'Woodside Animal Farm|pushchairSuitability',
  'Young V&A|pushchairSuitability',
];

const EXPECTED_TOTAL = 30;
const EXPECTED_PER_FIELD = { pushchairSuitability: 8, 'familyFacilities.freeParking': 22 };

/**
 * Everything that must hold for the run to be trustworthy, not just "the right four moved".
 * Each returns a list of failure strings so the report names every problem at once.
 */
function checkCohort(rows, results) {
  const failures = [];
  const keys = rows.map((r) => `${r.venue}|${r.field}`);

  if (rows.length !== EXPECTED_TOTAL) {
    failures.push(`fixture holds ${rows.length} rows, expected ${EXPECTED_TOTAL}`);
  }

  const duplicates = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  if (duplicates.length > 0) failures.push(`duplicate fixture keys: ${duplicates.join(', ')}`);

  for (const [field, expected] of Object.entries(EXPECTED_PER_FIELD)) {
    const actual = rows.filter((r) => r.field === field).length;
    if (actual !== expected) failures.push(`${field}: ${actual} claims, expected ${expected}`);
  }

  const present = new Set(keys);
  const absent = EXPECTED_CLAIM_KEYS.filter((k) => !present.has(k));
  const extra = [...present].filter((k) => !EXPECTED_CLAIM_KEYS.includes(k));
  if (absent.length > 0) failures.push(`missing from fixture: ${absent.join(', ')}`);
  if (extra.length > 0) failures.push(`unexpected in fixture: ${extra.join(', ')}`);

  // An unchanged claim must be unchanged in confidence too. A value that holds while its confidence
  // slips from high is a silent downgrade: `eligibleFact` requires high, so the claim stops being
  // published even though a value-only comparison shows nothing moved.
  for (const r of results.filter((x) => !x.changed)) {
    if (r.afterConfidence !== r.beforeConfidence) {
      failures.push(
        `${r.key}: value held at ${r.before} but confidence moved ${r.beforeConfidence} -> ${r.afterConfidence}`,
      );
    }
  }

  return failures;
}

function parseArgs(argv) {
  const args = { json: false, fixture: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--fixture') args.fixture = argv[i + 1];
  }
  return args;
}

function replay(rows) {
  return rows
    .map((row) => {
      const field = FIELD_BY_CLAIM_KEY[row.field];
      if (!field) throw new Error(`fixture row has unknown field: ${row.field}`);
      const facts = extractEvidenceFromText(
        row.text ?? '',
        extractionSourceMeta({
          url: row.url,
          sourceType: 'official_website',
          // Fixed so a rerun is byte-identical; the extractor only copies this through.
          retrievedAt: '2026-09-30T18:00:00.000Z',
          pageTitle: null,
        }),
      );
      const fact = facts.find((f) => f.field === field);
      const after = fact ? fact.value : null;
      return {
        key: `${row.venue}|${row.field}`,
        venue: row.venue,
        field: row.field,
        before: row.value,
        beforeConfidence: row.confidence,
        after,
        afterConfidence: fact ? fact.confidence : null,
        changed: after !== row.value,
      };
    })
    .sort((a, b) => a.field.localeCompare(b.field) || a.venue.localeCompare(b.venue));
}

const args = parseArgs(process.argv.slice(2));
const fixturePath = args.fixture
  ? resolve(process.cwd(), args.fixture)
  : resolve(repoRoot, 'docs/snapshots/live-fact-correctness-2026-09-30/replay-input.json');

const rows = JSON.parse(readFileSync(fixturePath, 'utf8'));
const results = replay(rows);
const changed = results.filter((r) => r.changed);
const changedKeys = changed.map((r) => r.key).sort();

const unexpected = changedKeys.filter((k) => !EXPECTED_CHANGES.includes(k));
const missing = EXPECTED_CHANGES.filter((k) => !changedKeys.includes(k));
const cohortFailures = checkCohort(rows, results);
const ok = unexpected.length === 0 && missing.length === 0 && cohortFailures.length === 0;

if (args.json) {
  console.log(
    JSON.stringify(
      {
        fixture: fixturePath,
        total: results.length,
        changed: changed.length,
        results,
        unexpected,
        missing,
        cohortFailures,
        ok,
      },
      null,
      2,
    ),
  );
} else {
  const pad = (value, width) => String(value ?? '(none)').padEnd(width).slice(0, width);
  for (const field of Object.keys(FIELD_BY_CLAIM_KEY)) {
    const group = results.filter((r) => r.field === field);
    if (group.length === 0) continue;
    console.log(`\n=== ${field} (${group.length} active claims) ===`);
    console.log(pad('venue', 44), pad('before', 16), pad('after', 16), 'changed');
    for (const r of group) {
      console.log(
        pad(r.venue, 44),
        pad(`${r.before}/${r.beforeConfidence}`, 16),
        pad(r.after ? `${r.after}/${r.afterConfidence}` : '(no fact)', 16),
        r.changed ? '** YES' : 'no',
      );
    }
    console.log(`changed: ${group.filter((r) => r.changed).length} of ${group.length}`);
  }
  console.log(`\ntotal: ${changed.length} changed of ${results.length}`);
  console.log(
    `cohort: ${results.length}/${EXPECTED_TOTAL} claims, ` +
      Object.entries(EXPECTED_PER_FIELD)
        .map(([f, n]) => `${f} ${results.filter((r) => r.field === f).length}/${n}`)
        .join(', ') +
      `, no duplicate keys, ${results.length - changed.length} unchanged in value and confidence`,
  );
  if (unexpected.length > 0) console.log(`UNEXPECTED changes: ${unexpected.join(', ')}`);
  if (missing.length > 0) console.log(`EXPECTED but unchanged: ${missing.join(', ')}`);
  for (const failure of cohortFailures) console.log(`COHORT FAILURE: ${failure}`);
  console.log(ok ? 'RESULT: matches the intended cohort exactly' : 'RESULT: DOES NOT MATCH');
}

process.exitCode = ok ? 0 : 1;
