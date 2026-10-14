/**
 * Candidates from the two open-licence sources that need no OpenStreetMap data: OS Open Greenspace (Ordnance Survey, Open Government Licence v3.0) and
 * Wikidata (CC0 1.0). Pure: reads parsed files, returns candidates and the numbers a reviewer needs; writes nothing, reads no network, adds no fact.
 *
 * What these sources say is small: a name, a place and (Wikidata) a website. Nothing here says a place has toilets, opens at any hour or suits any age.
 */
const toRad = (d) => (d * Math.PI) / 180;

export function haversineKm(aLat, aLng, bLat, bLng) {
  const h = Math.sin(toRad(bLat - aLat) / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(toRad(bLng - aLng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const polygonsOf = (g) => (g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []);
const inRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
export const pointInGeometry = (lat, lng, g) => polygonsOf(g).some(([outer, ...holes]) => inRing(lng, lat, outer) && !holes.some((h) => inRing(lng, lat, h)));

/** Area in hectares, by projecting to a local plane (accurate to well under 1% at London's latitude, which is all a size gate needs). */
export function areaHa(g) {
  let m2 = 0;
  for (const [outer, ...holes] of polygonsOf(g)) {
    const ring = (r) => {
      const lat0 = r[0][1]; const kx = 111320 * Math.cos(toRad(lat0)); const ky = 110540;
      let a = 0;
      for (let i = 0, j = r.length - 1; i < r.length; j = i, i += 1) a += (r[j][0] * kx) * (r[i][1] * ky) - (r[i][0] * kx) * (r[j][1] * ky);
      return Math.abs(a) / 2;
    };
    m2 += ring(outer) - holes.reduce((s, h) => s + ring(h), 0);
  }
  return m2 / 10000;
}

/** A point inside the polygon, near its middle: the centroid when that is inside, else the inside grid point nearest to it. */
export function interiorPoint(g) {
  const polys = polygonsOf(g);
  if (!polys.length) return null;
  // the largest part carries the name
  const [outer] = polys.map((p) => [p, Math.abs(areaHa({ type: 'Polygon', coordinates: p }))]).sort((a, b) => b[1] - a[1])[0];
  const ring = outer[0];
  let cx = 0; let cy = 0; let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
  }
  a /= 2;
  let c = a === 0 ? [ring[0][0], ring[0][1]] : [cx / (6 * a), cy / (6 * a)];
  const poly = { type: 'Polygon', coordinates: outer };
  if (pointInGeometry(c[1], c[0], poly)) return { lat: c[1], lng: c[0] };
  const xs = ring.map((p) => p[0]); const ys = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best = null;
  for (let i = 1; i < 24; i += 1) for (let j = 1; j < 24; j += 1) {
    const x = x0 + ((x1 - x0) * i) / 24; const y = y0 + ((y1 - y0) * j) / 24;
    if (!pointInGeometry(y, x, poly)) continue;
    const d = (x - c[0]) ** 2 + (y - c[1]) ** 2;
    if (!best || d < best.d) best = { d, lat: y, lng: x };
  }
  return best ? { lat: best.lat, lng: best.lng } : { lat: ring[0][1], lng: ring[0][0] };
}

export const bboxOf = (g) => {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => (typeof c[0] === 'number' ? (b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]) : c.forEach(walk));
  walk(g.coordinates);
  return b;
};

// ---------------------------------------------------------------- name gates (the same words as the OpenStreetMap gates in scripts/open-data/lib/quality.mjs)
/** Names that say who the land belongs to rather than what it is. */
export const PRIVATE_USE_NAME = /\b(football club|rugby|cricket club|fc|rfc|sports club|sports ground|sports centre|sports park|school|academy|university|hospital|tennis club|bowls? club|hockey|athletic|social club|training ground|campus|cemetery|churchyard|allotments?|golf)\b/i;
/** A name that names no particular place. */
export const GENERIC_NAME = /^(the )?(park|gardens?|playground|play area|recreation ground|rec|playing fields?|field|fields|green|common|open space|memorial gardens?|community garden|zoo|museum)$/i;

// ---------------------------------------------------------------- OS Open Greenspace
const OS_PRODUCT_URL = 'https://www.ordnancesurvey.co.uk/products/os-open-greenspace';
export { OS_PRODUCT_URL };

/**
 * Named public parks and gardens from OS Open Greenspace, each with its size, an interior point and whether a mapped play space lies inside it.
 * A play space is the Ordnance Survey's polygon for a children's play area; it says one is mapped there, not that it is open or what is in it.
 */
export function osParks(geojson, { centre = { lat: 51.5074, lng: -0.1278 }, maxKm = 40 } = {}) {
  const plays = [];
  for (const f of geojson.features ?? []) {
    if (f.properties?.function !== 'Play Space') continue;
    const p = interiorPoint(f.geometry);
    if (p) plays.push(p);
  }
  const out = [];
  for (const f of geojson.features ?? []) {
    const fn = f.properties?.function;
    const name = (f.properties?.distName1 ?? '').trim();
    if (fn !== 'Public Park Or Garden' || !name) continue;
    const p = interiorPoint(f.geometry);
    if (!p) continue;
    const km = haversineKm(centre.lat, centre.lng, p.lat, p.lng);
    if (km > maxKm) continue;
    const ha = areaHa(f.geometry);
    const b = bboxOf(f.geometry);
    out.push({
      source: 'os-greenspace', osId: String(f.properties.id).toLowerCase(), name, kind: 'park', category: 'park', ha: Number(ha.toFixed(2)),
      lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)), km,
      play: plays.some((q) => q.lng >= b[0] && q.lng <= b[2] && q.lat >= b[1] && q.lat <= b[3] && pointInGeometry(q.lat, q.lng, f.geometry)),
      geometry: f.geometry, bbox: b,
    });
  }
  return mergeSameNameNeighbours(out);
}

