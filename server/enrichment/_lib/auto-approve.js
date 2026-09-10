/**
 * AI-driven draft review and approval — publishes trusted claims without manual editor clicks.
 * Gated by ENRICHMENT_AUTO_APPROVE=true and evidence quality rules.
 */

const { approveDraft, getPendingDraft } = require('./draft-store');
const { listQueue } = require('./enrichment-store');
const { resolveBetaParams } = require('./beta-area');
const REVIEWED_BY = 'source_evidence_auto_v2';

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

// Withdraw automatic facts when the same successfully fetched page no longer supports them.
// A failed fetch cannot establish absence: existing facts instead reach their normal expiry.
async function reconcileSourceClaims(id, bundle) {
  const {listClaimsForVenue, disputeClaim} = require('./claims-store');
  const {FIELD_MAP} = require('./trusted-evidence');
  const review = require('./trusted-evidence').reviewEvidence(bundle);
  const claims = await listClaimsForVenue(id, {status:'active'});
  for (const claim of claims) {
    if (!['source_evidence_auto_v2','ai_auto_approved'].includes(claim.approvedBy)) continue;
    const source = bundle.sources.find(s=>s.url===claim.sourceUrl && Date.parse(s.retrievedAt)>=Date.parse(claim.checkedAt));
    if (!source) continue;
    const field = Object.keys(FIELD_MAP).find(key=>FIELD_MAP[key]===claim.fieldKey);
    const fact = bundle.facts.find(f=>f.field===field);
    const parts = claim.fieldKey.split('.');
    const value = parts.length===2 ? review.payload[parts[0]]?.[parts[1]] : review.payload[parts[0]];
    if (!fact || value===undefined) await disputeClaim(claim.id);
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
  REVIEWED_BY,
};
