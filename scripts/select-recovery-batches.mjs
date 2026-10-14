#!/usr/bin/env node
/**
 * Prepares the two first recovery batches for a person to review, from the dry run's output (scripts/open-data/dry-run.mjs, #206). Reads local files,
 * writes to the folder you name, calls nothing and imports nothing. Every entry it writes says `UNREVIEWED`, which the registry loader refuses to serve.
 *
 *   node scripts/select-recovery-batches.mjs --candidates c.jsonl --links l.jsonl --batch batch.json --stored rows.json --out dir \
 *        [--wikidata a.json,b.json] [--greenspace greenspace.geojson] [--site-checks s.json] [--private-out dir] [--target 200] [--seed 7]
 *
 * `--stored` is the JSON from scripts/replay-discovery-rules.mjs's SQL plus lat and lng. It is Google content: it is used only to compute match numbers
 * (name similarity, distance, category agreement) and to flag possible duplicates; no stored name or position is written.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { entryFromCandidate } from './build-identity-entries.mjs';
import { AREAS, DEFAULT_MIN_SCORE, areaOf, categoryOf, continuityRows, corroborate, csv, greenspaceIndex, haversineKm, scoreNew, selectBatch2, wikidataItems } from './lib/recovery-select.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { tokenOverlapScore } = require('../server/places/lib/venue-alias-detection.js');

/** Names that suggest a place a person should look at twice. A hint for the reviewer, never a rejection. */
export function doubts(c, scoredRow) {
  const out = [];
  if (/\b(cemetery|churchyard|burial)\b/i.test(c.name)) out.push('a burial ground');
  if (/\b(golf|cricket|bowling|tennis)\b/i.test(c.name) && c.group_id === 'parks') out.push('may be a club ground');
  if (/\b(square|gardens?)$/i.test(c.name) && (c.area_ha ?? 0) < 2 && c.group_id === 'parks' && c.playground_inside !== true) out.push('a small garden: may be for keyholders only');
  if (/\b(estate|housing|flats)\b/i.test(c.name)) out.push('a housing estate name');
  if (c.group_id === 'attractions' && !c.website) out.push('an attraction with no website of its own');
  if (scoredRow && !scoredRow.secondSource) out.push('no second source: own website only');
  return out;
}

