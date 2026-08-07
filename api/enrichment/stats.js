const { verifyEnrichmentAuth } = require('./lib/auth');
const { getStats, getStorageMode } = require('./lib/enrichment-store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Enrichment-Token');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyEnrichmentAuth(req, res)) return;

  try {
    const stats = await getStats();
    return res.status(200).json({ stats, storageMode: getStorageMode() });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Stats load failed',
    });
  }
};
