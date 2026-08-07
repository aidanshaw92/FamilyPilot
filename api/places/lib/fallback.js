const { searchGoogle } = require('./google-places');
const { searchOsm } = require('./osm-places');

const MOCK_FALLBACK = [
  {
    familypilotId: 'venue-1',
    externalId: 'mock:venue-1',
    provider: 'mock',
    name: 'Aldenham Country Park',
    latitude: 51.657,
    longitude: -0.312,
    category: 'park',
    photos: [],
    fetchedAt: new Date().toISOString(),
  },
  {
    familypilotId: 'venue-2',
    externalId: 'mock:venue-2',
    provider: 'mock',
    name: 'Cassiobury Park',
    latitude: 51.655,
    longitude: -0.402,
    category: 'park',
    photos: [],
    fetchedAt: new Date().toISOString(),
  },
];

const SEARCH_CHAIN = {
  google: [
    { name: 'google', search: searchGoogle },
    { name: 'osm', search: searchOsm },
    { name: 'mock', search: async () => MOCK_FALLBACK },
  ],
  osm: [
    { name: 'osm', search: searchOsm },
    { name: 'mock', search: async () => MOCK_FALLBACK },
  ],
  mock: [{ name: 'mock', search: async () => MOCK_FALLBACK }],
};

async function searchWithFallback(lat, lng, radiusKm, configuredProvider, options = {}) {
  const chain = SEARCH_CHAIN[configuredProvider] || SEARCH_CHAIN.mock;
  const errors = [];

  for (let i = 0; i < chain.length; i += 1) {
    const step = chain[i];
    try {
      const places = await step.search(lat, lng, radiusKm, options);
      return {
        places,
        provider: step.name,
        fallbackUsed: i > 0,
        fallbackReason: i > 0 ? errors.join(' → ') : undefined,
      };
    } catch (error) {
      errors.push(`${step.name}: ${error instanceof Error ? error.message : 'provider failed'}`);
    }
  }

  return {
    places: MOCK_FALLBACK,
    provider: 'mock',
    fallbackUsed: true,
    fallbackReason: errors.join(' → '),
  };
}

module.exports = { searchWithFallback, MOCK_FALLBACK };
