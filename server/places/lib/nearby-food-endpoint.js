const nearbyFood = require('./nearby-food');
const osmFood = require('./osm-food');

/**
 * The HTTP handling for `intent=nearby-food`, in a module that holds no Google anything.
 *
 * WHY THIS IS ITS OWN FILE even though it is called from the search handler. Food discovery belongs in
 * its own serverless function, where reaching Google would be structurally impossible. Vercel's
 * deployment budget is twelve functions and a thirteenth fails the deploy, so it has to be invoked
 * from `api/places/search.js` -- which is a file that CAN reach Google.
 *
 * Putting the handling here recovers most of what the separate function gave us: the code that answers
 * a food request lives in a module whose entire import graph (nearby-food -> osm-food -> geo-utils,
 * search-cache) contains no API key, no budget gate and no Google client. The search handler's only
 * involvement is one early `return` before it does anything billable. That return is the one line that
 * has to stay correct, and it is asserted by contract tests rather than trusted.
 *
 * It also makes the guarantee testable: `search.js` calls this through the module object, so a test can
 * replace the implementation and prove the delegation happens before the Google path is touched.
 */

/**
 * @param {{ query: Record<string, string> }} req
 * @param {{ status: Function, json: Function, setHeader: Function }} res
 * @param {{ getNearbyFood?: Function }} [deps]
 */
async function handleNearbyFoodRequest(req, res, deps = {}) {
  const getNearbyFood = deps.getNearbyFood ?? nearbyFood.getNearbyFood;

  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lng);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    // A 400, never a fall-through. Falling through would hand a food request to the provider chain,
    // which in production starts at Google.
    return res.status(400).json({ error: 'Invalid anchor coordinates', code: 'INVALID_ANCHOR' });
  }

  // Bounded here as well as inside the provider, so a hand-edited URL cannot ask for a London-wide
  // food sweep even if the module's own clamp were ever relaxed.
  const requestedRadius = Number(req.query.radiusM);
  const radiusM = Number.isFinite(requestedRadius)
    ? Math.min(Math.max(Math.round(requestedRadius), 200), osmFood.MAX_RADIUS_M)
    : osmFood.DEFAULT_RADIUS_M;

  const requestedLimit = Number(req.query.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.round(requestedLimit), 1), 20)
    : 20;

  const placeId = typeof req.query.placeId === 'string' ? req.query.placeId.slice(0, 120) : undefined;

  try {
    const result = await getNearbyFood({ latitude, longitude, placeId }, { radiusM, limit });
    if (result.cacheState !== 'bypass') {
      res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    }
    return res.status(200).json(result);
  } catch (error) {
    // A provider outage is not an empty neighbourhood. Returning `candidates: []` would tell a parent
    // there is nowhere to eat nearby, which is a false fact rather than a missing one, so the failure
    // is surfaced and the client renders its own unknown state.
    console.warn(
      JSON.stringify({
        tag: 'nearby_food_lookup_failed',
        message: error instanceof Error ? error.message : 'lookup failed',
      }),
    );
    return res.status(503).json({
      error: 'Restaurant lookup is unavailable just now',
      code: 'FOOD_PROVIDER_UNAVAILABLE',
      provider: 'osm',
      googleCalls: 0,
    });
  }
}

module.exports = { handleNearbyFoodRequest };
