/**
 * AI-driven draft review and approval — publishes trusted claims without manual editor clicks.
 * Gated by ENRICHMENT_AUTO_APPROVE=true and evidence quality rules.
 */

const { normaliseDraftJson } = require('./ai-draft-schema');
const { hasUnresolvedEvidenceConflicts } = require('./claim-review');
const { approveDraft, getPendingDraft } = require('./draft-store');
const { listQueue } = require('./enrichment-store');

const REVIEWED_BY = 'ai_auto_approved';
const TRI_STATE = new Set(['yes', 'no']);
const PUSHCHAIR = new Set(['excellent', 'good', 'mixed', 'difficult']);
const ENVIRONMENT = new Set(['indoor', 'outdoor', 'mixed']);
const ENERGY = new Set(['low', 'moderate', 'high', 'mixed']);
const TERRAIN = new Set(['flat', 'mostly_flat', 'mixed', 'hilly', 'very_hilly']);

function isAutoApproveEnabled() {
  const flag = process.env.ENRICHMENT_AUTO_APPROVE;
  return flag === 'true' || flag === '1' || flag === 'yes';
}

function isStorableValue(value) {
  if (value === undefined || value === null) return false;
  if (value === 'unknown') return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return true;
}

function passesFieldGate(field) {
  if (!field || !isStorableValue(field.value)) return false;
  if (field.evidenceBacked === true) return true;
  if (field.confidence === 'high') return true;
  if (field.confidence === 'medium' && (field.evidence || field.sourceUrl)) return true;
  return false;
}

function passesAgeGate(age) {
  if (!age) return false;
  const hasMin = typeof age.min === 'number' && Number.isFinite(age.min);
  const hasMax = typeof age.max === 'number' && Number.isFinite(age.max);
  if (!hasMin && !hasMax) return false;
  return age.confidence === 'high' || age.confidence === 'medium';
}

function triStateValue(field) {
  if (!field || !TRI_STATE.has(field.value)) return undefined;
  return passesFieldGate(field) ? field.value : undefined;
}

function enumValue(field, allowed) {
  if (!field || !allowed.has(field.value)) return undefined;
  return passesFieldGate(field) ? field.value : undefined;
}

/**
 * Build a selective editor payload — only fields that pass AI review gates.
 */
function buildAutoApprovePayload(rawDraftJson, evidenceBundle) {
  const draft = normaliseDraftJson(rawDraftJson);
  const payload = {};
  const age = draft.recommendedAge ?? {};
  const facilities = {};

  if (passesAgeGate(age)) {
    if (typeof age.min === 'number') payload.minRecommendedAge = age.min;
    if (typeof age.max === 'number') payload.maxRecommendedAge = age.max;
    if (age.notes && typeof age.notes === 'string' && age.notes.trim()) {
      payload.ageNotes = age.notes.trim();
    }
  }

  for (const [key, field] of Object.entries(draft.familyFacilities ?? {})) {
    const value = triStateValue(field);
    if (value !== undefined) facilities[key] = value;
  }
  if (Object.keys(facilities).length > 0) payload.familyFacilities = facilities;

  const pushchair = enumValue(draft.pushchairSuitability, PUSHCHAIR);
  if (pushchair !== undefined) payload.pushchairSuitability = pushchair;

  const environment = enumValue(draft.environment, ENVIRONMENT);
  if (environment !== undefined) payload.environment = environment;

  const energyLevel = enumValue(draft.energyLevel, ENERGY);
  if (energyLevel !== undefined) payload.energyLevel = energyLevel;

  const extendedTerrain = enumValue(draft.terrain, TERRAIN);
  if (extendedTerrain !== undefined) payload.extendedTerrain = extendedTerrain;

  const accessibility = {};
  for (const [key, field] of Object.entries(draft.accessibility ?? {})) {
    const value = triStateValue(field);
    if (value !== undefined) accessibility[key] = value;
  }
  if (Object.keys(accessibility).length > 0) payload.accessibility = accessibility;

  const sendInfo = {};
  for (const [key, field] of Object.entries(draft.sendInfo ?? {})) {
    const value = triStateValue(field);
    if (value !== undefined) sendInfo[key] = value;
  }
  if (Object.keys(sendInfo).length > 0) payload.sendInfo = sendInfo;

  if (
    typeof draft.suggestedVisitDuration === 'number' &&
    draft.suggestedVisitDuration > 0 &&
    Number.isFinite(draft.suggestedVisitDuration)
  ) {
    payload.visitDurationMinutes = draft.suggestedVisitDuration;
  }

  if (hasUnresolvedEvidenceConflicts(evidenceBundle)) {
    return { payload, eligible: false, reason: 'unresolved_evidence_conflicts', fieldCount: 0 };
  }

  const fieldCount = countApproveFields(payload);
  const hasAges = payload.minRecommendedAge != null || payload.maxRecommendedAge != null;
  const minFields = Number(process.env.ENRICHMENT_AUTO_APPROVE_MIN_FIELDS ?? 2);

  if (!hasAges) {
    return { payload, eligible: false, reason: 'missing_confident_ages', fieldCount };
  }
  if (fieldCount < minFields) {
    return { payload, eligible: false, reason: 'insufficient_approved_fields', fieldCount };
  }

  return { payload, eligible: true, reason: null, fieldCount };
}

function countApproveFields(payload) {
  let count = 0;
  if (payload.minRecommendedAge != null) count += 1;
  if (payload.maxRecommendedAge != null) count += 1;
  if (payload.ageNotes) count += 1;
  if (payload.pushchairSuitability !== undefined) count += 1;
  if (payload.environment !== undefined) count += 1;
  if (payload.energyLevel !== undefined) count += 1;
  if (payload.extendedTerrain !== undefined) count += 1;
  if (payload.visitDurationMinutes != null) count += 1;
  count += Object.keys(payload.familyFacilities ?? {}).length;
  count += Object.keys(payload.accessibility ?? {}).length;
  count += Object.keys(payload.sendInfo ?? {}).length;
  return count;
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

  const evidenceBundle =
    options.evidenceBundle ??
    draft.sourceContext?.evidenceBundle ??
    null;

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

  const result = await approveDraft(familypilotId, review.payload, REVIEWED_BY);
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
  const betaLat = params.betaLat != null ? Number(params.betaLat) : 51.643;
  const betaLng = params.betaLng != null ? Number(params.betaLng) : -0.36;
  const betaRadiusKm = params.betaRadiusKm != null ? Number(params.betaRadiusKm) : 15;

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
