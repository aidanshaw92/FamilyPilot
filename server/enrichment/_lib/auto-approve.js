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
 *   5. It no longer does -> dispute, however many ineligible siblings happen to agree. This is also
 *      the freshness policy the rest of the system states: a claim is withdrawn when its own
 *      refreshed source stops supporting it, not when some other page still does.
 *   6. Conflict is judged separately and only among eligible venue-specific sources. Two pages that
 *      may both speak for this venue disagreeing is a real conflict and still withdraws the field.
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
  const FETCHED_CLEANLY = ['ok', 'cached', 'fetched_truncated'];
  // Read straight off each source's own facts. Never the merged verdict: the merge cannot say which
  // page a given claim came from, which is precisely the distinction this function turns on.
  const statesValue = (source, field, value) =>
    (source?.facts ?? []).some((fact) => fact.field === field && fact.value === value);

  const claims = await listClaimsForVenue(id, {status:'active'});
  for (const claim of claims) {
    if (![REVIEWED_BY, AI_AUTO_APPROVER].includes(claim.approvedBy)) continue;
    const field = Object.keys(FIELD_MAP).find(key=>FIELD_MAP[key]===claim.fieldKey);
    // A claim outside the facility vocabulary (an age policy, say) is not this function's business.
    if (!field) continue;

    // (1) and (2)
    const backing = sources.find(s=>s.url===claim.sourceUrl
      && Date.parse(s.retrievedAt)>=Date.parse(claim.checkedAt)
      && FETCHED_CLEANLY.includes(s.fetchStatus));
    if (!backing) continue;

    // (3) the Phase 6 gate, stated on provenance rather than on whether a page happened to be fetched
    if (!isEligibleScope(backing.subjectScope)) continue;

    // (4) and (5)
    if (!statesValue(backing, field, claim.valueJson)) {
      await disputeClaim(claim.id);
      continue;
    }

    // (6) and (7)
    const eligibleValues = new Set();
    for (const source of sources) {
      if (!isEligibleScope(source.subjectScope)) continue;
      for (const fact of source.facts ?? []) {
        if (fact.field === field && fact.value !== 'unknown') eligibleValues.add(fact.value);
      }
    }
    if (eligibleValues.size > 1) await disputeClaim(claim.id);
  }
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
