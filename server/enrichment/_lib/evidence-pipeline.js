/**
 * Evidence-backed enrichment pipeline:
 * Google details → source discovery → fetch → extract → bundle for AI.
 */

const { getGooglePlace } = require('../../places/lib/google-places');
const {
  PlacesDisabledError,
  PlacesBudgetExceededError,
} = require('../../places/lib/places-budget');
const { upsertPlaceRecord } = require('./enrichment-store');
const { discoverSourceUrls, mergePageCandidates } = require('./source-discovery');
const { fetchOfficialPage } = require('./source-fetcher');
const { extractEvidenceFromText, buildEvidenceBundle, extractionSourceMeta, isEvidenceBearingSource } = require('./evidence-extractor');
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
 *   GATHER_BUDGET_MS     how long ALL of this may take, from entry -- protect the worker regardless.
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
 * Why 33s, and why the clock starts at THIS function's entry rather than at the first fetch:
 *
 * The first version reserved "5s for the head" in arithmetic only -- the deadline began after
 * `ensurePlaceDetails` and `listVenueIdentities` had already run, so the crawl got a fresh budget
 * however long the head took. Review found that concrete: `googleRequest` in google-places.js uses
 * `AbortSignal.timeout(15000)`, so `ensurePlaceDetails` alone could spend 15s, making the real worst
 * case 15 + 28 + 11.33 = 54.3s against a 50s abort. The assumption was the defect.
 *
 * So there is now one budget, measured from entry, that the head and the crawl SHARE. Measured over 128
 * completed jobs, the tail from the last fetch to job completion (extraction, reconciliation, claim
 * publication, response) is 2.40s p50, 6.25s p99, 11.33s max. Reserving that 11.33s and 5s of margin
 * leaves 50 - 16.33 = 33.67, taken as 33s. A slow head now eats into page fetching, which is the
 * correct trade: fewer pages beats a job the worker has already given up on.
 *
 * `MIN_PAGE_WINDOW_MS` is the smallest window worth starting a page in. Per-page p95 is 2.44s, so 4s
 * covers the large majority; below it the fetch would most likely be cut off mid-read and waste an
 * attempt. Every page's budget is additionally bounded by the ACTUAL remaining window, so a page
 * started near the end gets less than `PAGE_BUDGET_MS`, never more.
 */
const USABLE_PAGE_TARGET = Number(
  // SOURCE_MAX_PAGES is honoured as the usable target so existing deployments and tests that pin it
  // keep their meaning: it always described how many readable pages a crawl wanted.
  process.env.SOURCE_USABLE_PAGE_TARGET || process.env.SOURCE_MAX_PAGES || 6,
);
const MAX_FETCH_ATTEMPTS = Number(
  process.env.SOURCE_MAX_FETCH_ATTEMPTS || Math.max(10, USABLE_PAGE_TARGET),
);
const GATHER_BUDGET_MS = Number(
  // SOURCE_CRAWL_BUDGET_MS is still read, but it now bounds the whole gather rather than the crawl
  // alone, so a deployment that pinned it should revisit the number.
  process.env.SOURCE_GATHER_BUDGET_MS || process.env.SOURCE_CRAWL_BUDGET_MS || 33000,
);
const MIN_PAGE_WINDOW_MS = Number(process.env.SOURCE_MIN_PAGE_WINDOW_MS || 4000);

/** Retained under its old name: it is still the number of readable pages a crawl aims for. */
const MAX_PAGES = USABLE_PAGE_TARGET;

/**
 * How long a stored Google record is trusted before this pipeline re-buys Place Details for it.
 *
 * This number replaces a guard that could never be satisfied. The old condition was
 * `placeRow.website && placeRow.description`, and `description` comes from Google's
 * `editorialSummary` -- which Google simply does not supply for most places. Measured against
 * production on 2026-10-01: of 136 stored Google venues, 129 have a website but only 44 have a
 * description. So 93 venues, 68% of the catalogue, failed the guard on every single enrichment run
 * and bought a Place Details call to re-learn that Google still had no editorial summary for them.
 * The guard was not caching badly; it was asking for something that was never coming.
 *
 * Freshness is the right condition because it records the negative result: "we asked Google about
 * this place recently" is the fact that makes a second ask pointless, whether or not the answer was
 * complete. A website is still required outright, because without one the crawler has nothing to
 * fetch -- that is a capability gap, not a staleness one.
 */
const DETAILS_REFRESH_DAYS = Number(process.env.ENRICHMENT_DETAILS_REFRESH_DAYS || 14);

