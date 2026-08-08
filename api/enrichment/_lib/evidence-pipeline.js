/**
 * Evidence-backed enrichment pipeline:
 * Google details → source discovery → fetch → extract → bundle for AI.
 */

const { getGooglePlace } = require('../../places/lib/google-places');
const { upsertPlaceRecord } = require('./enrichment-store');
const { discoverSourceUrls, expandDiscoveryFromHtml } = require('./source-discovery');
const { fetchOfficialPage } = require('./source-fetcher');
const { extractEvidenceFromText, buildEvidenceBundle } = require('./evidence-extractor');
const { getCachedEvidence, saveEvidenceRecord } = require('./evidence-store');

const MAX_PAGES = Number(process.env.SOURCE_MAX_PAGES || 5);

async function ensurePlaceDetails(familypilotId, placeRow) {
  if (placeRow?.website && placeRow?.description) {
    return placeRow;
  }
  if (!familypilotId.startsWith('fp-google-')) return placeRow;

  const live = await getGooglePlace(familypilotId);
  if (live) {
    await upsertPlaceRecord(live);
    return {
      ...placeRow,
      website: live.website ?? placeRow?.website,
      description: live.description ?? placeRow?.description,
      phone: live.phone ?? placeRow?.phone,
      opening_hours: live.openingHours ?? placeRow?.opening_hours,
      address: live.address ?? placeRow?.address,
    };
  }
  return placeRow;
}

async function fetchAndExtractPage(familypilotPlaceId, page) {
  const cached = await getCachedEvidence(familypilotPlaceId, page.url);
  if (cached) {
    return {
      url: cached.sourceUrl,
      sourceType: cached.sourceType,
      pageTitle: cached.pageTitle,
      retrievedAt: cached.retrievedAt,
      fetchStatus: 'cached',
      facts: cached.extractedEvidence,
      extractedText: cached.extractedText,
    };
  }

  const fetched = await fetchOfficialPage(page.url);
  if (!fetched.ok) {
    await saveEvidenceRecord({
      familypilotPlaceId,
      sourceUrl: page.url,
      sourceType: page.sourceType,
      fetchStatus: fetched.fetchStatus,
      error: fetched.error,
      extractedEvidence: [],
    });
    return {
      url: page.url,
      sourceType: page.sourceType,
      retrievedAt: new Date().toISOString(),
      fetchStatus: fetched.fetchStatus,
      error: fetched.error,
      facts: [],
    };
  }

  const facts = extractEvidenceFromText(fetched.extractedText, {
    url: fetched.url,
    sourceType: page.sourceType,
    retrievedAt: fetched.retrievedAt,
  });

  await saveEvidenceRecord({
    familypilotPlaceId,
    sourceUrl: fetched.url,
    sourceType: page.sourceType,
    pageTitle: fetched.pageTitle,
    retrievedAt: fetched.retrievedAt,
    contentHash: fetched.contentHash,
    extractedText: fetched.extractedText,
    extractedEvidence: facts,
    fetchStatus: 'ok',
  });

  return {
    url: fetched.url,
    sourceType: page.sourceType,
    pageTitle: fetched.pageTitle,
    retrievedAt: fetched.retrievedAt,
    fetchStatus: 'ok',
    facts,
    extractedText: fetched.extractedText,
    html: fetched.html,
  };
}

async function gatherEvidenceForVenue(familypilotPlaceId, placeRow) {
  const enrichedPlace = await ensurePlaceDetails(familypilotPlaceId, placeRow);
  const discovery = discoverSourceUrls({
    website: enrichedPlace?.website,
    googleDescription: enrichedPlace?.description,
  });

  const sources = [];
  let pages = discovery.pages.slice(0, MAX_PAGES);

  if (discovery.sourceStatus === 'no_official_source') {
    const googleFacts = [];
    if (enrichedPlace?.description) {
      googleFacts.push({
        field: 'editorialSummary',
        value: 'info',
        confidence: 'medium',
        evidenceText: enrichedPlace.description.slice(0, 400),
        sourceUrl: null,
        sourceType: 'google_provider',
        retrievedAt: enrichedPlace.fetched_at ?? new Date().toISOString(),
      });
    }
    return buildEvidenceBundle(familypilotPlaceId, [{
      url: enrichedPlace?.website ?? 'provider-only',
      sourceType: 'google_provider',
      retrievedAt: new Date().toISOString(),
      fetchStatus: 'ok',
      facts: googleFacts,
    }], 'no_official_source');
  }

  for (let i = 0; i < pages.length && sources.length < MAX_PAGES; i++) {
    const page = pages[i];
    const result = await fetchAndExtractPage(familypilotPlaceId, page);
    sources.push(result);

    if (i === 0 && result.html && pages.length < MAX_PAGES) {
      pages = expandDiscoveryFromHtml(result.html, page.url, pages, MAX_PAGES);
    }
  }

  return buildEvidenceBundle(familypilotPlaceId, sources, discovery.sourceStatus);
}

module.exports = {
  gatherEvidenceForVenue,
  ensurePlaceDetails,
  MAX_PAGES,
};
