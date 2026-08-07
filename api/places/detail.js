const MOCK_DETAILS = {
  'venue-1': {
    place: {
      familypilotId: 'venue-1',
      externalId: 'mock:venue-1',
      provider: 'mock',
      name: 'Aldenham Country Park',
      latitude: 51.657,
      longitude: -0.312,
      category: 'park',
      photos: ['https://images.unsplash.com/photo-1564760055775-d63b17a55c44?w=800&q=80'],
      fetchedAt: new Date().toISOString(),
    },
    metadata: {
      familypilotPlaceId: 'venue-1',
      bestAges: '2 – 10 years',
      terrain: 'flat',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  },
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id', fallbackAvailable: true });

  const configuredProvider = (process.env.PLACES_PROVIDER || 'mock').toLowerCase();
  const detail = MOCK_DETAILS[id];
  if (!detail) {
    return res.status(404).json({ error: 'Place not found', code: 'NOT_FOUND', fallbackAvailable: true });
  }

  return res.status(200).json({
    ...detail,
    provider: detail.place.provider,
    configuredProvider,
    cached: false,
    fetchedAt: new Date().toISOString(),
    fallbackUsed: configuredProvider === 'osm' && detail.place.provider === 'mock',
    fallbackReason:
      configuredProvider === 'osm' && detail.place.provider === 'mock'
        ? 'Detail lookup uses mock until OSM place cache is wired'
        : undefined,
  });
};
