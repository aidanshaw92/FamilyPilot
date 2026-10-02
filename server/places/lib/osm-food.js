const { distanceKm } = require('../../context/lib/geo-utils');

/**
 * Nearby places to eat, from OpenStreetMap only.
 *
 * WHY THIS IS SEPARATE FROM `searchOsm`. Two reasons, both about not spending money and not getting
 * useless results.
 *
 * 1. `searchWithFallback` runs the chain for the CONFIGURED provider, and production is configured
 *    `google`. So routing food discovery through the shared path would call Google Places first, per
 *    restaurant, on every Venue Detail open -- the exact spend this workstream is meant to avoid.
 *    Nothing in this module can reach Google: there is no key, no gate, no import.
 * 2. The shared query asks for parks, playgrounds, restaurants, cafes and museums together and caps
 *    the whole result at twelve elements. A venue in a park-dense part of London can therefore come
 *    back with no food at all. Food needs its own query and its own budget of results.
 *
 * FAIR USE. Overpass is free, not unlimited, and it is public infrastructure other people depend on.
 * The protections here: an identifying User-Agent with a contact URL, two endpoints tried in order,
 * a server-side timeout inside the query AND a client-side abort, a hard radius ceiling, a hard
 * result ceiling, exactly one retry (a narrower query, not the same one again), and in-process
 * coalescing so concurrent requests for one anchor make one call. The durable cache that stops a
 * second parent paying for the same anchor lives a layer up, in `nearby-food.js`.
 */

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/**
 * Overpass asks that automated clients identify themselves with a contact route, so a maintainer can
 * reach whoever is making the requests rather than blocking an anonymous IP.
 */
const OVERPASS_USER_AGENT =
  'FamilyPilot/1.0 (https://family-pilot-seven.vercel.app; nearby-food)';

/** A walk from the anchor, not a trip across London. Also what keeps the query cheap. */
const MAX_RADIUS_M = 2500;
const DEFAULT_RADIUS_M = 1200;
const MIN_RADIUS_M = 200;

/** Enough to rank from, few enough that one anchor is never an expensive query. */
const MAX_ELEMENTS = 60;

const QUERY_TIMEOUT_S = 12;
const ABORT_MS = 15000;

/**
 * A ceiling on the WHOLE lookup, not just on each request.
 *
 * The first real canary run measured this: the V&A anchor spent 47 seconds before giving up. Each
 * request aborts at 15s, and the sequence is two endpoints for the full query plus two for the narrowed
 * retry -- so the per-request timeout bounded each attempt and nothing bounded the sum. A parent would
 * have sat on "Looking for places to eat nearby" for the better part of a minute and then been told it
 * failed.
 *
 * 20 seconds is chosen as roughly the longest a section of a screen may take before the answer stops
 * being worth waiting for. Exceeding it is reported as a failure, which the surface already renders as
 * "we could not check" rather than as an empty neighbourhood.
 */
const TOTAL_DEADLINE_MS = 20000;

/** The amenity values that are somewhere a family can actually eat. */
const FOOD_AMENITIES = ['restaurant', 'cafe', 'fast_food'];

function clampRadius(radiusM) {
  const value = Number(radiusM);
  if (!Number.isFinite(value)) return DEFAULT_RADIUS_M;
  return Math.min(Math.max(Math.round(value), MIN_RADIUS_M), MAX_RADIUS_M);
}

/**
 * Nodes AND ways, because a restaurant inside a building is usually mapped as the building. Querying
 * only nodes, which the shared query does, silently drops a large share of real places.
 * `out center` gives a way a single representative coordinate, so both kinds come back alike.
 */
function buildFoodQuery(lat, lng, radiusM, { narrow = false } = {}) {
  const amenities = narrow ? ['restaurant', 'cafe'] : FOOD_AMENITIES;
  const radius = narrow ? Math.min(radiusM, 1000) : radiusM;
  const limit = narrow ? 25 : MAX_ELEMENTS;
  const timeout = narrow ? 8 : QUERY_TIMEOUT_S;

  const clauses = amenities
    .flatMap((amenity) => [
      `node["amenity"="${amenity}"](around:${radius},${lat},${lng});`,
      `way["amenity"="${amenity}"](around:${radius},${lat},${lng});`,
    ])
    .join('');

  return `[out:json][timeout:${timeout}];(${clauses});out center ${limit};`;
}

