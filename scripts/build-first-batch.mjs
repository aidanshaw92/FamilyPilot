#!/usr/bin/env node
/**
 * The first recovery batch, as one review pack for a person to decide on. Runs both tranches and writes REVIEW.md plus the evidence behind it.
 *
 *   TRANCHE A: venues from sources with NO ODbL obligation: OS Open Greenspace (OGL v3.0) and Wikidata (CC0 1.0). Can be imported once a person signs.
 *   TRANCHE B: venues from OpenStreetMap (ODbL). Held: nothing here is served until the build steps and judgments in docs/ODBL_ASSESSMENT.md are settled.
 *
 * A stored venue that tranche A continues is not proposed again from OpenStreetMap, and an OpenStreetMap place that tranche A already proposes is dropped,
 * so the two never overlap and the ODbL tranche is only what the open-licence sources cannot give.
 *
 * Reads local files, writes to the folders you name, calls nothing and imports nothing. Every entry says UNREVIEWED; this tool never writes a reviewer.
 *
 *   node scripts/build-first-batch.mjs --osm-candidates c.jsonl --osm-links l.jsonl --osm-batch b.json --greenspace g.geojson --wikidata a.json,b.json \
 *        --stored rows.json --out dir --private-out dir [--osm-wikidata a.json] [--site-checks-osm s.json] [--site-checks-open s.json] [--seed 7]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { AREAS, areaOf, csv, greenspaceIndex, wikidataItems } from './lib/recovery-select.mjs';
import { inScope, osParks, readWikidataFile, wikidataCandidates } from './lib/open-licence.mjs';
import { buildBatches, writeOutputs as writeOsm, osmUrl } from './select-recovery-batches.mjs';
import { buildOpenLicenceBatch, writeOpenLicenceOutputs, idOf, sourceUrlOf } from './select-open-licence-batch.mjs';

const CATEGORIES = ['park', 'museum', 'attraction', 'zoo', 'farm', 'activity', 'soft_play'];
const LABEL = { park: 'Parks and gardens', museum: 'Museums and galleries', attraction: 'Attractions', zoo: 'Zoos and aquariums', farm: 'Farms', activity: 'Activities', soft_play: 'Soft play' };
const AREA_LABEL = { central: 'Central (within 6 km)', north: 'North', east: 'East', south: 'South', west: 'West', 'beyond 25 km': 'Beyond 25 km' };

const count = (items, f) => items.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

/** A seeded shuffle, so the same data gives the same sample and nobody picked it by hand. */
function rng(seed) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** `n` records from `items`, spread across categories first and then areas, chosen at random inside each. */
export function stratifiedSample(items, n, seed) {
  const rnd = rng(seed);
  const shuffled = items.map((it) => ({ it, k: rnd() })).sort((a, b) => a.k - b.k).map((o) => o.it);
  const byCat = new Map();
  for (const it of shuffled) { if (!byCat.has(it.category)) byCat.set(it.category, []); byCat.get(it.category).push(it); }
  // categories in descending size, so the commonest category is not squeezed out by a single rare one
  const cats = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length);
  const picked = []; const usedAreas = new Set();
  let guard = 0;
  while (picked.length < n && guard++ < 1000) {
    let progressed = false;
    for (const [, list] of cats) {
      if (picked.length >= n) break;
      const i = list.findIndex((x) => !usedAreas.has(x.area)) >= 0 ? list.findIndex((x) => !usedAreas.has(x.area)) : 0;
      if (!list.length) continue;
      const [it] = list.splice(i, 1);
      picked.push(it); usedAreas.add(it.area); if (usedAreas.size >= AREAS.length) usedAreas.clear(); progressed = true;
    }
    if (!progressed) break;
  }
  return picked;
}

