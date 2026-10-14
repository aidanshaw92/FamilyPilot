/**
 * Choosing what to put in front of a reviewer first. Pure: it reads candidates, links and two corroborating files and returns decisions and
 * evidence. It writes nothing, reads no network and adds no fact about a place.
 *
 * BATCH 1, continuity: the independent entries that continue a venue we already hold, so a saved plan and the catalogue keep working. Each is
 * shown with how well it matches (name similarity, distance between the stored position and the OSM position, category agreement). The stored
 * name and position are Google content and are used only to compute those numbers; they are never returned.
 *
 * BATCH 2, new places: a small, high-confidence selection of destinations, filling the geographic and category gaps, each with at least one source
 * that is not OpenStreetMap alone. It is a selection by quality and gap, not the whole list.
 *
 * NOTHING HERE SIGNS ANYTHING OFF. Entries are written UNREVIEWED; a person puts their name on them.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { tokenOverlapScore } = require('../../server/places/lib/venue-alias-detection.js');

const CENTRE = { lat: 51.5074, lng: -0.1278 };
const toRad = (d) => (d * Math.PI) / 180;
export function haversineKm(aLat, aLng, bLat, bLng) {
  const h = Math.sin(toRad(bLat - aLat) / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(toRad(bLng - aLng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export const AREAS = ['central', 'north', 'east', 'south', 'west', 'beyond 25 km'];
/** The areas the catalogue plan measures by: central within 6 km, else a quadrant by bearing, else beyond 25 km. */
export function areaOf(lat, lng) {
  const km = haversineKm(CENTRE.lat, CENTRE.lng, lat, lng);
  if (km <= 6) return 'central';
  if (km > 25) return 'beyond 25 km';
  const b = (((Math.atan2((lng - CENTRE.lng) * Math.cos(toRad(CENTRE.lat)), lat - CENTRE.lat) * 180) / Math.PI) + 360) % 360;
  if (b >= 315 || b < 45) return 'north';
  if (b < 135) return 'east';
  if (b < 225) return 'south';
  return 'west';
}

// ---------------------------------------------------------------- geometry (OS Open Greenspace polygons)
const inRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const polygons = (g) => (g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []);
export const pointInGeometry = (lat, lng, g) => polygons(g).some(([outer, ...holes]) => inRing(lng, lat, outer) && !holes.some((h) => inRing(lng, lat, h)));
const bboxOf = (g) => {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => (typeof c[0] === 'number' ? (b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]) : c.forEach(walk));
  walk(g.coordinates);
  return b;
};

// ---------------------------------------------------------------- the two corroborating sources
/** Wikidata items (CC0) from SPARQL JSON bindings: one entry per item, with every class label it was returned under. */
export function wikidataItems(jsonFiles) {
  const byQ = new Map();
  for (const json of jsonFiles) {
    for (const b of json?.results?.bindings ?? []) {
      const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value ?? '');
      if (!m || !b.item?.value) continue;
      const q = b.item.value.split('/').pop();
      const cur = byQ.get(q) ?? { q, label: b.itemLabel?.value ?? '', lat: Number(m[2]), lng: Number(m[1]), classes: new Set(), website: null };
      if (b.classLabel?.value) cur.classes.add(b.classLabel.value.toLowerCase());
      if (b.website?.value && !cur.website) cur.website = b.website.value;
      byQ.set(q, cur);
    }
  }
  return [...byQ.values()];
}

/** OS Open Greenspace features (OGL) with a bounding box each, so a point test only runs where it can succeed. */
export function greenspaceIndex(geojson) {
  return (geojson?.features ?? []).map((f) => ({ f, b: bboxOf(f.geometry), name: f.properties?.distName1 ?? '', fn: f.properties?.function }));
}

const NAME_MATCH = 0.6;
const PARK_FUNCTIONS = new Set(['Public Park Or Garden', 'Play Space', 'Playing Field']);

/**
 * What a source that is not OpenStreetMap says about this candidate. A Wikidata item matches by the QID the OSM feature itself carries (exact), or by
 * a name match within 250 m. An OS Greenspace polygon matches when it contains the point and its name matches.
 */
