const { searchWithFallback } = require('../../server/places/lib/fallback');
const { reorderByEnrichment } = require('../../server/places/lib/places-quality');
const { readCatalogue, mergeCatalogue } = require('../../server/places/lib/catalogue');
const { filterPlacesToCanonicalPrimaries } = require('../../server/places/lib/canonical-venues');
/**
 * Required as a module object rather than destructured, deliberately: the property is read at call
 * time, so the delegation is observable to a contract test. Destructuring would capture the binding at
 * require time and make the one line that carries the OSM-only guarantee untestable.
 */
const nearbyFoodEndpoint = require('../../server/places/lib/nearby-food-endpoint');
const betweenEndpoint = require('../../server/places/lib/between-endpoint');
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
 * Times the stages of one search: each `mark(name)` closes the stage that has been running since the previous mark.
 * `finish` writes them as a `Server-Timing` header (with the region and cache state as descriptions) and one structured
 * log line, so a real phone's request can be broken down without guessing.
 */
function createStageTimer() {
  const started = Date.now();
  let last = started;
  const stages = [];
  return {
    mark(name) {
      const now = Date.now();
      stages.push([name, now - last]);
      last = now;
    },
    finish(res, extra = {}) {
      const total = Date.now() - started;
      const header = [...stages.map(([name, ms]) => `${name};dur=${ms}`), `total;dur=${total}`].join(', ');
      res.setHeader('Server-Timing', header);
      res.setHeader('X-FamilyPilot-Region', process.env.VERCEL_REGION || 'local');
      console.info(JSON.stringify({ tag: 'places_search_timing', region: process.env.VERCEL_REGION || 'local', total, stages: Object.fromEntries(stages), ...extra }));
    },
  };
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
    return nearbyFoodEndpoint.handleNearbyFoodRequest(req, res);
  }

  /**
   * Meet Halfway's candidates: stored catalogue places in the corridor between two homes, handled and returned here for
   * the same reason as `nearby-food` above. It is a database read. It returns before `primePlacesBudget`, before the
   * provider is chosen and before the search chain exists, so it cannot discover through Google or spend a billable unit,
   * and `between-endpoint.js` imports no API key, no budget gate and no Google client.
   */
  if (req.query.intent === 'between') {
    return betweenEndpoint.handleBetweenRequest(req, res);
  }

  // Where the time goes, per stage, on every response (`Server-Timing`, readable in a browser's network panel or with
  // `curl -I`), plus the region the function ran in. Zero cost: it measures, it changes nothing.
  const timing = createStageTimer();

  // Loads today's shared billable total before anything can spend, so the daily cap counts what
  // every other serverless instance has already bought rather than only this one.
  await primePlacesBudget();
  timing.mark('budget');

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

  // The stored catalogue is a database read with no spend; for London it is always merged below, so it is read alongside
  // the search cache rather than after it. A failure here is the same best-effort miss it always was.
  const storedCatalogue = isLondonGrid
    ? readCatalogue().catch((error) => {
        console.warn(JSON.stringify({ tag: 'places_catalogue_read_failed', message: error?.message || 'read failed' }));
        return [];
      })
    : Promise.resolve([]);

  let cached = null;
  try {
    cached = await readSearchCache(cacheKey);
  } catch (error) {
    console.warn(JSON.stringify({ tag: 'places_search_cache_read_failed', message: error?.message || 'read failed' }));
  }
  timing.mark('cache');

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
      } else if (blocked && isLondonGrid && (await storedCatalogue).length > 0) {
        // No cached search and we may not buy one, but the stored catalogue is a database read: serve that.
        result = { places: [], provider: 'google', fallbackUsed: false };
        cacheState = 'catalogue';
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

  timing.mark('provider');
  if (cacheState === 'miss' && result.provider !== 'mock') {
    await writeSearchCache(cacheKey, result, {
      provider: result.provider,
      billableCalls: isLondonGrid ? LONDON_AREA_CEILING : 1,
    });
  }

  let places = result.places;
  // London is also served from the stored catalogue (`place_records`): a database read, never a Google request. The
  // live search is one page ranked by popularity across all categories, so on its own it showed 2 of the 8 farms the
  // database holds. Merged BEFORE the discovery upsert below, which only ever writes provider rows from the live page.
  const liveOnly = places;
  if (isLondonGrid && result.provider !== 'mock') {
    try {
      const stored = await storedCatalogue;
      if (stored.length > 0) {
        places = await filterPlacesToCanonicalPrimaries(mergeCatalogue(places, stored));
      }
    } catch (error) {
      console.warn(JSON.stringify({ tag: 'places_catalogue_merge_failed', message: error?.message || 'merge failed' }));
    }
  }
  timing.mark('catalogue');
  // Production Explore discovery feeds the insert-triggered enrichment queue. This also covers
  // explicit London area/postcode searches so useful outer-London places become richer over time.
  // Preview reads never enqueue work against the production worker.
  // It writes place_records only, which nothing below reads, so it runs alongside the evidence and food reads rather than
  // before them. It still runs on cached searches too: the cache is shared, so a page can have been filled by a request
  // that did not discover (a Preview), or by one whose upsert failed, and this is what retries it.
  const discovery = (async () => {
    if (!(process.env.VERCEL_ENV === 'production' && intent === 'explore')) return;
    try {
      const { getSupabaseAdmin } = require('../../server/enrichment/_lib/supabase-admin');
      const db = getSupabaseAdmin();
      if (db && liveOnly.length) {
        const rows = liveOnly.filter(p => p.provider !== 'mock').map(p => ({
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
  })();
  // The evidence overlay and the stored food lookup are independent reads, so they run together (and with discovery).
  //
  // Evidence: every place is overlaid with its consumer-safe metadata in ONE batched projection
  // (getConsumerMetadataBatch): a few set-based reads instead of three or four per place (~410 round trips for a London
  // search, up to 160 in flight at once). The same trusted claims, disputes and projection as before.
  // Food: which places already have a stored food lookup (OpenStreetMap, from Venue Detail's "Restaurants close by"): one
  // database read, no provider. Places never looked up have no `foodNearby`, and stay unknown on the screen.
  const evidence = (async () => {
    try {
      const { getConsumerMetadataBatch } = require('../../server/enrichment/_lib/consumer-projection');
      return await getConsumerMetadataBatch(places.map((place) => place.familypilotId));
    } catch {
      return null; // Best-effort metadata overlay
    }
  })();
  const food = (async () => {
    try {
      const { attachFoodProximity } = require('../../server/places/lib/food-proximity');
      const { getSupabaseAdmin } = require('../../server/enrichment/_lib/supabase-admin');
      return await attachFoodProximity(places, getSupabaseAdmin());
    } catch (error) {
      console.warn(JSON.stringify({ tag: 'places_food_proximity_failed', message: error?.message || 'failed' }));
      return places;
    }
  })();
  const [metadataById, withFood] = await Promise.all([evidence, food, discovery]);
  places = withFood;
  if (metadataById) {
    places = places.map((place) => {
      const metadata = metadataById.get(place.familypilotId);
      if (!metadata) return place;
      return {
        ...place,
        enrichmentStatus: metadata.enrichmentStatus || place.enrichmentStatus,
        familyMetadata: metadata,
      };
    });
    // rankPlaces (inside searchWithFallback) ran before real enrichment status was known - every
    // place was still 'provider_only' then. Now that it's overlaid, nudge verified/enriched venues
    // ahead of provider-only ones without disturbing relevance order within each trust tier.
    places = reorderByEnrichment(places);
  }
  timing.mark('evidence');

  // The CDN is the second line of defence after the Postgres cache: it answers repeat loads without
  // invoking this function at all. Bounded by the same window the store uses, so the two cannot
  // disagree about how old the data may be.
  res.setHeader(
    'Cache-Control',
    `public, max-age=60, s-maxage=${Math.round(ttlHours() * 3600)}, stale-while-revalidate=600`,
  );
  timing.finish(res, { cacheState, places: places.length });

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
