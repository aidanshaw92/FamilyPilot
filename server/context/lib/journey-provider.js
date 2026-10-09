const { estimateDriveMinutes } = require('./geo-utils');
const { computeRouteMatrix } = require('./route-matrix');
const {
  reservePlacesCall,
  PlacesDisabledError,
  PlacesBudgetExceededError,
} = require('../../places/lib/places-budget');

/**
 * `computeRouteMatrix` bills per origin-destination ELEMENT, not per request, so one call here is up to
 * 25 billable units.
 *
 * Two things were missing and are now in place: nothing stopped the call being made at all from a
 * public unauthenticated endpoint, and the budget counted REQUESTS, so this cap of 25 destinations
 * consumed a single unit of a 2,000-unit daily ceiling. The gate is told origins and destinations
 * below, and the ceiling now applies to elements.
 *
 * Well under the provider's own 625-element ceiling, so our cap is the binding one.
 */
const MAX_DESTINATIONS = 25;

function estimateJourneys(origin, destinations) {
  return destinations.map((destination) => ({
    placeId: destination.placeId,
    driveMinutes: estimateDriveMinutes(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude,
    ),
    source: 'estimated',
  }));
}

/**
 * Routed drive times from the Routes API, falling back per destination rather than wholesale.
 *
 * One origin by construction, so every element is `0:index`. A destination the provider could not route
 * to keeps its distance estimate and stays labelled `estimated`, which is the honest answer for that one
 * leg and leaves the rest of the matrix usable. Collapsing the whole response to estimates because one
 * element failed would throw away paid results.
 */
async function fetchRoutedDriveTimes(origin, destinations, apiKey, deps = {}) {
  const seconds = await computeRouteMatrix([origin], destinations, apiKey, deps);

  return destinations.map((destination, index) => {
    const value = seconds.get(`0:${index}`);
    if (value != null) {
      return {
        placeId: destination.placeId,
        // At least a minute: a sub-60-second drive rounding to 0 would schedule an instant journey.
        driveMinutes: Math.max(1, Math.round(value / 60)),
        source: 'live',
      };
    }

    return {
      placeId: destination.placeId,
      driveMinutes: estimateDriveMinutes(
        origin.latitude,
        origin.longitude,
        destination.latitude,
        destination.longitude,
      ),
      source: 'estimated',
    };
  });
}

/**
 * @param {{latitude:number,longitude:number}} origin
 * @param {Array<{placeId:string,latitude:number,longitude:number}>} destinations
 * @param {{ fetchImpl?: Function }} [deps] Injected for tests, so no suite can reach the real API.
 */
async function getDriveTimes(origin, destinations, deps = {}) {
  if (!origin || !Array.isArray(destinations) || destinations.length === 0) {
    throw new Error('Origin and destinations are required');
  }

  const validDestinations = destinations
    .filter(
      (destination) =>
        destination?.placeId &&
        Number.isFinite(destination.latitude) &&
        Number.isFinite(destination.longitude),
    )
    .slice(0, MAX_DESTINATIONS);

  if (validDestinations.length === 0) {
    return { journeys: [], provider: 'fallback', source: 'estimated' };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return {
      journeys: estimateJourneys(origin, validDestinations),
      provider: 'fallback',
      source: 'estimated',
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    // Routed driving is billable, so it answers to the same gate as Places. The estimated-journey
    // fallback below is already a first-class result the API labels as `source: 'estimated'`, so a
    // closed gate degrades the accuracy of a drive time rather than breaking the planner.
    //
    // THIS IS THE LINE THAT KEEPS ROUTING OFF. It runs before any request is built, and the `journeys`
    // scope carries `requiresExplicitEnable`, so an absent flag is a refusal rather than an inheritance.
    await reservePlacesCall({
      scope: 'journeys',
      reason: 'drive_times',
      subject: `${validDestinations.length} destinations`,
      // The SKU bills per origin-destination element, so the budget is told the SHAPE of the request
      // rather than the fact that one was made. One origin here, by construction.
      origins: 1,
      destinations: validDestinations.length,
      routeMode: 'driving',
    });
    const journeys = await fetchRoutedDriveTimes(origin, validDestinations, apiKey, deps);
    const source = journeys.some((journey) => journey.source === 'live') ? 'live' : 'estimated';
    return {
      journeys,
      provider: 'google',
      source,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const blocked =
      error instanceof PlacesDisabledError || error instanceof PlacesBudgetExceededError;
    return {
      journeys: estimateJourneys(origin, validDestinations),
      provider: 'fallback',
      source: 'estimated',
      // Named so a reader of the response can tell a switched-off journey API from a broken one.
      fallbackReason: blocked ? error.code : undefined,
      fetchedAt: new Date().toISOString(),
    };
  }
}

module.exports = {
  MAX_DESTINATIONS,
  estimateJourneys,
  getDriveTimes,
};
