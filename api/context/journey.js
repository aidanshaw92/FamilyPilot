const { getDriveTimes } = require('./lib/journey-provider');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body ?? {};
  const origin = body.origin;
  const destinations = body.destinations;

  if (
    !origin ||
    !Number.isFinite(origin.latitude) ||
    !Number.isFinite(origin.longitude)
  ) {
    return res.status(400).json({ error: 'Invalid origin coordinates' });
  }

  try {
    const result = await getDriveTimes(origin, destinations);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Journey lookup failed',
    });
  }
};
