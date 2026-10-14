#!/usr/bin/env node
/**
 * Turns an approved batch into registry files. THIS IS THE STEP THAT NEEDS A PERSON: it records who reviewed the entries, and it exists so that
 * nobody has to edit the JSON by hand. It writes nothing unless `--write` is given, never invents a reviewer, and never touches the OpenStreetMap file
 * unless `--odbl-cleared` says the steps in docs/ODBL_ASSESSMENT.md are done.
 *
 *   node scripts/apply-review.mjs --reviewer "A. Person" --date 2026-10-20 --entries A1.entries.UNREVIEWED.json,A2.entries.UNREVIEWED.json \
 *        [--keyed PRIVATE-A-A1.keyed-entries.UNREVIEWED.json]   take the continuing entries from this file instead (they carry the stored venue's id)
 *        [--drop fp-os-...,fp-wd-q...]                          leave these entries out (the exceptions you did not approve)
 *        [--out-dir server/places/data/identities] [--write] [--odbl-cleared]
 *        [--preview-only]   rehearse a release on a Preview branch: entries get the reviewer marker "PREVIEW ONLY (not a review)", which production refuses
 *
 * Every entry is checked with the registry's own validator before anything is written, and a batch with a single problem is refused whole.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const identities = require('../server/places/lib/independent-identities.js');

/** Which registry file an entry belongs in: by licence family, from the source of its identity. */
export const fileOf = (entry) => (entry.identity?.source === 'osm' || entry.location?.source === 'osm' ? 'osm' : entry.identity?.source);

/**
 * @returns {{ ok: boolean, problems: string[], files: Record<string, any[]> }} the entries by file, reviewed, or why not
 */
export const PREVIEW_MARKER = 'PREVIEW ONLY (not a review)';

export function applyReview({ entries, reviewer, date, keyed = null, drop = [], existing = {}, odblCleared = false, previewOnly = false }) {
  const problems = [];
  // A rehearsal is not a review: it carries a marker that production refuses (independent-identities.js), and it never carries a name.
  const name = previewOnly ? PREVIEW_MARKER : String(reviewer ?? '').trim();
  if (!previewOnly && (name.length < 2 || /unreviewed|simulation|preview|^test$|^claude$|assistant/i.test(name))) problems.push('a reviewer must be a named person; this tool does not write one for you');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) problems.push('a review date (YYYY-MM-DD) is required');
  if (problems.length) return { ok: false, problems, files: {} };

  const dropped = new Set(drop);
  // Continuing entries, when a keyed copy is given, replace their neutral twins one for one (same position in the list).
  let source = entries;
  if (keyed) {
    const keyedByIdentity = new Map(keyed.map((k) => [`${k.identity.source}:${k.identity.externalId}`, k]));
    source = entries.map((e) => keyedByIdentity.get(`${e.identity.source}:${e.identity.externalId}`) ?? e);
  }
  const files = { osm: [], wikidata: [], 'os-greenspace': [], 'official-site': [] };
  const seen = new Set();
  for (const raw of source) {
    if (dropped.has(raw.familypilotId) || dropped.has(`${raw.identity?.source}:${raw.identity?.externalId}`)) continue;
    const entry = { ...raw, reviewedBy: name, reviewedAt: date };
    const file = fileOf(entry);
    if (!Object.prototype.hasOwnProperty.call(files, file)) { problems.push(`${raw.familypilotId}: no registry file for source ${file}`); continue; }
    if (file === 'osm' && !odblCleared) { problems.push(`${raw.familypilotId}: OpenStreetMap entries need --odbl-cleared (the steps in docs/ODBL_ASSESSMENT.md)`); continue; }
    const problem = identities.problemWith(entry) ?? identities.fileProblem(file, entry);
    if (problem) { problems.push(`${raw.familypilotId}: ${problem}`); continue; }
    if (seen.has(entry.familypilotId)) { problems.push(`${entry.familypilotId}: appears twice in this batch`); continue; }
    seen.add(entry.familypilotId);
    files[file].push(entry);
  }
  for (const [file, list] of Object.entries(files)) {
    const have = new Set((existing[file] ?? []).map((e) => e.familypilotId));
    for (const e of list) if (have.has(e.familypilotId)) problems.push(`${e.familypilotId}: already in ${file}.json`);
  }
  return { ok: problems.length === 0, problems, files };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
  if (!opt('--entries') || !opt('--date') || (!opt('--reviewer') && !args.includes('--preview-only'))) { console.error('need --entries, --date and --reviewer (or --preview-only); see the header of this file'); process.exit(2); }
  const outDir = resolve(opt('--out-dir') ?? 'server/places/data/identities');
  const existing = {};
  for (const f of ['osm', 'wikidata', 'os-greenspace', 'official-site']) { try { existing[f] = json(join(outDir, `${f}.json`)).entries ?? []; } catch { existing[f] = []; } }
  const entries = opt('--entries').split(',').filter(Boolean).flatMap((p) => json(p));
  const r = applyReview({ entries, reviewer: opt('--reviewer'), date: opt('--date'), previewOnly: args.includes('--preview-only'), keyed: opt('--keyed') ? json(opt('--keyed')) : null, drop: (opt('--drop') ?? '').split(',').filter(Boolean), existing, odblCleared: args.includes('--odbl-cleared') });
  if (!r.ok) { console.error(`REFUSED (${r.problems.length}):\n${r.problems.slice(0, 40).map((p) => `  - ${p}`).join('\n')}`); process.exit(1); }
  for (const [file, list] of Object.entries(r.files)) if (list.length) console.log(`${file}.json: +${list.length} (now ${existing[file].length + list.length})`);
  if (!args.includes('--write')) { console.log('dry run: nothing written (add --write)'); return; }
  for (const [file, list] of Object.entries(r.files)) {
    if (!list.length) continue;
    const path = join(outDir, `${file}.json`);
    const doc = json(path);
    doc.entries = [...(doc.entries ?? []), ...list];
    writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
  }
  if (args.includes('--preview-only')) console.log('PREVIEW ONLY: these entries are a rehearsal, not a review. Do not merge this branch.');
  console.log('written. Review the diff, run the tests, and open a pull request; nothing is deployed by this tool.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
