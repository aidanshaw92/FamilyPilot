const { verifyEnrichmentAuth } = require('./lib/auth');
const { getMetadata, saveMetadata } = require('./lib/enrichment-store');
const { sanitizePayload } = require('./lib/validation');
const { getGooglePlace } = require('../places/lib/google-places');
const { upsertPlaceRecord } = require('./lib/enrichment-store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Enrichment-Token');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  if (req.method === 'GET') {
    if (!verifyEnrichmentAuth(req, res)) return;
    try {
      let place = null;
      if (id.startsWith('fp-google-')) {
        place = await getGooglePlace(id);
        if (place) await upsertPlaceRecord(place);
      }
      const metadata = await getMetadata(id);
      return res.status(200).json({ place, metadata });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Load failed',
      });
    }
  }

  if (req.method === 'PUT') {
    if (!verifyEnrichmentAuth(req, res)) return;
    try {
      const payload = sanitizePayload(req.body);
      const metadata = await saveMetadata(id, payload);
      return res.status(200).json({ metadata, saved: true });
    } catch (error) {
      if (error.code === 'VALIDATION_ERROR') {
        return res.status(400).json({
          error: error.message,
          missing: error.missing,
          code: 'VALIDATION_ERROR',
        });
      }
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Save failed',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
