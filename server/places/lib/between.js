const { rowToPlace, EXPLORE_CATEGORIES, MAX_AGE_DAYS } = require('./catalogue');

/**
 * Places that could suit TWO families, read from the stored venue catalogue (`place_records`) and nothing else.
 *
 * WHY THIS EXISTS. Meet Halfway used to rank whatever Home had loaded, and Home is personalised to ONE family: it is the
 * first family's neighbourhood, sorted by the first family's Family Fit. The genuinely best compromise for two families
 * who live apart is usually somewhere Home never showed. So the candidates are chosen from the catalogue by geography
 * alone, before either family's preferences are applied.
 *
 * COST. A database read. No Google request, no budget unit, no new provider call: this module imports the catalogue row
 * mapper and nothing else, and the endpoint that serves it returns before the billable path (see `between-endpoint.js`
 * and the contract test). Journeys are NOT computed here at all; the client estimates them from distance.
 *
 * TWO STAGES, the first deliberately cheap:
 *   1. `firstPass` (here): straight-line distances from each home, a corridor around the two homes, and a fairness score
 *      (the longer leg matters more than the sum, and a lopsided split is penalised). It keeps a bounded shortlist.
 *   2. The app then asks the planner's own questions of that shortlist for BOTH families (limits, must-haves, age policy,
 *      Family Fit, routines). Nothing here decides whether a place suits a family.
 */

/** The most candidates the first pass hands on. A ceiling, so a hand-edited request cannot ask for the whole catalogue. */
const MAX_CANDIDATES = 80;
const DEFAULT_CANDIDATES = 60;
/** The most stored rows one request reads before the first pass narrows them. */
const STORED_ROW_CEILING = 800;
/** The two homes may be at most this far apart; further than that is a day trip, not a meeting. */
const MAX_APART_KM = 120;
/**
 * How far beyond the straight line between the homes a place may sit. A place is in the corridor when
 * (distance from A) + (distance from B) <= (A to B) + slack: an ellipse with the homes as its foci, so it is wide
 * in the middle and pinches at each home, not a circle around the midpoint.
 */
const MIN_SLACK_KM = 6;
const SLACK_RATIO = 0.6;

const toRad = (degrees) => (degrees * Math.PI) / 180;

function haversineKm(aLat, aLng, bLat, bLng) {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const clampInt = (value, min, max, fallback) => {
  // null, undefined and '' are "not given": Number(null) is 0, which would clamp a missing limit to the minimum.
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
};

/** The corridor's slack for homes this far apart. */
const slackFor = (apartKm) => Math.max(MIN_SLACK_KM, apartKm * SLACK_RATIO);

/**
 * The first pass: a bounded shortlist of stored places that are plausible for both homes, fairest first.
 *
 * Pure. `a` and `b` are `{ latitude, longitude }`; `maxKmA` / `maxKmB` are each family's own reach in straight-line km
 * (omit for no limit). Fairness is `max(dA, dB) + 0.5 * |dA - dB|`: the longer journey dominates, and an uneven split costs.
 *
 * @returns {Array<{ place: any, kmA: number, kmB: number, fairness: number }>}
 */
function firstPass(a, b, places, options = {}) {
  const limit = clampInt(options.limit, 1, MAX_CANDIDATES, DEFAULT_CANDIDATES);
  const apart = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
  const slack = slackFor(apart);
  const scored = [];
  for (const place of places) {
    if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) continue;
    const kmA = haversineKm(a.latitude, a.longitude, place.latitude, place.longitude);
    const kmB = haversineKm(b.latitude, b.longitude, place.latitude, place.longitude);
    if (kmA + kmB > apart + slack) continue;
    if (Number.isFinite(options.maxKmA) && kmA > options.maxKmA) continue;
    if (Number.isFinite(options.maxKmB) && kmB > options.maxKmB) continue;
    scored.push({ place, kmA, kmB, fairness: Math.max(kmA, kmB) + 0.5 * Math.abs(kmA - kmB) });
  }
  scored.sort((x, y) => x.fairness - y.fairness || String(x.place.name).localeCompare(String(y.place.name)));
  return scored.slice(0, limit);
}

/** A latitude/longitude box that contains the whole corridor, so the database narrows before the first pass does. */
function corridorBounds(a, b) {
  const apart = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
  const padKm = (apart + slackFor(apart)) / 2;
  const padLat = padKm / 111;
  const midLat = (a.latitude + b.latitude) / 2;
  const padLng = padKm / (111 * Math.max(0.2, Math.cos(toRad(midLat))));
  return {
    minLat: Math.min(a.latitude, b.latitude) - padLat,
    maxLat: Math.max(a.latitude, b.latitude) + padLat,
    minLng: Math.min(a.longitude, b.longitude) - padLng,
    maxLng: Math.max(a.longitude, b.longitude) + padLng,
  };
}

function db() {
  try {
    const { getSupabaseAdmin } = require('../../enrichment/_lib/supabase-admin');
    return getSupabaseAdmin();
  } catch {
    return null;
  }
}

/**
 * Reads the stored places in the corridor and runs the first pass.
 *
 * `available: false` means the database could not be reached, which is NOT the same as "no places": the caller says
 * so rather than telling a parent there is nothing between them.
 *
 * @param {{ a: {latitude:number,longitude:number}, b: {latitude:number,longitude:number}, maxKmA?: number, maxKmB?: number, limit?: number, client?: any, now?: number }} options
 */
async function readBetween(options) {
  const { a, b } = options;
  const client = options.client ?? db();
  if (!client) return { available: false, places: [], considered: 0 };
  const now = options.now ?? Date.now();
  const since = new Date(now - MAX_AGE_DAYS * 86400000).toISOString();
  const box = corridorBounds(a, b);
  try {
    const { data, error } = await client
      .from('place_records')
      .select(
        'familypilot_place_id,external_id,provider,name,category,lat,lng,address,description,opening_hours,website,phone,photos,is_open,fetched_at,field_provenance',
      )
      .eq('provider', 'google')
      .in('category', EXPLORE_CATEGORIES)
      .gte('fetched_at', since)
      .gte('lat', box.minLat)
      .lte('lat', box.maxLat)
      .gte('lng', box.minLng)
      .lte('lng', box.maxLng)
      .limit(STORED_ROW_CEILING);
    if (error || !Array.isArray(data)) return { available: false, places: [], considered: 0 };
    const stored = data.filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng)).map(rowToPlace);
    const shortlist = firstPass(a, b, stored, options);
    return { available: true, places: shortlist.map((entry) => entry.place), considered: stored.length };
  } catch {
    return { available: false, places: [], considered: 0 };
  }
}

module.exports = {
  firstPass,
  corridorBounds,
  readBetween,
  haversineKm,
  slackFor,
  MAX_CANDIDATES,
  DEFAULT_CANDIDATES,
  STORED_ROW_CEILING,
  MAX_APART_KM,
};
