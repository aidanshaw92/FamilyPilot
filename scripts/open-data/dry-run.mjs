#!/usr/bin/env node
/**
 * Open-data dry run. Reads a licensed extract from a LOCAL FILE, applies the quality gates, and writes a candidate file and a report.
 * It makes no network request, opens no database connection, calls no Google API and writes only to the output folder you give it.
 * Nothing is imported: importing is a separate, approved, reviewed migration (docs/LEDGER_MIGRATION_PROPOSAL.md).
 *
 * Input (one of):
 *   - GeoJSON, as written by `osmium export -f geojson` (tags are the feature's properties; Polygon and MultiPolygon are supported)
 *   - Overpass JSON with `out center tags` (a `center` stands in for the geometry; the park-contains-playground join is skipped)
 *
 * From a Geofabrik .osm.pbf, one way to get GeoJSON (osmium-tool, run locally):
 *   osmium tags-filter greater-london-latest.osm.pbf nwr/leisure=park,playground,nature_reserve,trampoline_park,indoor_play,water_park,ice_rink,miniature_golf,bowling_alley \
 *     nwr/tourism=zoo,aquarium,museum,gallery,theme_park nwr/attraction=animal -o london-family.osm.pbf
 *   osmium export london-family.osm.pbf -f geojson -o london-family.geojson
 *
 * Usage:
 *   node scripts/open-data/dry-run.mjs --osm london-family.geojson --version 2026-10-14 --out ./dry-run-out [--stored rows.json] [--seed 7]
 *
 * `--stored` is the JSON exported by the SQL in scripts/replay-discovery-rules.mjs, plus lat and lng. It is Google content: used only
 * to find duplicates, in memory, and never written to the output.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifyOsm } from './lib/osm-classify.mjs';
import { areaOf, haversineKm, pointInGeometry, representativePoint } from './lib/geo.mjs';
import { osmBatch, renderReview, reviewSample } from './lib/review.mjs';

const require = createRequire(import.meta.url);
const { tokenOverlapScore, areLikelySameVenueAlias } = require('../../server/places/lib/venue-alias-detection.js');

const LONDON_BOX = { latMin: 51.0, latMax: 52.0, lngMin: -1.0, lngMax: 0.7 };
const STORED_GROUP = { park: 'parks', museum: 'museums', zoo: 'animals', farm: 'animals', soft_play: 'play', attraction: 'attractions', activity: 'attractions', beach: 'parks' };
export const GOALS = { parks: 230, museums: 65, animals: 30, play: 70, attractions: 85 };

/** One feature from either input shape, in the one shape the rest uses. */
export function normaliseFeatures(input) {
  if (input?.type === 'FeatureCollection') {
    return input.features.map((f) => {
      const raw = String(f.id ?? f.properties?.['@id'] ?? '');
      const m = /^([nwr])(\d+)$/.exec(raw) ?? /^(node|way|relation)\/(\d+)$/.exec(raw);
      const type = m ? ({ n: 'node', w: 'way', r: 'relation' }[m[1]] ?? m[1]) : 'feature';
      const id = m ? m[2] : raw || 'unknown';
      const { ['@id']: _a, ['@version']: version, ...tags } = f.properties ?? {};
      return { sourceId: `${type}/${id}`, type, id, version: version ?? f.properties?.['@version'], tags, geometry: f.geometry };
    });
  }
  if (Array.isArray(input?.elements)) {
    return input.elements.map((e) => ({
      sourceId: `${e.type}/${e.id}`, type: e.type, id: String(e.id), version: e.version, tags: e.tags ?? {},
      geometry: e.type === 'node' && e.lat != null ? { type: 'Point', coordinates: [e.lon, e.lat] } : e.center ? { type: 'Point', coordinates: [e.center.lon, e.center.lat] } : null,
    }));
  }
  throw new Error('Unrecognised input: expected GeoJSON FeatureCollection or Overpass JSON with elements');
}

const insideLondon = (p) => p.lat >= LONDON_BOX.latMin && p.lat <= LONDON_BOX.latMax && p.lng >= LONDON_BOX.lngMin && p.lng <= LONDON_BOX.lngMax;
const polygonal = (g) => g && (g.type === 'Polygon' || g.type === 'MultiPolygon');

