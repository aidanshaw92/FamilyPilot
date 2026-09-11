const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OVERPASS_USER_AGENT = 'FamilyPilot/1.0 (https://family-pilot-seven.vercel.app; places-api)';

function buildOverpassQuery(lat, lng, radiusKm, variant) {
  const radiusM = Math.min(Math.round(radiusKm * 1000), 12000);
  const foodRadius = Math.min(radiusM, 4000);
  const cultureRadius = Math.min(radiusM, 6000);
  const parkRadius = Math.min(radiusM, 10000);
  const limit = variant === 'minimal' ? 8 : 12;

  if (variant === 'minimal') {
    return `[out:json][timeout:8];(node["leisure"="park"](around:${Math.min(parkRadius, 5000)},${lat},${lng});node["amenity"="restaurant"](around:${Math.min(foodRadius, 3000)},${lat},${lng}););out center ${limit};`;
  }

  return `[out:json][timeout:12];(node["leisure"="park"](around:${parkRadius},${lat},${lng});node["leisure"="playground"](around:${Math.min(parkRadius, 6000)},${lat},${lng});node["amenity"="restaurant"](around:${foodRadius},${lat},${lng});node["amenity"="cafe"](around:${foodRadius},${lat},${lng});node["tourism"="museum"](around:${cultureRadius},${lat},${lng}););out center ${limit};`;
}

async function fetchOverpass(query) {
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
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        lastError = new Error(`Overpass API error: ${response.status} (${endpoint})`);
        continue;
      }
      const data = await response.json();
      return data.elements || [];
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Overpass request failed');
    }
  }
  throw lastError || new Error('Overpass API unavailable');
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
  else if (tags.tourism === 'zoo') category = 'zoo';
  else if (tags.tourism === 'attraction') category = 'attraction';
  else if (tags.tourism === 'farm') category = 'farm';
  else if (tags.leisure === 'playground') category = 'park';

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
  let elements = [];
  try {
    elements = await fetchOverpass(buildOverpassQuery(lat, lng, radiusKm, 'full'));
  } catch (_fullError) {
    elements = await fetchOverpass(buildOverpassQuery(lat, lng, radiusKm, 'minimal'));
  }

  const seen = new Set();
  return elements
    .map(elementToRecord)
    .filter(Boolean)
    .filter((r) => {
      if (seen.has(r.externalId)) return false;
      seen.add(r.externalId);
      return true;
    });
}

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

module.exports = { searchOsm, probeOsm };
