const { searchWithFallback } = require('../../server/places/lib/fallback');

function getConfiguredProvider() {
  return (process.env.PLACES_PROVIDER || 'mock').toLowerCase();
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
    const areas = [[51.5074,-0.1278],[51.60,-0.15],[51.43,-0.12],[51.52,0.02],[51.49,-0.30]];
    const batches = await Promise.all(areas.map(([lat,lng]) => searchWithFallback(lat,lng,12,configuredProvider,{intent})));
    const live = batches.filter(batch => batch.provider !== 'mock');
    const unique = new Map();
    for (const batch of live) for (const place of batch.places) unique.set(place.familypilotId,place);
    result = { places:[...unique.values()].slice(0,60), provider:live[0]?.provider || 'mock', fallbackUsed:live.some(b => b.fallbackUsed) };
  } else {
    result = await searchWithFallback(latitude, longitude, radiusKm, configuredProvider, { intent });
  }
  if (result.provider === 'mock' && configuredProvider !== 'mock') return res.status(503).json({error:'Live places are temporarily unavailable. Please retry.'});

  let places = result.places;
  // Production discovery uses the existing insert-triggered enrichment queue.
  // Preview reads never enqueue work against the production worker.
  if (process.env.VERCEL_ENV === 'production' && req.query.scope === 'london') {
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
        const { error } = await db.from('place_records').upsert(rows,{onConflict:'familypilot_place_id',ignoreDuplicates:true});
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
