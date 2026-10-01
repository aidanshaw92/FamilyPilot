/**
 * AI-driven draft review and approval — publishes trusted claims without manual editor clicks.
 * Gated by ENRICHMENT_AUTO_APPROVE=true and evidence quality rules.
 */

const { approveDraft, getPendingDraft } = require('./draft-store');
const { listQueue } = require('./enrichment-store');
const { resolveBetaParams } = require('./beta-area');
const { SOURCE_EVIDENCE_AUTO_APPROVER: REVIEWED_BY, AI_AUTO_APPROVER } = require('./approval-actors');

function isAutoApproveEnabled() {
  const flag = process.env.ENRICHMENT_AUTO_APPROVE;
  return !['false', '0', 'no'].includes(String(flag).toLowerCase());
}

function buildAutoApprovePayload(rawDraftJson, evidenceBundle) {
  // Model output is deliberately not an authority for publication.
  return require('./trusted-evidence').reviewEvidence(evidenceBundle);
}

/**
 * Attempt AI auto-approval for a venue's pending draft.
 */
async function tryAutoApproveDraft(familypilotId, options = {}) {
  if (!options.force && !isAutoApproveEnabled()) {
    return { approved: false, skipped: true, reason: 'auto_approve_disabled' };
  }

  const draft = options.draft ?? (await getPendingDraft(familypilotId));
  if (!draft) {
    return { approved: false, skipped: true, reason: 'no_pending_draft' };
  }

  const evidenceBundle = await require('./trusted-evidence').verifiedBundleForVenue(familypilotId);
  await reconcileSourceClaims(familypilotId, evidenceBundle);
  const review = buildAutoApprovePayload(draft.draftJson, evidenceBundle);
  if (!review.eligible) {
    return {
      approved: false,
      skipped: false,
      reason: review.reason,
      fieldCount: review.fieldCount,
      draftId: draft.id,
      approvedFields: Object.keys(review.payload),
    };
  }

  const result = await approveDraft(familypilotId, review.payload, REVIEWED_BY, { evidenceDraft: review.draft, expectedDraftId: draft.id });
  return {
    approved: true,
    skipped: false,
    reason: null,
    fieldCount: review.fieldCount,
    draftId: result.draftId,
    metadata: result.metadata,
    approvedFields: Object.keys(review.payload),
  };
}

/**
 * Withdraw an automatic fact when the page it came from no longer says it.
 *
 * ONE INVARIANT GOVERNS THIS FUNCTION:
 *
 *   Evidence that may not establish a venue-specific fact may not establish, contradict, refresh,
 *   preserve or withdraw that fact.
 *
 * Both halves matter, and the second is the one that took three attempts to get right.
 *
 * The first version read a bundle-wide verdict computed with `{enforceSubjectScope: false}`. The
 * Young V&A canary showed what that costs: a withheld sibling page contradicting itself turned the
 * venue's OWN parking fact into a conflict and this function disputed a true claim.
 *
 * The second version fixed conflicts inside `mergeEvidenceBundles` -- eligible candidates decide a
 * field where any exist, with a fallback to all candidates so a field never vanishes. That stopped
 * the contradiction but left the mirror image: when the venue's own page stops mentioning parking
 * and an ineligible sibling still asserts it, the fallback hands back the sibling's value and this
 * function READ IT AS CONFIRMATION. An unusable source could not refute a claim any more, but it
 * could still keep one alive. Same asymmetry, opposite sign.
 *
 * So the control belongs here, on the claim's own provenance, not in a merge that cannot know which
 * page any particular claim came from:
 *
 *   1. Find the source backing THIS claim -- `claim.sourceUrl`, refreshed at or after the claim was
 *      last checked, and actually fetched cleanly.
 *   2. Not refreshed this run, or not fetched cleanly? Leave the claim alone. A failed fetch cannot
 *      establish absence; the claim reaches its normal expiry instead.
 *   3. Backing source NULL or ineligible scope? SKIP. This is what keeps Phase 6 gated: Horniman
 *      Butterfly House's seven claims all rest on `other_catalogue_venue` pages, and repairing them
 *      is a reviewed decision, not something the every-minute cron does on deploy.
 *   4. Backing source eligible? Then THAT SAME PAGE must still carry the claim's field AND value.
 *   5. It no longer does -> dispute, however many ineligible siblings happen to agree, BUT only when
 *      that reading was complete. A `fetched_truncated` capture cannot establish absence, so it
 *      leaves the claim alone. This is also the freshness policy the rest of the system states: a
 *      claim is withdrawn when its own refreshed source stops supporting it, not when some other
 *      page still does.
 *   6. Conflict is judged separately, and only among eligible venue-specific sources whose reading is
 *      at least as fresh as the claim. Two such pages disagreeing is a real conflict and still
 *      withdraws the field; an older page does not get to overrule a newer claim.
 *   7. Ineligible sources stay in the bundle for diagnostics and the withheld ledger, and count for
 *      nothing here -- not as confirmation, not as contradiction.
 *
 * `mergeEvidenceBundles` keeps its eligible-candidate precedence, which is right for publication and
 * for what the audit reports. It is no longer what protects live claims.
 */
