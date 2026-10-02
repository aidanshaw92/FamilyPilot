const { searchOsmFood, DEFAULT_RADIUS_M, clampRadius } = require('./osm-food');
const { buildSearchCacheKey, readSearchCache, writeSearchCache } = require('./search-cache');
const { estimateDriveMinutes, distanceKm } = require('../../context/lib/geo-utils');

/**
 * Restaurants near one anchor, cached, with travel times a parent can act on.
 *
 * THE RULE THIS LAYER EXISTS FOR. "Do not make every Venue Detail render issue a fresh Overpass
 * request." The anchor's coordinates are the cache key, so the first parent to open a venue pays one
 * Overpass request and everyone after them reads a stored row. Overpass is free but it is public
 * infrastructure, and free is not a licence to be rude to it.
 *
 * DISCOVERY FIRST, ROUTING SECOND. The travel figures below are straight-line estimates computed
 * arithmetically -- no provider, no network, no cost. A venue with twenty candidates therefore costs
 * zero routing calls, not sixty. That is deliberate: routing twenty candidates across three modes on
 * every Venue Detail open is precisely the spend this design avoids. Routing is reserved for the one
 * candidate that becomes a real stop in a plan, where the matrix already measures it.
 *
 * WHICH MEANS EVERY NUMBER HERE IS AN ESTIMATE, AND SAYS SO. Each mode carries
 * `source: 'estimated'`, and the public transport figure is deliberately ABSENT rather than
 * estimated: a straight line says nothing about whether a bus or a train runs, and inventing a
 * public-transport duration from distance would be the worst kind of fabricated fact. Unknown stays
 * unknown.
 */

/** Cache rows are keyed by this scope, so food lookups never collide with venue discovery. */
const CACHE_SCOPE = 'nearby-food';

/**
 * How many candidates a surface is given. Generous enough to rank, small enough that a response
 * stays small and a list stays readable.
 */
const MAX_CANDIDATES = 20;

/**
 * Average speeds for the straight-line estimates, with a detour factor, because nobody walks or
 * drives in a straight line.
 *
 * Walking: 4.5 km/h is an adult pace; with a four-year-old and a pushchair it is slower, so 3.6 is
 * used instead. The detour factor is higher for walking than driving because pedestrian routes bend
 * around blocks, crossings and rivers.
 */
const WALK_KMH = 3.6;
const WALK_DETOUR = 1.35;
/** Driving reuses the same estimator the journey endpoint falls back on, so the two agree. */

/** Beyond this a walk with children is not a realistic suggestion, however short the line looks. */
const MAX_WALK_MINUTES = 25;

function estimateWalkMinutes(fromLat, fromLng, toLat, toLng) {
  const km = distanceKm(fromLat, fromLng, toLat, toLng) * WALK_DETOUR;
  return Math.max(1, Math.round((km / WALK_KMH) * 60));
}

/**
 * The travel options for one candidate, each labelled with how it was obtained.
 *
 * Walking is omitted entirely past MAX_WALK_MINUTES rather than shown as a large number, because
 * "about 90 min walk" is not an option a parent with a toddler is choosing between -- it is noise in
 * a list they are scanning. Public transport is always absent, for the reason in the module comment.
 */
function travelOptionsFor(anchor, candidate) {
  const walkMinutes = estimateWalkMinutes(
    anchor.latitude,
    anchor.longitude,
    candidate.latitude,
    candidate.longitude,
  );
  const driveMinutes = estimateDriveMinutes(
    anchor.latitude,
    anchor.longitude,
    candidate.latitude,
    candidate.longitude,
  );

  /**
   * Both legs carry `source: 'estimated-distance'` and a confidence, matching the TravelLeg shape the
   * client uses. Neither is routed: no provider was asked, no network was consulted, nothing was paid.
   *
   * Walking's confidence is LOW, and lower than driving's, deliberately. A detour factor applied to a
   * straight line is a much worse model of a walk than of a drive: pedestrian routes bend around
   * blocks, crossings, rivers and railways, and a river between the two points can double the real
   * journey while leaving the straight line untouched. Assuming a walking pace does not give a route.
   */
  const options = [];
  if (walkMinutes <= MAX_WALK_MINUTES) {
    options.push({
      mode: 'walk',
      durationMinutes: walkMinutes,
      source: 'estimated-distance',
      confidence: 'low',
    });
  }
  options.push({
    mode: 'drive',
    durationMinutes: driveMinutes,
    source: 'estimated-distance',
    confidence: 'medium',
  });
  // No transit entry. Its absence is the honest answer, and a surface renders it as unknown rather
  // than as a number nobody can stand behind.
  return options;
}

/**
 * Ranks by how useful the candidate is for a family stop, not by straight-line distance alone.
 *
 * Deliberately shallow. The inputs are only things OpenStreetMap actually told us, and the weights
 * are small and few, because a ranking tuned past the evidence is a ranking that pretends to know
 * more than it does. Walkability dominates, because a lunch stop you can walk to is categorically
 * easier with children than one that needs the car reloaded.
 */
