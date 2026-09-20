/**
 * What happened the last time we tried to re-read one official source page.
 *
 * Claim freshness is a fact about *a source*, not about a venue. One venue refresh routinely
 * succeeds on some pages and fails on others: `gatherEvidenceForVenue` fetches each page
 * independently, records the outcome of each, and still returns a usable bundle. The worker then
 * completes the job. So "the job completed" says nothing about whether the page backing a
 * particular claim was actually re-read, and "the job failed" says nothing about which claims
 * deserve protection.
 *
 * Reading the per-source outcome instead means a timeout on /family-visits can protect the
 * baby-changing claim without touching the parking claim backed by /accessibility, and vice versa.
 */

/** The page was re-read. Whatever it now says has already been evaluated by the evidence pipeline. */
const REFRESHED = 'refreshed';
/** The page could not be read for a reason that may not hold tomorrow. */
const TRANSIENT = 'transient';
/** The page could not be read for a reason that will hold tomorrow too. */
const PERMANENT = 'permanent';
/** No record of ever having tried this source. */
const NOT_ATTEMPTED = 'not-attempted';

/**
 * Statuses that mean the page was read.
 *
 * `fetched_truncated` counts: the byte cap stopped the read, but the text that arrived went
 * through the extractor exactly like a complete page, so the claim was genuinely re-evaluated.
 */
const READ_STATUSES = new Set(['ok', 'fetched_truncated']);

/**
 * Statuses that are a property of the page rather than of this attempt.
 *
 * `non_html` means the URL serves something that is not a page — a PDF, an image — so fetching it
 * again produces the same non-answer. `too_large_unusable` (and its legacy spelling `too_large`)
 * is the page measured against our byte cap, which is equally deterministic. Neither is an outage,
 * so neither earns a claim any extra life; both want a human to fix the source list.
 */
const PERMANENT_STATUSES = new Set(['non_html', 'too_large', 'too_large_unusable']);

/**
 * Statuses where the attempt itself failed and may well succeed later.
 *
 * `blocked` is bot mitigation — a Cloudflare interstitial, a 401/403 from a WAF. It is the largest
 * failure category in the catalogue and it genuinely comes and goes, so treating it as permanent
 * would withdraw grace from a third of venues during precisely the kind of outage grace exists
 * for. It is bounded by the same 14 days as everything else.
 */
const TRANSIENT_STATUSES = new Set(['timeout', 'blocked']);

/**
 * HTTP statuses worth another attempt. Everything else in the 4xx range is the server telling us
 * something stable about the request, and 404 in particular is a source that has moved or gone.
 */
function isTransientHttpStatus(status) {
  if (!Number.isInteger(status)) return false;
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Classify one stored evidence row.
 *
 * Driven by `fetch_status` and the recorded `http_status`, never by matching the free-text `error`
 * — that string is assembled for humans and would silently reclassify a claim the day its wording
 * changed.
 */
function classifySourceOutcome(record) {
  if (!record || !record.fetchStatus) return NOT_ATTEMPTED;

  const status = record.fetchStatus;
  if (READ_STATUSES.has(status)) return REFRESHED;
  if (PERMANENT_STATUSES.has(status)) return PERMANENT;
  if (TRANSIENT_STATUSES.has(status)) return TRANSIENT;

  if (status === 'error') {
    const httpStatus = Number.isInteger(record.httpStatus) ? record.httpStatus : null;
    // No HTTP status at all means the request never got an answer — DNS, connection reset, abort.
    if (httpStatus === null) return TRANSIENT;
    return isTransientHttpStatus(httpStatus) ? TRANSIENT : PERMANENT;
  }

  // `cached` is not an attempt: the pipeline returns it without re-fetching and without writing a
  // record, so a cached hit leaves the stored `retrievedAt` at the original fetch. Any status we
  // do not recognise is treated the same conservative way rather than assumed transient.
  return NOT_ATTEMPTED;
}

/**
 * The most recent attempt against one source, given every stored record for it.
 *
 * A source accumulates one record per distinct successful content hash plus a single failure
 * record (failures share the empty-text hash, so they overwrite each other). The newest
 * `retrievedAt` across all of them is therefore the last thing that actually happened.
 */
function latestRecordForSource(records) {
  let latest = null;
  for (const record of records || []) {
    if (!record || !record.retrievedAt) continue;
    if (!latest || Date.parse(record.retrievedAt) > Date.parse(latest.retrievedAt)) {
      latest = record;
    }
  }
  return latest;
}

module.exports = {
  NOT_ATTEMPTED,
  PERMANENT,
  PERMANENT_STATUSES,
  READ_STATUSES,
  REFRESHED,
  TRANSIENT,
  TRANSIENT_STATUSES,
  classifySourceOutcome,
  isTransientHttpStatus,
  latestRecordForSource,
};