/**
 * @param {{ features: ReturnType<typeof normaliseFeatures>, stored?: Array<{id:string,name:string,category:string,lat:number,lng:number}>, version: string, seed?: number }} args
 */
export function runDryRun({ features, stored = [], version, seed = 7 }) {
  const rejected = [];
  const accepted = [];
  const unnamedPlaygrounds = [];

  for (const f of features) {
    const decision = classifyOsm(f.tags);
    const point = representativePoint(f.geometry);
    if (!decision.ok) {
      if (decision.reason === 'no name' && f.tags.leisure === 'playground' && point) unnamedPlaygrounds.push({ point });
      rejected.push({ sourceId: f.sourceId, name: f.tags.name ?? '', gate: decision.gate, reason: decision.reason });
      continue;
    }
    if (!point) { rejected.push({ sourceId: f.sourceId, name: f.tags.name, gate: 'location', reason: 'no usable coordinate' }); continue; }
    if (!insideLondon(point)) { rejected.push({ sourceId: f.sourceId, name: f.tags.name, gate: 'location', reason: 'outside the London box' }); continue; }
    accepted.push({ f, decision, point });
  }

  // Provenance gate: every candidate carries its source id and the batch it will belong to.
  const rows = accepted.map(({ f, decision, point }) => ({
    familypilot_place_id: `fp-osm-${f.type}-${f.id}`,
    source_record_id: `${f.type}/${f.id}@v${f.version ?? 'unknown'}`,
    name: String(f.tags.name).trim(),
    group_id: decision.group,
    subtype: decision.subtype,
    lat: Number(point.lat.toFixed(6)),
    lng: Number(point.lng.toFixed(6)),
    website: decision.website,
    source_tags: { ...decision.decidedBy, ...decision.factTags },
    operating_status: 'unknown',
    status_evidence: null,
    identity_checked_at: version,
    // Not stored: what the report reads. Derived from source_tags at read time.
    _facts: decision.facts,
    _polygon: polygonal(f.geometry) ? f.geometry : null,
    _hasPolygon: polygonal(f.geometry),
  }));

  // A park gains "a playground lies inside it" from a named or an unnamed mapped playground within its polygon.
  const playgrounds = [...rows.filter((r) => r.subtype === 'playground').map((r) => ({ point: { lat: r.lat, lng: r.lng } })), ...unnamedPlaygrounds];
  for (const park of rows.filter((r) => r.group_id === 'parks' && ['park', 'nature_reserve'].includes(r.subtype))) {
    park._playgroundInside = park._polygon ? playgrounds.some((p) => pointInGeometry(p.point.lat, p.point.lng, park._polygon)) : null;
  }

  // Duplicates inside the batch: same group, close, similar name. Keep the polygon over the point, then the one with more tags.
  const dropped = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i], b = rows[j];
      if (dropped.has(a) || dropped.has(b) || a.group_id !== b.group_id) continue;
      const km = haversineKm(a.lat, a.lng, b.lat, b.lng);
      if (km > 0.1 || tokenOverlapScore(a.name, b.name) < 0.8) continue;
      const score = (r) => (r._hasPolygon ? 100 : 0) + Object.keys(r.source_tags).length;
      const loser = score(a) >= score(b) ? b : a;
      dropped.add(loser);
      rejected.push({ sourceId: loser.source_record_id, name: loser.name, gate: 'identity', reason: `duplicate within the batch of ${(loser === a ? b : a).source_record_id}` });
    }
  }
  const kept = rows.filter((r) => !dropped.has(r));

  // Duplicates of a stored place become a LINK to it, not a second listing.
  const links = [];
  const candidates = [];
  for (const row of kept) {
    let best = null;
    for (const s of stored) {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
      const km = haversineKm(row.lat, row.lng, s.lat, s.lng);
      if (!areLikelySameVenueAlias({ name: row.name }, { name: s.name }, km)) continue;
      const confidence = Number(tokenOverlapScore(row.name, s.name).toFixed(2));
      if (!best || confidence > best.confidence) best = { id: s.id, confidence, km: Number(km.toFixed(3)) };
    }
    if (best) links.push({ open_data_place: row.familypilot_place_id, google_place: best.id, match_method: 'name_and_distance', match_confidence: best.confidence, needs_review: best.confidence < 0.8, km: best.km });
    candidates.push({ ...row, _linked: best ? best.id : null });
  }

  return { candidates, links, rejected, stats: summarise({ candidates, links, rejected, stored, version, seed }) };
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