async function reconcileSourceClaims(id, bundle) {
  const {listClaimsForVenue, disputeClaim} = require('./claims-store');
  const {FIELD_MAP} = require('./trusted-evidence');
  const {isEligibleScope} = require('./source-identity');

  const sources = bundle?.sources ?? [];

  /**
   * TWO different questions, deliberately not one predicate.
   *
   * "Did I see this statement?" and "is this statement no longer anywhere on the page?" need
   * different evidence, and conflating them withdrew a true fact in production on 2026-09-29.
   *
   * Belmont Children's Farm, claim `7a37949d…`, `environment=mixed` from `belmontfarm.co.uk`. The
   * September reading was `ok`, 8000 characters, and carried the indoor/outdoor wording. The refresh
   * came back `fetched_truncated` at **770 characters** and carried no facts at all. The fact was not
   * absent from the page; it was past the point where the fetch stopped. Reconciliation read the
   * prefix as the whole page and disputed the claim.
   *
   * A bounded fetch is, by definition, a partial view. It can confirm what it contains and can prove
   * nothing about what it does not reach.
   */

  /** Statuses whose captured text may be read as explicit evidence of what it does contain. */
  const USABLE_FETCH = ['ok', 'cached', 'fetched_truncated'];
  /**
   * Statuses whose capture is complete enough for ABSENCE to mean anything.
   *
   * `fetched_truncated` is excluded for the reason above. `cached` is excluded too, and that is a
   * judgement rather than a transcription of the bug: `fetchAndExtractPage` stamps `fetchStatus:
   * 'cached'` on its cached branch unconditionally, and `getCachedEvidence` selects the newest row
   * without filtering on status -- so a row originally stored as `fetched_truncated` resurfaces as
   * `cached` and its completeness is unknowable from the status alone. Unknown fails closed, which is
   * this workstream's governing principle. The cost is small and bounded: the automation path always
   * runs with `forceRefresh` and so never takes that branch, and a claim nothing can re-confirm still
   * reaches its own `validUntil` expiry rather than living forever.
   */
  const COMPLETE_FETCH = ['ok'];

  /**
   * Current enough to read an explicit statement from: usable status, and retrieved at or after the
   * claim's check. Used for the claim's own page AND for any page allowed to contradict it, so the
   * recency rule cannot come adrift between them again.
   */
  const usableFor = (source, checkedAt) =>
    USABLE_FETCH.includes(source.fetchStatus)
    && Date.parse(source.retrievedAt) >= Date.parse(checkedAt);

  /**
   * Complete enough to argue that a previously supported fact has gone.
   *
   * Completeness only, with no recency test of its own. A mutation pass proved that adding one here
   * is dead: this is reached at a single site, after `usableFor` has already accepted the same source
   * for the same claim, and `USABLE_FETCH` is a superset of `COMPLETE_FETCH` -- so recency is
   * established before this can be asked. Taking only the source makes the redundancy impossible to
   * reintroduce rather than merely commented away, and leaves each predicate about one thing.
   */
  const isCompleteRead = (source) => COMPLETE_FETCH.includes(source.fetchStatus);
  // Read straight off each source's own facts. Never the merged verdict: the merge cannot say which
  // page a given claim came from, which is precisely the distinction this function turns on.
  const statesValue = (source, field, value) =>
    (source?.facts ?? []).some((fact) => fact.field === field && fact.value === value);

  const claims = await listClaimsForVenue(id, {status:'active'});
  let withdrawn = 0;
  for (const claim of claims) {
    if (![REVIEWED_BY, AI_AUTO_APPROVER].includes(claim.approvedBy)) continue;
    const field = Object.keys(FIELD_MAP).find(key=>FIELD_MAP[key]===claim.fieldKey);
    // A claim outside the facility vocabulary (an age policy, say) is not this function's business.
    if (!field) continue;

    // (1) and (2)
    const backing = sources.find(s=>s.url===claim.sourceUrl && usableFor(s, claim.checkedAt));
    if (!backing) continue;

    // (3) the Phase 6 gate, stated on provenance rather than on whether a page happened to be fetched
    if (!isEligibleScope(backing.subjectScope)) continue;

    // (4) and (5)
    if (!statesValue(backing, field, claim.valueJson)) {
      /**
       * The page no longer says it -- but only a COMPLETE read can turn that into a withdrawal. On a
       * truncated capture the statement may simply lie beyond where the fetch stopped, so the claim
       * is left exactly as it is and reaches its normal expiry if nothing re-confirms it. Silence in
       * a prefix is not a denial.
       */
      if (isCompleteRead(backing)) {
        await disputeClaim(claim.id);
        withdrawn += 1;
      }
      continue;
    }

    /**
     * (6) and (7). A source joins the conflict set only if it may speak for this venue AND its
     * reading is at least contemporaneous with the claim. Without the second test an older
     * successful page withdraws a newer claim, which is the same staleness this function exists to
     * police -- just pointed the other way.
     *
     * `usableFor`, not `isCompleteRead`, on purpose: a truncated page that EXPLICITLY states the
     * opposite value has been read saying so, and that is positive evidence of a disagreement rather
     * than an argument from absence. Truncation limits what a page can deny, not what it can assert.
     */
    const eligibleValues = new Set();
    for (const source of sources) {
      if (!isEligibleScope(source.subjectScope)) continue;
      if (!usableFor(source, claim.checkedAt)) continue;
      for (const fact of source.facts ?? []) {
        if (fact.field === field && fact.value !== 'unknown') eligibleValues.add(fact.value);
      }
    }
    if (eligibleValues.size > 1) {
      await disputeClaim(claim.id);
      withdrawn += 1;
    }
  }

  /**
   * A WITHDRAWAL THAT DOES NOT LEAVE THE SERVING SURFACE IS NOT A WITHDRAWAL.
   *
   * `disputeClaim` sets the claim's status and stops there. What a parent reads is the projection in
   * `venue_family_metadata`, which is rebuilt from active claims -- so until something rebuilds it,
   * the withdrawn value is still on the venue page.
   *
   * The admin endpoint remembers to do this; this function did not, and the one caller above returns
   * EARLY when the review that follows is ineligible:
   *
   *   reconcileSourceClaims(...)        <- disputes the claims
   *   review = reviewEvidence(...)
   *   if (!review.eligible) return;     <- no publish, so no projection rebuild
   *   approveDraft(...)                 <- this is what would have rebuilt it
   *
   * Those two conditions coincide exactly when every claim for a field has just been withdrawn,
   * which is the case that matters most. Found in the production audit on 2026-10-01: Crystal Palace
   * Park was still serving `playground`, `toilets` and `accessibleToilet` as `yes`, and Swanley Park
   * `playground = yes`, from claims disputed on 11 September -- twenty days of a withdrawn fact on a
   * live venue page. Both venues' projections carried the publication timestamp, never updated since.
   *
   * Rebuilt here, once per venue rather than once per claim, and only when something was actually
   * withdrawn, so a run that changes nothing writes nothing.
   *
   * `fromClaims: true` is explicit rather than load-bearing, and a mutation pass says so: removing it
   * changes no outcome, because `saveMetadata` falls through to the same rebuild whenever the venue
   * still has active claims, and when it has none the minimal payload below clears the field anyway.
   * It stays because it states the intent and does not depend on that coincidence holding.
   */
  if (withdrawn > 0) {
    const { getMetadata, saveMetadata } = require('./enrichment-store');
    const existing = await getMetadata(id);
    await saveMetadata(
      id,
      {
        lastChecked: existing?.lastChecked ?? new Date().toISOString().slice(0, 10),
        checkedBy: existing?.checkedBy ?? REVIEWED_BY,
      },
      { fromClaims: true },
    );
  }

  return { withdrawn };
}

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 25;

