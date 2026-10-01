#!/usr/bin/env node
/**
 * Replay stored page text through the current extractor and diff the facts it yields.
 *
 * The contamination fix changes what text reaches the field extractors, so the question that matters
 * is not "is the text cleaner" but "does any fact change, and is every change an improvement". This
 * re-derives that answer from the repository: the fixture holds real `venue_source_evidence` rows as
 * production stored them on 2026-10-01, one per contamination class plus the rows whose facts move
 * plus clean controls that must not move at all.
 *
 *   node scripts/audit-extraction-replay.mjs
 *   node scripts/audit-extraction-replay.mjs --json
 *
 * Exits non-zero if any fact is LOST, if the changed/gained set differs from EXPECTED below, if a
 * control row moves, or if the cohort is not exactly the pinned 14 rows.
 *
 * Limitation, stated plainly: the fixture holds extracted TEXT, not the original HTML, because raw
 * HTML is not retained. So this exercises `extractRelevantParagraphs` -- the chunk cleaning, residue
 * stripping and dedupe -- but not `removeNonContentElements`, which needs HTML and is covered by unit
 * tests instead. Element removal only ever deletes contamination, so the real post-deploy text is at
 * least as clean as this replay assumes, and the production check after the re-crawl is what confirms
 * it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { extractRelevantParagraphs } = require(
  resolve(repoRoot, 'server/enrichment/_lib/html-text-extractor.js'),
);
const { extractEvidenceFromText, extractionSourceMeta } = require(
  resolve(repoRoot, 'server/enrichment/_lib/evidence-extractor.js'),
);

/** Facts that must change, and exactly these. Each was reviewed individually; see audit.md. */
const EXPECTED_CHANGED = [
  'sydenham wheelchair flip|wheelchairAccessible|wheelchairAccessible=yes/high|wheelchairAccessible=no/high',
  'saatchi parking flip|parking|parking=yes/high|parking=no/high',
];
const EXPECTED_GAINED = [
  'swanley gained freeParking=no|freeParking=no/high',
  'swanley home gained|freeParking=no/high',
];
/**
 * Rows whose facts must be byte-identical before and after, AND must still be the facts named here.
 *
 * Checking only for movement was not enough: replacing a control's text with filler produced no facts
 * on either side, so nothing "moved" and the tamper check passed. Pinning the fact each control must
 * yield closes that. One earlier control was dropped for the same reason -- Flip Out Brent Cross's
 * fact comes from its page TITLE, which stored text does not contain, so it yielded nothing and proved
 * nothing.
 */
const CONTROL_FACTS = {
  'clean control: mudchute faq': ['cafe=yes/high'],
  'clean control: graffiti tunnel parking': ['parking=no/high'],
  'clean control: courtauld cafe': ['cafe=yes/high'],
  'clean control: flip out brent cross faq': ['parking=no/high', 'wheelchairAccessible=yes/high'],
};
const CONTROL_LABELS = Object.keys(CONTROL_FACTS);
const EXPECTED_ROWS = 14;

const args = new Set(process.argv.slice(2));
const fixturePath = resolve(repoRoot, 'docs/snapshots/extraction-quality-2026-10-01/replay-input.json');
const rows = JSON.parse(readFileSync(fixturePath, 'utf8'));

const key = (f) => `${f.field}=${f.value}/${f.confidence}`;
const meta = (url) =>
  extractionSourceMeta({
    url,
    sourceType: 'official_website',
    retrievedAt: '2026-10-01T00:00:00.000Z',
    pageTitle: null,
  });

const lost = [];
const changed = [];
const gained = [];
const movedControls = [];

for (const row of rows) {
  const before = extractEvidenceFromText(row.t, meta(row.url));
  const after = extractEvidenceFromText(extractRelevantParagraphs(row.t), meta(row.url));
  const b = new Map(before.map((f) => [f.field, f]));
  const a = new Map(after.map((f) => [f.field, f]));
  let moved = false;

  for (const [field, bf] of b) {
    const af = a.get(field);
    if (!af) {
      lost.push(`${row.label}|${field}|${key(bf)}`);
      moved = true;
    } else if (key(af) !== key(bf)) {
      changed.push(`${row.label}|${field}|${key(bf)}|${key(af)}`);
      moved = true;
    }
  }
  for (const [field, af] of a) {
    if (!b.has(field)) {
      gained.push(`${row.label}|${key(af)}`);
      moved = true;
    }
  }
  if (moved && CONTROL_LABELS.includes(row.label)) movedControls.push(`${row.label} (facts moved)`);
  if (CONTROL_FACTS[row.label]) {
    const got = new Set([...a.values()].map(key));
    for (const required of CONTROL_FACTS[row.label]) {
      if (!got.has(required)) movedControls.push(`${row.label} (lost ${required})`);
    }
  }
}

const failures = [];
if (rows.length !== EXPECTED_ROWS) failures.push(`fixture has ${rows.length} rows, expected ${EXPECTED_ROWS}`);
const ids = rows.map((r) => r.id);
if (new Set(ids).size !== ids.length) failures.push('duplicate row ids in fixture');
const labels = rows.map((r) => r.label);
for (const label of [...CONTROL_LABELS, ...EXPECTED_CHANGED.map((e) => e.split('|')[0])]) {
  if (!labels.includes(label)) failures.push(`fixture is missing the row labelled "${label}"`);
}
if (lost.length > 0) failures.push(`facts LOST: ${lost.join('; ')}`);
for (const c of changed) if (!EXPECTED_CHANGED.includes(c)) failures.push(`unexpected change: ${c}`);
for (const e of EXPECTED_CHANGED) if (!changed.includes(e)) failures.push(`expected change missing: ${e}`);
for (const g of gained) if (!EXPECTED_GAINED.includes(g)) failures.push(`unexpected gain: ${g}`);
for (const e of EXPECTED_GAINED) if (!gained.includes(e)) failures.push(`expected gain missing: ${e}`);
if (movedControls.length > 0) failures.push(`control rows moved: ${movedControls.join(', ')}`);

const ok = failures.length === 0;

if (args.has('--json')) {
  console.log(JSON.stringify({ rows: rows.length, lost, changed, gained, failures, ok }, null, 2));
} else {
  console.log(`cohort: ${rows.length}/${EXPECTED_ROWS} pinned evidence rows, ${CONTROL_LABELS.length} of them controls`);
  console.log(`lost: ${lost.length}   changed: ${changed.length}   gained: ${gained.length}`);
  for (const c of changed) console.log(`  CHANGED ${c}`);
  for (const g of gained) console.log(`  GAINED  ${g}`);
  for (const f of failures) console.log(`FAILURE: ${f}`);
  console.log(ok ? 'RESULT: matches the reviewed expectation exactly' : 'RESULT: DOES NOT MATCH');
}

process.exitCode = ok ? 0 : 1;
