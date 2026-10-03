const { probeGoogle } = require('../../server/places/lib/google-places');
const { probeOsm } = require('../../server/places/lib/osm-places');
const { placesBudgetSnapshot, isPlacesEnabled } = require('../../server/places/lib/places-budget');

/**
 * A diagnostics endpoint that used to cost money on every request.
 *
 * It is public and unauthenticated, and it called `probeGoogle` -- a real Nearby Search -- on every
 * GET while `configuredProvider` was 'google'. Anyone who found the URL could bill the project by
 * refreshing it, and any uptime monitor pointed at it would have done so continuously.
 *
 * The probe is now opt-in per request (`?probe=live`) and subject to the `probe` scope switch. Without
 * it the endpoint reports configuration only, which is what a reader almost always actually wants:
 * whether the key and provider are set.
 *
 * THIS COMMENT USED TO SAY the probe switch was "off by default like every other scope". That was true
 * in development and FALSE IN PRODUCTION -- the one environment where it bills. `masterEnabled()`
 * defaults to true when VERCEL_ENV is production, so every scope without `requiresExplicitEnable`
 * inherited "on" from an unset variable, and a live production check found `probeEnabled: true`. The
 * endpoint was therefore still exactly what the paragraph above says it stopped being: a URL a stranger
 * could loop to bill the project, with attacker-supplied coordinates so no cache could absorb it.
 * The `probe` scope now requires its variable by name, so the sentence is true again.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const configuredProvider = (process.env.PLACES_PROVIDER || 'mock').toLowerCase();
  const lat = Number(req.query.lat || 51.643);
  const lng = Number(req.query.lng || -0.36);
  const hasGoogleKey = Boolean(process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY);

  const liveProbeRequested = req.query.probe === 'live';

  let probe = null;
  let probeSkippedReason = null;
  if (!liveProbeRequested) {
    probeSkippedReason = 'add ?probe=live to make a billable provider request';
  } else if (configuredProvider === 'google') {
    // probeGoogle bills against the `probe` scope, so a disabled switch turns this into a reported
    // reason rather than a request. It returns `{ ok: false, error }` instead of throwing.
    probe = await probeGoogle(lat, lng);
  } else if (configuredProvider === 'osm') {
    // OpenStreetMap is free, so there is nothing to gate.
    probe = await probeOsm(lat, lng);
  } else {
    probeSkippedReason = `configured provider is "${configuredProvider}"`;
  }

  return res.status(200).json({
    runtime: {
      configuredProvider,
      envPlacesProvider: process.env.PLACES_PROVIDER,
      hasGooglePlacesApiKey: hasGoogleKey,
      nodeVersion: process.version,
    },
    // The whole cost posture in one object, so "is Google switched on in production?" is answerable
    // without a billable request and without reading Vercel's environment settings.
    placesBudget: placesBudgetSnapshot(),
    probeEnabled: isPlacesEnabled('probe'),
    probe,
    probeSkippedReason,
    timestamp: new Date().toISOString(),
  });
};