export function buildFirstBatch({ osm, open, stored, version, seed = 7 }) {
  // ---- tranche A
  const A = buildOpenLicenceBatch({ parks: open.parks, wikidata: open.wikidata, stored, version, target: open.target ?? 160, siteChecks: open.siteChecks ?? {} });
  const aStoredIds = new Set(A.rows.map((r) => r.stored.id));
  const aPlaces = [...A.rows.map((r) => ({ name: r.candidate.name, lat: r.candidate.lat, lng: r.candidate.lng })), ...A.picked.map((p) => ({ name: p.c.name, lat: p.c.lat, lng: p.c.lng }))];

  // ---- tranche B: only what A does not give
  // Tranche B is for what the open sources cannot give: its ceilings favour activities, attractions, farms and zoos, with a few parks and museums for geographic gaps.
  const B = buildBatches({ ...osm, stored, excludeStoredIds: aStoredIds, excludeNear: aPlaces, target: osm.target ?? 120, seed, budget: osm.budget ?? { activity: 0.3, attraction: 0.25, farm: 0.05, zoo: 0.05, museum: 0.15, park: 0.2 } });

  // ---- normalised records, for the sample and the tables
  const aCont = A.rows.map((r, i) => ({ tranche: 'A', kind: 'continuity', ref: `A1-${String(i + 1).padStart(2, '0')}`, entryId: idOf(r.candidate), name: r.candidate.name, category: r.candidate.category, area: areaOf(r.candidate.lat, r.candidate.lng), lat: r.candidate.lat, lng: r.candidate.lng, source: r.candidate.source, link: sourceUrlOf(r.candidate), storedCategory: r.stored.category, sim: r.sim, distance: r.inside ? 'inside the polygon' : `${r.distanceM} m`, flags: r.flags, signals: [] }));
  const aNew = A.picked.map((p, i) => ({ tranche: 'A', kind: 'new', ref: `A2-${String(i + 1).padStart(3, '0')}`, entryId: idOf(p.c), name: p.c.name, category: p.category, area: p.area, lat: p.c.lat, lng: p.c.lng, source: p.c.source, link: sourceUrlOf(p.c), signals: p.signals, flags: p.flags }));
  const bCont = B.batch1.map((r, i) => ({ tranche: 'B', kind: 'continuity', ref: `B1-${String(i + 1).padStart(2, '0')}`, entryId: r.candidate.familypilot_place_id, name: r.candidate.name, category: r.category, area: areaOf(r.candidate.lat, r.candidate.lng), lat: r.candidate.lat, lng: r.candidate.lng, source: 'osm', link: osmUrl(r.candidate), storedCategory: r.storedCategory, sim: r.nameSimilarity, distance: `${r.distanceM} m`, flags: r.flags, signals: [] }));
  const bNew = B.picked.map((p, i) => ({ tranche: 'B', kind: 'new', ref: `B2-${String(i + 1).padStart(3, '0')}`, entryId: p.c.familypilot_place_id, name: p.c.name, category: p.category, area: p.area, lat: p.c.lat, lng: p.c.lng, source: 'osm', link: osmUrl(p.c), signals: p.signals, flags: p.flags }));

  // ---- the sample of 20: five from each of the four groups, so one review covers both tranches and both kinds
  const groups = [aCont, aNew, bCont, bNew];
  const sample = groups.flatMap((g, i) => stratifiedSample(g, 5, seed + i));

  // ---- coverage: today, after A, after A and B
  const today = count(stored, (s) => s.category);
  const afterA = count([...aCont, ...aNew], (r) => r.category);
  const afterAB = count([...aCont, ...aNew, ...bCont, ...bNew], (r) => r.category);
  const storedByArea = count(stored, (s) => areaOf(s.lat, s.lng));
  const gridOf = (recs) => { const g = Object.fromEntries(AREAS.map((a) => [a, {}])); for (const r of recs) g[r.area][r.category] = (g[r.area][r.category] ?? 0) + 1; return g; };
  const continuedStoredIds = new Set([...aStoredIds, ...B.batch1.map((r) => r.storedId)]);
  const lost = stored.filter((s) => !continuedStoredIds.has(s.id));
  const lostByCategory = count(lost, (s) => s.category);

  return {
    A, B, aCont, aNew, bCont, bNew, sample, version, lostVenues: lost,
    coverage: { today, afterA, afterAB, storedByArea, gridA: gridOf([...aCont, ...aNew]), gridAB: gridOf([...aCont, ...aNew, ...bCont, ...bNew]), lostByCategory, lost: lost.length, stored: stored.length, continued: continuedStoredIds.size },
  };
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

export function renderReview(r) {
  const { A, B, coverage: c } = r;
  const L = [];
  const row = (cells) => `| ${cells.join(' | ')} |`;
  L.push(`# First recovery batch: for your decision (${r.version})`, '');
  L.push('**Nothing here is imported, served or signed off.** Every entry says `UNREVIEWED (simulation only)`, which the registry loader refuses. Your name goes on a batch when you decide; this pack never writes it. No Google call, no database change, no deployment.', '');
  L.push('## The decision', '');
  L.push(`| | Venues | Source and licence | Can be served once you sign |`, `|---|---:|---|---|`);
  L.push(row(['**Tranche A: continue venues we already hold**', `**${r.aCont.length}**`, 'OS Open Greenspace (OGL v3.0), Wikidata (CC0)', 'Yes: no ODbL obligation']));
  L.push(row(['**Tranche A: new venues**', `**${r.aNew.length}**`, 'OS Open Greenspace, Wikidata', 'Yes']));
  L.push(row(['Tranche B: continue venues we already hold', `${r.bCont.length}`, 'OpenStreetMap (ODbL)', '**No**: held for the ODbL steps (docs/ODBL_ASSESSMENT.md)']));
  L.push(row(['Tranche B: new venues', `${r.bNew.length}`, 'OpenStreetMap (ODbL)', '**No**: held']));
  L.push('', `So **${r.aCont.length + r.aNew.length} venues can be decided now**, and ${r.bCont.length + r.bNew.length} more are ready and waiting on licensing. Tranche B holds only what the open sources cannot give (activities, farms, soft-play-type venues, attractions and the smaller museums and parks).`, '');
  L.push(`**What I am asking:** approve or amend tranche A, using the sample of 20 below and the exceptions list. The exceptions are left out by default; you do not need to open the other records one by one.`, '');

  L.push('## What this does **not** say', '');
  L.push('An independent identity is a name, a category and a position from a source with a licence. It is **not** a statement that a place has toilets, a café, step-free access, opening hours, or suits a baby, a toddler or a ten-year-old. Those stay "not yet reviewed" until our own evidence says otherwise. OS describes its greenspaces as "likely to be accessible to the public" and generalises them automatically; that caveat applies to every park here.', '');

  L.push('## Expected coverage', '');
  L.push(`Today\'s catalogue is ${c.stored} Google rows inside the app\'s 40 km scope (two further out are not served today), and they expire from about 8 November. This is what would replace it.`, '');
  L.push(row(['Category', 'Today', 'After tranche A', 'After A and B']), row(['---', '---:', '---:', '---:']));
  for (const k of CATEGORIES) L.push(row([LABEL[k], c.today[k] ?? 0, c.afterA[k] ?? 0, c.afterAB[k] ?? 0]));
  L.push(row(['**All**', `**${c.stored}**`, `**${sum(c.afterA)}**`, `**${sum(c.afterAB)}**`]), '');
  L.push(`Of the ${c.stored} venues we hold, **${r.aCont.length}** continue from tranche A and **${r.bCont.length}** more from B (${c.continued} in all, ${pct(c.continued, c.stored)}%). **${c.lost} have no independent candidate** and disappear when their Google row expires: ${Object.entries(c.lostByCategory).map(([k, v]) => `${(LABEL[k] ?? k).toLowerCase()} ${v}`).join(', ')}. These names are in the private review folder (PRIVATE-lost.csv). The options for them: accept the loss; add them by hand from their own websites (each needs a position from a source we may use); or find them again once licensing is settled. I have not found a compliant source for them.`, '');
  L.push('### By area and category: tranche A alone, then A and B', '');
  const catCols = CATEGORIES.filter((k) => (c.afterAB[k] ?? 0) > 0);
  L.push(row(['Area', ...catCols.map((k) => LABEL[k]), 'A', 'A+B', 'Held today']), row(['---', ...catCols.map(() => '---:'), '---:', '---:', '---:']));
  for (const a of AREAS) {
    const ga = c.gridA[a]; const gab = c.gridAB[a];
    L.push(row([AREA_LABEL[a], ...catCols.map((k) => `${ga[k] ?? 0} / ${gab[k] ?? 0}`), sum(ga), sum(gab), c.storedByArea[a] ?? 0]));
  }
  L.push('', '(Each category cell reads "tranche A / tranche A and B".)', '');

  L.push('## Your sample: 20 records, drawn at random by category and area', '');
  L.push('Five from each of: A continuing, A new, B continuing, B new. For each, open **where it is** (a street map, used only as a viewer) and the record, and check three things: **is it the right place, is the category right, would you be content to see it in Explore?** Tick if yes. If two or more fail, reject the tranche; a single failure is a gate to tighten, and I will do that and redraw.', '');
  for (const g of ['A', 'B']) for (const kind of ['continuity', 'new']) {
    const rs = r.sample.filter((x) => x.tranche === g && x.kind === kind);
    L.push(`### Tranche ${g}, ${kind === 'continuity' ? 'continuing a venue we hold' : 'new'}${g === 'B' ? ' (held; ODbL)' : ''}`, '');
    for (const x of rs) {
      const evidence = kind === 'continuity' ? `name similarity ${x.sim}, ${x.distance}${x.flags.length ? `, **${x.flags.join('; ')}**` : ''}` : `${x.signals.join('; ')}${x.flags.length ? `. **${x.flags.join('; ')}**` : ''}`;
      const where = `https://www.openstreetmap.org/?mlat=${x.lat}&mlon=${x.lng}#map=17/${x.lat}/${x.lng}`;
      const record = x.source === 'os-greenspace' ? 'OS Open Greenspace (no page per record)' : `[${x.source === 'wikidata' ? 'Wikidata' : 'OpenStreetMap'} record](${x.link})`;
      L.push(`- [ ] **${x.name}** · ${LABEL[x.category] ?? x.category} · ${AREA_LABEL[x.area]} · [where it is](${where}) · ${record} · ref ${x.ref}: ${evidence}`);
    }
    L.push('');
  }

  const flaggedA = A.flagged; const flaggedB = B.flagged;
  const flaggedCont = [...r.aCont, ...r.bCont].filter((x) => x.flags.length);
  L.push('## Exceptions: left out or held by default', '');
  L.push(`${flaggedA.length + flaggedB.length} new venues and ${flaggedCont.length} continuing matches carry a flag. New venues with a flag are **not** in the numbers above; a continuing match with a flag **is**, so it appears here for your eye. Full lists: \`A/A2-flagged.csv\`, \`B/batch2-flagged.csv\`, and the flags column of the continuity CSVs.`, '');
  L.push('### Continuing matches to look at', '');
  for (const x of flaggedCont) L.push(`- ${x.ref} **${x.name}** (${LABEL[x.category] ?? x.category}, tranche ${x.tranche}): ${x.flags.join('; ')}`);
  if (!flaggedCont.length) L.push('None.');
  const grouped = (list) => {
    const by = new Map();
    for (const s of list) {
      const first = (s.flags[0] ?? '(no reason recorded)').replace(/\s*\(which one is in the private review folder\)/, '');
      const key = first.split(': ')[0].trim();
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(`${s.c.name} (${(LABEL[s.category] ?? s.category).toLowerCase()}, ${s.area})`);
    }
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  };
  L.push('', '### New venues left out (tranche A), grouped by what is open', '');
  for (const [reason, names] of grouped(flaggedA)) L.push(`- **${reason}** (${names.length}): ${names.join('; ')}`);
  if (!flaggedA.length) L.push('None.');
  L.push('', '### New venues left out (tranche B), grouped by what is open', '');
  for (const [reason, names] of grouped(flaggedB)) L.push(`- **${reason}** (${names.length}): ${names.join('; ')}`);
  if (!flaggedB.length) L.push('None.');
  L.push('', '### Duplicate risks', '');
  L.push(`- Possible duplicates of a place we hold, left out: A ${A.dupes.length}, B ${flaggedB.filter((s) => s.nearStored).length}; the pairs are in the private review folder.`);
  L.push(`- Places dropped from B because tranche A already proposes them: ${B.duplicatesOfOther.length}. Two features for one place within B, the better evidenced kept: ${B.duplicatesInBatch.length}.`, '');
  L.push('### Why places were held back (tranche A, counts)', '');
  for (const [reason, n] of Object.entries(A.coverage.heldByReason).sort((a, b) => b[1] - a[1])) L.push(`- ${n}: ${reason}`);
  L.push(`- ${A.coverage.newBelowThreshold}: below the evidence threshold`, '');

  L.push('## How each record was checked (automated)', '');
  L.push('- **Identity.** The name and position are the source\'s own (OS, Wikidata or OpenStreetMap), with a link to the record. No name, address or position from Google is used or written; a stored venue is read only to compute match numbers.');
  L.push('- **Continuing a venue we hold.** Name overlap, whether the stored position lies inside the park\'s polygon or within 150 m of the point, and category agreement. A match is "confident" only above fixed thresholds; everything else is in the exceptions.');
  L.push('- **Gates.** Held back, with a reason, in `A2-held.csv`: parks under 3 ha without a mapped play space, clubs, schools, burial grounds, allotments and golf courses; generic names; museums and attractions with no website of their own, or too few Wikipedia articles to show they are a destination; prehistoric monuments and arts venues that Wikidata files under "museum".');
  L.push('- **Evidence points,** each one checkable at the link: OS "named public park" polygon, its size, a mapped play space inside it, a Wikidata item, the number of Wikipedia articles, and the venue\'s own website, **fetched once** with robots.txt honoured, to see whether it answers and names the venue.');
  L.push('- **Duplicates.** Within 150 m of a place we already hold with a similar name, or within 120 m of a better-evidenced place in the same tranche: left out and listed. A place proposed in tranche A is dropped from tranche B.');
  L.push('- **Classification.** A castle, palace, abbey, house or dungeon that Wikidata files under "museum" is classed as an attraction, and the reason is shown on the record. Nothing is classed from a guess about the activity.');
  L.push('- **Shape.** The registry\'s own validator checks every entry (licence matches source, position inside Greater London, https website, no unknown key).', '');
  L.push('## When you decide', '');
  L.push('Tell me which tranche you approve, with any exceptions you want added or removed. I will then (with your name, not mine) mark the entries reviewed, add them to the registry on a branch, run the full tests and the mobile-profile measurement, and open a pull request for you. I will not merge or deploy it, and tranche B stays held until the ODbL steps are done.', '');
  return L.join('\n');
}

export function writeFirstBatch(out, r, { privateOut }) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'REVIEW.md'), renderReview(r));
  writeOpenLicenceOutputs(join(out, 'A'), r.A, { privateOut: privateOut && join(privateOut, 'A') });
  writeOsm(join(out, 'B'), r.B, { version: r.version, privateOut: privateOut && join(privateOut, 'B') });
  writeFileSync(join(out, 'coverage.json'), JSON.stringify(r.coverage, null, 2));
  writeFileSync(join(out, 'sample-20.json'), JSON.stringify(r.sample.map(({ ref, tranche, kind, name, category, area, source, link, lat, lng }) => ({ ref, tranche, kind, name, category, area, source, link, lat, lng })), null, 1));
  if (privateOut) {
    mkdirSync(privateOut, { recursive: true });
    const refs = [
      ...r.A.rows.map((x, i) => ({ ref: `A1-${String(i + 1).padStart(2, '0')}`, stored_place_id: x.stored.id, stored_name: x.stored.name, entry_id: idOf(x.candidate) })),
      ...r.B.batch1.map((x, i) => ({ ref: `B1-${String(i + 1).padStart(2, '0')}`, stored_place_id: x.storedId, stored_name: x.storedName, entry_id: x.candidate.familypilot_place_id })),
    ];
    writeFileSync(join(privateOut, 'PRIVATE-lost.csv'), csv(r.lostVenues.map((s) => ({ stored_place_id: s.id, stored_name: s.name, stored_category: s.category })), ['stored_place_id', 'stored_name', 'stored_category']));
    writeFileSync(join(privateOut, 'PRIVATE-refs.csv'), csv(refs, ['ref', 'stored_place_id', 'stored_name', 'entry_id']));
  }
}

