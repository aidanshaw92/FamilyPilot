/**
 * The stored venue catalogue: places FamilyPilot already holds in `place_records`, served without asking Google
 * for anything.
 *
 * WHY THIS EXISTS. Home and Explore used to show only what the most recent London discovery search returned: nine
 * Nearby Search requests, twenty results each, ranked by popularity across one mixed list of 21 place types. Parks
 * and museums are the most popular things in London, so they filled the page (62 of 79 served places) and the farms,
 * soft-play centres and activity venues that ARE in the database were never shown: 2 farms were served while 8 were
 * stored, 2 soft-play centres while 5 were stored. A category with a handful of results reads as "nothing here".
 *
 * `place_records` is the data the cost-controlled ingestion (area sync, discovery upserts) has already paid for, with
 * its provenance and fetch time. Reading it is a database query and nothing else: no Google request is made here,
 * and `catalogue.test.ts` pins that. Rows older than the same hard stop the detail endpoint uses are not served, so
 * this cannot become an indefinite store of provider content.
 *
 * This is a UNION with the live search, not a replacement: a fresh search still contributes whatever is newer.
 */

/** The same ceiling the detail endpoint applies to stored provider content. */
const MAX_AGE_DAYS = 30;

/** Everything a parent can browse. Restaurants and cafes are served separately, as context for a day out. */
const EXPLORE_CATEGORIES = ['park', 'museum', 'zoo', 'farm', 'attraction', 'activity', 'soft_play', 'beach'];

/** The scope the London search covers: the app's own centre and radius. */
const LONDON = { lat: 51.5074, lng: -0.1278, radiusKm: 40 };

function haversineKm(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function db() {
  try {
    const { getSupabaseAdmin } = require('../../enrichment/_lib/supabase-admin');
    return getSupabaseAdmin();
  } catch {
    return null;
  }
}

/** A `place_records` row, in the shape the search endpoint returns for a live result. */
function rowToPlace(row) {
  const hours = row.opening_hours && typeof row.opening_hours === 'object' && !Array.isArray(row.opening_hours) ? row.opening_hours : undefined;
  return {
    familypilotId: row.familypilot_place_id,
    externalId: row.external_id,
    provider: row.provider,
    name: row.name,
    latitude: row.lat,
    longitude: row.lng,
    category: row.category,
    address: row.address ?? undefined,
    description: row.description ?? undefined,
    openingHours: hours && (Array.isArray(hours.periods) || (Array.isArray(hours.weekdayText) && hours.weekdayText.length)) ? hours : undefined,
    website: row.website ?? undefined,
    phone: row.phone ?? undefined,
    photos: Array.isArray(row.photos) ? row.photos.filter((p) => typeof p === 'string') : [],
    // The stored flag is a snapshot from when the row was fetched. It is passed on with `fetchedAt` so the app can
    // tell how stale it is; the schedule, not this flag, decides what "open today" means.
    isOpen: typeof row.is_open === 'boolean' ? row.is_open : undefined,
    fetchedAt: row.fetched_at,
    enrichmentStatus: 'provider_only',
    googlePrimaryType: row.field_provenance?.googlePrimaryType,
    googleTypes: row.field_provenance?.googleTypes || [],
  };
}

/**
 * Reads the stored venues inside the London scope. Returns [] when the database is unavailable: the catalogue is an
 * addition to the live result, and its absence must degrade to exactly what was served before.
 *
 * @param {{ client?: any, now?: number }} [options] `client` is injectable for tests.
 */
async function readCatalogue(options = {}) {
  const client = options.client ?? db();
  if (!client) return [];
  const now = options.now ?? Date.now();
  const since = new Date(now - MAX_AGE_DAYS * 86400000).toISOString();
  try {
    const { data, error } = await client
      .from('place_records')
      .select(
        'familypilot_place_id,external_id,provider,name,category,lat,lng,address,description,opening_hours,website,phone,photos,is_open,fetched_at,field_provenance',
      )
      .eq('provider', 'google')
      .in('category', EXPLORE_CATEGORIES)
      .gte('fetched_at', since)
      .limit(400);
    if (error || !Array.isArray(data)) return [];
    return data
      .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng))
      .filter((row) => haversineKm(LONDON.lat, LONDON.lng, row.lat, row.lng) <= LONDON.radiusKm)
      .map(rowToPlace);
  } catch {
    return [];
  }
}

/**
 * The live places first (they are the freshest), then every stored place the live result does not already contain.
 * Keyed by FamilyPilot id, so a venue present in both is served once, from the live copy.
 */
function mergeCatalogue(livePlaces, storedPlaces, limit = 160) {
  const merged = new Map();
  for (const place of livePlaces) merged.set(place.familypilotId, place);
  for (const place of storedPlaces) {
    if (merged.size >= limit) break;
    if (!merged.has(place.familypilotId)) merged.set(place.familypilotId, place);
  }
  return [...merged.values()];
}

module.exports = { readCatalogue, mergeCatalogue, rowToPlace, EXPLORE_CATEGORIES, MAX_AGE_DAYS };