export function buildBatches({ candidates, links, batch, stored, wikidata = [], greenspace = [], siteChecks = {}, target = 200, seed = 7 }) {
  const linked = new Set(links.map((l) => l.open_data_place));
  const wikidataByQ = new Map(wikidata.map((w) => [w.q, w]));

  // ---- batch 1
  const { rows: contRows, unmatched } = continuityRows({ candidates, links, stored });
  const batch1 = contRows.filter((r) => r.confident);
  const compare = contRows.filter((r) => !r.confident);

  // ---- batch 2: new places only, scored, then selected
  const newOnes = candidates.filter((c) => !linked.has(c.familypilot_place_id));
  const storedPts = stored.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng }));
  const scored = [];
  for (const c of newOnes) {
    const category = categoryOf(c);
    if (!category) continue;
    const corr = corroborate(c, { wikidata, wikidataByQ, greenspace });
    const s = scoreNew(c, corr, siteChecks[osmUrl(c)] ?? null);
    scored.push({ c, category, area: areaOf(c.lat, c.lng), corr, ...s });
  }
  const { picked, eligible } = selectBatch2(scored, { target });
  const reserve = scored.filter((s) => s.independent && s.score >= (DEFAULT_MIN_SCORE[s.category] ?? DEFAULT_MIN_SCORE.default) && !picked.includes(s)).sort((a, b) => b.score - a.score).slice(0, 100);

  // ---- exceptions on the picked set
  for (const s of picked) {
    s.flags = doubts(s.c, s);
    const nearStored = storedPts.find((p) => haversineKm(s.c.lat, s.c.lng, p.lat, p.lng) < 0.15);
    if (nearStored) { s.nearStored = nearStored; s.flags.push('within 150 m of a place we already hold: possible duplicate (which one is in the private review folder)'); }
    const nearPicked = picked.find((o) => o !== s && o.category === s.category && haversineKm(s.c.lat, s.c.lng, o.c.lat, o.c.lng) < 0.12 && tokenOverlapScore(s.c.name, o.c.name) >= 0.5);
    if (nearPicked) s.flags.push(`within 120 m of ${nearPicked.c.name}: possible duplicate in this batch`);
  }

  // ---- coverage
  const grid = (items, areaOfItem, catOfItem) => {
    const g = {}; for (const a of AREAS) g[a] = {};
    for (const it of items) { const a = areaOfItem(it); const c = catOfItem(it); g[a][c] = (g[a][c] ?? 0) + 1; }
    return g;
  };
  const coverage = {
    batch1ByCategory: Object.fromEntries(Object.entries(batch1.reduce((m, r) => ((m[r.category] = (m[r.category] ?? 0) + 1), m), {}))),
    batch2ByCategory: picked.reduce((m, s) => ((m[s.category] = (m[s.category] ?? 0) + 1), m), {}),
    batch2ByArea: picked.reduce((m, s) => ((m[s.area] = (m[s.area] ?? 0) + 1), m), {}),
    batch2Grid: grid(picked, (s) => s.area, (s) => s.category),
    batch1ByArea: batch1.reduce((m, r) => { const a = areaOf(r.candidate.lat, r.candidate.lng); m[a] = (m[a] ?? 0) + 1; return m; }, {}),
    storedByArea: stored.reduce((m, s) => { const a = areaOf(s.lat, s.lng); m[a] = (m[a] ?? 0) + 1; return m; }, {}),
    eligibleForBatch2: eligible,
    newCandidates: newOnes.length,
  };

  // ---- entries (UNREVIEWED)
  const e1 = batch1.map((r) => entryFromCandidate(r.candidate, batch, { linkedTo: r.storedId })).filter(Boolean);
  const e2 = picked.map((s) => entryFromCandidate(s.c, batch)).filter(Boolean);

  // ---- a representative sample for the reviewer: stratified, seeded
  let x = seed >>> 0; const rnd = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  const take = (items, n) => [...items].map((it) => ({ it, k: rnd() })).sort((a, b) => a.k - b.k).slice(0, n).map((o) => o.it);
  const sample2 = []; const byCat = {};
  for (const s of picked) (byCat[s.category] ??= []).push(s);
  for (const cat of Object.keys(byCat)) sample2.push(...take(byCat[cat], Math.min(byCat[cat].length, Math.max(2, Math.round((byCat[cat].length / picked.length) * 30)))));
  const sample1 = take(batch1, Math.min(15, batch1.length));
  const unmatchedIds = new Set(unmatched.map((u) => u.id));
  const compareOnUnmatched = compare.filter((x) => unmatchedIds.has(x.storedId));
  const recoverableByComparison = new Set(compareOnUnmatched.map((x) => x.storedId)).size;
  const unmatchedByCategory = {};
  for (const u of unmatched) if (!compareOnUnmatched.some((x) => x.storedId === u.id)) unmatchedByCategory[u.category] = (unmatchedByCategory[u.category] ?? 0) + 1;
  return { batch1, compare, unmatched, unmatchedByCategory, recoverableByComparison, compareLinksOnUnmatched: compareOnUnmatched.length, picked, reserve, coverage, entries: { batch1: e1, batch2: e2 }, sample: { batch1: sample1, batch2: sample2 } };
}

export const osmUrl = (c) => { const [t, rest] = String(c.source_record_id).split('/'); return `https://www.openstreetmap.org/${t}/${String(rest).split('@')[0]}`; };

/** The id an entry carries in the files that can be published: the open-data id, never a Google place id. */
export const publicIdOf = (x) => x.candidate.familypilot_place_id;