function placeRowAgeDays(placeRow) {
  const timestamp = Date.parse(placeRow?.fetched_at || '');
  if (!Number.isFinite(timestamp)) return Infinity;
  return (Date.now() - timestamp) / 86_400_000;
}

async function ensurePlaceDetails(familypilotId, placeRow, options = {}) {
  if (placeRow?.website && placeRowAgeDays(placeRow) < DETAILS_REFRESH_DAYS) {
    return placeRow;
  }
  if (!familypilotId.startsWith('fp-google-')) return placeRow;

  let live = null;
  try {
    live = await getGooglePlace(familypilotId, {
      scope: 'refresh',
      reason: 'enrichment_place_details',
      jobId: options.jobId,
    });
  } catch (error) {
    if (error instanceof PlacesDisabledError || error instanceof PlacesBudgetExceededError) {
      // Enrichment reads websites, extracts evidence and reconciles claims. All of that works on
      // the stored row. Refusing to run at all because a refresh was switched off would make the
      // cost control look like an enrichment outage, so the crawl proceeds on what we hold and the
      // decision is on the record in the gate's own log.
      console.warn(
        JSON.stringify({
          tag: 'enrichment_place_details_skipped',
          familypilotPlaceId: familypilotId,
          code: error.code,
          detail: error.detail,
        }),
      );
      return placeRow;
    }
    throw error;
  }

  if (live) {
    await upsertPlaceRecord(live);
    return {
      ...placeRow,
      website: live.website ?? placeRow?.website,
      description: live.description ?? placeRow?.description,
      phone: live.phone ?? placeRow?.phone,
      opening_hours: live.openingHours ?? placeRow?.opening_hours,
      address: live.address ?? placeRow?.address,
      // The refresh is only worth skipping next time if its timestamp is what the guard reads.
      fetched_at: live.fetchedAt ?? new Date().toISOString(),
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
    // The stored title travels with the stored text. This branch dropped it, which is the same
    // defect review found in re-verification.
    const facts = extractEvidenceFromText(cached.extractedText || '', extractionSourceMeta({
      url: cached.sourceUrl, sourceType: cached.sourceType, retrievedAt: cached.retrievedAt,
      pageTitle: cached.pageTitle,
    }));
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

  const facts = extractEvidenceFromText(fetched.extractedText, extractionSourceMeta({
    url: fetched.url,
    sourceType: page.sourceType,
    retrievedAt: fetched.retrievedAt,
    pageTitle: fetched.pageTitle,
  }));

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
  /**
   * Injectable so the wall-clock guard is testable without sleeping. Production passes nothing.
   *
   * The deadline is set HERE, on the first line, because everything below it -- a Google Places call
   * with its own 15s timeout, a catalogue read, then the crawl -- has to fit inside one bound for the
   * bound to mean anything.
   */
  const clock = options.clock ?? (() => Date.now());
  const gatherStartedAt = clock();
  const gatherDeadlineAt = gatherStartedAt + GATHER_BUDGET_MS;
  /** Time left before the deadline; what remains after the head, not what was assumed for it. */
  const windowRemaining = () => gatherDeadlineAt - clock();
  const canStartPage = () => windowRemaining() >= MIN_PAGE_WINDOW_MS;
  /** A page may never be handed more time than the gather itself has left. */
  const pageBudgetNow = () => Math.min(PAGE_BUDGET_MS, windowRemaining());

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
  /** What the head actually cost, reported rather than assumed. */
  const headElapsedMs = clock() - gatherStartedAt;

  // The page budget is computed per fetch, not once: it shrinks as the window does.
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
  const homepageKey = homepage.url.replace(/\/$/, '');

  const sources = [];
  const attemptedUrls = new Set();
  const pagesFailed = [];
  const pagesFetched = [];
  const evidenceByPage = [];
  /** Fetched cleanly, nothing to read: reported so the loss is visible rather than silent. */
  const emptyShells = [];
  let fetchAttempts = 0;

  const recordResult = (result) => {
    sources.push(result);
    /**
     * A successful HTTP status is not evidence. Six fresh `ok` rows from Crossrail Place Roof Garden
     * carried no text and no title at all, and each counted towards the usable-page target as though a
     * page had been read. `isEvidenceBearingSource` is the same rule trusted re-verification applies,
     * so a page cannot be usable here and invisible there.
     */
    const fetchSucceeded =
      result.fetchStatus === 'ok' ||
      result.fetchStatus === 'cached' ||
      result.fetchStatus === 'fetched_truncated';
    const usable = fetchSucceeded && isEvidenceBearingSource({
      extractedText: result.extractedText,
      // The facts this very crawl extracted, title included: a body-less page counts only if it
      // produced something.
      facts: result.facts,
    });
    if (fetchSucceeded && !usable) emptyShells.push({ url: result.url, fetchStatus: result.fetchStatus });

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

  /**
   * `pagesFetched` holds exactly the usable pages (ok / cached / fetched_truncated), so counting it is
   * the whole of "a failed fetch consumes an attempt but not a usable-page slot".
   */
  const usablePageCount = () => pagesFetched.length;
  let stopReason = null;

  /**
   * The homepage is subject to the same window as every other page. If the head has already spent the
   * budget there is nothing safe to fetch, and fetching anyway is precisely the hole review found: it
   * would hand the loop a fresh budget the request does not have. A gather that reads nothing produces
   * an empty bundle, which fails closed everywhere downstream -- no facts, no claims, and reconciliation
   * finds no backing page so it disputes nothing.
   */
  let homeResult = null;
  if (!canStartPage()) {
    stopReason = 'wall_clock_before_homepage';
    pagesFailed.push({
      url: homepage.url,
      fetchStatus: 'not_attempted',
      error: 'gather budget exhausted before the first fetch',
    });
  } else {
    homeResult = await fetchAndExtractPage(familypilotPlaceId, homepage, {
      ...pageOptions,
      pageBudgetMs: pageBudgetNow(),
    });
    recordResult(homeResult);
    attemptedUrls.add(homepageKey);
    fetchAttempts += 1;
  }

  /**
   * ONE queue, in score order. `mergePageCandidates` splits its ordered list into `pages` (the first
   * `USABLE_PAGE_TARGET - 1`) and `reserveCandidates` (the rest); concatenating them restores that
   * order exactly. The split stays as a diagnostic -- "what we expected to need" versus "what we held
   * back" -- but it no longer gates fetching, which is what made the reserve unreachable.
   */
  let queue = [];
  let discoveryDiagnostics = {
    linksDiscovered: [], linksSelected: [], linksRejectedAsOtherVenue: [], reserveCount: 0,
  };
  if (homeResult) {
    const merged = mergePageCandidates(
      homepage.url,
      discovery.pages,
      homeResult.html,
      USABLE_PAGE_TARGET,
      { venue, catalogue },
    );
    discoveryDiagnostics = merged.diagnostics;
    queue = [
      ...merged.pages.filter((page) => page.url.replace(/\/$/, '') !== homepageKey),
      ...merged.reserveCandidates.filter((page) => page.url.replace(/\/$/, '') !== homepageKey),
    ];
  }

  while (!stopReason) {
    if (usablePageCount() >= USABLE_PAGE_TARGET) {
      stopReason = 'usable_page_target';
    } else if (fetchAttempts >= MAX_FETCH_ATTEMPTS) {
      stopReason = 'attempt_ceiling';
    } else if (!canStartPage()) {
      // Refuse to START what has no safe window left. Nothing in flight is interrupted, so the crawl
      // always stops on a whole page, with its evidence stored and its facts extracted.
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

      const result = await fetchAndExtractPage(familypilotPlaceId, next, {
        ...pageOptions,
        pageBudgetMs: pageBudgetNow(),
      });
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
    homepageFetchStatus: homeResult?.fetchStatus ?? 'not_attempted',
    homepageFetchError: homeResult?.error ?? null,
    fetchAttempts,
    /**
     * Which ceiling ended the crawl, and the numbers to judge it by. Without this a short crawl and a
     * thorough one look identical in the stored bundle, and the budgets could not be tuned on evidence.
     */
    usablePageCount: usablePageCount(),
    emptyShells,
    candidatesRemaining: queue.length,
    stopReason,
    /**
     * Measured from this function's ENTRY, so the head is inside the number rather than assumed
     * alongside it. `headElapsedMs` is reported separately because it is the figure the 5s guess got
     * wrong, and the only way to know what it really costs is to record it.
     */
    gatherElapsedMs: clock() - gatherStartedAt,
    headElapsedMs,
    budgets: {
      usablePageTarget: USABLE_PAGE_TARGET,
      maxFetchAttempts: MAX_FETCH_ATTEMPTS,
      gatherBudgetMs: GATHER_BUDGET_MS,
      pageBudgetMs: PAGE_BUDGET_MS,
      minPageWindowMs: MIN_PAGE_WINDOW_MS,
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
  GATHER_BUDGET_MS,
  MIN_PAGE_WINDOW_MS,
};
