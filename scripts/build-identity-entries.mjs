#!/usr/bin/env node
/**
 * Turns the dry run's output (scripts/open-data/dry-run.mjs, pull request #206) into entries for the independent-identities registry
 * (server/places/data/identities/osm.json), and measures what they would keep discoverable. Nothing is imported: it reads local files,
 * writes to the folder you name, and the registry files in the repository are never touched.
 *
 *   node scripts/build-identity-entries.mjs --candidates candidates.jsonl --links links.jsonl --batch batch.json --out ./entries \
 *        [--stored rows.json] [--reviewed-by "Name"] [--min-confidence 0.8]
 *
 * WITHOUT --reviewed-by every entry says `reviewedBy: "UNREVIEWED (simulation only)"`, and the registry loader refuses such an entry, so
 * the output can be counted and read but never served. A person who has read the entries passes their name, and the file is then
 * a reviewed diff to commit.
 *
 * KEYS. A candidate the dry run linked to a stored place is keyed by that place's id, so a saved plan that names the venue keeps
 * working. A candidate that is not linked is keyed by its own `fp-osm-...` id. The cross-reference from an OSM-derived entry to a
 * Google-derived id is itself a question for counsel (docs/OSM_LICENCE_REVIEW.md, 4A and 6.8); this tool only reports how many there are.
 *
 * CATEGORY. The source's own tags decide the group (the dry run); this maps the group to the catalogue's categories, conservatively:
 * trampoline parks and indoor play are `activity`, never `soft_play`, because soft play must be shown by evidence, not by a tag.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { problemWith } = require('../server/places/lib/independent-identities.js');

/** [group, subtype] -> catalogue category. A subtype not listed falls back to the group's default; no default means "not served". */
export const CATEGORY_RULES = {
  parks: { default: 'park' },
  museums: { default: 'museum' },
  animals: { petting_zoo: 'farm', zoo: 'zoo', wildlife_park: 'zoo', aquarium: 'attraction', animal_attraction: 'attraction' },
  play: { trampoline_park: 'activity', indoor_play: 'activity' },
  attractions: { theme_park: 'attraction', water_park: 'attraction', ice_rink: 'activity', miniature_golf: 'activity', bowling_alley: 'activity' },
};

export function categoryFor(group, subtype) {
  const rule = CATEGORY_RULES[group];
  if (!rule) return null;
  return rule[subtype] ?? rule.default ?? null;
}

const httpsOnly = (url) => (typeof url === 'string' && /^https:\/\//i.test(url) ? url : null);

/** One registry entry from one dry-run candidate, or null when it has no served category. */
export function entryFromCandidate(candidate, batch, { linkedTo = null, reviewedBy = null } = {}) {
  const category = categoryFor(candidate.group_id, candidate.subtype);
  if (!category) return null;
  const [type, rest] = String(candidate.source_record_id).split('/');
  const sourceId = `${type}/${String(rest).split('@')[0]}`;
  const entry = {
    familypilotId: linkedTo ?? candidate.familypilot_place_id,
    name: candidate.name,
    category,
    identity: {
      source: 'osm',
      url: `https://www.openstreetmap.org/${sourceId}`,
      retrievedAt: batch.version,
      licence: 'ODbL-1.0',
      externalId: sourceId,
    },
    location: { latitude: candidate.lat, longitude: candidate.lng, source: 'osm', licence: 'ODbL-1.0' },
    reviewedBy: reviewedBy ?? 'UNREVIEWED (simulation only)',
    reviewedAt: batch.version,
  };
  const website = httpsOnly(candidate.website);
  if (website) entry.website = website;
  return entry;
}

export function buildEntries({ candidates, links, batch, stored = [], minConfidence = 0.8, reviewedBy = null }) {
  const linkByCandidate = new Map(links.map((l) => [l.open_data_place, l]));
  const storedById = new Map(stored.map((s) => [s.id, s]));
  const entries = [];
  const dropped = { noCategory: 0, invalid: [] };
  const used = new Set();
  const report = { linkedConfident: 0, linkedNeedsReview: 0, newOnly: 0 };
  // Highest confidence first, so that if two candidates claim one stored place the better match keeps it.
  const ordered = [...candidates].sort((a, b) => (linkByCandidate.get(b.familypilot_place_id)?.match_confidence ?? 0) - (linkByCandidate.get(a.familypilot_place_id)?.match_confidence ?? 0));
  for (const candidate of ordered) {
    const link = linkByCandidate.get(candidate.familypilot_place_id);
    const confident = link && link.match_confidence >= minConfidence && !link.needs_review;
    const linkedTo = confident && !used.has(link.google_place) ? link.google_place : null;
    if (linkedTo) used.add(linkedTo);
    const entry = entryFromCandidate(candidate, batch, { linkedTo, reviewedBy });
    if (!entry) { dropped.noCategory += 1; continue; }
    const problem = reviewedBy ? problemWith(entry) : problemWith({ ...entry, reviewedBy: 'checked' });
    if (problem) { dropped.invalid.push({ id: entry.familypilotId, problem }); continue; }
    entries.push(entry);
    if (linkedTo) report.linkedConfident += 1; else if (link) report.linkedNeedsReview += 1; else report.newOnly += 1;
  }
  const keptStored = [...used].filter((id) => storedById.has(id));
  const byCategory = {};
  for (const e of entries) byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
  const storedByCategory = {};
  for (const s of stored) storedByCategory[s.category] = (storedByCategory[s.category] ?? 0) + 1;
  const keptByCategory = {};
  for (const id of keptStored) { const c = storedById.get(id).category; keptByCategory[c] = (keptByCategory[c] ?? 0) + 1; }
  return { entries, dropped, report, keptStoredIds: keptStored, byCategory, storedByCategory, keptByCategory };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const need = ['--candidates', '--links', '--batch', '--out'].filter((n) => !opt(n));
  if (need.length) { console.error(`missing ${need.join(', ')}\nusage: node scripts/build-identity-entries.mjs --candidates c.jsonl --links l.jsonl --batch batch.json --out dir [--stored rows.json] [--reviewed-by NAME] [--min-confidence 0.8]`); process.exit(2); }
  const lines = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const candidates = lines(opt('--candidates'));
  const links = lines(opt('--links'));
  const batch = JSON.parse(readFileSync(opt('--batch'), 'utf8'));
  const stored = opt('--stored') ? JSON.parse(readFileSync(opt('--stored'), 'utf8')).map((r) => ({ id: r.id ?? r.familypilot_place_id, category: r.category })) : [];
  const out = buildEntries({ candidates, links, batch, stored, minConfidence: Number(opt('--min-confidence') ?? 0.8), reviewedBy: opt('--reviewed-by') ?? null });
  mkdirSync(opt('--out'), { recursive: true });
  const name = opt('--reviewed-by') ? 'osm.entries.json' : 'osm.entries.UNREVIEWED.simulation.json';
  writeFileSync(join(opt('--out'), name), JSON.stringify(out.entries, null, 1));
  const summary = {
    entries: out.entries.length, byCategory: out.byCategory, ...out.report,
    storedPlaces: stored.length, storedPlacesWithAnIndependentEntry: out.keptStoredIds.length, storedByCategory: out.storedByCategory, keptByCategory: out.keptByCategory,
    droppedNoCategory: out.dropped.noCategory, droppedInvalid: out.dropped.invalid.length,
  };
  writeFileSync(join(opt('--out'), 'entries-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`wrote ${join(opt('--out'), name)}${opt('--reviewed-by') ? '' : ' (UNREVIEWED: the registry loader will refuse it; for counting only)'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