/**
 * `out` is for the repository: OpenStreetMap-derived rows and our own numbers, with no Google place id, name or position (the ODbL memo, section 3.3:
 * keep Google out of the file that may have to be published). `privateOut`, when given, takes the cross-reference from each stored venue to its entry
 * and the stored names, which are Google content; it is for the person reviewing, never for the repository.
 */
export function writeOutputs(out, r, { version, privateOut } = {}) {
  mkdirSync(out, { recursive: true });
  const w = (name, text) => writeFileSync(join(out, name), text);
  const row1 = (x) => ({ entry_id: publicIdOf(x), osm_record: osmUrl(x.candidate), osm_name: x.candidate.name, category: x.category, stored_category: x.storedCategory, osm_lat: x.candidate.lat, osm_lng: x.candidate.lng, area: areaOf(x.candidate.lat, x.candidate.lng), name_similarity: x.nameSimilarity, distance_m: x.distanceM, confidence: x.confidence, flags: x.flags });
  const c1 = ['entry_id', 'osm_record', 'osm_name', 'category', 'stored_category', 'osm_lat', 'osm_lng', 'area', 'name_similarity', 'distance_m', 'confidence', 'flags'];
  w('batch1-continuity.csv', csv(r.batch1.map(row1), c1));
  w('batch1-needs-comparison.csv', csv(r.compare.map(row1), c1));
  const row2 = (s) => ({ osm_record: osmUrl(s.c), osm_name: s.c.name, category: s.category, subtype: s.c.subtype, area: s.area, osm_lat: s.c.lat, osm_lng: s.c.lng, score: s.score, signals: s.signals, wikidata: s.corr.wikidata ? `${s.corr.wikidata.q} ${s.corr.wikidata.label}` : '', os_greenspace: s.corr.os ? `${s.corr.os.function}: ${s.corr.os.name}` : '', website: s.c.website ?? '', area_ha: s.c.area_ha ?? '', playground_mapped_inside: s.c.playground_inside ?? '', flags: s.flags ?? [] });
  const c2 = ['osm_record', 'osm_name', 'category', 'subtype', 'area', 'osm_lat', 'osm_lng', 'score', 'signals', 'wikidata', 'os_greenspace', 'website', 'area_ha', 'playground_mapped_inside', 'flags'];
  w('batch2-new.csv', csv(r.picked.map(row2), c2));
  w('batch2-reserve.csv', csv(r.reserve.map((s) => row2({ ...s, flags: doubts(s.c, s) })), c2));
  const idByStored = new Map(r.batch1.map((x) => [x.storedId, publicIdOf(x)]));
  w('batch1.entries.UNREVIEWED.json', JSON.stringify(r.entries.batch1.map((e) => ({ ...e, familypilotId: idByStored.get(e.familypilotId) ?? e.familypilotId })), null, 1));
  w('batch2.entries.UNREVIEWED.json', JSON.stringify(r.entries.batch2, null, 1));
  w('coverage.json', JSON.stringify(r.coverage, null, 2));
  w('review-sample.md', renderSample(r, version));
  w('SUMMARY.md', renderSummary(r, version));
  if (privateOut) {
    mkdirSync(privateOut, { recursive: true });
    const wp = (name, text) => writeFileSync(join(privateOut, name), text);
    const alias = (x) => ({ stored_place_id: x.storedId, stored_name: x.storedName, stored_category: x.storedCategory, entry_id: publicIdOf(x), osm_record: osmUrl(x.candidate), osm_name: x.candidate.name, name_similarity: x.nameSimilarity, distance_m: x.distanceM, flags: x.flags });
    const ca = ['stored_place_id', 'stored_name', 'stored_category', 'entry_id', 'osm_record', 'osm_name', 'name_similarity', 'distance_m', 'flags'];
    wp('PRIVATE-alias-map.csv', csv(r.batch1.map(alias), ca));
    const compareIds = new Map();
    for (const x of r.compare) if (!compareIds.has(x.storedId)) compareIds.set(x.storedId, x);
    const un = r.unmatched.map((u) => ({ stored_place_id: u.id, stored_name: u.name, stored_category: u.category, comparison_candidate: compareIds.has(u.id) ? osmUrl(compareIds.get(u.id).candidate) : '', candidate_name: compareIds.has(u.id) ? compareIds.get(u.id).candidate.name : '' }));
    wp('PRIVATE-unmatched.csv', csv(un, ['stored_place_id', 'stored_name', 'stored_category', 'comparison_candidate', 'candidate_name']));
    const dupes = r.picked.filter((x) => x.nearStored).map((x) => ({ osm_record: osmUrl(x.c), osm_name: x.c.name, stored_place_id: x.nearStored.id, stored_name: x.nearStored.name }));
    wp('PRIVATE-possible-duplicates.csv', csv(dupes, ['osm_record', 'osm_name', 'stored_place_id', 'stored_name']));
    wp('README.txt', 'Google content (stored names) and the link from each stored place ID to its entry. Do not commit, publish or paste into a public place. Kept only so the reviewer can see which existing venue each entry continues.\n');
  }
}