/** One park drawn as several polygons (a heath cut by a road) is one venue: keep the largest part and add the areas. */
export function mergeSameNameNeighbours(parks, withinKm = 1.2) {
  const sorted = [...parks].sort((a, b) => b.ha - a.ha);
  const kept = [];
  for (const p of sorted) {
    const twin = kept.find((k) => k.name.toLowerCase() === p.name.toLowerCase() && haversineKm(k.lat, k.lng, p.lat, p.lng) <= withinKm);
    if (twin) { twin.ha = Number((twin.ha + p.ha).toFixed(2)); twin.play = twin.play || p.play; twin.parts = (twin.parts ?? 1) + 1; continue; }
    kept.push({ ...p });
  }
  return kept;
}

// ---------------------------------------------------------------- Wikidata (CC0)
/** Wikidata class labels (as the queries return them) and the catalogue category each would be served as. A class not listed is not served. */
export const WIKIDATA_CATEGORY = {
  park: 'park', 'urban park': 'park', garden: 'park', 'botanical garden': 'park', 'nature reserve': 'park', 'country park': 'park', common: 'park',
  museum: 'museum', 'art museum': 'museum', "children's museum": 'museum',
  zoo: 'zoo', farm: 'farm', 'public aquarium': 'attraction', 'theme park': 'attraction', 'amusement park': 'attraction', 'tourist attraction': 'attraction',
  castle: 'attraction', palace: 'attraction', windmill: 'attraction',
};

/**
 * Wikidata files a castle, a historic house or an arts centre under "museum" when it holds a collection, and the app's groups are by what a family goes
 * to do. These rules say, in the open, when the name decides the category instead. Each result carries the reason, so a reviewer can see it and overrule.
 *   hold      a monument or an arts venue: not a visit the app can describe (a barrow, a stone circle, a theatre or arts centre)
 *   attraction  a castle, palace, abbey, tower, fort, historic house or dungeon, unless the name also says museum or gallery
 *   museum    anything else Wikidata calls a museum
 */
