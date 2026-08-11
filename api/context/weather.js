const { getCurrentWeather } = require('./lib/weather-provider');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=900');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  try {
    const weather = await getCurrentWeather(latitude, longitude);
    return res.status(200).json(weather);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Weather lookup failed',
    });
  }
};