function renderSample(r, version) {
  const L = [`# Representative sample to review (${version})`, '', 'Tick or strike each line against its source link. A reviewer who accepts the batch is vouching for this sample, so it is drawn at random (seeded) and by category, not hand-picked.', '', '## Batch 1: continuing a venue we already hold', ''];
  for (const x of r.sample.batch1) L.push(`- [ ] **${x.candidate.name}** (${x.category}) [${osmUrl(x.candidate)}](${osmUrl(x.candidate)}) continues an existing venue (entry \`${publicIdOf(x)}\`): ${x.distanceM} m apart, name similarity ${x.nameSimilarity}${x.flags.length ? `, **${x.flags.join('; ')}**` : ''}`);
  L.push('', '## Batch 2: new places', '');
  for (const s of r.sample.batch2) L.push(`- [ ] **${s.c.name}** (${s.category}, ${s.area}) [${osmUrl(s.c)}](${osmUrl(s.c)}): ${s.signals.join('; ')}${s.flags?.length ? `. **Check: ${s.flags.join('; ')}**` : ''}`);
  return L.join('\n') + '\n';
}

function renderSummary(r, version) {
  const c = r.coverage;
  const rowsOf = (g) => AREAS.map((a) => `| ${a} | ${Object.entries(g[a]).map(([k, v]) => `${k} ${v}`).join(', ') || '-'} | ${Object.values(g[a]).reduce((s, v) => s + v, 0)} |`);
  const exceptions = r.picked.filter((s) => s.flags?.length);
  const L = [`# Recovery batches, ${version}`, '', '**Nothing here is imported, served or signed off.** Every entry is marked `UNREVIEWED`; the registry loader refuses it. A reviewer puts their name on a batch, not me.', '',
    `**Batch 1: ${r.batch1.length} entries that continue a venue we already hold** (a confident match on name and position; ${r.batch1.filter((x) => x.flags.length).length} of them carry a flag to look at). Of the ${r.batch1.length + r.unmatched.length} stored venues, ${r.unmatched.length} have no confident match: ${r.recoverableByComparison} of those have a candidate a person could confirm (\`batch1-needs-comparison.csv\`, which also lists ${r.compare.length - r.compareLinksOnUnmatched} alternative links to venues already matched), and ${r.unmatched.length - r.recoverableByComparison} have no independent candidate at all (by category: ${Object.entries(r.unmatchedByCategory).map(([k, v]) => `${k} ${v}`).join(', ')}; the list, with names, is in the private review folder, not here).`,
    `**Batch 2: ${r.picked.length} new destinations** chosen from ${c.newCandidates} new candidates, ${c.eligibleForBatch2} of which have enough independent evidence (a score of 3 for parks and museums, 2 for the rest, and a source that is not OpenStreetMap alone). A reserve of ${r.reserve.length} is in \`batch2-reserve.csv\`.`, '',
    '## Batch 2 coverage', '', '| Area | Categories | Total |', '|---|---|---:|', ...rowsOf(c.batch2Grid), '',
    `By category: ${Object.entries(c.batch2ByCategory).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '',
    `Batch 1 by category: ${Object.entries(c.batch1ByCategory).map(([k, v]) => `${k} ${v}`).join(', ')}. By area: ${Object.entries(c.batch1ByArea).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '',
    `Stored venues by area today (counts only): ${Object.entries(c.storedByArea).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '',
    '## How each batch-2 place earned its place', '', 'A score from: a Wikidata item (CC0) or an OS Open Greenspace polygon (OGL) that agrees on the name and place (2 each); the venue\'s own website in the source (1) and, where its page was fetched once and names the venue, 1.5 more; a Wikipedia article (1); a mapped playground inside a park (1); a park of 3 hectares or more (1); opening hours or a fee stated (0.5). For activities, farms, zoos and attractions, where those sources hardly reach, the venue\'s own page, fetched and checked, is the independent source. The batch stops when the evidence runs out; it is never padded to a target. Quality gates have already held back clubs, schools, shops, places of worship, commercial galleries and memorials (`docs/OPEN_DATA_FIRST_EXTRACT.md`).', '',
    `## Exceptions to look at (${exceptions.length} of ${r.picked.length})`, '', ...(exceptions.length ? exceptions.map((s) => `- **${s.c.name}** (${s.category}, ${s.area}): ${s.flags.join('; ')}`) : ['None.']), '',
    '## What this does not say', '', 'An independent identity is a name, a category and a position from a source with a licence. It is **not** a claim that the place has toilets, opens at any hour, is open today or suits a child of any age. Those stay "not yet reviewed" until our own evidence says otherwise.', ''];
  return L.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const need = ['--candidates', '--links', '--batch', '--stored', ...(opt('--site-check-input') ? [] : ['--out'])].filter((n) => !opt(n));
  if (need.length) { console.error(`missing ${need.join(', ')}`); process.exit(2); }
  const lines = (p) => readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const stored = JSON.parse(readFileSync(opt('--stored'), 'utf8')).map((s) => ({ id: s.id ?? s.familypilot_place_id, name: s.name, category: s.category, lat: Number(s.lat), lng: Number(s.lng) }));
  const wikidata = wikidataItems((opt('--wikidata') ?? '').split(',').filter(Boolean).map((p) => JSON.parse(readFileSync(p, 'utf8'))));
  const greenspace = opt('--greenspace') ? greenspaceIndex(JSON.parse(readFileSync(opt('--greenspace'), 'utf8'))) : [];
  const batch = JSON.parse(readFileSync(opt('--batch'), 'utf8'));
  const candidates = lines(opt('--candidates'));
  const siteChecks = opt('--site-checks') ? JSON.parse(readFileSync(opt('--site-checks'), 'utf8')) : {};
  if (opt('--site-check-input')) {
    // The venues whose own website is the only independent source open data can offer: a runner fetches each page once and says whether it names the venue.
    const linkedIds = new Set(lines(opt('--links')).map((l) => l.open_data_place));
    const want = candidates.filter((c) => !linkedIds.has(c.familypilot_place_id) && c.website && ['activity', 'farm', 'zoo', 'attraction'].includes(categoryOf(c)));
    writeFileSync(opt('--site-check-input'), JSON.stringify(want.map((c) => ({ id: osmUrl(c), name: c.name, url: c.website })), null, 1));
    console.log(`wrote ${want.length} venues to check to ${opt('--site-check-input')}`);
    return;
  }
  const r = buildBatches({ candidates, links: lines(opt('--links')), batch, stored, wikidata, greenspace, siteChecks, target: Number(opt('--target') ?? 200), seed: Number(opt('--seed') ?? 7) });
  writeOutputs(opt('--out'), r, { version: batch.version, privateOut: opt('--private-out') });
  console.log(`batch 1: ${r.batch1.length} (${r.recoverableByComparison} more venues recoverable by comparison, ${r.unmatched.length - r.recoverableByComparison} with no independent candidate); batch 2: ${r.picked.length} of ${r.coverage.eligibleForBatch2} eligible`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