export function corroborate(c, { wikidata = [], wikidataByQ = null, greenspace = [] } = {}) {
  const byQ = wikidataByQ ?? new Map(wikidata.map((w) => [w.q, w]));
  let wd = null;
  if (c.wikidata_id && byQ.has(c.wikidata_id)) wd = { q: c.wikidata_id, how: 'qid', label: byQ.get(c.wikidata_id).label, classes: [...byQ.get(c.wikidata_id).classes] };
  else {
    const hit = wikidata.find((w) => haversineKm(c.lat, c.lng, w.lat, w.lng) < 0.25 && tokenOverlapScore(c.name, w.label) >= NAME_MATCH);
    if (hit) wd = { q: hit.q, how: 'name+distance', label: hit.label, classes: [...hit.classes] };
  }
  let os = null;
  if (c.group_id === 'parks') {
    for (const g of greenspace) {
      if (c.lng < g.b[0] || c.lng > g.b[2] || c.lat < g.b[1] || c.lat > g.b[3]) continue;
      if (!PARK_FUNCTIONS.has(g.fn) || !g.name || tokenOverlapScore(c.name, g.name) < NAME_MATCH) continue;
      if (pointInGeometry(c.lat, c.lng, g.f.geometry)) { os = { function: g.fn, name: g.name }; break; }
    }
  }
  return { wikidata: wd, os };
}

// ---------------------------------------------------------------- scoring a new place
/**
 * Evidence, not a verdict. Each signal is something a person can check against the source link. "independent" means a second source that is not
 * OpenStreetMap alone, or (for categories those sources do not cover) the venue's own website together with an encyclopaedic link.
 */
export function scoreNew(c, corr, siteCheck = null) {
  const signals = [];
  let score = 0;
  const add = (name, pts) => { signals.push(name); score += pts; };
  if (corr.wikidata) add(`Wikidata item ${corr.wikidata.q} (${corr.wikidata.how})`, 2);
  if (corr.os) add(`OS Open Greenspace: ${corr.os.function}`, 2);
  if (c.website) add('own website in the source', 1);
  // Checked by fetching the page once: it answered, and its title or heading carries the venue's name. The venue's own words, not ours.
  const siteNamesVenue = Boolean(siteCheck?.ok && siteCheck?.namesVenue);
  if (siteNamesVenue) add('its own website was fetched and names the venue', 1.5);
  if (c.has_wikipedia) add('Wikipedia article linked', 1);
  else if (c.wikidata_id) add('Wikidata link in the source', 0.5);
  if (c.group_id === 'parks') {
    if (c.playground_inside === true) add('a playground is mapped inside', 1);
    if ((c.area_ha ?? 0) >= 3) add(`${c.area_ha} ha`, 1);
  }
  const stated = c.source_tags?.opening_hours || c.source_tags?.fee;
  if (stated) add('opening hours or a fee stated', 0.5);
  const secondSource = Boolean(corr.wikidata || corr.os);
  // For categories open data hardly reaches (activities, farms, zoos, attractions) the venue's own page, checked, is the independent source.
  const independent = secondSource || siteNamesVenue || Boolean(c.website && (c.has_wikipedia || c.wikidata_id));
  return { score, signals, independent, secondSource, siteNamesVenue, siteCheck };
}

/** The catalogue category a candidate would be served as (mirrors scripts/build-identity-entries.mjs). */
export function categoryOf(c) {
  const rules = {
    parks: { default: 'park' }, museums: { default: 'museum' },
    animals: { city_farm: 'farm', farmyard: 'farm', petting_zoo: 'farm', zoo: 'zoo', wildlife_park: 'zoo', aquarium: 'attraction', animal_attraction: 'attraction' },
    play: { trampoline_park: 'activity', indoor_play: 'activity' },
    attractions: { attraction: 'attraction', theme_park: 'attraction', water_park: 'attraction', ice_rink: 'activity', miniature_golf: 'activity', bowling_alley: 'activity' },
  }[c.group_id];
  return rules ? rules[c.subtype] ?? rules.default ?? null : null;
}

