const catalogue = require('./catalogue');

/**
 * `intent=catalogue`: the stored catalogue, a page at a time, nearest first. A database read in a module that holds no Google anything.
 *
 * WHY. The London search returns the whole catalogue and the phone filters it. That was fine for 160 places and is not fine for thousands: the
 * payload, the parsing and the first render all grow with the catalogue, and a parent near Camden does not need Penge. This returns what was asked
 * for, in pages, with the TRUE number behind it, so nothing is hidden by a cap and nothing unneeded is sent:
 *
 *   lat, lng      the anchor (default: the app's London centre)
 *   radiusKm      only places within it (default: none, which is "search all": the whole London scope)
 *   categories    comma list of catalogue categories (park, museum, ...)
 *   q             words that must each appear in the name, or name the category ("soft play", "zoo")
 *   limit, cursor a page of at most 100 (default 40), then the cursor the last page returned
 *
 * It answers `total` (everything that matches, not what this page holds), `countsByCategory` (the same match ignoring the category filter, so a
 * chip can say how many it would show), `hasMore` and `nextCursor`. Walking the cursor to the end returns every match exactly once.
 *
 * SAFETY. It sits behind `api/places/search.js` for the same reason `between` and `nearby-food` do (twelve functions): one early `return` before the
 * budget, the provider choice and the search chain, and an import graph with no API key, no budget gate and no Google client.
 * `catalogue-endpoint.test.ts` asserts both. It reads the same catalogue the London search merges in, so a Google row older than its limit, and a
 * category switched over to the independent files, behave exactly as they do there.
 *
 * @param {{ query: Record<string, string> }} req
 * @param {{ status: Function, json: Function, setHeader: Function }} res
 * @param {{ readCatalogue?: () => Promise<any[]> }} [deps]
 */
const LONDON = { latitude: 51.5074, longitude: -0.1278 };
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const MAX_RADIUS_KM = 40;

function haversineKm(aLat, aLng, bLat, bLng) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const words = (s) => String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

/** A word a parent might type for a kind of place, and the category it means. */
const CATEGORY_WORDS = new Map([
  ['park', 'park'], ['parks', 'park'], ['playground', 'park'], ['playgrounds', 'park'], ['garden', 'park'], ['gardens', 'park'],
  ['museum', 'museum'], ['museums', 'museum'], ['gallery', 'museum'], ['galleries', 'museum'],
  ['zoo', 'zoo'], ['zoos', 'zoo'], ['farm', 'farm'], ['farms', 'farm'],
  ['soft', 'soft_play'], ['play', 'soft_play'], ['attraction', 'attraction'], ['attractions', 'attraction'],
  ['activity', 'activity'], ['activities', 'activity'], ['trampoline', 'activity'], ['bowling', 'activity'],
]);

/** Every typed word must either appear in the name or name the place's category. */
function matches(place, tokens) {
  if (!tokens.length) return true;
  const name = words(place.name);
  return tokens.every((t) => name.some((w) => w === t || w.startsWith(t)) || CATEGORY_WORDS.get(t) === place.category);
}

const encode = (d, id) => Buffer.from(JSON.stringify({ d, id })).toString('base64url');
function decode(cursor) {
  try {
    const c = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (typeof c.id === 'string' && (c.d === null || Number.isFinite(c.d))) return c;
  } catch { /* falls through */ }
  return null;
}

async function handleCatalogueRequest(req, res, deps = {}) {
  const read = deps.readCatalogue ?? catalogue.readCatalogue;
  const q = req.query ?? {};

  const hasAnchor = q.lat !== undefined || q.lng !== undefined;
  const anchor = hasAnchor ? { latitude: Number(q.lat), longitude: Number(q.lng) } : LONDON;
  if (!Number.isFinite(anchor.latitude) || !Number.isFinite(anchor.longitude) || Math.abs(anchor.latitude) > 90 || Math.abs(anchor.longitude) > 180) {
    return res.status(400).json({ error: 'Invalid location', code: 'INVALID_LOCATION' });
  }
  let radiusKm = null;
  if (q.radiusKm !== undefined && q.radiusKm !== '') {
    radiusKm = Number(q.radiusKm);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) return res.status(400).json({ error: 'Invalid radius', code: 'INVALID_RADIUS' });
    radiusKm = Math.min(radiusKm, MAX_RADIUS_KM);
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(q.limit)) || DEFAULT_LIMIT));
  const known = new Set(catalogue.EXPLORE_CATEGORIES);
  const categories = String(q.categories ?? '').split(',').map((c) => c.trim()).filter((c) => known.has(c));
  const tokens = words(q.q);
  const after = q.cursor ? decode(q.cursor) : null;
  if (q.cursor && !after) return res.status(400).json({ error: 'Invalid cursor', code: 'INVALID_CURSOR' });

  let all;
  try {
    all = await read();
  } catch {
    all = null;
  }
  if (!Array.isArray(all)) {
    // An outage is not an empty catalogue: say so, and do not cache it.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'The venue catalogue is unavailable', code: 'CATALOGUE_UNAVAILABLE', googleCalls: 0 });
  }

  // Distance from the anchor; a place with no position has none, is never inside a radius, and sorts last.
  const withDistance = all.map((place) => ({
    place,
    d: Number.isFinite(place.latitude) && Number.isFinite(place.longitude) ? haversineKm(anchor.latitude, anchor.longitude, place.latitude, place.longitude) : null,
  }));
  const inScope = withDistance.filter(({ place, d }) => (radiusKm === null || (d !== null && d <= radiusKm)) && matches(place, tokens));
  const countsByCategory = {};
  for (const { place } of inScope) countsByCategory[place.category] = (countsByCategory[place.category] ?? 0) + 1;

  const matched = inScope
    .filter(({ place }) => !categories.length || categories.includes(place.category))
    .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity) || (a.place.familypilotId < b.place.familypilotId ? -1 : 1));
  const start = after ? matched.findIndex(({ place, d }) => (d ?? Infinity) > (after.d ?? Infinity) || ((d ?? Infinity) === (after.d ?? Infinity) && place.familypilotId > after.id)) : 0;
  const from = start < 0 ? matched.length : start;
  const page = matched.slice(from, from + limit);
  const last = page[page.length - 1];
  const hasMore = from + limit < matched.length;

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    places: page.map(({ place, d }) => (d === null ? place : { ...place, distanceKm: Math.round(d * 100) / 100 })),
    total: matched.length,
    returned: page.length,
    hasMore,
    nextCursor: hasMore && last ? encode(last.d === null ? null : last.d, last.place.familypilotId) : null,
    countsByCategory,
    center: { latitude: anchor.latitude, longitude: anchor.longitude },
    radiusKm,
    provider: 'catalogue',
    intent: 'catalogue',
    googleCalls: 0,
    fetchedAt: new Date().toISOString(),
  });
}

module.exports = { handleCatalogueRequest, DEFAULT_LIMIT, MAX_LIMIT, MAX_RADIUS_KM };
