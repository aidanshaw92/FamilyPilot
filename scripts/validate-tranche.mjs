#!/usr/bin/env node
/**
 * Validate a tranche of independent-identity entries against the open sources they name, and against the stored Google rows (to prove none of their values
 * reached an entry). Read-only: reads local files, calls no provider, touches no database, writes only the files you name. Never writes a reviewer.
 *
 *   node scripts/validate-tranche.mjs --entries A1.json,A2.json --greenspace greenspace-london.geojson --wikidata wikidata-london.json \
 *        [--rows rows.json] [--allow allow.json] [--overrides overrides.json] [--out report.md] [--out-entries final.json] [--json result.json] [--drop failed.json]
 *
 * `--allow` is a JSON object {entryId: reason} of hygiene or batch rules a person has chosen to overrule; the entry is reported as accepted, with its reason.
 * `--overrides` is {entryId: {category, reason} | {remove: reason}}: the changes a person made during validation, each with its reason. `--out-entries` writes
 * the entries as they would be proposed after them (still unreviewed).
 * `--rows` is the private stored catalogue (id, name, lat, lng, ...). It is read for comparison only; nothing from it is written to any output.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { readWikidataFile } from './lib/open-licence.mjs';
import { sourceIndex, validateTranche } from './lib/tranche-checks.mjs';

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const entriesOf = (arg) => (arg ?? '').split(',').filter(Boolean).flatMap((p) => { const j = json(p); return Array.isArray(j) ? j : j.entries ?? []; });

export function renderValidation(result, { sources = [] } = {}) {
  const L = ['# Tranche validation', '', `${result.passed} of ${result.total} entries pass every check (registry shape, source fidelity, Google independence, selector gates, hygiene, duplicates)${result.proposed !== result.total ? `, after ${result.proposed - result.total} removed by a person (below)` : ''}.`, ''];
  const bySource = {}; const byCategory = {};
  for (const r of result.rows) { bySource[r.source] = (bySource[r.source] ?? 0) + 1; byCategory[r.category] = (byCategory[r.category] ?? 0) + 1; }
  L.push(`By source: ${Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(', ')}. By category: ${Object.entries(byCategory).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '');
  if (sources.length) L.push('Checked against: ' + sources.join('; ') + '.', '');
  if (result.removed?.length) {
    L.push(`## ${result.removed.length} entries removed during validation`, '', '| Entry | Name | Category | Reason |', '|---|---|---|---|');
    for (const r of result.removed) L.push(`| ${r.id} | ${r.name} | ${r.category} | ${r.reason} |`);
    L.push('');
  }
  if (result.changed?.length) {
    L.push(`## ${result.changed.length} entries reclassified during validation`, '', '| Entry | Name | From | To | Reason |', '|---|---|---|---|---|');
    for (const r of result.changed) L.push(`| ${r.id} | ${r.name} | ${r.from} | ${r.to} | ${r.reason} |`);
    L.push('');
  }
  if (result.accepted?.length) {
    L.push(`## ${result.accepted.length} accepted exceptions (a rule overruled, with the reason)`, '', '| Entry | Name | Rule | Reason |', '|---|---|---|---|');
    for (const f of result.accepted) L.push(`| ${f.id} | ${f.name} | ${f.problems.join('; ')} | ${f.accepted} |`);
    L.push('');
  }
  if (result.ignored?.length) L.push(`${result.ignored.length} override(s) ignored: ${result.ignored.map((i) => `${i.id} (${i.why})`).join('; ')}`, '');
  if (!result.failed.length) L.push('No entry failed a check.');
  else {
    L.push(`## ${result.failed.length} entries failed`, '', '| Entry | Name | Category | Problems |', '|---|---|---|---|');
    for (const f of result.failed) L.push(`| ${f.id} | ${f.name} | ${f.category} | ${f.problems.join('; ')} |`);
  }
  return L.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  if (!opt('--entries') || !opt('--greenspace') || !opt('--wikidata')) { console.error('need --entries, --greenspace and --wikidata (see the header of this file)'); process.exit(2); }
  const entries = entriesOf(opt('--entries'));
  const index = sourceIndex({ greenspace: json(opt('--greenspace')), wikidata: opt('--wikidata').split(',').filter(Boolean).map(readWikidataFile) });
  const stored = opt('--rows') ? json(opt('--rows')) : [];
  const result = validateTranche(entries, { index, stored, allow: opt('--allow') ? json(opt('--allow')) : {}, overrides: opt('--overrides') ? json(opt('--overrides')) : {} });
  const md = renderValidation(result, { sources: [`OS Open Greenspace extract (${index.os.size} parks)`, `Wikidata extract (${index.wd.size} items)`, stored.length ? `${stored.length} stored rows, for comparison only` : 'no stored rows given (the Google-id check was not run)'] });
  console.log(md);
  if (opt('--out')) writeFileSync(opt('--out'), `${md}\n`);
  if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(result, null, 2));
  if (opt('--out-entries')) writeFileSync(opt('--out-entries'), JSON.stringify(result.entries, null, 1));
  if (opt('--drop')) writeFileSync(opt('--drop'), JSON.stringify(result.failed.map((f) => f.id), null, 2));
  process.exit(result.failed.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