function main() {
  const args = process.argv.slice(2);
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const need = ['--osm-candidates', '--osm-links', '--osm-batch', '--greenspace', '--wikidata', '--stored', '--out'].filter((n) => !opt(n));
  if (need.length) { console.error(`missing ${need.join(', ')}`); process.exit(2); }
  const lines = (p) => readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const allStored = json(opt('--stored')).map((s) => ({ id: s.id ?? s.familypilot_place_id, name: s.name, category: s.category, lat: Number(s.lat), lng: Number(s.lng) }));
  const stored = allStored.filter((s) => inScope(s.lat, s.lng)); // the venues the app can serve at all
  const wdFiles = opt('--wikidata').split(',').filter(Boolean).map(readWikidataFile);
  const batch = json(opt('--osm-batch'));
  const osmWd = (opt('--osm-wikidata') ?? opt('--wikidata')).split(',').filter(Boolean).map(json);
  const osm = {
    candidates: lines(opt('--osm-candidates')), links: lines(opt('--osm-links')), batch,
    wikidata: wikidataItems(osmWd), greenspace: greenspaceIndex(json(opt('--greenspace'))),
    siteChecks: opt('--site-checks-osm') ? json(opt('--site-checks-osm')) : {},
  };
  const open = { parks: osParks(json(opt('--greenspace'))), wikidata: wikidataCandidates(wdFiles), siteChecks: opt('--site-checks-open') ? json(opt('--site-checks-open')) : {} };
  const r = buildFirstBatch({ osm, open, stored, version: batch.version, seed: Number(opt('--seed') ?? 7) });
  writeFirstBatch(opt('--out'), r, { privateOut: opt('--private-out') });
  console.log(`A: ${r.aCont.length} continuing + ${r.aNew.length} new. B (held): ${r.bCont.length} continuing + ${r.bNew.length} new. Stored venues continued: ${r.coverage.continued} of ${r.coverage.stored}; no candidate: ${r.coverage.lost}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
