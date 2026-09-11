const { searchWithFallback } = require('../../server/places/lib/fallback');
const { reorderByEnrichment } = require('../../server/places/lib/places-quality');

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lng);
  const radiusKm = Number(req.query.radiusKm || 25);
  const intent = req.query.intent === 'restaurant' ? 'restaurant' : 'explore';
  const configuredProvider = getConfiguredProvider();
  const fetchedAt = new Date().toISOString();

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: 'Invalid coordinates', fallbackAvailable: true });
  }

  let result;
  if (req.query.scope === 'london' && intent === 'explore') {
    // A London-wide grid gives parents useful coverage in every direction rather than a
    // central-London-heavy result set. Twelve-kilometre circles intentionally overlap so
    // venues near area boundaries are still discovered and then de-duplicated below.
    const areas = [
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
    const batches = await Promise.all(
      areas.map(([lat, lng]) => searchWithFallback(lat, lng, 12, configuredProvider, { intent })),
    );
    result = mergeLondonBatches(batches);
  } else {
    result = await searchWithFallback(latitude, longitude, radiusKm, configuredProvider, { intent });
  }
  if (result.provider === 'mock' && configuredProvider !== 'mock') {
    return res.status(503).json({ error: 'Live places are temporarily unavailable. Please retry.' });
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
          website:p.website,fetched_at:p.fetchedAt,
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

  return res.status(200).json({
    places,
    provider: result.provider,
    configuredProvider,
    intent,
    cached: false,
    fetchedAt,
    fallbackUsed: result.fallbackUsed,
    fallbackReason: result.fallbackReason,
  });
};
