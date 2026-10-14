#!/usr/bin/env node
/**
 * Tranche A of the first batch: venues that can be served from sources that are NOT OpenStreetMap, so no ODbL obligation attaches to them.
 *   - OS Open Greenspace (Ordnance Survey, Open Government Licence v3.0): named public parks and gardens, their size and whether a play space is mapped inside.
 *   - Wikidata (CC0 1.0): museums, zoos, castles and palaces, with their own website and Wikipedia-article count.
 *
 * Reads local files, writes to the folders you name, calls nothing and imports nothing. Every entry says UNREVIEWED, which the registry loader refuses to
 * serve; this tool never writes a reviewer's name.
 *
 *   node scripts/select-open-licence-batch.mjs --greenspace g.geojson --wikidata a.json,b.json --stored rows.json --out dir \
 *        [--private-out dir] [--site-checks s.json] [--version 2026-10-14] [--target 160]
 *   node scripts/select-open-licence-batch.mjs ... --site-check-input in.json   (writes the Wikidata websites worth one polite request each)
 *
 * `--stored` is the stored catalogue (id, name, category, lat, lng). It is Google content: it is used only to compute match numbers and to flag possible
 * duplicates; no stored name or position is written to `--out`. The cross-reference from each held venue to its entry, with the stored names, goes to
 * `--private-out` only.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { AREAS, areaOf, csv, selectBatch2 } from './lib/recovery-select.mjs';
import { doubts, entryFromOs, entryFromWikidata, haversineKm, holdReason, inScope, judgeMatch, matchStored, osEntryId, osParks, pointInGeometry, readWikidataFile, scoreCandidate, wikidataCandidates, wikidataEntryId, OS_PRODUCT_URL } from './lib/open-licence.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { tokenOverlapScore } = require('../server/places/lib/venue-alias-detection.js');

const BUDGET = { park: 0.55, museum: 0.25, attraction: 0.12, zoo: 0.05, farm: 0.03 };
const MIN_SCORE = { park: 3, museum: 3, default: 3 };

export const sourceUrlOf = (c) => (c.source === 'os-greenspace' ? OS_PRODUCT_URL : `https://www.wikidata.org/wiki/${c.q}`);
export const idOf = (c) => (c.source === 'os-greenspace' ? osEntryId(c.osId) : wikidataEntryId(c.q));

export function buildOpenLicenceBatch({ parks, wikidata: allWikidata, stored, version, target = 160, siteChecks = {} }) {
  // Nothing beyond the app's 40 km scope would ever be served, so none is proposed.
  const wikidata = allWikidata.filter((w) => inScope(w.lat, w.lng));
  // ---- continuing a venue we already hold
  const rows = []; const consumed = new Set(); const unmatched = []; const compare = [];
  for (const s of stored) {
    const { os, wd } = matchStored(s, { parks, wikidata });
    const options = [os, wd].filter(Boolean).map((hit) => ({ hit, ...judgeMatch(s, hit) }));
    options.sort((a, b) => Number(b.confident) - Number(a.confident) || b.hit.sim - a.hit.sim);
    const best = options[0];
    if (!best) { unmatched.push(s); continue; }
    const row = { stored: s, candidate: best.hit.candidate, sim: best.hit.sim, distanceM: best.hit.distanceM, inside: best.hit.inside, flags: best.flags, also: options[1] ? idOf(options[1].hit.candidate) : null };
    if (best.confident) { rows.push(row); consumed.add(idOf(best.hit.candidate)); }
    else compare.push(row);
  }
  const compareOnly = new Set(compare.map((r) => r.stored.id)); // stored venues that have a candidate a person could confirm
  const trulyUnmatched = unmatched;

  // ---- new places
  const wdByQ = new Map(wikidata.map((w) => [w.q, w]));
  const pool = [];
  for (const p of parks) {
    if (consumed.has(idOf(p))) continue;
    // A Wikidata park/garden whose point lies inside this polygon with a similar name is the same place: corroboration, not a second venue.
    const twin = wikidata.find((w) => w.category === 'park' && pointInGeometry(w.lat, w.lng, p.geometry) && tokenOverlapScore(w.name, p.name) >= 0.5);
    pool.push({ ...p, wdMatch: twin ?? null });
  }
  const twinQs = new Set(pool.filter((p) => p.wdMatch).map((p) => p.wdMatch.q));
  for (const w of wikidata) {
    if (consumed.has(idOf(w)) || twinQs.has(w.q)) continue;
    if (w.category === 'park') {
      // A Wikidata park that an OS polygon already covers (by name, anywhere inside) is the OS one.
      if (parks.some((p) => pointInGeometry(w.lat, w.lng, p.geometry))) continue;
    }
    pool.push({ ...w, ha: undefined, play: false });
  }

  const held = []; const scored = [];
  for (const c of pool) {
    const reason = holdReason(c);
    const { score: base, signals } = scoreCandidate(c, { wdMatch: c.wdMatch });
    let score = base;
    const flags = doubts(c);
    // The venue's own website, fetched once: does it answer, and does its title or heading name the venue? Only the result is kept.
    const sc = siteChecks[idOf(c)];
    if (sc?.ok && sc.namesVenue) { score += 1.5; signals.push('its own website was fetched and names the venue'); }
    else if (sc?.ok) flags.push('its website answered but does not name the venue: check it is the right site');
    else if (sc && (c.sitelinks ?? 0) < 8) flags.push('its website could not be checked, and the venue has few Wikipedia articles');
    const area = areaOf(c.lat, c.lng);
    const near = stored.find((s) => haversineKm(c.lat, c.lng, s.lat, s.lng) < 0.15 && tokenOverlapScore(c.name, s.name) >= 0.5);
    if (near) flags.push('within 150 m of a place we already hold, with a similar name: possible duplicate (which one is in the private review folder)');
    const row = { c, category: c.category, area, score, signals, flags, independent: true, nearStored: near ?? null, wdMatch: c.wdMatch ?? null };
    if (reason) held.push({ ...row, reason });
    else scored.push(row);
  }
  const floor = (cat) => MIN_SCORE[cat] ?? MIN_SCORE.default;
  const below = scored.filter((s) => s.score < floor(s.category)).map((s) => ({ ...s, reason: `below the evidence threshold (${s.score} of ${floor(s.category)})` }));
  const eligible = scored.filter((s) => s.score >= floor(s.category));
  // Three tiers. CLEAN: passes every gate with nothing for a person to look at; only these are proposed. FLAGGED: passes the gates but something is open
  // (a possible duplicate, a classification the name suggests, a website that does not name the venue); default decision is to leave it out.
  // HELD: failed a gate; kept with its reason.
  const dupes = eligible.filter((s) => s.nearStored);
  const flagged = eligible.filter((s) => !s.nearStored && s.flags.length > 0);
  const clean = eligible.filter((s) => !s.nearStored && s.flags.length === 0);
  const { picked } = selectBatch2(clean, { target, minScore: MIN_SCORE, budget: BUDGET });
  const pickedSet = new Set(picked.map((p) => idOf(p.c)));
  const reserve = clean.filter((s) => !pickedSet.has(idOf(s.c))).sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name)).slice(0, 100);

  // ---- entries (neutral ids; the keyed copy for continuity is made privately)
  const entryOf = (c, over = {}) => (c.source === 'os-greenspace' ? entryFromOs(c, { version, ...over }) : entryFromWikidata(c, { version, ...over }));
  const entries = {
    continuity: rows.map((r) => entryOf(r.candidate)),
    continuityKeyed: rows.map((r) => entryOf(r.candidate, { linkedTo: r.stored.id })),
    news: picked.map((p) => entryOf(p.c)),
  };

  const byCat = (list, f = (x) => x.category) => list.reduce((m, x) => ({ ...m, [f(x)]: (m[f(x)] ?? 0) + 1 }), {});
  const grid = Object.fromEntries(AREAS.map((a) => [a, byCat(picked.filter((p) => p.area === a))]));
  const coverage = {
    stored: stored.length,
    continuity: rows.length,
    compare: compare.length,
    compareVenues: compareOnly.size,
    unmatched: trulyUnmatched.length,
    continuityByCategory: byCat(rows, (r) => r.stored.category),
    newCandidates: pool.length,
    newHeld: held.length,
    newBelowThreshold: below.length,
    newPossibleDuplicates: dupes.length,
    newFlagged: flagged.length,
    newEligible: clean.length,
    newPicked: picked.length,
    newByCategory: byCat(picked),
    newByArea: byCat(picked, (p) => p.area),
    newGrid: grid,
    heldByReason: held.reduce((m, h) => ({ ...m, [h.reason]: (m[h.reason] ?? 0) + 1 }), {}),
  };
  return { rows, compare, unmatched: trulyUnmatched, picked, reserve, flagged, held, below, dupes, entries, coverage };
}

export function writeOpenLicenceOutputs(out, r, { privateOut } = {}) {
  mkdirSync(out, { recursive: true });
  const w = (name, text) => writeFileSync(join(out, name), text);
  const contRow = (x) => ({ entry_id: idOf(x.candidate), source: x.candidate.source, source_record: sourceUrlOf(x.candidate), name: x.candidate.name, category: x.candidate.category, stored_category: x.stored.category, lat: x.candidate.lat, lng: x.candidate.lng, area: areaOf(x.candidate.lat, x.candidate.lng), name_similarity: x.sim, distance_m: x.inside ? 'inside the polygon' : x.distanceM, flags: x.flags });
  const cCols = ['entry_id', 'source', 'source_record', 'name', 'category', 'stored_category', 'lat', 'lng', 'area', 'name_similarity', 'distance_m', 'flags'];
  w('A1-continuity.csv', csv(r.rows.map(contRow), cCols));
  w('A1-needs-comparison.csv', csv(r.compare.map(contRow), cCols));
  const newRow = (s) => ({ entry_id: idOf(s.c), source: s.c.source, source_record: sourceUrlOf(s.c), name: s.c.name, category: s.category, area: s.area, lat: s.c.lat, lng: s.c.lng, score: s.score, signals: s.signals, website: s.c.website ?? '', ha: s.c.ha ?? '', flags: s.flags, reason: s.reason ?? '' });
  const nCols = ['entry_id', 'source', 'source_record', 'name', 'category', 'area', 'lat', 'lng', 'score', 'signals', 'website', 'ha', 'flags', 'reason'];
  w('A2-new.csv', csv(r.picked.map(newRow), nCols));
  w('A2-reserve.csv', csv(r.reserve.map(newRow), nCols));
  w('A2-flagged.csv', csv(r.flagged.map(newRow), nCols));
  w('A2-held.csv', csv([...r.held, ...r.below, ...r.dupes].map(newRow), nCols));
  w('A1.entries.UNREVIEWED.json', JSON.stringify(r.entries.continuity, null, 1));
  w('A2.entries.UNREVIEWED.json', JSON.stringify(r.entries.news, null, 1));
  w('A-coverage.json', JSON.stringify(r.coverage, null, 2));
  if (privateOut) {
    mkdirSync(privateOut, { recursive: true });
    const wp = (name, text) => writeFileSync(join(privateOut, name), text);
    wp('PRIVATE-A-alias-map.csv', csv(r.rows.map((x) => ({ stored_place_id: x.stored.id, stored_name: x.stored.name, stored_category: x.stored.category, entry_id: idOf(x.candidate), source_name: x.candidate.name, source_record: sourceUrlOf(x.candidate), name_similarity: x.sim, flags: x.flags })), ['stored_place_id', 'stored_name', 'stored_category', 'entry_id', 'source_name', 'source_record', 'name_similarity', 'flags']));
    wp('PRIVATE-A-A1.keyed-entries.UNREVIEWED.json', JSON.stringify(r.entries.continuityKeyed, null, 1));
    const cmp = new Map(r.compare.map((x) => [x.stored.id, x]));
    wp('PRIVATE-A-unmatched.csv', csv(r.unmatched.map((u) => ({ stored_place_id: u.id, stored_name: u.name, stored_category: u.category })), ['stored_place_id', 'stored_name', 'stored_category']));
    wp('PRIVATE-A-compare.csv', csv([...cmp.values()].map((x) => ({ stored_place_id: x.stored.id, stored_name: x.stored.name, stored_category: x.stored.category, candidate_name: x.candidate.name, entry_id: idOf(x.candidate), name_similarity: x.sim, flags: x.flags })), ['stored_place_id', 'stored_name', 'stored_category', 'candidate_name', 'entry_id', 'name_similarity', 'flags']));
    wp('PRIVATE-A-possible-duplicates.csv', csv([...r.picked, ...r.dupes, ...r.flagged, ...r.reserve].filter((x) => x.nearStored).map((x) => ({ entry_id: idOf(x.c), name: x.c.name, stored_place_id: x.nearStored.id, stored_name: x.nearStored.name })), ['entry_id', 'name', 'stored_place_id', 'stored_name']));
    wp('README.txt', 'Google content (stored names) and the link from each stored place ID to its entry. Do not commit, publish or paste into a public place.\n');
  }
}

function main() {
  const args = process.argv.slice(2);
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const need = ['--greenspace', '--wikidata', '--stored', ...(opt('--site-check-input') ? [] : ['--out'])].filter((n) => !opt(n));
  if (need.length) { console.error(`missing ${need.join(', ')}`); process.exit(2); }
  const stored = JSON.parse(readFileSync(opt('--stored'), 'utf8')).map((s) => ({ id: s.id ?? s.familypilot_place_id, name: s.name, category: s.category, lat: Number(s.lat), lng: Number(s.lng) }));
  const parks = osParks(JSON.parse(readFileSync(opt('--greenspace'), 'utf8')));
  const wikidata = wikidataCandidates(opt('--wikidata').split(',').filter(Boolean).map(readWikidataFile));
  const version = opt('--version') ?? new Date().toISOString().slice(0, 10);
  const siteChecks = opt('--site-checks') ? JSON.parse(readFileSync(opt('--site-checks'), 'utf8')) : {};
  if (opt('--site-check-input')) {
    const pre = buildOpenLicenceBatch({ parks, wikidata, stored, version, target: 1000 });
    const want = [...pre.picked, ...pre.flagged, ...pre.reserve, ...pre.rows.map((x) => ({ c: x.candidate }))].filter((x) => x.c.source === 'wikidata' && x.c.website);
    const seen = new Map(want.map((x) => [idOf(x.c), { id: idOf(x.c), name: x.c.name, url: x.c.website }]));
    writeFileSync(opt('--site-check-input'), JSON.stringify([...seen.values()], null, 1));
    console.log(`wrote ${seen.size} venues to check to ${opt('--site-check-input')}`);
    return;
  }
  const r = buildOpenLicenceBatch({ parks, wikidata, stored, version, target: Number(opt('--target') ?? 160), siteChecks });
  writeOpenLicenceOutputs(opt('--out'), r, { privateOut: opt('--private-out') });
  const c = r.coverage;
  console.log(`A1: ${c.continuity} continue a held venue (${c.compareVenues} more venues could be confirmed by comparison, ${c.unmatched} have no candidate); A2: ${c.newPicked} clean new of ${c.newEligible} clean (${c.newFlagged} flagged, ${c.newPossibleDuplicates} possible duplicates, ${c.newBelowThreshold} below threshold, ${c.newHeld} held by a gate, ${c.newCandidates} candidates)`);
  console.log('A2 by category', c.newByCategory, 'by area', c.newByArea);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
