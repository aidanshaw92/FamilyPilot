const PLACES_BASE_URL = 'https://places.googleapis.com/v1';

const {
  mapGoogleCategory,
  googleTypesForIntent,
  isSupportedForIntent,
  rankPlaces,
  dedupeChains,
  dedupeVenueAliases,
  findVenueAliasPairs,
} = require('./places-quality');
const {
  filterPlacesToCanonicalPrimaries,
  recordAliasPairs,
  getCanonicalIdentity,
} = require('./canonical-venues');

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

/**
 * Google Nearby uses POPULARITY for a broad quality candidate set; FamilyPilot re-ranks
 * by category relevance + distance (not distance-only).
 */
const SEARCH_RANK_PREFERENCE = 'POPULARITY';
const EXPLORE_MAX_CANDIDATES = 20;
const RESULT_LIMIT = 20;

function getApiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_PLACES_API_KEY is not configured on the server');
  }
  return key;
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

function googlePlaceToRecord(place, intent) {
  const placeId = place.id;
  const name = place.displayName && place.displayName.text;
  const latitude = place.location && place.location.latitude;
  const longitude = place.location && place.location.longitude;
  if (!placeId || !name || latitude == null || longitude == null) return null;

  const primaryType = place.primaryType;
  const types = place.types || [];
  if (!isSupportedForIntent(primaryType, types, intent, name)) return null;

  const category = mapGoogleCategory(primaryType, types, name);
  if (!category) return null;

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
    enrichmentStatus: 'provider_only',
    googlePrimaryType: primaryType,
    googleTypes: types,
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

async function searchGoogle(lat, lng, radiusKm, options = {}) {
  const intent = options.intent === 'restaurant' ? 'restaurant' : 'explore';
  const radiusM = Math.min(Math.max(Math.round(radiusKm * 1000), 500), 50000);
  const includedTypes = googleTypesForIntent(intent);

  const data = await googleRequest(`${PLACES_BASE_URL}/places:searchNearby`, {
    method: 'POST',
    fieldMask: SEARCH_FIELD_MASK,
    body: {
      includedPrimaryTypes: includedTypes,
      maxResultCount: intent === 'explore' ? EXPLORE_MAX_CANDIDATES : RESULT_LIMIT,
      rankPreference: SEARCH_RANK_PREFERENCE,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusM,
        },
      },
    },
  });

  const seen = new Set();
  const mapped = (data.places || [])
    .map((place) => googlePlaceToRecord(place, intent))
    .filter(Boolean)
    .filter((record) => {
      if (seen.has(record.externalId)) return false;
      seen.add(record.externalId);
      return true;
    });

  const chainDeduped = dedupeChains(mapped, lat, lng, intent);
  const { places: aliasDeduped, pairs } = findVenueAliasPairs(chainDeduped);

  if (pairs.length > 0) {
    try {
      await recordAliasPairs(pairs, { reviewStatus: 'uncertain' });
    } catch {
      // Canonical link persistence must not break search
    }
  }

  const canonicalFiltered = await filterPlacesToCanonicalPrimaries(aliasDeduped);
  return rankPlaces(canonicalFiltered, {
    originLat: lat,
    originLng: lng,
    intent,
    maxResults: RESULT_LIMIT,
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
    const { mapGoogleCategory: mapCat } = require('./places-quality');
    const category = mapCat(place.primaryType, place.types || [], place.displayName?.text);
    if (!category) return null;
    const intent = category === 'restaurant' || category === 'cafe' ? 'restaurant' : 'explore';
    return googlePlaceToRecord(place, intent);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function probeGoogle(lat, lng) {
  try {
    const places = await searchGoogle(lat, lng, 5, { intent: 'explore' });
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
