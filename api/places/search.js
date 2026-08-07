const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const OVERPASS_USER_AGENT = 'FamilyPilot/1.0 (https://family-pilot-seven.vercel.app; places-api)';

function getConfiguredProvider() {
  return (process.env.PLACES_PROVIDER || 'mock').toLowerCase();
}

function buildOverpassQuery(lat, lng, radiusM) {
  return `[out:json][timeout:25];
(
  node["leisure"="park"](around:${radiusM},${lat},${lng});
  way["leisure"="park"](around:${radiusM},${lat},${lng});
  node["tourism"="museum"](around:${radiusM},${lat},${lng});
  way["tourism"="museum"](around:${radiusM},${lat},${lng});
  node["tourism"="farm"](around:${radiusM},${lat},${lng});
  way["tourism"="farm"](around:${radiusM},${lat},${lng});
  node["amenity"="restaurant"](around:${radiusM},${lat},${lng});
  way["amenity"="restaurant"](around:${radiusM},${lat},${lng});
  node["amenity"="cafe"](around:${radiusM},${lat},${lng});
  way["amenity"="cafe"](around:${radiusM},${lat},${lng});
);
out center 30;`;
}

function elementToRecord(element) {
  const tags = element.tags || {};
  const name = tags.name;
  if (!name) return null;
  const lat = element.lat != null ? element.lat : element.center && element.center.lat;
  const lon = element.lon != null ? element.lon : element.center && element.center.lon;
  if (lat == null || lon == null) return null;

  let category = 'park';
  if (tags.amenity === 'cafe') category = 'cafe';
  else if (tags.amenity === 'restaurant') category = 'restaurant';
  else if (tags.tourism === 'museum') category = 'museum';
  else if (tags.tourism === 'farm' || tags.tourism === 'zoo') category = 'farm';

  return {
    familypilotId: `fp-osm-${element.id}`,
    externalId: `osm:${element.type}/${element.id}`,
    provider: 'osm',
    name,
    latitude: lat,
    longitude: lon,
    category,
    address: [tags['addr:street'], tags['addr:city'], tags['addr:postcode']].filter(Boolean).join(', ') || undefined,
    website: tags.website,
    phone: tags.phone || tags['contact:phone'],
    photos: [],
    fetchedAt: new Date().toISOString(),
  };
}

async function searchOsm(lat, lng, radiusKm) {
  const radiusM = Math.round(radiusKm * 1000);
  const query = buildOverpassQuery(lat, lng, radiusM);
  const response = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': OVERPASS_USER_AGENT,
      Accept: 'application/json',
    },
    body: new URLSearchParams({ data: query }).toString(),
  });
  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status}`);
  }
  const data = await response.json();
  const seen = new Set();
  return (data.elements || [])
    .map(elementToRecord)
    .filter(Boolean)
    .filter((r) => {
      if (seen.has(r.externalId)) return false;
      seen.add(r.externalId);
      return true;
    });
}

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
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lng);
  const radiusKm = Number(req.query.radiusKm || 25);
  const configuredProvider = getConfiguredProvider();
  const fetchedAt = new Date().toISOString();

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: 'Invalid coordinates', fallbackAvailable: true });
  }

  if (configuredProvider === 'osm') {
    try {
      const places = await searchOsm(latitude, longitude, radiusKm);
      return res.status(200).json({
        places,
        provider: 'osm',
        configuredProvider,
        cached: false,
        fetchedAt,
        fallbackUsed: false,
      });
    } catch (error) {
      return res.status(200).json({
        places: MOCK_FALLBACK,
        provider: 'mock',
        configuredProvider,
        cached: false,
        fetchedAt,
        fallbackUsed: true,
        fallbackReason: error instanceof Error ? error.message : 'OSM provider failed',
      });
    }
  }

  return res.status(200).json({
    places: MOCK_FALLBACK,
    provider: 'mock',
    configuredProvider,
    cached: false,
    fetchedAt,
    fallbackUsed: false,
  });
};
