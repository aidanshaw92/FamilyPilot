const { searchWithFallback } = require('../../server/places/lib/fallback');
const { reorderByEnrichment } = require('../../server/places/lib/places-quality');
const { getNearbyFood } = require('../../server/places/lib/nearby-food');
const {
  MAX_RADIUS_M: MAX_FOOD_RADIUS_M,
  DEFAULT_RADIUS_M: DEFAULT_FOOD_RADIUS_M,
} = require('../../server/places/lib/osm-food');
const {
  buildSearchCacheKey,
  readSearchCache,
  writeSearchCache,
  ttlHours,
} = require('../../server/places/lib/search-cache');
const {
  isPlacesEnabled,
  describeScope,
  primePlacesBudget,
  PlacesDisabledError,
  PlacesBudgetExceededError,
} = require('../../server/places/lib/places-budget');

/**
 * The London grid below is the single most expensive thing this repository does: nine overlapping
 * Nearby Search requests, which Google bills individually. It used to run on every page load, for
 * every anonymous visitor, with `Cache-Control: no-store` on the response.
 *
 * LONDON_AREAS is a fixed array rather than anything computed, and LONDON_AREA_CEILING asserts that
 * it stays fixed. A bug must not be able to widen the grid and search all of London repeatedly.
 */
const LONDON_AREA_CEILING = 9;

function getConfiguredProvider() {
  return (process.env.PLACES_PROVIDER || 'mock').toLowerCase();
}

function mergeLondonBatches(batches, limit = 90) {
  const live = batches.filter((batch) => batch.provider !== 'mock');
  const unique = new Map();
  const longestBatch = live.reduce((max, batch) => Math.max(max, batch.places.length), 0);

  // Interleave areas so central London cannot fill the result set before outer London is considered.
  for (let index = 0; index < longestBatch && unique.size < limit; index += 1) {
    for (const batch of live) {
      const place = batch.places[index];
      if (place) unique.set(place.familypilotId, place);
      if (unique.size >= limit) break;
    }
  }

  return {
    places: [...unique.values()],
    provider: live[0]?.provider || 'mock',
    fallbackUsed: live.some((batch) => batch.fallbackUsed),
    fallbackReason: live.map((batch) => batch.fallbackReason).filter(Boolean).join(' | ') || undefined,
  };
}

/**
 * A London-wide grid gives parents useful coverage in every direction rather than a
 * central-London-heavy result set. Twelve-kilometre circles intentionally overlap so venues near
 * area boundaries are still discovered and then de-duplicated.
 *
 * Nine areas is nine billable Nearby Search requests. The ceiling below is an assertion, not a
 * limit to tune: if someone adds a tenth area, this throws rather than silently costing more.
 */
const LONDON_AREAS = [
  [51.5074, -0.1278], // central
  [51.6030, -0.1700], // north
  [51.5900, -0.3300], // north-west
  [51.5900, 0.0600], // north-east
  [51.5100, -0.3300], // west
  [51.5200, 0.1000], // east
  [51.4400, -0.2500], // south-west
  [51.4200, -0.1000], // south
  [51.4500, 0.0800], // south-east
];

async function searchLondonGrid(configuredProvider, intent) {
  if (LONDON_AREAS.length > LONDON_AREA_CEILING) {
    throw new Error(
      `London grid has ${LONDON_AREAS.length} areas, above the ${LONDON_AREA_CEILING} billable requests this path is allowed`,
    );
  }
  const batches = await Promise.all(
    LONDON_AREAS.map(([lat, lng]) =>
      searchWithFallback(lat, lng, 12, configuredProvider, { intent, reason: 'london_grid' }),
    ),
  );
  return mergeLondonBatches(batches);
}


/**
 * The food branch. Bounded here as well as inside the provider, so a hand-edited URL cannot ask for a
 * London-wide food sweep even if the module's own clamp were ever relaxed.
 */
