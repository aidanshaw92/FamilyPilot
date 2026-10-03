/**
 * Public transport via the TfL Unified API Journey Planner.
 *
 * The owner's decision (`docs/routing-decisions.md` §3): TfL for the London phase, not paid Google
 * TRANSIT. TfL publishes this as open data, it is free, and it covers London specifically.
 *
 * NOT VERIFIED AGAINST THE LIVE API. `api.tfl.gov.uk` is denied by the development environment's egress
 * policy, so the request shape, the response parsing and the rate-limit handling here are built against
 * the documented contract and exercised by fixtures ONLY. Read this module as "written and gated", not
 * as "working". That is why it is behind a flag even though it costs nothing: the flag is about an
 * unproven parser, not about money, and transit stays absent from the UI until somebody with access has
 * watched it answer.
 *
 * FOUR HONESTY RULES ARE STRUCTURAL HERE, not conventions a reader has to remember:
 *
 * 1. **Outside London is UNKNOWN, never "no service".** TfL returns nothing for a journey it does not
 *    cover, and reporting that as "no public transport" would be a false fact about, say, Manchester.
 *    The bounding-box check runs before any request, and its result is a distinct state.
 * 2. **Departure times are never cached.** A journey result embeds *when* the next service leaves, so a
 *    cached one serves a parent yesterday's bus. Nothing here writes to a cache.
 * 3. **🚌 only when the journey really is buses.** A mixed tube-and-bus journey is 🚇 Public transport.
 *    Calling everything "Bus" was explicitly forbidden, and the mode is derived from the legs TfL
 *    actually returned.
 * 4. **A TfL journey is `routed`, not `estimated`.** It is a real plan over a real network, so it may be
 *    stated plainly. This is the one place in the product where a non-driving mode earns that.
 */

const TFL_BASE = 'https://api.tfl.gov.uk';

/** The credit TfL's terms require. Their branding must NOT be used and we must not look official. */
const TFL_ATTRIBUTION = 'Powered by the Transport for London Journey Planner API';

/**
 * Greater London plus a margin, as a bounding box.
 *
 * Deliberately a box rather than a polygon: a box is wrong at the corners, and wrong here means asking
 * TfL about a journey it will decline, which costs one wasted request and returns `unknown` -- the same
 * answer the box would have given. A polygon would be more precise about something that does not need
 * precision. The failure to avoid is the opposite one: treating a decline as "no service".
 */
const LONDON_BOUNDS = { minLat: 51.25, maxLat: 51.72, minLng: -0.55, maxLng: 0.34 };

/**
 * Requests per minute, defaulting well below the documented anonymous ceiling.
 *
 * The two figures I have disagree: an earlier note recorded roughly 500/day unauthenticated, the owner
 * reports 50/minute anonymous and 500/minute registered. `api.tfl.gov.uk` is unreachable from here so I
 * cannot settle it, and the honest response to an unresolved limit is to sit far under both rather than
 * to pick the generous one. 20/minute is the default; `TFL_MAX_REQUESTS_PER_MINUTE` raises it once the
 * owner has registered and knows the real ceiling.
 */
const DEFAULT_MAX_PER_MINUTE = 20;
const WINDOW_MS = 60_000;

const ABORT_MS = 8000;

/** In-process sliding window. Per-instance, like the Places budget's window, and stated as such. */
const recentRequests = [];

class TflDisabledError extends Error {
  constructor(detail) {
    super(`TfL transit is disabled: ${detail}`);
    this.name = 'TflDisabledError';
    this.code = 'TRANSIT_DISABLED';
  }
}

class TflRateLimitedError extends Error {
  constructor(detail) {
    super(`TfL transit rate limit: ${detail}`);
    this.name = 'TflRateLimitedError';
    this.code = 'TRANSIT_RATE_LIMITED';
  }
}

function maxPerMinute() {
  const raw = Number(process.env.TFL_MAX_REQUESTS_PER_MINUTE);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MAX_PER_MINUTE;
  return Math.min(Math.round(raw), 500);
}

/**
 * Whether transit is switched on at all.
 *
 * Fail-closed and explicit, for the same reason the paid routing scope is: an unset variable must not
 * be the thing that turns on a provider nobody has watched work. Unlike the Google scopes, this one is
 * not about money.
 */
function transitEnabled() {
  return process.env.TFL_TRANSIT_ENABLED === 'true';
}

function withinLondon(point) {
  if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return false;
  return (
    point.latitude >= LONDON_BOUNDS.minLat &&
    point.latitude <= LONDON_BOUNDS.maxLat &&
    point.longitude >= LONDON_BOUNDS.minLng &&
    point.longitude <= LONDON_BOUNDS.maxLng
  );
}

/** Consumes one slot of the window, or refuses. Never queues: a parent is waiting on this screen. */
function takeRateLimitSlot() {
  const now = Date.now();
  while (recentRequests.length && now - recentRequests[0] >= WINDOW_MS) recentRequests.shift();
  const limit = maxPerMinute();
  if (recentRequests.length >= limit) {
    throw new TflRateLimitedError(`${recentRequests.length} requests in the last minute, limit ${limit}`);
  }
  recentRequests.push(now);
}

/** Visible to tests, and to anyone wondering what this instance has spent. */
function rateLimitSnapshot() {
  const now = Date.now();
  const live = recentRequests.filter((at) => now - at < WINDOW_MS);
  return { windowRequests: live.length, maxPerMinute: maxPerMinute(), windowMs: WINDOW_MS };
}