async function postOverpass(query, deadlineAt = Number.POSITIVE_INFINITY) {
  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    // Never start an attempt that cannot finish inside the overall deadline, and never wait longer than
    // what is left of it. Without this the per-request timeout is the only bound and four attempts can
    // sum to a minute.
    const remaining = deadlineAt - Date.now();
    if (remaining <= 250) {
      throw lastError ?? new Error('Overpass deadline exceeded before a response arrived');
    }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': OVERPASS_USER_AGENT,
          Accept: 'application/json',
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(Math.min(ABORT_MS, remaining)),
      });

      // 429 and 504 are Overpass asking us to back off. Trying the second endpoint immediately is
      // reasonable; hammering the same one is not, which is why there is no retry loop per endpoint.
      if (!response.ok) {
        lastError = new Error(`Overpass ${response.status} (${endpoint})`);
        continue;
      }
      const data = await response.json();
      return Array.isArray(data.elements) ? data.elements : [];
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Overpass request failed');
    }
  }
  throw lastError || new Error('Overpass unavailable');
}

/**
 * What OpenStreetMap actually said, and nothing more.
 *
 * Every field here is a tag that was present. There is no inference: a restaurant with no
 * `opening_hours` tag gets `openingHours: null`, not a guess, and nothing in this module decides a
 * place is family-friendly. The tags that bear on children (`highchair`, `changing_table`,
 * `outdoor_seating`, `wheelchair`) are carried through ONLY when the tag exists and says yes, so a
 * silent map is silent downstream rather than becoming a confirmed facility.
 */
function elementToCandidate(element, anchor) {
  // A malformed entry must cost its own row, not the whole neighbourhood. Overpass has returned
  // nulls and bare objects in practice, and reading `.tags` off one threw, which turned a single bad
  // element into "there is nowhere to eat near here" -- a false fact, from a parsing bug.
  if (!element || typeof element !== 'object') return null;
  const tags = element.tags || {};
  const name = typeof tags.name === 'string' ? tags.name.trim() : '';
  if (!name) return null;

  const lat = element.lat != null ? element.lat : element.center && element.center.lat;
  const lng = element.lon != null ? element.lon : element.center && element.center.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const amenity = tags.amenity;
  if (!FOOD_AMENITIES.includes(amenity)) return null;

  const km = distanceKm(anchor.latitude, anchor.longitude, lat, lng);
  // A coordinate far outside the radius asked for means the element or the query is wrong; keeping it
  // would put a place on screen that is not nearby at all.
  if (!Number.isFinite(km) || km > MAX_RADIUS_M / 1000 + 0.5) return null;

  return {
    familypilotId: `fp-osm-${element.type}-${element.id}`,
    externalId: `osm:${element.type}/${element.id}`,
    provider: 'osm',
    name,
    category: amenity === 'cafe' ? 'cafe' : amenity === 'fast_food' ? 'fast_food' : 'restaurant',
    latitude: lat,
    longitude: lng,
    distanceKm: Math.round(km * 1000) / 1000,
    cuisine: typeof tags.cuisine === 'string' ? tags.cuisine : null,
    // The raw tag, unparsed. Turning an opening_hours expression into "open now" is a separate job
    // with its own failure modes, and guessing it here would manufacture a fact.
    openingHours: typeof tags.opening_hours === 'string' ? tags.opening_hours : null,
    address:
      [tags['addr:housenumber'], tags['addr:street'], tags['addr:postcode']]
        .filter(Boolean)
        .join(' ') || null,
    website: tags.website || tags['contact:website'] || null,
    phone: tags.phone || tags['contact:phone'] || null,
    // Only an explicit yes counts. An absent tag is not a no and not a yes.
    tagged: {
      highchair: tags.highchair === 'yes' || undefined,
      changingTable: tags.changing_table === 'yes' || undefined,
      outdoorSeating: tags.outdoor_seating === 'yes' || undefined,
      wheelchair: tags.wheelchair === 'yes' || undefined,
    },
  };
}

