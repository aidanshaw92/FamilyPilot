const { getGooglePlace } = require('../../server/places/lib/google-places');
const { MOCK_FALLBACK } = require('../../server/places/lib/fallback');
const { getCanonicalIdentity, resolvePrimaryPlaceId } = require('../../server/places/lib/canonical-venues');
const { getPlaceRecord } = require('../../server/enrichment/_lib/enrichment-store');
const {
  isPlacesEnabled,
  describeScope,
  primePlacesBudget,
  PlacesDisabledError,
  PlacesBudgetExceededError,
} = require('../../server/places/lib/places-budget');

/**
 * How this endpoint decides whether to spend.
 *
 * It used to call Place Details unconditionally for every `fp-google-*` id, with no cache and no
 * look at `place_records` -- so opening the same venue twice bought the same data twice, and the
 * CI visual-regression job's venue navigation bought it again on every run.
 *
 * Now the stored copy is read first. Two windows govern it:
 *
 *  - Inside STORED_FRESH_DAYS the stored copy is served and Google is not called at all.
 *  - Between that and STORED_MAX_DAYS it is served, and a refresh is attempted only if the details
 *    scope is enabled.
 *
 * STORED_MAX_DAYS is 30 because the Google Maps Platform terms permit caching Places content
 * temporarily rather than indefinitely, and 30 days is the limit they state. A copy older than that
 * is not served from cache: either Google is called, or the request fails visibly. Place IDs are
 * the exception -- those may be stored indefinitely, which is why `place_records` keeps its rows
 * rather than deleting them.
 */
const STORED_FRESH_DAYS = Number(process.env.PLACES_DETAIL_FRESH_DAYS || 7);
const STORED_MAX_DAYS = 30;

function ageInDays(fetchedAt) {
  const timestamp = Date.parse(fetchedAt || '');
  if (!Number.isFinite(timestamp)) return Infinity;
  return (Date.now() - timestamp) / 86_400_000;
}

