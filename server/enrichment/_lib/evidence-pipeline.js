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

const { PAGE_BUDGET_MS } = require('./source-fetcher');

/**
 * Three separate ceilings, because one number was doing three incompatible jobs.
 *
 * The old crawl had a single `MAX_PAGES = 5`, used at once as the candidate-list length, the fetch
 * attempt limit and the stored-page limit. Two consequences, both measured rather than supposed:
 *
 *  1. A FAILED fetch consumed a page slot. 33.7% of 953 stored evidence rows are non-usable (321
 *     failed or blocked, 187 of those Cloudflare), so a venue whose first guesses 404 ended the crawl
 *     with one or two usable pages. 56 of 234 crawl rounds produced no usable page beyond nothing,
 *     and 35 produced only the homepage.
 *  2. The "reserve" list was unreachable. With the queue holding exactly `MAX_PAGES - 1` candidates,
 *     `if (!next && reserve.length)` could only fire once the queue had emptied, and the queue emptied
 *     exactly as the attempt budget ran out. The `isQuickFailure -> continue` beside it looked like a
 *     retry and refunded nothing: the attempt had already been counted. So a venue whose four selected
 *     guesses all 404'd never reached `/accessibility` or `/facilities`, which sat in that reserve.
 *
 * Split apart, each ceiling answers one question:
 *
 *   USABLE_PAGE_TARGET   how many pages worth reading are ENOUGH -- stop succeeding early.
 *   MAX_FETCH_ATTEMPTS   how many URLs may be tried, successful or not -- absorb the 33.7%.
 *   CRAWL_BUDGET_MS      how long the crawl may take -- protect the worker regardless of either.
 *
 * Why 10 attempts: at the measured 66.3% usable rate, six usable pages needs 9.05 attempts in
 * expectation, so 10 is the first ceiling that does not routinely truncate the target. Expected cost
 * per venue rises from the measured 4.07 attempts to roughly 8.7 (+4.6), and the catalogue-wide worst
 * case is 134 x 10 = 1,340 fetches per full pass against about 545 today. `refresh_venue_data` enqueues
 * at most 50 venues a day, so the daily worst case is 500 fetches against about 204 today.
 *
 * Why the wall clock is not optional: the enrichment worker aborts its call to the API after 50s
 * (`enrichment-worker/index.ts`), while Vercel lets the function run to 60s. An overrun therefore
 * marks the job FAILED in `venue_enrichment_jobs` while the function keeps going and may still publish
 * claims -- a correctness hazard, not a latency one. Ten attempts alone cannot be trusted against it:
 * measured spans reach 20.48s p99 and 26.78s max at only 4.07 attempts.
 *
 * Why 28s: measured over 128 completed jobs, the tail from the last fetch to job completion (extraction,
 * reconciliation, claim publication, response) is 2.40s p50, 6.25s p99, 11.33s max. Reserving 12s for
 * that tail, 5s for the unmeasured head before the first fetch (auth, metadata and place reads, and a
 * possible Google Places call) and 5s of margin leaves 50 - 22 = 28s for the crawl. A new fetch starts
 * only while `PAGE_BUDGET_MS` still fits inside that 28s, and one page is itself bounded, so the crawl
 * cannot exceed 28s however slow the site is.
 */
const USABLE_PAGE_TARGET = Number(
  // SOURCE_MAX_PAGES is honoured as the usable target so existing deployments and tests that pin it
  // keep their meaning: it always described how many readable pages a crawl wanted.
  process.env.SOURCE_USABLE_PAGE_TARGET || process.env.SOURCE_MAX_PAGES || 6,
);
const MAX_FETCH_ATTEMPTS = Number(
  process.env.SOURCE_MAX_FETCH_ATTEMPTS || Math.max(10, USABLE_PAGE_TARGET),
);
const CRAWL_BUDGET_MS = Number(process.env.SOURCE_CRAWL_BUDGET_MS || 28000);