function summarise({ candidates, links, rejected, stored, seed }) {
  const groups = Object.keys(GOALS);
  const storedByGroup = Object.fromEntries(groups.map((g) => [g, stored.filter((s) => STORED_GROUP[s.category] === g).length]));
  const newOnes = candidates.filter((c) => !c._linked);
  const byGroup = Object.fromEntries(groups.map((g) => [g, newOnes.filter((c) => c.group_id === g).length]));
  const areas = ['central', 'north', 'east', 'south', 'west', 'beyond 25 km'];
  const byArea = Object.fromEntries(areas.map((a) => [a, Object.fromEntries(groups.map((g) => [g, newOnes.filter((c) => c.group_id === g && areaOf(c.lat, c.lng) === a).length]))]));
  const factKeys = ['stepFree', 'toilets', 'babyChanging', 'fee', 'openingHoursText', 'minAge', 'maxAge'];
  const factCoverage = Object.fromEntries(factKeys.map((k) => [k, candidates.filter((c) => c._facts[k] !== undefined).length]));
  const rejectedByGate = {};
  for (const r of rejected) rejectedByGate[r.gate] = (rejectedByGate[r.gate] ?? 0) + 1;
  const parks = candidates.filter((c) => c._playgroundInside !== undefined);
  const rnd = seeded(seed);
  const spot = [...candidates].map((c) => ({ c, k: rnd() })).sort((a, b) => a.k - b.k).slice(0, 40).map(({ c }) => c);
  // One of each outcome the report can show, for the ten-row sample.
  const sample = [];
  const take = (label, row) => { if (row && sample.length < 10 && !sample.find((s) => s.row === row)) sample.push({ label, row }); };
  // The unusual outcomes first, so the sample shows them; then one new place per group; then anything else.
  take('linked to a stored place', candidates.find((c) => c._linked));
  take('park with a mapped playground inside', candidates.find((c) => c._playgroundInside === true));
  take('park with no mapped playground found (not confirmed)', candidates.find((c) => c._playgroundInside === false));
  take('trampoline park', candidates.find((c) => c.subtype === 'trampoline_park'));
  take('with source-stated facts', candidates.find((c) => Object.keys(c._facts).length > 0));
  take('indoor play, soft play not confirmed', candidates.find((c) => c.subtype === 'indoor_play'));
  for (const g of groups) take(`new, ${g}`, newOnes.find((c) => c.group_id === g));
  for (const c of newOnes) take('another new place', c);
  return { total: candidates.length, new: newOnes.length, linked: links.length, needsReview: links.filter((l) => l.needs_review).length, rejected: rejected.length, rejectedByGate, storedByGroup, byGroup, byArea, factCoverage, parksWithPlaygroundAnswer: { yes: parks.filter((p) => p._playgroundInside === true).length, no: parks.filter((p) => p._playgroundInside === false).length, unknown: parks.filter((p) => p._playgroundInside === null).length }, spot, sample };
}