// ---------------------------------------------------------------- batch 2 selection
/** Shares of the target by category. They are ceilings, not quotas: a category with too little evidence stays short rather than being padded from another. */
export const DEFAULT_BUDGET = { park: 0.42, museum: 0.18, farm: 0.07, zoo: 0.05, activity: 0.14, attraction: 0.14 };
/** The least a place may score, by category. Parks and museums have two independent open sources to draw on, so they need two signals' worth. */
export const DEFAULT_MIN_SCORE = { park: 3, museum: 3, default: 2 };
/** Round-robin order: the outer areas the plan says are thin come first and most often; centre is every second round; beyond 25 km every sixth. */
const ROUND = ['east', 'south', 'west', 'north', 'central', 'east', 'south', 'west', 'north', 'beyond 25 km'];

/**
 * The best evidenced places that are independent, taken area by area in turn so the batch cannot be all central museums, each inside its category's
 * ceiling. It stops when the evidence runs out; it never pads to reach the target.
 */
export function selectBatch2(scored, { target = 200, minScore = DEFAULT_MIN_SCORE, budget = DEFAULT_BUDGET } = {}) {
  const floor = (cat) => minScore[cat] ?? minScore.default ?? 2;
  const eligible = scored.filter((s) => s.independent && s.score >= floor(s.category));
  const rank = (a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name);
  const queues = Object.fromEntries(AREAS.map((a) => [a, eligible.filter((s) => s.area === a).sort(rank)]));
  const picked = []; const catCount = {};
  const limit = (cat) => Math.max(1, Math.round((budget[cat] ?? 0) * target));
  let progressed = true;
  while (picked.length < target && progressed) {
    progressed = false;
    for (const area of ROUND) {
      if (picked.length >= target) break;
      const q = queues[area];
      const i = q.findIndex((s) => (catCount[s.category] ?? 0) < limit(s.category));
      if (i < 0) continue;
      const [s] = q.splice(i, 1);
      picked.push(s); catCount[s.category] = (catCount[s.category] ?? 0) + 1; progressed = true;
    }
  }
  return { picked, eligible: eligible.length };
}

// ---------------------------------------------------------------- batch 1: continuity
/**
 * One row per link from a candidate to a stored place, with the numbers that say whether it is the same venue. `stored` rows carry Google content
 * (name, position): they are read here and only the derived numbers leave.
 */
export function continuityRows({ candidates, links, stored, minConfidence = 0.8 }) {
  const byCand = new Map(candidates.map((c) => [c.familypilot_place_id, c]));
  const storedBy = new Map(stored.map((s) => [s.id, s]));
  const rows = [];
  const claimed = new Set();
  const ordered = [...links].sort((a, b) => b.match_confidence - a.match_confidence);
  for (const l of ordered) {
    const c = byCand.get(l.open_data_place); const s = storedBy.get(l.google_place);
    if (!c || !s) continue;
    const confident = l.match_confidence >= minConfidence && !l.needs_review && !claimed.has(l.google_place);
    if (confident) claimed.add(l.google_place);
    const distanceM = Math.round(haversineKm(c.lat, c.lng, s.lat, s.lng) * 1000);
    const nameSimilarity = Number(tokenOverlapScore(c.name, s.name).toFixed(2));
    const category = categoryOf(c);
    const flags = [];
    if (distanceM > 150) flags.push(`positions ${distanceM} m apart`);
    if (nameSimilarity < 0.9) flags.push(`names differ (similarity ${nameSimilarity})`);
    if (category && s.category && category !== s.category) flags.push(`category differs (stored ${s.category}, source ${category})`);
    if (l.match_method !== 'name_and_distance') flags.push(`matched loosely (${l.match_method})`);
    if (!confident && l.needs_review) flags.push('the matcher asks for a person to compare');
    rows.push({ confident, storedId: l.google_place, storedName: s.name, storedCategory: s.category, candidate: c, category, distanceM, nameSimilarity, confidence: l.match_confidence, method: l.match_method, flags });
  }
  const matched = new Set(rows.filter((r) => r.confident).map((r) => r.storedId));
  const unmatched = stored.filter((s) => !matched.has(s.id));
  return { rows, unmatched };
}

export const csv = (rows, cols) => [cols.join(','), ...rows.map((r) => cols.map((c) => { const v = r[c]; const t = Array.isArray(v) ? v.join('; ') : String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(','))].join('\n');