const MOCK_DETAILS = {
  'venue-1': {
    place: {
      familypilotId: 'venue-1',
      externalId: 'mock:venue-1',
      provider: 'mock',
      name: 'Aldenham Country Park',
      latitude: 51.657,
      longitude: -0.312,
      category: 'park',
      photos: ['https://images.unsplash.com/photo-1564760055775-d63b17a55c44?w=800&q=80'],
      fetchedAt: new Date().toISOString(),
    },
    metadata: {
      familypilotPlaceId: 'venue-1',
      bestAges: '2 – 10 years',
      terrain: 'flat',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  },
};

function mockDetailFor(id) {
  const detail = MOCK_DETAILS[id];
  if (detail) return detail;
  const mockPlace = MOCK_FALLBACK.find((p) => p.familypilotId === id);
  if (!mockPlace) return null;
  return {
    place: { ...mockPlace, photos: mockPlace.photos || [] },
    metadata: null,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id', fallbackAvailable: true });

  // Loads today's shared billable total before anything can spend, so the daily cap counts what
  // every other serverless instance has already bought rather than only this one.
  await primePlacesBudget();

  let canonicalIdentity = null;
  try {
    canonicalIdentity = await getCanonicalIdentity(id);
  } catch {
    // Canonical lookup is best-effort
  }

  const configuredProvider = (process.env.PLACES_PROVIDER || 'mock').toLowerCase();
  const fetchedAt = new Date().toISOString();
  let detail = null;
  let provider = 'mock';
  let fallbackUsed = false;
  let fallbackReason;
  const errors = [];
  const lookupId =
    canonicalIdentity?.isAlias && canonicalIdentity.primaryFamilypilotPlaceId
      ? canonicalIdentity.primaryFamilypilotPlaceId
      : id;

  let servedFromStore = false;
  let storedAgeDays = null;

  if (configuredProvider === 'google' && lookupId.startsWith('fp-google-')) {
    let stored = null;
    try {
      stored = await getPlaceRecord(lookupId);
    } catch (error) {
      errors.push(`store: ${error instanceof Error ? error.message : 'store unavailable'}`);
    }

    const storedAge = stored ? ageInDays(stored.fetchedAt) : Infinity;
    const storedIsServable = Boolean(stored) && storedAge < STORED_MAX_DAYS;
    const storedIsFresh = storedIsServable && storedAge < STORED_FRESH_DAYS;

    if (storedIsFresh) {
      // The whole point of the change: no Google request on the common path.
      detail = { place: stored, metadata: null };
      provider = 'google';
      servedFromStore = true;
      storedAgeDays = Number(storedAge.toFixed(2));
    } else {
      try {
        const place = await getGooglePlace(lookupId, { reason: 'venue_detail_open' });
        if (place) {
          detail = { place, metadata: null };
          provider = 'google';
        }
      } catch (error) {
        const disabled =
          error instanceof PlacesDisabledError || error instanceof PlacesBudgetExceededError;
        errors.push(`google: ${error instanceof Error ? error.message : 'provider failed'}`);
        if (disabled && storedIsServable) {
          // Switched off, but we hold a copy Google's terms still let us serve. Showing it beats
          // showing nothing, and the response says plainly that it was not refreshed.
          detail = { place: stored, metadata: null };
          provider = 'google';
          servedFromStore = true;
          storedAgeDays = Number(storedAge.toFixed(2));
          fallbackUsed = true;
          fallbackReason = `served from store: ${error.detail || error.message}`;
        } else if (disabled) {
          // Nothing stored, or the stored copy has outlived what we may cache. Fail loudly rather
          // than substituting a demo venue for a real one the parent asked for.
          res.setHeader('Cache-Control', 'no-store');
          return res.status(error instanceof PlacesBudgetExceededError ? 429 : 503).json({
            error: 'Live venue details are unavailable',
            code: error.code,
            scope: error.scope,
            detail: error.detail,
            requestedPlaceId: id,
            fallbackAvailable: false,
          });
        }
      }
    }
  }

  if (!detail) {
    const mockDetail = mockDetailFor(lookupId);
    if (mockDetail) {
      detail = mockDetail;
      provider = mockDetail.place.provider;
      if (configuredProvider === 'google' && provider === 'mock') {
        fallbackUsed = true;
        fallbackReason = errors.join(' → ') || 'Google place not found — using mock detail';
      }
    }
  }

  if (!detail) {
    return res.status(404).json({ error: 'Place not found', code: 'NOT_FOUND', fallbackAvailable: true });
  }

  try {
    const {
      getConsumerMetadata,
      getVenueStaleFacts,
    } = require('../../server/enrichment/_lib/consumer-projection');
    const primaryId = await resolvePrimaryPlaceId(id);
    // Started now and awaited after the metadata, so the count runs beside the reads the detail already makes.
    const reportsFlag = require('../../server/feedback/_lib/store').venueHasRecentReports(primaryId);
    const metadata = await getConsumerMetadata(primaryId);
    if (metadata) {
      detail.metadata = metadata;
      detail.place = { ...detail.place, enrichmentStatus: metadata.enrichmentStatus, familyMetadata: metadata };
    }
    // A sibling of `metadata`, never a field inside it. Facts we no longer vouch for must be
    // impossible to reach by reading the venue's metadata, so that a screen which has never heard
    // of stale evidence cannot render one as confirmed.
    detail.staleFacts = await getVenueStaleFacts(primaryId);
    // Whether a parent report could still correct a fact on this page. A sibling like `staleFacts`, true/false/null (null is
    // "could not tell"). It lets the screen show Family Fit as "checking recent reports" only for the venues where that is true,
    // instead of showing an official fact as confirmed and correcting it a moment later. Read beside the metadata, bounded to
    // 400 ms, and it cannot fail the detail (an error is `null`).
    detail.hasRecentParentReports = await reportsFlag;
  } catch {
    // Metadata load is best-effort — provider facts still returned
  }

  // A venue page that is reloaded, or opened by several family members at once, must not re-invoke
  // this function. The body carries enrichment metadata that does change, so the browser is told to
  // revalidate while the CDN absorbs the repeats.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');

  return res.status(200).json({
    ...detail,
    requestedPlaceId: id,
    canonicalIdentity,
    provider,
    configuredProvider,
    cached: servedFromStore,
    storedAgeDays,
    placesEnabled: isPlacesEnabled('details'),
    placesScope: describeScope('details'),
    fetchedAt,
    fallbackUsed,
    fallbackReason,
  });
};