export function classifyWikidata(c) {
  const name = c.name;
  const museumish = /\b(museum|gallery|galleries|collection|library)\b/i.test(name);
  if (/\b(long barrow|barrow|stone circle|cairn|dolmen|cromlech|standing stone|hill ?fort|earthwork)\b/i.test(name)) return { hold: 'a prehistoric monument, not a staffed visit' };
  if (/\b(centre|center|theatre|theater|cinema|arts|auditorium|concert hall)\b/i.test(name) && !museumish && c.category === 'museum') return { hold: 'an arts or events venue that Wikidata files under museum' };
  if (c.category === 'museum' && !museumish && /\b(castle|palace|abbey|priory|tower|fort|fortress|dungeon|villa|manor|hall|house|mansion|lodge|observatory|mill)\b/i.test(name)) {
    return { category: 'attraction', reason: 'Wikidata calls it a museum; the name says a castle, house or similar, so it is classed as an attraction' };
  }
  return {};
}

/** One entry per Wikidata item from SPARQL JSON: coordinates, label, website, Wikipedia-link count, and every class it was returned under. */
export function wikidataCandidates(jsonFiles) {
  const byQ = new Map();
  for (const json of jsonFiles) {
    for (const b of json?.results?.bindings ?? []) {
      const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value ?? '');
      if (!m || !b.item?.value) continue;
      const q = b.item.value.split('/').pop();
      const cur = byQ.get(q) ?? { source: 'wikidata', q, name: (b.itemLabel?.value ?? '').trim(), lat: Number(m[2]), lng: Number(m[1]), classes: new Set(), website: null, sitelinks: 0 };
      const cls = b.classLabel?.value ?? b.grp?.value;
      if (cls) cur.classes.add(cls.toLowerCase());
      if (b.website?.value && !cur.website) cur.website = b.website.value;
      if (b.sitelinks?.value) cur.sitelinks = Math.max(cur.sitelinks, Number(b.sitelinks.value));
      byQ.set(q, cur);
    }
  }
  const out = [];
  for (const c of byQ.values()) {
    if (!c.name || /^Q\d+$/.test(c.name)) continue; // no English label
    // Subclasses of museum (a local museum, a transport museum, a historic house museum) are museums: the queries return them by their own label.
    const cats = [...c.classes].map((k) => WIKIDATA_CATEGORY[k] ?? (/\bmuseum$/.test(k) ? 'museum' : null)).filter(Boolean);
    if (!cats.length) continue; // railway stations and other classes the app does not serve
    // A venue returned under several classes takes the most specific visitor category: zoo > farm > museum > attraction > park.
    const category = ['zoo', 'farm', 'museum', 'attraction', 'park'].find((k) => cats.includes(k));
    const base = { ...c, classes: [...c.classes], category, kind: category };
    const cls = classifyWikidata(base);
    if (cls.hold) { out.push({ ...base, hold: cls.hold }); continue; }
    if (cls.category) { base.category = cls.category; base.kind = cls.category; base.reclassified = cls.reason; }
    out.push(base);
  }
  return out;
}

export function wikidataEntryId(q) { return `fp-wd-${String(q).toLowerCase()}`; }
export function osEntryId(osId) { return `fp-os-${String(osId).toLowerCase()}`; }

// ---------------------------------------------------------------- entries (always unreviewed here: a person signs, this never does)
const UNREVIEWED = 'UNREVIEWED (simulation only)';

export function entryFromOs(c, { version, linkedTo = null, reviewedBy = null }) {
  return {
    familypilotId: linkedTo ?? osEntryId(c.osId),
    name: c.name,
    category: c.category,
    identity: { source: 'os-greenspace', url: OS_PRODUCT_URL, retrievedAt: version, licence: 'OGL-3.0', externalId: c.osId },
    location: { latitude: c.lat, longitude: c.lng, source: 'os-greenspace', licence: 'OGL-3.0' },
    reviewedBy: reviewedBy ?? UNREVIEWED,
    reviewedAt: version,
  };
}

