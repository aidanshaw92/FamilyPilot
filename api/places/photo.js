/**
 * Resolves a Google place photo for the app, without ever exposing the API key.
 *
 * This endpoint was the most expensive line of code in the repository. It made TWO billable Google
 * requests per image -- a Place Details call purely to re-read the photo reference, then the Place
 * Photos media call -- and set `Cache-Control: no-store`, so every render of every card bought both
 * again. Home shows three photographs at once, the CI visual-regression job loaded Home eight times
 * per run, and it ran 49 times in September 2026.
 *
 * Two changes remove most of that spend without changing what a parent sees:
 *
 *  1. **The redirect is cacheable.** `s-maxage` lets Vercel's CDN answer a repeat render without
 *     invoking this function at all, which is the only way a re-render can cost nothing. The window
 *     is deliberately short relative to the signed URL's own lifetime, so a cached redirect cannot
 *     outlive the URL it points at.
 *  2. **Concurrent lookups are coalesced.** Home shows three photographs at once; the reference
 *     lookup for one place is now bought once per process rather than once per layer.
 *
 * What was considered and rejected: carrying Google's photo reference in the proxy path, so the
 * media call could be made directly and the Place Details lookup skipped entirely. That halves the
 * calls on paper, but a reference may expire while a `place_records` row lives on, so a stale one
 * costs an extra failed media call before the lookup it was meant to avoid. It also breaks an
 * invariant the project had already set and pinned in `london-browsing.test.ts`. A cache miss here
 * therefore still costs two billable requests, and the lever is the hit rate, not the call count.
 */
const {
  assertPlacesAllowed,
  dedupe,
  PlacesDisabledError,
  PlacesBudgetExceededError,
} = require('../../server/places/lib/places-budget');

const PLACES_BASE_URL = 'https://places.googleapis.com/v1';

/** Browser cache; short so a stale redirect cannot survive long. */
const BROWSER_MAX_AGE_S = 600;
/** CDN cache; the figure that actually stops repeat renders reaching Google. */
const CDN_MAX_AGE_S = 3600;

const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

function blocked(res, error) {
  // Never cached: the switch can be turned back on at any moment, and a cached 503 would outlive it.
  res.setHeader('Cache-Control', 'no-store');
  const status = error instanceof PlacesBudgetExceededError ? 429 : 503;
  return res.status(status).json({
    error: 'Venue photography is unavailable',
    code: error.code,
    scope: error.scope,
    detail: error.detail,
  });
}

/** Resolves the photo reference by buying a Place Details call. Coalesced per process. */
async function lookupPhotoReference(key, placeId, index) {
  return dedupe(`photo-ref:${placeId}`, async () => {
    assertPlacesAllowed({
      scope: 'photos',
      reason: 'photo_reference_lookup',
      subject: `fp-google-${placeId}`,
    });
    const response = await fetch(`${PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'photos' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    return body?.photos ?? null;
  }).then((photos) => (Array.isArray(photos) ? photos[index]?.name ?? null : null));
}

async function resolveMediaUri(key, photoName, placeId) {
  assertPlacesAllowed({
    scope: 'photos',
    reason: 'photo_media',
    subject: `fp-google-${placeId}`,
  });
  const response = await fetch(
    `${PLACES_BASE_URL}/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true`,
    { headers: { 'X-Goog-Api-Key': key }, signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) return null;
  const { photoUri } = (await response.json().catch(() => ({}))) || {};
  if (typeof photoUri !== 'string') return null;
  let url;
  try {
    url = new URL(photoUri);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.googleusercontent.com')) return null;
  return photoUri;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).end();
  }

  const id = req.query.id;
  const index = Number(req.query.index || 0);
  if (
    typeof id !== 'string' ||
    !PLACE_ID_PATTERN.test(id) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > 2
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).end();
  }

  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Venue photography is not configured' });
  }

  try {
    const photoName = await lookupPhotoReference(key, id, index);
    if (!photoName) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).end();
    }

    const photoUri = await resolveMediaUri(key, photoName, id);
    if (!photoUri) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).end();
    }

    res.setHeader(
      'Cache-Control',
      `public, max-age=${BROWSER_MAX_AGE_S}, s-maxage=${CDN_MAX_AGE_S}`,
    );
    return res.redirect(302, photoUri);
  } catch (error) {
    if (error instanceof PlacesDisabledError || error instanceof PlacesBudgetExceededError) {
      return blocked(res, error);
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).end();
  }
};
