// Resolve a UK postcode or town. Never silently substitute a default location.
//
// postcodes.io is free and handles a full postcode. Google Geocoding is the paid fallback for a
// town name, so it goes through the same gate as every other billable Google request -- this
// endpoint is public and unauthenticated, and without a gate anyone could bill the project by
// POSTing town names at it. With the gate closed the endpoint keeps working for postcodes and says
// so, which is the fallback it already had for a missing key.
const {
  reservePlacesCall,
  primePlacesBudget,
  PlacesDisabledError,
  PlacesBudgetExceededError,
} = require('../../server/places/lib/places-budget');

const POSTCODE_ONLY_MESSAGE =
  'We can only look up full UK postcodes right now, like NW7 2AB. Try entering one instead of a town name.';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const input = typeof req.body?.area === 'string' ? req.body.area.trim() : '';
  if (input.length < 2 || input.length > 120) return res.status(400).json({ error: 'Enter a UK town or postcode.' });
  try {
    let location;
    if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(input)) {
      const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(input)}`, { signal: AbortSignal.timeout(10000) });
      const result = await response.json();
      if (response.ok && result.result) location = { latitude: result.result.latitude, longitude: result.result.longitude, area: result.result.admin_district || result.result.outcode };
    }
    if (!location) {
      const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
      if (!key) return res.status(503).json({ error: POSTCODE_ONLY_MESSAGE });
      try {
        // Read the shared ledger first, so GOOGLE_PLACES_REQUIRE_LEDGER can be honoured on this path too.
        await primePlacesBudget();
        await reservePlacesCall({ scope: 'geocoding', reason: 'town_name_lookup', subject: input });
      } catch (gateError) {
        if (gateError instanceof PlacesDisabledError || gateError instanceof PlacesBudgetExceededError) {
          return res.status(gateError instanceof PlacesBudgetExceededError ? 429 : 503).json({
            error: POSTCODE_ONLY_MESSAGE,
            code: gateError.code,
          });
        }
        throw gateError;
      }
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', input); url.searchParams.set('components', 'country:GB'); url.searchParams.set('key', key);
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const result = await response.json(); const first = result.results?.[0];
      if (result.status === 'OK' && first) location = { latitude: first.geometry.location.lat, longitude: first.geometry.location.lng,
        area: first.address_components?.find(c => c.types.includes('postal_town') || c.types.includes('locality'))?.long_name || input };
    }
    if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return res.status(404).json({ error: 'Location not found. Check the UK town or postcode.' });
    return res.status(200).json(location);
  } catch { return res.status(503).json({ error: 'Location lookup is unavailable. Please try again.' }); }
};
