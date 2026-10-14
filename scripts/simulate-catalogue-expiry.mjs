/**
 * How many venues Explore and Meet halfway serve on a given day, with today's 30-day gate alone and with the reviewed independent list.
 * Read-only: it reads two JSON files you give it and prints a table. It touches no database, calls no provider and writes nothing.
 *
 *   node scripts/simulate-catalogue-expiry.mjs --rows rows.json [--registry entries.json] [--dates 2026-10-20,2026-11-01,2026-11-08] [--json]
 *        [--cutover park,museum,...]  serve those categories from the entries instead of Google
 *        [--count-unreviewed]         count entries marked UNREVIEWED (simulation output); nothing is served
 *
 * `rows.json` is an array of { id, category, lat, lng, fetched, provider } (the non-content columns of place_records).
 * `entries.json` is an array of independent entries (the `entries` of server/places/data/identities/*.json); default: the shipped files.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { simulate } from './lib/catalogue-expiry.mjs';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const rowsPath = flag('rows');
if (!rowsPath) {
  console.error('usage: node scripts/simulate-catalogue-expiry.mjs --rows rows.json [--registry entries.json] [--dates a,b,c] [--cutover cats] [--count-unreviewed] [--json]');
  process.exit(2);
}
const rows = JSON.parse(readFileSync(rowsPath, 'utf8'));
const registryPath = flag('registry');
const entries = registryPath
  ? (() => { const parsed = JSON.parse(readFileSync(registryPath, 'utf8')); return Array.isArray(parsed) ? parsed : parsed.entries ?? []; })()
  : require('../server/places/lib/independent-identities.js').shippedEntries();
const dates = (flag('dates') ?? '2026-10-20,2026-11-01,2026-11-08').split(',');

const cutover = (flag('cutover') ?? '').split(',').filter(Boolean);
const results = await simulate({ rows, entries, dates, cutover, countUnreviewed: args.includes('--count-unreviewed') });
if (args.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log(`${rows.length} stored rows, ${entries.length} independent entries\n`);
  console.log('date        google-only  +independent  total  on a map  list only');
  for (const r of results) {
    console.log(`${r.date}  ${String(r.googleOnly).padStart(11)}  ${String(r.independentAdded).padStart(12)}  ${String(r.total).padStart(5)}  ${String(r.plottable).padStart(8)}  ${String(r.listOnly).padStart(9)}`);
  }
  console.log('\nby category (with the independent list):');
  for (const r of results) console.log(`${r.date}  ${Object.entries(r.byCategory).sort().map(([k, v]) => `${k} ${v}`).join(', ') || '(none)'}`);
}
