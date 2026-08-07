const { getGooglePlace } = require('./lib/google-places');
const { MOCK_FALLBACK } = require('./lib/fallback');

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

function mockDetailFor(id) {
  const detail = MOCK_DETAILS[id];
  if (detail) return detail;
  const mockPlace = MOCK_FALLBACK.find((p) => p.familypilotId === id);
  if (!mockPlace) return null;
  return {
    place: { ...mockPlace, photos: mockPlace.photos || [] },
    metadata: null,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id', fallbackAvailable: true });

  const configuredProvider = (process.env.PLACES_PROVIDER || 'mock').toLowerCase();
  const fetchedAt = new Date().toISOString();
  let detail = null;
  let provider = 'mock';
  let fallbackUsed = false;
  let fallbackReason;
  const errors = [];

  if (configuredProvider === 'google' && id.startsWith('fp-google-')) {
    try {
      const place = await getGooglePlace(id);
      if (place) {
        detail = { place, metadata: null };
        provider = 'google';
      }
    } catch (error) {
      errors.push(`google: ${error instanceof Error ? error.message : 'provider failed'}`);
    }
  }

  if (!detail) {
    const mockDetail = mockDetailFor(id);
    if (mockDetail) {
      detail = mockDetail;
      provider = mockDetail.place.provider;
      if (configuredProvider === 'google' && provider === 'mock') {
        fallbackUsed = true;
        fallbackReason = errors.join(' → ') || 'Google place not found — using mock detail';
      }
    }
  }

  if (!detail) {
    return res.status(404).json({ error: 'Place not found', code: 'NOT_FOUND', fallbackAvailable: true });
  }

  try {
    const { getMetadata } = require('../enrichment/lib/enrichment-store');
    const metadata = await getMetadata(id);
    if (metadata) {
      detail.metadata = metadata;
      detail.place = { ...detail.place, enrichmentStatus: metadata.enrichmentStatus, familyMetadata: metadata };
    }
  } catch {
    // Metadata load is best-effort — provider facts still returned
  }

  return res.status(200).json({
    ...detail,
    provider,
    configuredProvider,
    cached: false,
    fetchedAt,
    fallbackUsed,
    fallbackReason,
  });
};
