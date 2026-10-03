const { getDriveTimes } = require('../../server/context/lib/journey-provider');
/**
 * Required as a module object rather than destructured, so a contract test can replace the
 * implementation and prove the transit branch returns before the driving path is touched. The same
 * reason `api/places/search.js` requires its food endpoint this way.
 */
const tflTransit = require('../../server/context/lib/tfl-transit');

/**
 * Transit is handled HERE rather than in its own function because Vercel's deployment budget is twelve
 * serverless functions and this project is at twelve. A thirteenth fails the deploy -- the same
 * constraint that put nearby-food inside the places search handler. The honest statement of the
 * guarantee is therefore not "a separate function cannot reach Google" but this: the transit branch
 * returns before `getDriveTimes` is called, and `tfl-transit.js` imports no Google client, no API key
 * and no billing gate. Its whole import graph is itself.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body ?? {};
  const origin = body.origin;
  const destinations = body.destinations;

  if (
    !origin ||
    !Number.isFinite(origin.latitude) ||
    !Number.isFinite(origin.longitude)
  ) {
    return res.status(400).json({ error: 'Invalid origin coordinates' });
  }

  /**
   * Public transport, answered before anything that can spend.
   *
   * `mode: 'transit'` is a different question from the drive matrix below, and it is free. It is also
   * UNPROVEN against the live TfL API, which is why it stays behind `TFL_TRANSIT_ENABLED` and answers
   * 503 TRANSIT_DISABLED rather than falling through: falling through would hand a transit request to
   * the driving path and return drive times labelled as a journey nobody asked for.
   */
  if (body.mode === 'transit') {
    const destination = Array.isArray(destinations) ? destinations[0] : destinations;
    if (
      !destination ||
      !Number.isFinite(destination.latitude) ||
      !Number.isFinite(destination.longitude)
    ) {
      return res.status(400).json({ error: 'Invalid destination coordinates', code: 'INVALID_DESTINATION' });
    }
    try {
      const transit = await tflTransit.getTransitJourney(origin, destination);
      // No Cache-Control: a journey result embeds departure times and goes stale by the minute.
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ...transit, googleCalls: 0 });
    } catch (error) {
      const code = error && error.code === 'TRANSIT_DISABLED' ? 'TRANSIT_DISABLED' : 'TRANSIT_UNAVAILABLE';
      res.setHeader('Cache-Control', 'no-store');
      // Never `state: 'unknown'` with a 200 here: a disabled provider is our state, not a fact about
      // whether a bus runs, and the client renders those differently.
      return res.status(503).json({ error: 'Public transport times are unavailable', code, googleCalls: 0 });
    }
  }

  try {
    const result = await getDriveTimes(origin, destinations);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Journey lookup failed',
    });
  }
};
