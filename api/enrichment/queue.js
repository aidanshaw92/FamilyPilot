const { verifyEnrichmentAuth } = require('./lib/auth');
const { listQueue } = require('./lib/enrichment-store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Enrichment-Token');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyEnrichmentAuth(req, res)) return;

  const status = req.query.status;
  const sort = req.query.sort || 'newest';
  const betaLat = req.query.betaLat != null ? Number(req.query.betaLat) : undefined;
  const betaLng = req.query.betaLng != null ? Number(req.query.betaLng) : undefined;
  const betaRadiusKm = req.query.betaRadiusKm != null ? Number(req.query.betaRadiusKm) : undefined;

  try {
    const items = await listQueue({
      status: status || undefined,
      sort,
      betaLat,
      betaLng,
      betaRadiusKm,
      provider: 'google',
    });
    return res.status(200).json({ items, count: items.length });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Queue load failed',
    });
  }
};
