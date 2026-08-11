const { estimateDriveMinutes } = require('./geo-utils');

const MAX_DESTINATIONS = 25;

function estimateJourneys(origin, destinations) {
  return destinations.map((destination) => ({
    placeId: destination.placeId,
    driveMinutes: estimateDriveMinutes(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude,
    ),
    source: 'estimated',
  }));
}

async function fetchGoogleDistanceMatrix(origin, destinations, apiKey) {
  const originParam = `${origin.latitude},${origin.longitude}`;
  const destinationParam = destinations
    .map((destination) => `${destination.latitude},${destination.longitude}`)
    .join('|');

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', originParam);
  url.searchParams.set('destinations', destinationParam);
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('departure_time', 'now');
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Distance Matrix request failed (${response.status})`);
  }

  const payload = await response.json();
  if (payload.status !== 'OK') {
    throw new Error(`Distance Matrix status ${payload.status}`);
  }

  const elements = payload.rows?.[0]?.elements ?? [];
  return destinations.map((destination, index) => {
    const element = elements[index];
    if (element?.status === 'OK' && element.duration?.value != null) {
      return {
        placeId: destination.placeId,
        driveMinutes: Math.max(1, Math.round(element.duration.value / 60)),
        source: 'live',
      };
    }

    return {
      placeId: destination.placeId,
      driveMinutes: estimateDriveMinutes(
        origin.latitude,
        origin.longitude,
        destination.latitude,
        destination.longitude,
      ),
      source: 'estimated',
    };
  });
}

async function getDriveTimes(origin, destinations) {
  if (!origin || !Array.isArray(destinations) || destinations.length === 0) {
    throw new Error('Origin and destinations are required');
  }

  const validDestinations = destinations
    .filter(
      (destination) =>
        destination?.placeId &&
        Number.isFinite(destination.latitude) &&
        Number.isFinite(destination.longitude),
    )
    .slice(0, MAX_DESTINATIONS);

  if (validDestinations.length === 0) {
    return { journeys: [], provider: 'fallback', source: 'estimated' };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return {
      journeys: estimateJourneys(origin, validDestinations),
      provider: 'fallback',
      source: 'estimated',
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const journeys = await fetchGoogleDistanceMatrix(origin, validDestinations, apiKey);
    const source = journeys.some((journey) => journey.source === 'live') ? 'live' : 'estimated';
    return {
      journeys,
      provider: 'google',
      source,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return {
      journeys: estimateJourneys(origin, validDestinations),
      provider: 'fallback',
      source: 'estimated',
      fetchedAt: new Date().toISOString(),
    };
  }
}

module.exports = {
  MAX_DESTINATIONS,
  estimateJourneys,
  getDriveTimes,
};
