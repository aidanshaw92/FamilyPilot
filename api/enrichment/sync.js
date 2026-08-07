const { searchGoogle } = require('../places/lib/google-places');
const { verifyEnrichmentAuth } = require('./lib/auth');
const { upsertPlaceRecords } = require('./lib/enrichment-store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Enrichment-Token');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyEnrichmentAuth(req, res)) return;

  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const radiusKm = Number(req.body?.radiusKm ?? 15);
  const intent = req.body?.intent === 'restaurant' ? 'restaurant' : 'explore';

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  try {
    const places = await searchGoogle(lat, lng, radiusKm, { intent });
    await upsertPlaceRecords(places);
    return res.status(200).json({
      synced: places.length,
      places: places.map((p) => ({
        familypilotId: p.familypilotId,
        name: p.name,
        category: p.category,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Sync failed',
    });
  }
};