export function renderReport(result, { version, source }) {
  const s = result.stats;
  const groups = Object.keys(GOALS);
  const lines = [];
  lines.push(`# Open-data dry run: ${source}, version ${version}`, '', '**Nothing was imported.** This is a report on a local file.', '');
  lines.push('## Counts', '', '| | |', '|---|---:|', `| Candidates | ${s.total} |`, `| New places | ${s.new} |`, `| Duplicates of a stored place (to be linked) | ${s.linked} (${s.needsReview} need a person to review) |`, `| Rejected | ${s.rejected} |`, `| **Expected import if approved** (new places, in reviewed batches of at most 100) | **${s.new}** (${Math.ceil(s.new / 100)} batch${Math.ceil(s.new / 100) === 1 ? '' : 'es'}) |`, '');
  lines.push('## Rejected, by the gate that stopped them', '', '| Gate | Rows |', '|---|---:|', ...Object.entries(s.rejectedByGate).map(([g, n]) => `| ${g} | ${n} |`), '');
  lines.push('## Against the goals', '', '| Group | Stored today | New from this source | Goal | Gap left |', '|---|---:|---:|---:|---:|', ...groups.map((g) => `| ${g} | ${s.storedByGroup[g]} | ${s.byGroup[g]} | ${GOALS[g]} | ${Math.max(0, GOALS[g] - s.storedByGroup[g] - s.byGroup[g])} |`), '');
  lines.push('## New places by area', '', `| Area | ${groups.join(' | ')} |`, `|---|${groups.map(() => '---:').join('|')}|`, ...Object.entries(s.byArea).map(([a, row]) => `| ${a} | ${groups.map((g) => row[g]).join(' | ')} |`), '');
  lines.push('## Family facts the source itself states', '', 'Everything else is unknown. This is how much of the candidate set could ever show a fact from this source.', '', '| Fact | Candidates stating it | Of |', '|---|---:|---:|', ...Object.entries(s.factCoverage).map(([k, n]) => `| ${k} | ${n} | ${s.total} |`), '');
  lines.push('## Parks and a mapped playground inside', '', `Yes ${s.parksWithPlaygroundAnswer.yes}, no mapped playground found ${s.parksWithPlaygroundAnswer.no}, not answerable without polygon geometry ${s.parksWithPlaygroundAnswer.unknown}. "No mapped playground found" is **not confirmed**, never "none".`, '');
  return lines.join('\n');
}

const csv = (rows, cols) => [cols.join(','), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

async function main() {
  const args = process.argv.slice(2);
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const osm = opt('--osm'); const out = opt('--out'); const version = opt('--version');
  if (!osm || !out || !version) { console.error('Usage: node scripts/open-data/dry-run.mjs --osm file.geojson --version YYYY-MM-DD --out dir [--stored rows.json] [--seed n]'); process.exit(2); }
  const features = normaliseFeatures(JSON.parse(readFileSync(osm, 'utf8')));
  const stored = opt('--stored') ? JSON.parse(readFileSync(opt('--stored'), 'utf8')).map((r) => ({ ...r, lat: Number(r.lat), lng: Number(r.lng) })) : [];
  const result = runDryRun({ features, stored, version, seed: Number(opt('--seed') ?? 7) });
  mkdirSync(out, { recursive: true });
  const clean = ({ _facts, _polygon, _hasPolygon, _playgroundInside, _linked, ...row }) => row;
  writeFileSync(join(out, 'candidates.jsonl'), result.candidates.map((c) => JSON.stringify(clean(c))).join('\n') + '\n');
  writeFileSync(join(out, 'links.jsonl'), result.links.map((l) => JSON.stringify(l)).join('\n') + '\n');
  writeFileSync(join(out, 'rejected.csv'), csv(result.rejected, ['sourceId', 'name', 'gate', 'reason']));
  writeFileSync(join(out, 'spot-check-40.jsonl'), result.stats.spot.map((c) => JSON.stringify(clean(c))).join('\n') + '\n');
  writeFileSync(join(out, 'sample-10.json'), JSON.stringify(result.stats.sample.map(({ label, row }) => ({ label, row: clean(row), derivedFacts: row._facts, playgroundInside: row._playgroundInside ?? null, linkedTo: row._linked })), null, 2));
  // The ten records a person reads first, with the batch's licence and credit recorded once.
  const batch = osmBatch({ version, input: osm });
  const reviews = reviewSample(result.stats.sample, batch, { links: result.links, stored });
  writeFileSync(join(out, 'batch.json'), JSON.stringify(batch, null, 2));
  writeFileSync(join(out, 'first-ten-review.json'), JSON.stringify(reviews, null, 2));
  writeFileSync(join(out, 'first-ten-review.md'), renderReview(reviews, batch));
  writeFileSync(join(out, 'report.md'), renderReport(result, { version, source: osm }));
  console.log(`candidates ${result.stats.total} (new ${result.stats.new}, linked ${result.stats.linked}), rejected ${result.stats.rejected}. Wrote ${out}/ (nothing imported).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
