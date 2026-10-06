const between = require('./between');

/**
 * The HTTP handling for `intent=between`, in a module that holds no Google anything.
 *
 * It sits behind `api/places/search.js` for the same reason `nearby-food-endpoint.js` does: the deployment budget is
 * twelve serverless functions, so this cannot be a function of its own. The search handler's only involvement is one early
 * `return` before `primePlacesBudget`, before a provider is chosen and before the search chain exists. This module's own
 * import graph (between -> catalogue, plus the stored canonical and enrichment readers) holds no API key, no budget gate and
 * no Google client, and `between-contract.test.ts` asserts both halves rather than trusting them.
 *
 * What it answers: stored catalogue places in the corridor between two homes, fairest first, with the enrichment the
 * app already reads for any place (stored database reads). It is the CANDIDATE stage of Meet Halfway; whether a place
 * suits either family is decided in the app, where both families' needs are.
 *
 * @param {{ query: Record<string, string> }} req
 * @param {{ status: Function, json: Function, setHeader: Function }} res
 * @param {{ readBetween?: Function, enrich?: Function }} [deps]
 */
async function handleBetweenRequest(req, res, deps = {}) {
  const readBetween = deps.readBetween ?? between.readBetween;

  const a = { latitude: Number(req.query.aLat), longitude: Number(req.query.aLng) };
  const b = { latitude: Number(req.query.bLat), longitude: Number(req.query.bLng) };
  const valid = (p) =>
    Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
  if (!valid(a) || !valid(b)) {
    // A 400, never a fall-through: falling through would hand the request to the provider chain, which starts at Google.
    return res.status(400).json({ error: 'Invalid home coordinates', code: 'INVALID_HOMES' });
  }
  const apartKm = between.haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
  if (apartKm > between.MAX_APART_KM) {
    return res.status(400).json({ error: 'Those homes are too far apart to meet between', code: 'TOO_FAR_APART' });
  }

  const optionalKm = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : undefined;
  };

  let result;
  try {
    result = await readBetween({
      a,
      b,
      maxKmA: optionalKm(req.query.aMaxKm),
      maxKmB: optionalKm(req.query.bMaxKm),
      limit: req.query.limit,
    });
  } catch {
    result = { available: false, places: [], considered: 0 };
  }

  if (!result.available) {
    // An outage is not an empty middle: the app says it could not look, and does not say there is nothing there.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'The venue catalogue is unavailable', code: 'CATALOGUE_UNAVAILABLE', googleCalls: 0 });
  }

  let places = result.places;
  try {
    const { filterPlacesToCanonicalPrimaries } = require('./canonical-venues');
    places = await filterPlacesToCanonicalPrimaries(places);
  } catch {
    // Best effort: a duplicate listing is better than no listing.
  }
  try {
    const enrich =
      deps.enrich ??
      (async (list) => {
        // One batched projection for the whole shortlist, not three or four round trips per place (see search.js).
        const { getConsumerMetadataBatch } = require('../../enrichment/_lib/consumer-projection');
        const byId = await getConsumerMetadataBatch(list.map((place) => place.familypilotId));
        return list.map((place) => {
          const metadata = byId.get(place.familypilotId);
          return metadata ? { ...place, enrichmentStatus: metadata.enrichmentStatus || place.enrichmentStatus, familyMetadata: metadata } : place;
        });
      });
    places = await enrich(places);
  } catch {
    // Best-effort metadata overlay, as on every other search path.
  }

  // PRIVATE: the request carries where two families live (rounded to about a kilometre by the app), so no shared cache keeps it.
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.status(200).json({
    places,
    provider: 'stored-catalogue',
    intent: 'between',
    googleCalls: 0,
    considered: result.considered,
    shortlisted: places.length,
    fetchedAt: new Date().toISOString(),
  });
}

module.exports = { handleBetweenRequest };
