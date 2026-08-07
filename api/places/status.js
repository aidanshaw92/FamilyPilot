const { probeGoogle } = require('./lib/google-places');
const { probeOsm } = require('./lib/osm-places');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const configuredProvider = (process.env.PLACES_PROVIDER || 'mock').toLowerCase();
  const lat = Number(req.query.lat || 51.643);
  const lng = Number(req.query.lng || -0.36);
  const hasGoogleKey = Boolean(process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY);

  let probe = null;
  if (configuredProvider === 'google') {
    probe = await probeGoogle(lat, lng);
  } else if (configuredProvider === 'osm') {
    probe = await probeOsm(lat, lng);
  }

  return res.status(200).json({
    runtime: {
      configuredProvider,
      envPlacesProvider: process.env.PLACES_PROVIDER,
      hasGooglePlacesApiKey: hasGoogleKey,
      nodeVersion: process.version,
    },
    probe,
    timestamp: new Date().toISOString(),
  });
};
