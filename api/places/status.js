const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OVERPASS_USER_AGENT = 'FamilyPilot/1.0 (https://family-pilot-seven.vercel.app; places-api)';

async function probeOsm(lat, lng) {
  const query = `[out:json][timeout:10];node["amenity"="restaurant"](around:4000,${lat},${lng});out center 5;`;
  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': OVERPASS_USER_AGENT,
          Accept: 'application/json',
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) {
        lastError = `Overpass HTTP ${response.status} (${endpoint})`;
        continue;
      }
      const data = await response.json();
      const names = (data.elements || []).map((e) => e.tags && e.tags.name).filter(Boolean);
      return { ok: true, count: names.length, sampleNames: names.slice(0, 5), endpoint };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Probe failed';
    }
  }

  return { ok: false, count: 0, sampleNames: [], error: lastError || 'Overpass unavailable' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const configuredProvider = (process.env.PLACES_PROVIDER || 'mock').toLowerCase();
  const lat = Number(req.query.lat || 51.643);
  const lng = Number(req.query.lng || -0.36);

  let probe = null;
  if (configuredProvider === 'osm') {
    probe = await probeOsm(lat, lng);
  }

  return res.status(200).json({
    runtime: {
      configuredProvider,
      envPlacesProvider: process.env.PLACES_PROVIDER,
      nodeVersion: process.version,
    },
    probe,
    timestamp: new Date().toISOString(),
  });
};