export function entryFromWikidata(c, { version, linkedTo = null, reviewedBy = null }) {
  const entry = {
    familypilotId: linkedTo ?? wikidataEntryId(c.q),
    name: c.name,
    category: c.category,
    identity: { source: 'wikidata', url: `https://www.wikidata.org/wiki/${c.q}`, retrievedAt: version, licence: 'CC0-1.0', externalId: c.q },
    location: { latitude: Number(c.lat.toFixed(6)), longitude: Number(c.lng.toFixed(6)), source: 'wikidata', licence: 'CC0-1.0' },
    reviewedBy: reviewedBy ?? UNREVIEWED,
    reviewedAt: version,
  };
  if (c.website && /^https:\/\//i.test(c.website)) entry.website = c.website;
  return entry;
}

// ---------------------------------------------------------------- continuing a venue we already hold
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { tokenOverlapScore } = require('../../server/places/lib/venue-alias-detection.js');

/** Which candidate categories may continue a stored venue of a given category. A farm is never continued by a park that happens to contain it. */
const COMPATIBLE = { park: ['park'], museum: ['museum', 'attraction'], attraction: ['attraction', 'museum', 'zoo'], zoo: ['zoo', 'attraction'], farm: ['farm'], activity: [], soft_play: [] };

/**
 * The best OS Open Greenspace park and the best Wikidata item that could be the stored venue, each with the numbers a reviewer can check. The stored name
 * and position are Google content: they are read here to compute those numbers, and only the numbers leave.
 */
export function matchStored(stored, { parks, wikidata }) {
  const allowed = COMPATIBLE[stored.category] ?? [];
  const sameKind = (cat) => allowed.includes(cat);
  let os = null;
  for (const p of parks) {
    if (!sameKind(p.category)) continue;
    const b = p.bbox;
    if (stored.lng < b[0] - 0.004 || stored.lng > b[2] + 0.004 || stored.lat < b[1] - 0.004 || stored.lat > b[3] + 0.004) continue;
    const sim = tokenOverlapScore(stored.name, p.name);
    if (sim < 0.6) continue;
    const inside = pointInGeometry(stored.lat, stored.lng, p.geometry);
    const distanceM = Math.round(haversineKm(stored.lat, stored.lng, p.lat, p.lng) * 1000);
    if (!inside && distanceM > 600) continue;
    if (!os || sim > os.sim || (sim === os.sim && inside && !os.inside)) os = { candidate: p, sim: Number(sim.toFixed(2)), inside, distanceM };
  }
  let wd = null;
  for (const w of wikidata) {
    if (!sameKind(w.category) && !(stored.category === 'park' && w.category === 'park')) continue;
    const km = haversineKm(stored.lat, stored.lng, w.lat, w.lng);
    const reach = stored.category === 'park' || stored.category === 'zoo' ? 0.4 : 0.25;
    if (km > reach) continue;
    const sim = tokenOverlapScore(stored.name, w.name);
    if (sim < 0.6) continue;
    if (!wd || sim > wd.sim) wd = { candidate: w, sim: Number(sim.toFixed(2)), inside: false, distanceM: Math.round(km * 1000) };
  }
  return { os, wd };
}

/** Flags a reviewer should look at on a match, and whether it is confident enough to propose for continuity. */
export function judgeMatch(stored, hit) {
  const flags = [];
  const c = hit.candidate;
  if (hit.sim < 0.9) flags.push(`names differ (similarity ${hit.sim})`);
  if (!hit.inside && hit.distanceM > 150) flags.push(`positions ${hit.distanceM} m apart`);
  if (c.category !== stored.category) flags.push(`category differs (stored ${stored.category}, source ${c.category})`);
  // Close in name and place; a venue of a neighbouring category (an "attraction" that Wikidata calls a museum) needs a near-exact name.
  const placeOk = hit.inside || hit.distanceM <= 150;
  const confident = placeOk && (c.category === stored.category ? hit.sim >= 0.8 : hit.sim >= 0.9);
  return { confident: Boolean(confident), flags };
}

// ---------------------------------------------------------------- new places: gates and evidence
/** Why a candidate is not proposed, or null. Held candidates stay in the held list with this reason so a reviewer can re-admit one. */
export function holdReason(c) {
  if (c.hold) return c.hold;
  if (GENERIC_NAME.test(c.name)) return 'a name that names no particular place';
  if (c.kind === 'park' && PRIVATE_USE_NAME.test(c.name) && !/nature reserve/i.test(c.name)) return 'named for a club, school, burial ground, allotments or golf course: not a public park to visit';
  if (c.source === 'os-greenspace') {
    if (!(c.ha >= 3 || (c.play && c.ha >= 0.5))) return 'too small to be a day out (under 3 ha, and no mapped play space of at least half a hectare)';
    return null;
  }
  // Wikidata
  if (c.category !== 'park' && !c.website) return 'no website of its own in Wikidata: nothing independent to check it against';
  if (c.sitelinks < 2) return 'few Wikipedia articles: little evidence it is a destination';
  if (PRIVATE_USE_NAME.test(c.name) && c.category !== 'museum') return 'named for a club, school or university: not a public destination';
  return null;
}

/** Flags that do not hold a candidate back but ask the reviewer to look. */
export function doubts(c) {
  const out = [];
  if (c.category === 'museum' && /\b(university|school|academy)\b/i.test(c.name)) out.push('a museum named for a university or school: check it is open to the public');
  if (c.category === 'museum' && /\b(football club|rugby|cricket club)\b/i.test(c.name)) out.push('a sports-club museum: check it is open to visitors and not only to ticket holders');
  if (/\b(palace|castle)\b/i.test(c.name) && /\b(lambeth|buckingham|st james)/i.test(c.name)) out.push('an official residence: check public access');
  if (c.classes?.includes('windmill')) out.push('a windmill: often a landmark rather than a visit');
  if (c.classes?.includes('castle') && !c.website) out.push('a castle with no website: may be a ruin or private');
  if (c.category === 'park' && /\b(square|gardens?)$/i.test(c.name) && c.ha < 6 && !c.play) out.push('a small garden square: may be for keyholders only');
  return out;
}

/** Evidence points. Each is something a person can check against the source link. */
export function scoreCandidate(c, { wdMatch = null } = {}) {
  const signals = []; let score = 0;
  // Notes on how the record was read. They are shown with it; they are not doubts, so they do not hold a venue back.
  if (c.reclassified) signals.push(c.reclassified);
  if (c.source === 'os-greenspace' && (c.parts ?? 1) > 1) signals.push(`drawn as ${c.parts} separate areas; the point is in the largest`);
  const add = (s, pts) => { signals.push(s); score += pts; };
  if (c.source === 'os-greenspace') {
    add('OS Open Greenspace: a named public park or garden', 1);
    if (c.ha >= 10) add(`${c.ha} ha`, 2); else if (c.ha >= 3) add(`${c.ha} ha`, 1);
    if (c.play) add('a play space is mapped inside it', 1.5);
    if (wdMatch) { add(`Wikidata ${wdMatch.q}`, 2); if (wdMatch.sitelinks >= 3) add(`${wdMatch.sitelinks} Wikipedia articles`, 1); }
  } else {
    add(`Wikidata ${c.q} (${c.classes.join(', ')})`, 1);
    if (c.website) add('own website listed in Wikidata', 1);
    if (c.sitelinks >= 8) add(`${c.sitelinks} Wikipedia articles`, 2); else if (c.sitelinks >= 3) add(`${c.sitelinks} Wikipedia articles`, 1);
  }
  return { score, signals };
}