/**
 * Auto-approve pending AI drafts for venues already in ai_draft status.
 */
async function autoApprovePendingBatch(params = {}) {
  const batchSize = Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, Number(params.batchSize ?? DEFAULT_BATCH_SIZE)),
  );
  const { betaLat, betaLng, betaRadiusKm } = resolveBetaParams(params);

  const queue = await listQueue({
    status: 'ai_draft',
    sort: 'priority',
    betaLat,
    betaLng,
    betaRadiusKm,
    provider: 'google',
  });

  const candidates = queue.slice(0, batchSize);
  const results = [];
  let approved = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of candidates) {
    try {
      const outcome = await tryAutoApproveDraft(item.familypilotId, {
        force: Boolean(params.force),
      });
      if (outcome.approved) approved += 1;
      else if (outcome.skipped) skipped += 1;
      results.push({
        familypilotPlaceId: item.familypilotId,
        name: item.name,
        ok: true,
        ...outcome,
      });
    } catch (error) {
      failed += 1;
      results.push({
        familypilotPlaceId: item.familypilotId,
        name: item.name,
        ok: false,
        error: error instanceof Error ? error.message : 'Auto-approve failed',
      });
    }
  }

  return {
    processed: candidates.length,
    approved,
    skipped,
    failed,
    results,
  };
}

module.exports = {
  isAutoApproveEnabled,
  buildAutoApprovePayload,
  tryAutoApproveDraft,
  autoApprovePendingBatch,
  // Exported so the reconciliation boundary can be asserted directly. It decides whether a live
  // claim survives, so it is tested against the real store rather than through a grep for a string.
  reconcileSourceClaims,
  REVIEWED_BY,
};
