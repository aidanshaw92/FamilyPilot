const { searchWithFallback } = require('./lib/fallback');

function getConfiguredProvider() {
  return (process.env.PLACES_PROVIDER || 'mock').toLowerCase();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300');

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

  const result = await searchWithFallback(latitude, longitude, radiusKm, configuredProvider, {
    intent,
  });

  let places = result.places;
  try {
    const { getMetadata } = require('../enrichment/_lib/enrichment-store');
    places = await Promise.all(
      places.map(async (place) => {
        const metadata = await getMetadata(place.familypilotId);
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
