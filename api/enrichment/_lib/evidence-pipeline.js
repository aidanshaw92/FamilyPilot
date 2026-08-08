/**
 * Evidence-backed enrichment pipeline:
 * Google details → source discovery → fetch → extract → bundle for AI.
 */

const { getGooglePlace } = require('../../places/lib/google-places');
const { upsertPlaceRecord } = require('./enrichment-store');
const { discoverSourceUrls, mergePageCandidates } = require('./source-discovery');
const { fetchOfficialPage } = require('./source-fetcher');
const { extractEvidenceFromText, buildEvidenceBundle } = require('./evidence-extractor');
const { getCachedEvidence, saveEvidenceRecord } = require('./evidence-store');

const MAX_PAGES = Number(process.env.SOURCE_MAX_PAGES || 5);

function isQuickFailure(result) {
  return (
    result.fetchStatus === 'error' &&
    (result.error === 'HTTP 404' || String(result.error).includes('404'))
  );
}

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
      html: null,
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
      html: fetched.html ?? null,
      truncated: fetched.truncated ?? false,
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
    fetchStatus: fetched.fetchStatus,
  });

  return {
    url: fetched.url,
    sourceType: page.sourceType,
    pageTitle: fetched.pageTitle,
    retrievedAt: fetched.retrievedAt,
    fetchStatus: fetched.fetchStatus,
    facts,
    extractedText: fetched.extractedText,
    html: fetched.html,
    truncated: fetched.truncated ?? false,
  };
}

async function gatherEvidenceForVenue(familypilotPlaceId, placeRow) {
  const enrichedPlace = await ensurePlaceDetails(familypilotPlaceId, placeRow);
  const discovery = discoverSourceUrls({
    website: enrichedPlace?.website,
    googleDescription: enrichedPlace?.description,
  });

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
    return buildEvidenceBundle(
      familypilotPlaceId,
      [{
        url: enrichedPlace?.website ?? 'provider-only',
        sourceType: 'google_provider',
        retrievedAt: new Date().toISOString(),
        fetchStatus: 'ok',
        facts: googleFacts,
      }],
      'no_official_source',
      {
        linksDiscovered: [],
        linksSelected: [],
        pagesFetched: [],
        pagesFailed: [],
        evidenceByPage: [],
      },
    );
  }

  const homepage = discovery.pages[0];
  const homeResult = await fetchAndExtractPage(familypilotPlaceId, homepage);

  const { pages, reserveCandidates, diagnostics: discoveryDiagnostics } = mergePageCandidates(
    homepage.url,
    discovery.pages,
    homeResult.html,
    MAX_PAGES,
  );

  const sources = [];
  const attemptedUrls = new Set();
  const pagesFailed = [];
  const pagesFetched = [];
  const evidenceByPage = [];

  const homepageKey = homepage.url.replace(/\/$/, '');
  const queue = pages.filter((p) => p.url.replace(/\/$/, '') !== homepageKey);
  const reserve = [...reserveCandidates];
  let fetchAttempts = 0;
  const maxAttempts = MAX_PAGES;

  const recordResult = (result) => {
    sources.push(result);
    const usable =
      result.fetchStatus === 'ok' ||
      result.fetchStatus === 'cached' ||
      result.fetchStatus === 'fetched_truncated';

    if (usable) {
      pagesFetched.push({
        url: result.url,
        fetchStatus: result.fetchStatus,
        pageTitle: result.pageTitle ?? null,
        truncated: result.truncated ?? false,
      });
      evidenceByPage.push({
        url: result.url,
        fields: (result.facts ?? []).map((f) => f.field),
        factCount: (result.facts ?? []).length,
        truncated: result.truncated ?? false,
      });
    } else {
      pagesFailed.push({
        url: result.url,
        fetchStatus: result.fetchStatus,
        error: result.error ?? result.fetchStatus,
      });
      evidenceByPage.push({
        url: result.url,
        fields: [],
        factCount: 0,
        error: result.error ?? result.fetchStatus,
      });
    }
  };

  recordResult(homeResult);
  attemptedUrls.add(homepageKey);
  fetchAttempts += 1;

  while (fetchAttempts < maxAttempts && sources.length < MAX_PAGES + 1) {
    let next = queue.shift();
    if (!next && reserve.length) next = reserve.shift();
    if (!next) break;

    const urlKey = next.url.replace(/\/$/, '');
    if (attemptedUrls.has(urlKey)) continue;
    attemptedUrls.add(urlKey);
    fetchAttempts += 1;

    const result = await fetchAndExtractPage(familypilotPlaceId, next);
    recordResult(result);

    if (isQuickFailure(result) && reserve.length && fetchAttempts < maxAttempts) {
      continue;
    }
  }

  const diagnostics = {
    linksDiscovered: discoveryDiagnostics.linksDiscovered,
    linksSelected: discoveryDiagnostics.linksSelected,
    reserveCount: discoveryDiagnostics.reserveCount ?? reserve.length,
    pagesFetched,
    pagesFailed,
    evidenceByPage,
    homepageFetchStatus: homeResult.fetchStatus,
    homepageFetchError: homeResult.error ?? null,
    fetchAttempts,
  };

  return buildEvidenceBundle(familypilotPlaceId, sources, discovery.sourceStatus, diagnostics);
}

module.exports = {
  gatherEvidenceForVenue,
  ensurePlaceDetails,
  MAX_PAGES,
};