/**
 * Removes the same place appearing twice.
 *
 * Two distinct causes, and both happen in real OSM data: the identical element returned by both the
 * node and the way clause, and a genuine duplicate mapping where someone added a node inside an
 * already-mapped building. The first is caught by id. The second needs name plus proximity, because
 * the ids differ -- but a chain with two branches 300m apart is NOT a duplicate, so the proximity
 * threshold is tight (40m) rather than generous.
 */
function dedupeCandidates(candidates) {
  const byId = new Set();
  const kept = [];

  for (const candidate of candidates) {
    if (byId.has(candidate.externalId)) continue;
    byId.add(candidate.externalId);

    const twin = kept.find(
      (other) =>
        other.name.toLowerCase() === candidate.name.toLowerCase() &&
        distanceKm(other.latitude, other.longitude, candidate.latitude, candidate.longitude) <= 0.04,
    );
    if (twin) {
      // Prefer the richer record rather than whichever arrived first: a way usually carries the
      // address and hours a bare node lacks.
      if (describedness(candidate) > describedness(twin)) kept[kept.indexOf(twin)] = candidate;
      continue;
    }
    kept.push(candidate);
  }

  return kept;
}

function describedness(candidate) {
  return [candidate.openingHours, candidate.address, candidate.cuisine, candidate.website].filter(
    Boolean,
  ).length;
}

/**
 * One in-flight request per anchor and radius, within this process.
 *
 * A Venue Detail screen that mounts twice, or two parents hitting the same serverless instance in
 * the same second, must not become two Overpass requests. This closes the window inside one
 * invocation; the durable cache is what closes it across instances.
 */
const inFlight = new Map();

async function searchOsmFood(anchor, { radiusM = DEFAULT_RADIUS_M } = {}) {
  if (
    !anchor ||
    !Number.isFinite(anchor.latitude) ||
    !Number.isFinite(anchor.longitude) ||
    Math.abs(anchor.latitude) > 90 ||
    Math.abs(anchor.longitude) > 180
  ) {
    throw new Error('A valid anchor latitude and longitude are required');
  }

  const radius = clampRadius(radiusM);
  const key = `${anchor.latitude.toFixed(4)}|${anchor.longitude.toFixed(4)}|${radius}`;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const work = (async () => {
    const deadlineAt = Date.now() + TOTAL_DEADLINE_MS;
    let elements;
    let attempts = 1;
    try {
      elements = await postOverpass(
        buildFoodQuery(anchor.latitude, anchor.longitude, radius),
        deadlineAt,
      );
    } catch (firstError) {
      // Exactly one retry, and a NARROWER query rather than the same one: if Overpass timed out or
      // asked us to back off, repeating the identical request is the wrong response.
      attempts = 2;
      try {
        elements = await postOverpass(
          buildFoodQuery(anchor.latitude, anchor.longitude, radius, { narrow: true }),
          deadlineAt,
        );
      } catch (_secondError) {
        throw firstError;
      }
    }

    const candidates = dedupeCandidates(
      elements.map((element) => elementToCandidate(element, anchor)).filter(Boolean),
    ).sort((a, b) => a.distanceKm - b.distanceKm);

    return {
      candidates,
      provider: 'osm',
      radiusM: radius,
      overpassRequests: attempts,
      fetchedAt: new Date().toISOString(),
    };
  })();

  inFlight.set(key, work);
  try {
    return await work;
  } finally {
    inFlight.delete(key);
  }
}

module.exports = {
  searchOsmFood,
  buildFoodQuery,
  elementToCandidate,
  dedupeCandidates,
  clampRadius,
  FOOD_AMENITIES,
  MAX_RADIUS_M,
  DEFAULT_RADIUS_M,
  MAX_ELEMENTS,
  OVERPASS_USER_AGENT,
  OVERPASS_ENDPOINTS,
  TOTAL_DEADLINE_MS,
};
