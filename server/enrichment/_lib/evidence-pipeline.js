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
const { listVenueIdentities } = require('./enrichment-store');
const { classifySubjectScope } = require('./source-identity');

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

async function fetchAndExtractPage(familypilotPlaceId, page, options = {}) {
  /**
   * Decide whose page this is BEFORE storing it, and store the verdict with it.
   *
   * The old pipeline stamped `familypilot_place_id` on every fetched page and moved on, so the
   * assertion "this page is evidence for venue X" was created by the act of crawling and could
   * never afterwards be checked. Classifying here, where the crawl still knows what it was doing
   * and why, is the whole fix: everything downstream reads a recorded relationship instead of
   * re-inferring one from a URL.
   */
  const { venue = null, catalogue = [] } = options;
  const scopeFor = (sourceUrl, pageTitle) => (venue
    ? classifySubjectScope({ sourceUrl, pageTitle, venue, catalogue })
    : { scope: null, reason: null });
  const cached = options.forceRefresh ? null : await getCachedEvidence(familypilotPlaceId, page.url);
  if (cached) {
    // A row cached before this column existed carries no verdict. Reclassify rather than inherit
    // a null, so an old cache entry cannot quietly bypass the gate.
    const cachedScope = cached.subjectScope
      ? { scope: cached.subjectScope, reason: cached.subjectScopeReason }
      : scopeFor(cached.sourceUrl, cached.pageTitle);
    const facts = extractEvidenceFromText(cached.extractedText || '', { url: cached.sourceUrl, sourceType: cached.sourceType, retrievedAt: cached.retrievedAt });
    return {
      url: cached.sourceUrl,
      sourceType: cached.sourceType,
      pageTitle: cached.pageTitle,
      retrievedAt: cached.retrievedAt,
      fetchStatus: 'cached',
      facts,
      extractedText: cached.extractedText,
      html: null,
      subjectScope: cachedScope.scope,
      subjectScopeReason: cachedScope.reason,
    };
  }

  const fetched = await fetchOfficialPage(page.url);
  if (!fetched.ok) {
    const failedScope = scopeFor(page.url, null);
    await saveEvidenceRecord({
      familypilotPlaceId,
      sourceUrl: page.url,
      sourceType: page.sourceType,
      subjectScope: failedScope.scope,
      subjectScopeReason: failedScope.reason,
      fetchStatus: fetched.fetchStatus,
      httpStatus: fetched.httpStatus ?? null,
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
    pageTitle: fetched.pageTitle ?? null,
  });

  // The page title is part of the verdict, so classify only once it is known.
  const scope = scopeFor(fetched.url, fetched.pageTitle ?? null);

  await saveEvidenceRecord({
    familypilotPlaceId,
    sourceUrl: fetched.url,
    sourceType: page.sourceType,
    subjectScope: scope.scope,
    subjectScopeReason: scope.reason,
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
    subjectScope: scope.scope,
    subjectScopeReason: scope.reason,
  };
}

async function gatherEvidenceForVenue(familypilotPlaceId, placeRow, options = {}) {
  const enrichedPlace = await ensurePlaceDetails(familypilotPlaceId, placeRow);

  /**
   * Who this crawl is for, and who else shares the sites it may touch. Without the second half a
   * crawl cannot tell a venue's own deeper page from a sibling venue's front door.
   */
  const catalogue = options.catalogue ?? (await listVenueIdentities());
  const venue = {
    familypilotPlaceId,
    name: enrichedPlace?.name ?? placeRow?.name ?? null,
    website: enrichedPlace?.website ?? null,
  };
  const pageOptions = { ...options, venue, catalogue };
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
  const homeResult = await fetchAndExtractPage(familypilotPlaceId, homepage, pageOptions);

  const { pages, reserveCandidates, diagnostics: discoveryDiagnostics } = mergePageCandidates(
    homepage.url,
    discovery.pages,
    homeResult.html,
    MAX_PAGES,
    { venue, catalogue },
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

    const result = await fetchAndExtractPage(familypilotPlaceId, next, pageOptions);
    recordResult(result);

    if (isQuickFailure(result) && reserve.length && fetchAttempts < maxAttempts) {
      continue;
    }
  }

  const diagnostics = {
    linksDiscovered: discoveryDiagnostics.linksDiscovered,
    linksSelected: discoveryDiagnostics.linksSelected,
    linksRejectedAsOtherVenue: discoveryDiagnostics.linksRejectedAsOtherVenue ?? [],
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
