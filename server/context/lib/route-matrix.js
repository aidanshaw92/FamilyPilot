/**
 * Google Routes API `computeRouteMatrix`, traffic-unaware.
 *
 * Both of those are owner decisions, recorded in `docs/routing-decisions.md`:
 *
 * 1. **Routes API, not legacy Distance Matrix.** The endpoint this replaces was
 *    `maps.googleapis.com/maps/api/distancematrix/json`, which new Cloud projects can no longer enable
 *    and whose JS counterpart was deprecated in February 2026. It had never been called in production,
 *    so nothing was migrated away from -- the choice was which API to call the first time.
 * 2. **Traffic-unaware.** A traffic-aware request moves the call into the Pro tier, which doubles the
 *    unit price ($10.00 vs $5.00 per 1,000 elements) and halves the free monthly allowance (5,000 vs
 *    10,000). The legacy call set `departure_time=now` and preferred `duration_in_traffic`, which is
 *    exactly that tier, so this is a change in billing behaviour and not only in endpoint.
 *
 * `routingPreference` is set EXPLICITLY to `TRAFFIC_UNAWARE` rather than left to the API's default. The
 * default for DRIVE is traffic-unaware today, but a default is not a commitment, and the cost of being
 * wrong here is a silent doubling of the unit price. A test asserts the field is present and its value.
 *
 * NOT VERIFIED AGAINST THE LIVE API. `routes.googleapis.com` is reachable in production but denied by
 * this development environment's egress policy, and calling it costs money besides. Everything here is
 * built against recorded response shapes and exercised by fixtures. The request shape, the field mask and
 * the duration parsing are therefore **unproven against the real service** until the owner enables the
 * API and a canary measures predicted against actual billable elements. That is stated here rather than
 * left for someone to assume otherwise.
 */

/** Billing is per element of the request matrix, which is origins x destinations. */
const ENDPOINT = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';

/**
 * The fields asked for, which the API requires: an unmasked request is rejected outright.
 *
 * Deliberately minimal. `condition` says whether a route exists at all, and `status` says why not when
 * it does not, which is the difference between "no road connects these" and "we sent something wrong".
 * Asking for distance or polylines would be asking for data no FamilyPilot surface shows.
 */
const FIELD_MASK = 'originIndex,destinationIndex,duration,condition,status';

/** Routes API's own ceiling for DRIVE: 625 elements per request. Ours is far lower, by MAX_DESTINATIONS. */
const PROVIDER_MAX_ELEMENTS = 625;

const REQUEST_TIMEOUT_MS = 10000;

/** `{ latitude, longitude }` in the shape the Routes API wants a waypoint. */
function waypoint(point) {
  return { waypoint: { location: { latLng: { latitude: point.latitude, longitude: point.longitude } } } };
}

/**
 * Seconds out of a protobuf Duration, which arrives as a string like `"842s"`.
 *
 * Returns null rather than 0 for anything unparseable. A zero would schedule a day around an instant
 * journey, which is worse than falling back to the distance estimate that the caller already has.
 */
function durationSeconds(duration) {
  if (typeof duration === 'number' && Number.isFinite(duration)) return duration;
  if (typeof duration !== 'string') return null;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(duration.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Whether an element carries a usable duration.
 *
 * `ROUTE_EXISTS` is the only condition that means yes. An element can come back with an OK status and
 * `ROUTE_NOT_FOUND` -- the request was fine, there is simply no drivable route -- and treating that as a
 * success would put a missing number into a plan.
 */
function elementHasRoute(element) {
  if (!element || typeof element !== 'object') return false;
  if (element.condition !== 'ROUTE_EXISTS') return false;
  // `status` is absent or `{}` for a healthy element; a populated `code` is an error.
  if (element.status && typeof element.status === 'object' && element.status.code) return false;
  return durationSeconds(element.duration) !== null;
}

/**
 * One matrix request, returning seconds keyed by `originIndex:destinationIndex`.
 *
 * @param {Array<{latitude:number,longitude:number}>} origins
 * @param {Array<{latitude:number,longitude:number}>} destinations
 * @param {string} apiKey
 * @param {{ fetchImpl?: Function }} [deps]
 * @returns {Promise<Map<string, number>>}
 */
async function computeRouteMatrix(origins, destinations, apiKey, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;

  if (!Array.isArray(origins) || origins.length === 0) throw new Error('At least one origin is required');
  if (!Array.isArray(destinations) || destinations.length === 0) {
    throw new Error('At least one destination is required');
  }

  const elements = origins.length * destinations.length;
  if (elements > PROVIDER_MAX_ELEMENTS) {
    // Refused here rather than sent and rejected: a request the provider will not serve is still a
    // request, and the caller's own cap should have prevented it.
    throw new Error(`Route matrix would be ${elements} elements, above the provider maximum of ${PROVIDER_MAX_ELEMENTS}`);
  }

  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      origins: origins.map(waypoint),
      destinations: destinations.map(waypoint),
      travelMode: 'DRIVE',
      // The decision, stated rather than inherited. See the module comment.
      routingPreference: 'TRAFFIC_UNAWARE',
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    // The body can carry an API error explaining a 400, but it can also carry the key back in an echoed
    // request, so nothing from it is logged or attached to the thrown error.
    throw new Error(`Route matrix request failed (${response.status})`);
  }

  const payload = await response.json();
  // computeRouteMatrix answers with a JSON array of elements, not an object with a rows field.
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.elements) ? payload.elements : [];

  const seconds = new Map();
  for (const element of rows) {
    if (!elementHasRoute(element)) continue;
    const originIndex = Number(element.originIndex ?? 0);
    const destinationIndex = Number(element.destinationIndex ?? 0);
    if (!Number.isInteger(originIndex) || !Number.isInteger(destinationIndex)) continue;
    seconds.set(`${originIndex}:${destinationIndex}`, durationSeconds(element.duration));
  }
  return seconds;
}

module.exports = {
  ENDPOINT,
  FIELD_MASK,
  PROVIDER_MAX_ELEMENTS,
  REQUEST_TIMEOUT_MS,
  computeRouteMatrix,
  durationSeconds,
  elementHasRoute,
};