function resetRateLimit() {
  recentRequests.length = 0;
}

/**
 * The single mode to describe a journey by, from the legs TfL returned.
 *
 * `bus` only when EVERY transit leg is a bus. One tube leg makes the journey 🚇 Public transport, which
 * is both true and the thing the brief asked for: "Do not call everything 'Bus'". Walking legs are
 * ignored for this decision -- almost every transit journey starts and ends on foot, and letting a
 * walk to the stop decide the label would make everything a walk.
 */
function journeyMode(legs) {
  const transitModes = (legs ?? [])
    .map((leg) => leg?.mode?.id ?? leg?.mode?.name)
    .filter((id) => typeof id === 'string' && id !== 'walking' && id !== 'walk');
  if (transitModes.length === 0) return null;
  return transitModes.every((id) => id === 'bus') ? 'bus' : 'transit';
}

/**
 * One journey from TfL, as a `TravelLeg`-shaped object.
 *
 * Returns `{ state: 'unknown' }` rather than throwing for the cases that are genuinely unknown, so a
 * caller cannot accidentally render an absence as a negative. The three unknown cases are: outside
 * London, TfL offering no journey, and the provider failing.
 *
 * @param {{latitude:number,longitude:number}} from
 * @param {{latitude:number,longitude:number}} to
 * @param {{ fetchImpl?: Function }} [deps]
 */
async function getTransitJourney(from, to, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;

  if (!transitEnabled()) {
    throw new TflDisabledError('TFL_TRANSIT_ENABLED is not set to true');
  }

  // Before any request: a journey TfL does not cover is unknown, and asking would not change that.
  if (!withinLondon(from) || !withinLondon(to)) {
    return { state: 'unknown', reason: 'outside-coverage', attribution: TFL_ATTRIBUTION };
  }

  takeRateLimitSlot();

  const path =
    `/Journey/JourneyResults/${from.latitude},${from.longitude}` +
    `/to/${to.latitude},${to.longitude}`;
  const url = new URL(path, TFL_BASE);
  // Public transport only. Without this TfL will happily plan a drive, which this module must not
  // present as a transit journey.
  url.searchParams.set('mode', 'tube,dlr,overground,elizabeth-line,bus,tram,national-rail');
  // An app key raises the rate ceiling. Absent is a supported state, not an error: anonymous access
  // works, more slowly, which is why the default limit above is conservative.
  const appKey = process.env.TFL_APP_KEY;
  if (appKey) url.searchParams.set('app_key', appKey);

  let response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(ABORT_MS),
    });
  } catch (_error) {
    // A provider that did not answer tells us nothing about whether a bus exists.
    return { state: 'unknown', reason: 'provider-unavailable', attribution: TFL_ATTRIBUTION };
  }

  if (response.status === 429) {
    // TfL asking us to back off. Never retried here: a retry is another request against the limit we
    // have just been told we exceeded.
    return { state: 'unknown', reason: 'provider-rate-limited', attribution: TFL_ATTRIBUTION };
  }
  if (response.status === 404) {
    // TfL's documented answer for "no journey found", which is not "no service exists".
    return { state: 'unknown', reason: 'no-journey-found', attribution: TFL_ATTRIBUTION };
  }
  if (!response.ok) {
    return { state: 'unknown', reason: 'provider-error', attribution: TFL_ATTRIBUTION };
  }

  let payload;
  try {
    payload = await response.json();
  } catch (_error) {
    return { state: 'unknown', reason: 'provider-unreadable', attribution: TFL_ATTRIBUTION };
  }

  const journeys = Array.isArray(payload?.journeys) ? payload.journeys : [];
  // The quickest journey, which is what a parent asked for by asking at all.
  const best = journeys
    .filter((journey) => Number.isFinite(journey?.duration) && journey.duration > 0)
    .sort((a, b) => a.duration - b.duration)[0];

  if (!best) {
    return { state: 'unknown', reason: 'no-journey-found', attribution: TFL_ATTRIBUTION };
  }

  const mode = journeyMode(best.legs);
  if (!mode) {
    // A journey entirely on foot is not public transport, and offering it as a transit option would be
    // a mode that does not exist. The walk itself is already covered elsewhere.
    return { state: 'unknown', reason: 'walking-only', attribution: TFL_ATTRIBUTION };
  }

  return {
    state: 'available',
    leg: {
      mode,
      durationMinutes: Math.max(1, Math.round(best.duration)),
      // A real plan over a real network. The one non-driving mode that earns a plain statement.
      source: 'routed',
      confidence: 'high',
    },
    attribution: TFL_ATTRIBUTION,
    /**
     * Deliberately NOT returned: departure times, and nothing is written to a cache.
     *
     * A journey result embeds when the next service leaves. Caching it would serve a parent yesterday's
     * bus, and surfacing it would put a time on screen that is wrong within minutes of being fetched.
     */
    cacheable: false,
  };
}

module.exports = {
  TFL_BASE,
  TFL_ATTRIBUTION,
  LONDON_BOUNDS,
  DEFAULT_MAX_PER_MINUTE,
  TflDisabledError,
  TflRateLimitedError,
  transitEnabled,
  withinLondon,
  journeyMode,
  maxPerMinute,
  rateLimitSnapshot,
  resetRateLimit,
  getTransitJourney,
};
