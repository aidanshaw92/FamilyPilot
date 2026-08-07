const { isAuthConfigured } = require('./lib/auth');
const { getStorageMode } = require('./lib/enrichment-store');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  return res.status(200).json({
    authConfigured: isAuthConfigured(),
    storageMode: getStorageMode(),
    /** Never expose tokens or service keys */
  });
};