/** Retained under its old name: it is still the number of readable pages a crawl aims for. */
const MAX_PAGES = USABLE_PAGE_TARGET;

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
    /**
     * A row cached before this column existed carries NO recorded verdict, and a verdict computed
     * here and now is not one the database holds.
     *
     * The first version of this branch reclassified such a row and returned the inferred scope.
     * That looked like the careful thing to do and was not: a claim approved from it would point at
     * an evidence row whose `subject_scope` is still NULL, so the provenance behind a published
     * fact would exist only in the memory of one worker run. That is the original defect's exact
     * shape -- an assertion manufactured by the act of crawling -- and it breaks this workstream's
     * own invariant, that a served fact is backed by a RECORDED relationship.
     *
     * So the stored scope is passed through exactly as stored, null included, and a null fails
     * closed at `eligibleFact`. The reclassification is kept only as a diagnostic: it is what a
     * separately reviewed backfill would propose, never something this path may publish from.
     *
     * Nothing is written here, deliberately. `familypilot-automatic-enrichment` runs every minute,
     * so backfilling provenance from this branch would quietly make the cron a provenance writer
     * and re-qualify hundreds of legacy rows with nobody having reviewed one of them.
     *
     * A legacy row recovers without any backfill in the ordinary case: the cache is fresh for at
     * most 14 days (`evidence-store.CACHE_TTL_DAYS`), so the row falls out of cache and the next
     * crawl refetches it and records the scope properly on the way in.
     *
     * Which callers actually get here, because it is easy to assume the wrong ones: BOTH HTTP entry
     * points in `api/enrichment/index.js` pass `sourceOnly: true`, and `draft-store.js` turns that
     * into `forceRefresh: true`, which skips this branch outright. So the every-minute automation
     * never reads the cache and always records a scope. Today the only caller that lands here is the
     * internal batch runner in `draft-store.js`, which calls `generateDraftForVenue(id)` with no
     * options. That makes this guard defence in depth rather than the hot path -- and it is exactly
     * why it has to be right: nothing loud happens when it is wrong.
     */
    const recorded = Boolean(cached.subjectScope);
    const inferred = recorded ? null : scopeFor(cached.sourceUrl, cached.pageTitle);
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
      subjectScope: cached.subjectScope ?? null,
      subjectScopeReason: recorded ? cached.subjectScopeReason : 'cached_row_predates_provenance',
      subjectScopeRecorded: recorded,
      inferredSubjectScope: inferred?.scope ?? null,
      inferredSubjectScopeReason: inferred?.reason ?? null,
    };
  }

  const fetched = await fetchOfficialPage(page.url, {
    // The caller's crawl deadline reserved exactly this much for the page; honour it, so a slow
    // redirect chain cannot push the crawl past the budget the caller proved safe.
    budgetMs: options.pageBudgetMs,
  });
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
    // This page was just classified and stored in the same breath, so the scope above is a
    // recorded one. The cached branch is the only place that can be false.
    subjectScopeRecorded: true,
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
  /**
   * Injectable so the wall-clock guard is testable without sleeping. Production passes nothing.
   */
  const clock = options.clock ?? (() => Date.now());
  const crawlStartedAt = clock();
  const crawlDeadlineAt = crawlStartedAt + CRAWL_BUDGET_MS;

  const pageOptions = { ...options, venue, catalogue, pageBudgetMs: PAGE_BUDGET_MS };
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
    USABLE_PAGE_TARGET,
    { venue, catalogue },
  );

  const sources = [];
  const attemptedUrls = new Set();
  const pagesFailed = [];
  const pagesFetched = [];
  const evidenceByPage = [];

  const homepageKey = homepage.url.replace(/\/$/, '');
  /**
   * ONE queue, in score order. `mergePageCandidates` splits its ordered list into `pages` (the first
   * `USABLE_PAGE_TARGET - 1`) and `reserveCandidates` (the rest); concatenating them restores that
   * order exactly. The split stays as a diagnostic -- "what we expected to need" versus "what we held
   * back" -- but it no longer gates fetching, which is what made the reserve unreachable.
   */
  const queue = [
    ...pages.filter((p) => p.url.replace(/\/$/, '') !== homepageKey),
    ...reserveCandidates.filter((p) => p.url.replace(/\/$/, '') !== homepageKey),
  ];
  let fetchAttempts = 0;

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

  /**
   * `pagesFetched` holds exactly the usable pages (ok / cached / fetched_truncated), so counting it is
   * the whole of "a failed fetch consumes an attempt but not a usable-page slot".
   */
  const usablePageCount = () => pagesFetched.length;
  let stopReason = null;

  while (!stopReason) {
    if (usablePageCount() >= USABLE_PAGE_TARGET) {
      stopReason = 'usable_page_target';
    } else if (fetchAttempts >= MAX_FETCH_ATTEMPTS) {
      stopReason = 'attempt_ceiling';
    } else if (clock() + PAGE_BUDGET_MS > crawlDeadlineAt) {
      // Refuse to START what cannot finish inside the budget. Nothing in flight is interrupted, so
      // the crawl always stops on a whole page, with its evidence stored and its facts extracted.
      stopReason = 'wall_clock';
    } else if (queue.length === 0) {
      stopReason = 'candidates_exhausted';
    } else {
      const next = queue.shift();
      const urlKey = next.url.replace(/\/$/, '');
      // A duplicate was never fetched, so it costs no attempt -- only a loop iteration.
      if (attemptedUrls.has(urlKey)) continue;
      attemptedUrls.add(urlKey);
      fetchAttempts += 1;

      const result = await fetchAndExtractPage(familypilotPlaceId, next, pageOptions);
      recordResult(result);
    }
  }

  const diagnostics = {
    linksDiscovered: discoveryDiagnostics.linksDiscovered,
    linksSelected: discoveryDiagnostics.linksSelected,
    linksRejectedAsOtherVenue: discoveryDiagnostics.linksRejectedAsOtherVenue ?? [],
    /**
     * Cache hits whose stored row predates the provenance column, with the facts they are
     * consequently NOT publishing. Reported rather than acted on: this is the input a reviewed
     * backfill would work from, and without it the withholding would be invisible.
     */
    cachedRowsMissingProvenance: sources
      .filter((s) => s.subjectScopeRecorded === false)
      .map((s) => ({
        url: s.url,
        inferredSubjectScope: s.inferredSubjectScope ?? null,
        factCount: (s.facts ?? []).length,
      })),
    // `reserve` no longer exists as a separate list, and the `?? reserve.length` fallback that stood
    // here would have thrown a ReferenceError had `reserveCount` ever been absent. Kept as the same
    // diagnostic key -- how many candidates were held back from the initial selection -- with the live
    // remainder reported alongside it as `candidatesRemaining`.
    reserveCount: discoveryDiagnostics.reserveCount ?? 0,
    pagesFetched,
    pagesFailed,
    evidenceByPage,
    homepageFetchStatus: homeResult.fetchStatus,
    homepageFetchError: homeResult.error ?? null,
    fetchAttempts,
    /**
     * Which ceiling ended the crawl, and the numbers to judge it by. Without this a short crawl and a
     * thorough one look identical in the stored bundle, and the budgets could not be tuned on evidence.
     */
    usablePageCount: usablePageCount(),
    candidatesRemaining: queue.length,
    stopReason,
    crawlElapsedMs: clock() - crawlStartedAt,
    budgets: {
      usablePageTarget: USABLE_PAGE_TARGET,
      maxFetchAttempts: MAX_FETCH_ATTEMPTS,
      crawlBudgetMs: CRAWL_BUDGET_MS,
      pageBudgetMs: PAGE_BUDGET_MS,
    },
  };

  return buildEvidenceBundle(familypilotPlaceId, sources, discovery.sourceStatus, diagnostics);
}

module.exports = {
  gatherEvidenceForVenue,
  ensurePlaceDetails,
  MAX_PAGES,
  USABLE_PAGE_TARGET,
  MAX_FETCH_ATTEMPTS,
  CRAWL_BUDGET_MS,
};
