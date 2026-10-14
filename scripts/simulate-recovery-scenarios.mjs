#!/usr/bin/env node
/**
 * What Explore and Meet halfway would serve on each date, under each way of getting through 8 November. Read-only: it reads local files, calls no provider,
 * touches no database and writes only the file you name. It uses the real reader (server/places/lib/catalogue.js), so the 30-day gate and the category
 * switch behave exactly as they would in production.
 *
 *   node scripts/simulate-recovery-scenarios.mjs --rows rows.json --a A.keyed-entries.json,A2.entries.json --b B1.entries.json,B2.entries.json \
 *        [--out scenarios.md] [--json scenarios.json] [--dates 2026-10-20,2026-11-01,...]
 *
 * `rows.json` is the stored catalogue (id, category, lat, lng, fetched, provider). Entries are counted although they say UNREVIEWED (counted for simulation
 * only; nothing is served).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { createRequire } from 'node:module';

import { simulate } from './lib/catalogue-expiry.mjs';

const require = createRequire(import.meta.url);
const identities = require('../server/places/lib/independent-identities.js');

/** Every entry through the registry's own validator, as if a person had signed it. Returns how many would be served and why the rest would not. */
export function validity(entries) {
  const problems = [];
  const signed = entries.map((e) => ({ ...e, reviewedBy: 'counted for simulation only', reviewedAt: e.reviewedAt }));
  const valid = identities.loadIdentities({ entries: signed, onProblem: (id, problem) => problems.push(`${id}: ${problem}`) });
  return { total: entries.length, valid: valid.length, problems };
}

export const DATES = ['2026-10-20', '2026-11-01', '2026-11-07', '2026-11-08', '2026-11-15', '2026-11-25', '2026-12-07'];
const CATEGORIES = ['park', 'museum', 'attraction', 'zoo', 'farm', 'activity', 'soft_play'];

/** The categories whose independent coverage is at least what Google's was, so the category can be switched to the independent files. */
export function switchable(rows, entries) {
  const stored = {}; for (const r of rows) stored[r.category] = (stored[r.category] ?? 0) + 1;
  const have = {}; for (const e of entries) have[e.category] = (have[e.category] ?? 0) + 1;
  return CATEGORIES.filter((c) => (have[c] ?? 0) >= (stored[c] ?? 0) && (have[c] ?? 0) > 0);
}

export async function scenarios({ rows, a, b, dates = DATES, refreshDate = '2026-11-07' }) {
  const refreshed = rows.map((r) => ({ ...r, fetched: refreshDate }));
  const run = (rs, entries, cutover) => simulate({ rows: rs, entries, dates, cutover, countUnreviewed: true });
  const ab = [...a, ...b];
  return [
    { id: 'S0', label: 'Do nothing', cost: '0', results: await run(rows, [], []) },
    { id: 'S1', label: 'Tranche A (CC0 and OGL), categories switched where A is at least as large as Google\'s', cost: '0', cutover: switchable(rows, a), results: await run(rows, a, switchable(rows, a)) },
    { id: 'S2', label: 'Tranches A and B (adds OpenStreetMap; needs the ODbL steps)', cost: '0', cutover: switchable(rows, ab), results: await run(rows, ab, switchable(rows, ab)) },
    { id: 'S3', label: `One-off Google refresh on ${refreshDate} alone (149 requests)`, cost: 'US$2.98 to US$3.73', results: await run(refreshed, [], []) },
    { id: 'S4', label: `Tranche A plus the one-off refresh on ${refreshDate}`, cost: 'US$2.98 to US$3.73', cutover: switchable(rows, a), results: await run(refreshed, a, switchable(rows, a)) },
  ];
}

export function renderScenarios(list, { stored }) {
  const L = ['| Scenario | Extra cost | ' + list[0].results.map((r) => r.date.slice(5)).join(' | ') + ' |', '|---|---|' + list[0].results.map(() => '---:').join('|') + '|'];
  for (const s of list) L.push(`| **${s.id}** ${s.label} | ${s.cost} | ${s.results.map((r) => r.total).join(' | ')} |`);
  L.push('', `Venues served by date (Explore and Meet halfway), from ${stored} stored rows today. Counts are venues in the 40 km scope.`);
  return L.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  if (!opt('--rows') || !opt('--a')) { console.error('need --rows and --a (see the header of this file)'); process.exit(2); }
  const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const rows = json(opt('--rows'));
  const entriesOf = (arg) => (arg ?? '').split(',').filter(Boolean).flatMap((p) => { const j = json(p); return Array.isArray(j) ? j : j.entries ?? []; });
  const list = await scenarios({ rows, a: entriesOf(opt('--a')), b: entriesOf(opt('--b')), dates: opt('--dates')?.split(',') });
  const aEntries = entriesOf(opt('--a')); const bEntries = entriesOf(opt('--b'));
  const va = validity(aEntries); const vb = validity(bEntries);
  const md = `${renderScenarios(list, { stored: rows.length })}\n\nEntries through the registry validator: tranche A ${va.valid} of ${va.total} would be served${va.problems.length ? ` (${va.problems.slice(0, 5).join('; ')})` : ''}; tranche B ${vb.valid} of ${vb.total}${vb.problems.length ? ` (${vb.problems.slice(0, 5).join('; ')})` : ''}.`;
  console.log(md);
  if (opt('--out')) writeFileSync(opt('--out'), `${md}\n`);
  if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(list, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
