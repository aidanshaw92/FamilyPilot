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
const ok = unexpected.length === 0 && missing.length === 0;

if (args.json) {
  console.log(
    JSON.stringify(
      { fixture: fixturePath, total: results.length, changed: changed.length, results, unexpected, missing, ok },
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
  if (unexpected.length > 0) console.log(`UNEXPECTED changes: ${unexpected.join(', ')}`);
  if (missing.length > 0) console.log(`EXPECTED but unchanged: ${missing.join(', ')}`);
  console.log(ok ? 'RESULT: matches the intended cohort exactly' : 'RESULT: DOES NOT MATCH');
}

process.exitCode = ok ? 0 : 1;
