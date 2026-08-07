const PLACES_BASE_URL = 'https://places.googleapis.com/v1';

const SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.formattedAddress',
  'places.primaryType',
  'places.types',
  'places.businessStatus',
].join(',');

const DETAIL_FIELD_MASK = [
  'id',
  'displayName',
  'location',
  'formattedAddress',
  'primaryType',
  'types',
  'websiteUri',
  'nationalPhoneNumber',
  'regularOpeningHours',
  'editorialSummary',
  'businessStatus',
].join(',');

const DEFAULT_SEARCH_TYPES = ['park', 'museum', 'restaurant', 'cafe', 'zoo'];

function getApiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_PLACES_API_KEY is not configured on the server');
  }
  return key;
}

function mapGoogleCategory(primaryType, types = []) {
  const candidates = [primaryType, ...types].filter(Boolean);
  for (const type of candidates) {
    if (type === 'restaurant' || type.endsWith('_restaurant')) return 'restaurant';
    if (type === 'cafe' || type === 'coffee_shop') return 'cafe';
    if (type === 'museum' || type === 'art_gallery') return 'museum';
    if (type === 'zoo') return 'farm';
    if (type === 'park' || type === 'playground' || type === 'national_park') return 'park';
    if (type === 'beach') return 'beach';
    if (type === 'lodging' || type === 'hotel') return 'hotel';
    if (type === 'supermarket' || type === 'grocery_store') return 'shop';
  }
  return 'park';
}

function mapOpeningHours(regularOpeningHours) {
  const weekdayText = regularOpeningHours && regularOpeningHours.weekdayDescriptions;
  if (!weekdayText || !weekdayText.length) return undefined;
  return { weekdayText, source: 'google' };
}

function mapIsOpen(businessStatus) {
  if (!businessStatus) return undefined;
  if (businessStatus === 'OPERATIONAL') return true;
  if (businessStatus === 'CLOSED_TEMPORARILY' || businessStatus === 'CLOSED_PERMANENTLY') {
    return false;
  }
  return undefined;
}

function googlePlaceToRecord(place) {
  const placeId = place.id;
  const name = place.displayName && place.displayName.text;
  const latitude = place.location && place.location.latitude;
  const longitude = place.location && place.location.longitude;
  if (!placeId || !name || latitude == null || longitude == null) return null;

  const category = mapGoogleCategory(place.primaryType, place.types || []);
  const openingHours = mapOpeningHours(place.regularOpeningHours);
  const description = place.editorialSummary && place.editorialSummary.text;
  const fetchedAt = new Date().toISOString();

  return {
    familypilotId: `fp-google-${placeId}`,
    externalId: `google:${placeId}`,
    provider: 'google',
    name,
    latitude,
    longitude,
    category,
    address: place.formattedAddress,
    description,
    openingHours,
    website: place.websiteUri,
    phone: place.nationalPhoneNumber,
    photos: [],
    isOpen: mapIsOpen(place.businessStatus),
    fetchedAt,
  };
}

async function googleRequest(url, options) {
  let response;
  try {
    response = await fetch(url, {
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': getApiKey(),
        'X-Goog-FieldMask': options.fieldMask,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Google Places network error');
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message =
      (errorBody && errorBody.error && (errorBody.error.message || errorBody.error.status)) ||
      `Google Places API error: ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

async function searchGoogle(lat, lng, radiusKm) {
  const radiusM = Math.min(Math.max(Math.round(radiusKm * 1000), 500), 50000);
  const data = await googleRequest(`${PLACES_BASE_URL}/places:searchNearby`, {
    method: 'POST',
    fieldMask: SEARCH_FIELD_MASK,
    body: {
      includedTypes: DEFAULT_SEARCH_TYPES,
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusM,
        },
      },
    },
  });

  const seen = new Set();
  return (data.places || [])
    .map(googlePlaceToRecord)
    .filter(Boolean)
    .filter((record) => {
      if (seen.has(record.externalId)) return false;
      seen.add(record.externalId);
      return true;
    });
}

async function getGooglePlace(familypilotId) {
  if (!familypilotId.startsWith('fp-google-')) return null;
  const placeId = familypilotId.slice('fp-google-'.length);
  if (!placeId) return null;

  try {
    const place = await googleRequest(
      `${PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}`,
      { method: 'GET', fieldMask: DETAIL_FIELD_MASK },
    );
    return googlePlaceToRecord(place);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function probeGoogle(lat, lng) {
  try {
    const places = await searchGoogle(lat, lng, 5);
    return {
      ok: true,
      count: places.length,
      sampleNames: places.slice(0, 5).map((p) => p.name),
    };
  } catch (error) {
    return {
      ok: false,
      count: 0,
      sampleNames: [],
      error: error instanceof Error ? error.message : 'Google probe failed',
    };
  }
}

module.exports = {
  searchGoogle,
  getGooglePlace,
  probeGoogle,
  googlePlaceToRecord,
};
