const { buildSearchCacheKey } = require('./search-cache');
const { DEFAULT_RADIUS_M } = require('./osm-food');
const { estimateWalkMinutes, CACHE_SCOPE, MAX_WALK_MINUTES } = require('./nearby-food');

/**
 * "Is there somewhere to eat close to this place?", answered for a whole list of venues WITHOUT asking a provider.
 *
 * The food lookup behind Venue Detail's "Restaurants close by" (`getNearbyFood`) stores what OpenStreetMap returned
 * for each anchor in `place_search_cache`. This module reads those stored rows, in one database query, and reduces each
 * to the three facts a filter needs. It never calls Overpass, never calls Google and never writes: a venue whose food
 * has not been looked up yet simply has no answer, and "no answer" stays "unknown" all the way to the screen. A parent
 * who asks for food within a five minute walk is shown the places we know about, plainly told how many we have not
 * been able to check, rather than being shown unchecked places as if they had food.
 *
 * The walk times are the same straight-line estimates Venue Detail shows (`estimateWalkMinutes`), so a card and the
 * detail page cannot disagree about how far the cafe is.
 */

const MAX_KEYS = 200;

function keyFor(place) {
  return buildSearchCacheKey({
    scope: CACHE_SCOPE,
    intent: 'restaurant',
    lat: place.latitude,
    lng: place.longitude,
    radiusKm: DEFAULT_RADIUS_M / 1000,
    categories: ['restaurant', 'cafe', 'fast_food'],
  });
}

/** Pure: reduce one stored discovery payload to the facts a filter and a card line need. */
function summariseFood(anchor, payload, checkedAt) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : null;
  if (!candidates) return null;
  const minutes = candidates
    .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude))
    .map((c) => estimateWalkMinutes(anchor.latitude, anchor.longitude, c.latitude, c.longitude))
    .filter((m) => m <= MAX_WALK_MINUTES)
    .sort((a, b) => a - b);
  return {
    checkedAt: checkedAt || payload.fetchedAt || null,
    nearestWalkMinutes: minutes.length ? minutes[0] : null,
    within5: minutes.filter((m) => m <= 5).length,
    within10: minutes.filter((m) => m <= 10).length,
    source: 'osm',
  };
}

/**
 * Adds `foodNearby` to each place that has a stored lookup. `db` is injectable so a test can prove how many queries
 * (one) and which tables (only the cache) are touched.
 */
async function attachFoodProximity(places, db) {
  if (!db || !Array.isArray(places) || places.length === 0) return places;
  const located = places.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).slice(0, MAX_KEYS);
  if (located.length === 0) return places;
  const keys = [...new Set(located.map(keyFor))];
  const { data, error } = await db.from('place_search_cache').select('cache_key, payload, fetched_at').in('cache_key', keys);
  if (error || !Array.isArray(data)) return places;
  const byKey = new Map(data.map((row) => [row.cache_key, row]));
  return places.map((place) => {
    if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return place;
    const row = byKey.get(keyFor(place));
    const foodNearby = row ? summariseFood(place, row.payload, row.fetched_at) : null;
    return foodNearby ? { ...place, foodNearby } : place;
  });
}

module.exports = { attachFoodProximity, summariseFood, keyFor };