function usefulness(candidate) {
  const walk = candidate.travel.find((option) => option.mode === 'walk');
  let score = 0;
  // Walkable at all is the single biggest factor; closer is better within that.
  if (walk) score += 40 + Math.max(0, 25 - walk.durationMinutes);
  else score += Math.max(0, 20 - candidate.distanceKm * 4);
  // Knowing when it opens is worth something to a parent planning a time, so a mapped
  // `opening_hours` ranks above a silent one. It is NOT a claim that the place is open.
  if (candidate.openingHours) score += 8;
  // A cafe is usually faster and more forgiving with small children than a restaurant.
  if (candidate.category === 'cafe') score += 5;
  // Tags that genuinely bear on eating with children, each counted once and only when tagged yes.
  if (candidate.tagged.highchair) score += 6;
  if (candidate.tagged.changingTable) score += 4;
  if (candidate.tagged.outdoorSeating) score += 2;
  return score;
}

/**
 * The collaborators, injectable.
 *
 * Same pattern as `buildJourneyMatrix(input, deps)`: the provider and the cache are passed in rather
 * than reached for, so a test can state exactly how many provider requests a sequence of reads costs
 * without mocking module internals. That matters more here than usual -- a test that accidentally
 * reached the real `searchOsmFood` would be making live Overpass requests on every push, which is
 * the abuse of public infrastructure this whole design is trying to avoid.
 */
const DEFAULT_DEPS = {
  search: searchOsmFood,
  readCache: readSearchCache,
  writeCache: writeSearchCache,
};

/**
 * @param {{latitude:number, longitude:number, placeId?:string}} anchor
 * @param {{radiusM?:number, limit?:number, forceRefresh?:boolean}} [options]
 * @param {Partial<typeof DEFAULT_DEPS>} [deps]
 */
async function getNearbyFood(anchor, options = {}, deps = {}) {
  const { search, readCache, writeCache } = { ...DEFAULT_DEPS, ...deps };
  if (!anchor || !Number.isFinite(anchor.latitude) || !Number.isFinite(anchor.longitude)) {
    throw new Error('A valid anchor latitude and longitude are required');
  }

  const radiusM = clampRadius(options.radiusM ?? DEFAULT_RADIUS_M);
  const limit = Math.min(Math.max(Number(options.limit) || MAX_CANDIDATES, 1), MAX_CANDIDATES);

  const cacheKey = buildSearchCacheKey({
    scope: CACHE_SCOPE,
    intent: 'restaurant',
    lat: anchor.latitude,
    lng: anchor.longitude,
    // The stored key is in kilometres, so two radii that round together share a row. Candidates are
    // sorted by distance, so a smaller radius can be served from a wider row by filtering.
    radiusKm: radiusM / 1000,
    categories: ['restaurant', 'cafe', 'fast_food'],
  });

  let discovery = null;
  let cacheState = 'bypass';

  if (!options.forceRefresh) {
    const cached = await readCache(cacheKey);
    if (cached?.payload?.candidates) {
      discovery = cached.payload;
      cacheState = cached.fresh ? 'hit' : 'stale';
    }
  }

  if (!discovery) {
    discovery = await search(anchor, { radiusM });
    cacheState = 'miss';
    // Best effort. A cache write failing must not fail the lookup it was meant to make cheaper --
    // it only means the next reader pays for Overpass again.
    await writeCache(
      cacheKey,
      { candidates: discovery.candidates, radiusM: discovery.radiusM, fetchedAt: discovery.fetchedAt },
      { provider: 'osm', billableCalls: 0 },
    );
  }

  const withTravel = (discovery.candidates || [])
    .filter((candidate) => candidate.distanceKm * 1000 <= radiusM)
    .map((candidate) => ({ ...candidate, travel: travelOptionsFor(anchor, candidate) }));

  const ranked = withTravel
    .map((candidate) => ({ candidate, score: usefulness(candidate) }))
    .sort((a, b) => b.score - a.score || a.candidate.distanceKm - b.candidate.distanceKm)
    .slice(0, limit)
    .map(({ candidate }) => candidate);

  return {
    anchor: { latitude: anchor.latitude, longitude: anchor.longitude, placeId: anchor.placeId ?? null },
    candidates: ranked,
    totalFound: withTravel.length,
    provider: 'osm',
    // So a caller can prove no Google request was involved rather than trusting that it was not.
    googleCalls: 0,
    overpassRequests: cacheState === 'miss' ? (discovery.overpassRequests ?? 1) : 0,
    cacheState,
    radiusM,
    fetchedAt: discovery.fetchedAt,
    // The ODbL credit the surface owes for every candidate here.
    attribution: 'osm',
  };
}

module.exports = {
  getNearbyFood,
  travelOptionsFor,
  usefulness,
  estimateWalkMinutes,
  CACHE_SCOPE,
  MAX_CANDIDATES,
  MAX_WALK_MINUTES,
};
