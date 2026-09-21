/**
 * How much a trusted claim is still worth, as of today.
 *
 * A claim carries a bounded lifetime because a facility can be removed and a page can change. When
 * that lifetime runs out the honest answer is "we no longer know" — but if the only reason we
 * could not re-check is that the venue's website timed out for three days, dropping every fact we
 * hold about it punishes a parent for an outage they cannot see.
 *
 * So expiry has a bounded, visible tail: up to 14 days in which a claim is retained, shown with
 * the date it was last confirmed, and deliberately demoted. It stops being able to satisfy a hard
 * requirement, and it stops being able to rule a venue out. Stale is not a weaker kind of
 * confirmed; it is a different thing, and the rest of the system is built so it cannot be mistaken
 * for one.
 *
 * Grace has to be earned. A claim only gets it when the specific source page backing *that* claim
 * was re-read and failed for a reason that might not hold tomorrow.
 */

const {
  TRANSIENT,
  classifySourceOutcome,
  latestRecordForSource,
} = require('./source-refresh-outcome');

/** Days a claim is retained past `validUntil` when, and only when, grace is earned. */
const GRACE_DAYS = 14;
/** How far before expiry the replenisher queues a refresh, and how far back an attempt counts. */
const REFRESH_LEAD_DAYS = 7;

/**
 * Claim lifetimes, mirroring `expiryDate` in trusted-evidence.js.
 *
 * Duplicated deliberately rather than imported: this module must stay free of the evidence
 * pipeline so it can be reasoned about (and tested) on its own. The two are pinned together by a
 * test that asserts they agree for every field key in FIELD_MAP.
 */
const SHORT_LIVED = /Facilities|accessibility|pushchair|sendInfo|agePolicy/;

function addDays(isoDate, days) {
  const date = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * When a claim stops being trusted.
 *
 * Falls back to deriving it from `checkedAt` for legacy rows written before expiry was recorded,
 * exactly as `isClaimActive` already does, so the two can never disagree about the same claim.
 */
function validUntil(claim) {
  if (claim && claim.validUntil) return String(claim.validUntil).slice(0, 10);
  if (!claim || !claim.checkedAt) return null;
  return addDays(claim.checkedAt, SHORT_LIVED.test(claim.fieldKey || '') ? 30 : 90);
}

/** The last day a claim can be shown at all, earned grace or not. */
function graceUntil(claim) {
  const until = validUntil(claim);
  return until ? addDays(until, GRACE_DAYS) : null;
}

/**
 * Whether this claim's own source failed in a way that justifies keeping the claim a while longer.
 *
 * Every condition is about the one source backing this claim. A sibling page succeeding cannot
 * take grace away, and a sibling page failing cannot hand it over.
 */
function isGraceEligible(claim, sourceRecords, today) {
  const until = validUntil(claim);
  if (!until) return false;

  // Only expired claims need grace, and only inside the window.
  if (today <= until) return false;
  if (today > addDays(until, GRACE_DAYS)) return false;

  // A claim with no source page has nothing that could have been re-read. Editorial claims land
  // here: they expire on time and want a human, not an extension.
  if (!claim.sourceUrl) return false;

  const latest = latestRecordForSource(sourceRecords);
  if (!latest) return false;

  // The attempt has to be about this expiry, not a fetch from months ago.
  const attemptedAt = String(latest.retrievedAt).slice(0, 10);
  if (attemptedAt < addDays(until, -REFRESH_LEAD_DAYS)) return false;

  // Only a transient failure. A successful re-read has already been evaluated by the evidence
  // pipeline, and a permanent failure is not an outage to wait out.
  return classifySourceOutcome(latest) === TRANSIENT;
}

/**
 * The claim's state today.
 *
 * `fresh` and `refresh_due` are the same thing to every consumer; they differ only in that
 * `refresh_due` tells the replenisher to queue work. Keeping them apart means the scheduler has a
 * name for what it is doing instead of recomputing a date threshold in two places.
 */
function classifyClaim(claim, sourceRecords, today) {
  const until = validUntil(claim);
  if (!until) return 'expired';

  if (today <= until) {
    return today >= addDays(until, -REFRESH_LEAD_DAYS) ? 'refresh_due' : 'fresh';
  }

  return isGraceEligible(claim, sourceRecords, today) ? 'stale' : 'expired';
}

/** A demoted claim, shaped for display and nothing else. Carries no tri-state a renderer could reuse. */
function toStaleFact(claim) {
  return {
    fieldKey: claim.fieldKey,
    value: claim.valueJson,
    lastConfirmed: String(claim.checkedAt).slice(0, 10),
    graceUntil: graceUntil(claim),
    recheckPending: true,
  };
}

module.exports = {
  GRACE_DAYS,
  REFRESH_LEAD_DAYS,
  addDays,
  classifyClaim,
  graceUntil,
  isGraceEligible,
  toStaleFact,
  validUntil,
};