async function handleNearbyFood(req, res) {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lng);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return res.status(400).json({ error: 'Invalid anchor coordinates', code: 'INVALID_ANCHOR' });
  }

  const requestedRadius = Number(req.query.radiusM);
  const radiusM = Number.isFinite(requestedRadius)
    ? Math.min(Math.max(Math.round(requestedRadius), 200), MAX_FOOD_RADIUS_M)
    : DEFAULT_FOOD_RADIUS_M;

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // Replaced at the end of a successful response. Kept here so every early return and error path
  // is uncacheable by default: a cached 503 would outlive the switch that caused it.
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  /**
   * Places to eat near one anchor, handled here and returned BEFORE anything that can spend.
   *
   * This started as its own file, which is where it belongs: a separate function cannot reach Google
   * by accident. It is folded in because the deployment budget is twelve serverless functions and a
   * thirteenth would have failed the deploy, so the guarantee is carried differently and the honest
   * statement of it is this: the branch returns before `primePlacesBudget`, before the provider is
   * chosen and before the search chain exists, and `nearby-food.js` imports no API key, no budget
   * gate and no Google client. Nothing below this line runs for a food request.
   *
   * It matters that this is NOT `intent=restaurant`. That intent goes through the configured
   * provider, which in production is Google, and `searchGoogle` bills for it. This one cannot.
   */
  if (req.query.intent === 'nearby-food') {
    return handleNearbyFood(req, res);
  }

  // Loads today's shared billable total before anything can spend, so the daily cap counts what
  // every other serverless instance has already bought rather than only this one.
  await primePlacesBudget();

  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lng);
  const radiusKm = Number(req.query.radiusKm || 25);
  const intent = req.query.intent === 'restaurant' ? 'restaurant' : 'explore';
  const configuredProvider = getConfiguredProvider();
  const fetchedAt = new Date().toISOString();

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: 'Invalid coordinates', fallbackAvailable: true });
  }

  const isLondonGrid = req.query.scope === 'london' && intent === 'explore';
  const categories = typeof req.query.categories === 'string' && req.query.categories
    ? req.query.categories.split(',').map((value) => value.trim()).filter(Boolean)
    : [];
  const cacheKey = buildSearchCacheKey({
    scope: isLondonGrid ? 'london' : 'nearby',
    intent,
    lat: isLondonGrid ? 51.5074 : latitude,
    lng: isLondonGrid ? -0.1278 : longitude,
    radiusKm: isLondonGrid ? 40 : radiusKm,
    categories,
  });

  let cached = null;
  try {
    cached = await readSearchCache(cacheKey);
  } catch (error) {
    console.warn(JSON.stringify({ tag: 'places_search_cache_read_failed', message: error?.message || 'read failed' }));
  }

  let result;
  let cacheState = 'miss';

  if (cached?.fresh) {
    // The common path, and the whole point: a repeat search within the cache window reaches Postgres
    // instead of Google. Nine billable requests become none.
    result = cached.payload;
    cacheState = 'hit';
  } else {
    try {
      result = isLondonGrid
        ? await searchLondonGrid(configuredProvider, intent)
        : await searchWithFallback(latitude, longitude, radiusKm, configuredProvider, { intent });
    } catch (error) {
      const blocked =
        error instanceof PlacesDisabledError || error instanceof PlacesBudgetExceededError;
      if (blocked && cached) {
        // Switched off or over budget, but we hold a copy within what we may serve. A parent sees
        // London; the response says plainly that it was not refreshed.
        result = cached.payload;
        cacheState = 'stale';
      } else if (blocked) {
        // Nothing to serve and we may not buy it. Fail visibly rather than falling through to the
        // demo venues, which would make a cost control look like a data outage.
        res.setHeader('Cache-Control', 'no-store');
        return res.status(error instanceof PlacesBudgetExceededError ? 429 : 503).json({
          error: 'Live places are unavailable',
          code: error.code,
          scope: error.scope,
          detail: error.detail,
          fallbackAvailable: false,
        });
      } else {
        throw error;
      }
    }
  }

  if (result.provider === 'mock' && configuredProvider !== 'mock') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Live places are temporarily unavailable. Please retry.' });
  }

  if (cacheState === 'miss' && result.provider !== 'mock') {
    await writeSearchCache(cacheKey, result, {
      provider: result.provider,
      billableCalls: isLondonGrid ? LONDON_AREA_CEILING : 1,
    });
  }

  let places = result.places;
  // Production Explore discovery feeds the insert-triggered enrichment queue. This also covers
  // explicit London area/postcode searches so useful outer-London places become richer over time.
  // Preview reads never enqueue work against the production worker.
  if (process.env.VERCEL_ENV === 'production' && intent === 'explore') {
    try {
      const { getSupabaseAdmin } = require('../../server/enrichment/_lib/supabase-admin');
      const db = getSupabaseAdmin();
      if (db && places.length) {
        const rows = places.filter(p => p.provider !== 'mock').map(p => ({
          familypilot_place_id:p.familypilotId,external_id:p.externalId,provider:p.provider,
          name:p.name,category:p.category,lat:p.latitude,lng:p.longitude,address:p.address,
          website:p.website,photos:p.photos ?? [],fetched_at:p.fetchedAt,
          field_provenance:{googlePrimaryType:p.googlePrimaryType,googleTypes:p.googleTypes || []},
        }));
        // Update provider facts/category on repeat discovery rather than freezing the first mapping.
        const { error } = await db.from('place_records').upsert(rows,{onConflict:'familypilot_place_id'});
        if (error) console.error('[places] Discovery queue failed',error.code);
      }
    } catch(error) { console.error('[places] Discovery unavailable',error instanceof Error ? error.name : 'Error'); }
  }
  try {
    const { getConsumerMetadata } = require('../../server/enrichment/_lib/consumer-projection');
    places = await Promise.all(
      places.map(async (place) => {
        const metadata = await getConsumerMetadata(place.familypilotId);
        if (!metadata) return place;
        return {
          ...place,
          enrichmentStatus: metadata.enrichmentStatus || place.enrichmentStatus,
          familyMetadata: metadata,
        };
      }),
    );
    // rankPlaces (inside searchWithFallback) ran before real enrichment status was known - every
    // place was still 'provider_only' then. Now that it's overlaid, nudge verified/enriched venues
    // ahead of provider-only ones without disturbing relevance order within each trust tier.
    places = reorderByEnrichment(places);
  } catch {
    // Best-effort metadata overlay
  }

  // The CDN is the second line of defence after the Postgres cache: it answers repeat loads without
  // invoking this function at all. Bounded by the same window the store uses, so the two cannot
  // disagree about how old the data may be.
  res.setHeader(
    'Cache-Control',
    `public, max-age=60, s-maxage=${Math.round(ttlHours() * 3600)}, stale-while-revalidate=600`,
  );

  return res.status(200).json({
    places,
    provider: result.provider,
    configuredProvider,
    intent,
    cached: cacheState !== 'miss',
    cacheState,
    cacheAgeHours: cached ? Number(cached.ageHours.toFixed(2)) : null,
    placesEnabled: isPlacesEnabled('discovery'),
    placesScope: describeScope('discovery'),
    fetchedAt,
    fallbackUsed: result.fallbackUsed,
    fallbackReason: result.fallbackReason,
  });
};
