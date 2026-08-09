const fs = require('fs');
const path = require('path');

const { getSupabaseAdmin } = require('./supabase-admin');
const { collectFieldEvidence } = require('./ai-draft-mapper');
const {
  buildBestAges,
  facilitiesFromTriState,
  mapExtendedTerrain,
  resolveEnrichmentStatus,
} = require('./validation');

const FILE_CLAIMS_DIR = '.data';
const FILE_CLAIMS_NAME = 'venue-claims.json';

const ACTIVE_STATUSES = new Set(['active']);
const INACTIVE_STATUSES = new Set(['disputed', 'expired', 'superseded']);

function getClaimsFilePath() {
  return path.join(process.cwd(), FILE_CLAIMS_DIR, FILE_CLAIMS_NAME);
}

function ensureClaimsFileStore() {
  const filePath = getClaimsFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ claims: [] }, null, 2));
  }
}

function readClaimsFileStore() {
  ensureClaimsFileStore();
  return JSON.parse(fs.readFileSync(getClaimsFilePath(), 'utf8'));
}

function writeClaimsFileStore(data) {
  ensureClaimsFileStore();
  fs.writeFileSync(getClaimsFilePath(), JSON.stringify(data, null, 2));
}

function rowToClaim(row) {
  if (!row) return null;
  return {
    id: row.id,
    familypilotPlaceId: row.familypilot_place_id,
    fieldKey: row.field_key,
    valueJson: row.value_json,
    confidence: row.confidence,
    sourceUrl: row.source_url,
    evidenceExcerpt: row.evidence_excerpt,
    sourceType: row.source_type,
    sourceEvidenceId: row.source_evidence_id,
    checkedAt: row.checked_at,
    validUntil: row.valid_until,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    approvedFromDraftId: row.approved_from_draft_id,
    status: row.status,
    supersedesClaimId: row.supersedes_claim_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function claimToRow(claim) {
  return {
    id: claim.id,
    familypilot_place_id: claim.familypilotPlaceId,
    field_key: claim.fieldKey,
    value_json: claim.valueJson,
    confidence: claim.confidence ?? null,
    source_url: claim.sourceUrl ?? null,
    evidence_excerpt: claim.evidenceExcerpt ?? null,
    source_type: claim.sourceType ?? null,
    source_evidence_id: claim.sourceEvidenceId ?? null,
    checked_at: claim.checkedAt,
    valid_until: claim.validUntil ?? null,
    approved_at: claim.approvedAt,
    approved_by: claim.approvedBy,
    approved_from_draft_id: claim.approvedFromDraftId ?? null,
    status: claim.status,
    supersedes_claim_id: claim.supersedesClaimId ?? null,
    updated_at: new Date().toISOString(),
  };
}

function normalizeConfidence(value) {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'unknown';
}

function normalizeFieldKey(fieldKey) {
  if (fieldKey === 'terrain') return 'extendedTerrain';
  return fieldKey;
}

function resolveFieldValue(fieldKey, fieldEvidence, editorPayload) {
  const normalizedKey = normalizeFieldKey(fieldKey);
  const override = getEditorOverride(normalizedKey, editorPayload);
  if (override !== undefined) return override;
  const evidence = fieldEvidence[fieldKey] ?? fieldEvidence[normalizedKey];
  if (evidence?.value !== undefined && evidence?.value !== null) return evidence.value;
  return undefined;
}

function getEditorOverride(fieldKey, payload) {
  if (!payload) return undefined;
  if (fieldKey.startsWith('familyFacilities.')) {
    const sub = fieldKey.slice('familyFacilities.'.length);
    return payload.familyFacilities?.[sub];
  }
  if (fieldKey.startsWith('accessibility.')) {
    const sub = fieldKey.slice('accessibility.'.length);
    return payload.accessibility?.[sub];
  }
  if (fieldKey.startsWith('sendInfo.')) {
    const sub = fieldKey.slice('sendInfo.'.length);
    return payload.sendInfo?.[sub];
  }
  if (fieldKey === 'pushchairSuitability') return payload.pushchairSuitability;
  if (fieldKey === 'environment') return payload.environment;
  if (fieldKey === 'energyLevel') return payload.energyLevel;
  if (fieldKey === 'extendedTerrain') {
    return payload.extendedTerrain ?? payload.terrain;
  }
  if (fieldKey === 'minRecommendedAge') return payload.minRecommendedAge;
  if (fieldKey === 'maxRecommendedAge') return payload.maxRecommendedAge;
  if (fieldKey === 'ageNotes') return payload.ageNotes;
  if (fieldKey === 'categoryConfirmed') return payload.categoryConfirmed;
  return undefined;
}

function buildClaimRecord({
  familypilotPlaceId,
  fieldKey,
  value,
  fieldEvidence,
  reviewedBy,
  draftId,
  checkedAt,
  supersedesClaimId,
}) {
  const evidenceKey = fieldKey === 'extendedTerrain' ? 'terrain' : fieldKey;
  const evidence = fieldEvidence?.[evidenceKey] ?? fieldEvidence?.[fieldKey] ?? {};
  return {
    familypilotPlaceId,
    fieldKey,
    valueJson: value,
    confidence: normalizeConfidence(evidence.confidence),
    sourceUrl: evidence.sourceUrl ?? null,
    evidenceExcerpt: evidence.evidence ?? null,
    sourceType: evidence.sourceType ?? 'ai_assisted',
    sourceEvidenceId: null,
    checkedAt,
    validUntil: null,
    approvedAt: new Date().toISOString(),
    approvedBy: reviewedBy,
    approvedFromDraftId: draftId ?? null,
    status: 'active',
    supersedesClaimId: supersedesClaimId ?? null,
  };
}

async function getActiveClaimForField(familypilotPlaceId, fieldKey) {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('venue_claims')
      .select('*')
      .eq('familypilot_place_id', familypilotPlaceId)
      .eq('field_key', fieldKey)
      .eq('status', 'active')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return rowToClaim(data);
  }

  const store = readClaimsFileStore();
  const row = store.claims.find(
    (c) =>
      c.familypilot_place_id === familypilotPlaceId &&
      c.field_key === fieldKey &&
      c.status === 'active',
  );
  return rowToClaim(row);
}

async function insertClaim(claim) {
  const supabase = getSupabaseAdmin();
  const row = claimToRow(claim);

  if (supabase) {
    const { data, error } = await supabase.from('venue_claims').insert(row).select('*').single();
    if (error) throw new Error(error.message);
    return rowToClaim(data);
  }

  const store = readClaimsFileStore();
  const id = claim.id || `claim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const stored = {
    ...row,
    id,
    created_at: new Date().toISOString(),
  };
  store.claims.push(stored);
  writeClaimsFileStore(store);
  return rowToClaim(stored);
}

async function updateClaimStatus(claimId, status) {
  const supabase = getSupabaseAdmin();
  const updates = { status, updated_at: new Date().toISOString() };

  if (supabase) {
    const { error } = await supabase.from('venue_claims').update(updates).eq('id', claimId);
    if (error) throw new Error(error.message);
    return;
  }

  const store = readClaimsFileStore();
  const claim = store.claims.find((c) => c.id === claimId);
  if (claim) Object.assign(claim, updates);
  writeClaimsFileStore(store);
}

async function createApprovedClaim({
  familypilotPlaceId,
  fieldKey,
  value,
  fieldEvidence,
  reviewedBy,
  draftId,
  checkedAt,
}) {
  const existing = await getActiveClaimForField(familypilotPlaceId, fieldKey);
  const claim = buildClaimRecord({
    familypilotPlaceId,
    fieldKey,
    value,
    fieldEvidence,
    reviewedBy,
    draftId,
    checkedAt,
    supersedesClaimId: existing?.id ?? null,
  });

  if (existing) {
    await updateClaimStatus(existing.id, 'superseded');
  }

  return insertClaim(claim);
}

/**
 * Create trusted claims from human-approved draft fields.
 * AI drafts never write here directly — only approveDraft / editor save paths call this.
 */
async function createClaimsFromApproval({
  familypilotPlaceId,
  draftJson,
  editorPayload,
  reviewedBy,
  draftId,
  checkedAt,
}) {
  const fieldEvidence = collectFieldEvidence(draftJson);
  const fieldKeys = new Set(Object.keys(fieldEvidence));

  if (editorPayload?.minRecommendedAge != null) fieldKeys.add('minRecommendedAge');
  if (editorPayload?.maxRecommendedAge != null) fieldKeys.add('maxRecommendedAge');
  if (editorPayload?.ageNotes) fieldKeys.add('ageNotes');
  if (editorPayload?.categoryConfirmed) fieldKeys.add('categoryConfirmed');

  for (const [key] of Object.entries(editorPayload?.familyFacilities ?? {})) {
    fieldKeys.add(`familyFacilities.${key}`);
  }
  for (const [key] of Object.entries(editorPayload?.accessibility ?? {})) {
    fieldKeys.add(`accessibility.${key}`);
  }
  for (const [key] of Object.entries(editorPayload?.sendInfo ?? {})) {
    fieldKeys.add(`sendInfo.${key}`);
  }

  const created = [];
  for (const fieldKey of fieldKeys) {
    const value = resolveFieldValue(fieldKey, fieldEvidence, editorPayload);
    if (value === undefined) continue;
    const claim = await createApprovedClaim({
      familypilotPlaceId,
      fieldKey: normalizeFieldKey(fieldKey),
      value,
      fieldEvidence,
      reviewedBy,
      draftId,
      checkedAt,
    });
    created.push(claim);
  }
  return created;
}

/**
 * Editor PUT save — create claims for explicitly provided fields (human editorial action).
 */
async function syncClaimsFromEditorSave(familypilotPlaceId, payload, reviewedBy) {
  const checkedAt = payload.lastChecked || new Date().toISOString().slice(0, 10);
  const fieldEvidence = {};
  const created = [];

  const addScalar = async (fieldKey, value) => {
    if (value === undefined) return;
    const claim = await createApprovedClaim({
      familypilotPlaceId,
      fieldKey,
      value,
      fieldEvidence,
      reviewedBy,
      draftId: null,
      checkedAt,
    });
    created.push(claim);
  };

  if (payload.familyFacilities) {
    for (const [key, value] of Object.entries(payload.familyFacilities)) {
      await addScalar(`familyFacilities.${key}`, value);
    }
  }
  if (payload.accessibility) {
    for (const [key, value] of Object.entries(payload.accessibility)) {
      if (key === 'notes') continue;
      await addScalar(`accessibility.${key}`, value);
    }
  }
  if (payload.sendInfo) {
    for (const [key, value] of Object.entries(payload.sendInfo)) {
      if (key === 'scheduleNotes') continue;
      await addScalar(`sendInfo.${key}`, value);
    }
  }

  await addScalar('pushchairSuitability', payload.pushchairSuitability);
  await addScalar('environment', payload.environment);
  await addScalar('energyLevel', payload.energyLevel);
  await addScalar('extendedTerrain', payload.extendedTerrain ?? payload.terrain);
  await addScalar('minRecommendedAge', payload.minRecommendedAge);
  await addScalar('maxRecommendedAge', payload.maxRecommendedAge);
  await addScalar('ageNotes', payload.ageNotes);
  await addScalar('categoryConfirmed', payload.categoryConfirmed);

  return created;
}

async function listClaimsForVenue(familypilotPlaceId, options = {}) {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    let query = supabase.from('venue_claims').select('*').eq('familypilot_place_id', familypilotPlaceId);
    if (options.status) query = query.eq('status', options.status);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToClaim);
  }

  const store = readClaimsFileStore();
  return store.claims
    .filter((c) => {
      if (c.familypilot_place_id !== familypilotPlaceId) return false;
      if (options.status && c.status !== options.status) return false;
      return true;
    })
    .map(rowToClaim);
}

async function getActiveClaims(familypilotPlaceId) {
  const claims = await listClaimsForVenue(familypilotPlaceId, { status: 'active' });
  const today = new Date().toISOString().slice(0, 10);
  return claims.filter((c) => !c.validUntil || c.validUntil >= today);
}

function isClaimActive(claim) {
  if (!ACTIVE_STATUSES.has(claim.status)) return false;
  if (claim.validUntil) {
    const today = new Date().toISOString().slice(0, 10);
    if (claim.validUntil < today) return false;
  }
  return true;
}

function setNestedValue(target, fieldKey, value) {
  if (fieldKey.startsWith('familyFacilities.')) {
    target.familyFacilities = target.familyFacilities || {};
    target.familyFacilities[fieldKey.slice('familyFacilities.'.length)] = value;
    return;
  }
  if (fieldKey.startsWith('accessibility.')) {
    target.accessibility = target.accessibility || {};
    target.accessibility[fieldKey.slice('accessibility.'.length)] = value;
    return;
  }
  if (fieldKey.startsWith('sendInfo.')) {
    target.sendInfo = target.sendInfo || {};
    target.sendInfo[fieldKey.slice('sendInfo.'.length)] = value;
    return;
  }
  if (fieldKey === 'extendedTerrain') {
    target.extendedTerrain = value;
    return;
  }
  if (fieldKey === 'minRecommendedAge') {
    target.minRecommendedAge = value;
    return;
  }
  if (fieldKey === 'maxRecommendedAge') {
    target.maxRecommendedAge = value;
    return;
  }
  if (fieldKey === 'ageNotes') {
    target.ageNotes = value;
    return;
  }
  if (fieldKey === 'categoryConfirmed') {
    target.categoryConfirmed = value;
    return;
  }
  if (fieldKey === 'pushchairSuitability') {
    target.pushchairSuitability = value;
    return;
  }
  if (fieldKey === 'environment') {
    target.environment = value;
    return;
  }
  if (fieldKey === 'energyLevel') {
    target.energyLevel = value;
  }
}

/**
 * Build enrichment save payload from active trusted claims only.
 * Disputed, expired, and superseded claims are excluded.
 */
function projectActiveClaimsToPayload(activeClaims) {
  const payload = {
    familyFacilities: {},
    accessibility: {},
    sendInfo: {},
  };

  for (const claim of activeClaims) {
    if (!isClaimActive(claim)) continue;
    setNestedValue(payload, claim.fieldKey, claim.valueJson);
  }

  if (Object.keys(payload.familyFacilities).length === 0) delete payload.familyFacilities;
  if (Object.keys(payload.accessibility).length === 0) delete payload.accessibility;
  if (Object.keys(payload.sendInfo).length === 0) delete payload.sendInfo;

  return payload;
}

function mergeEditorialFields(projected, editorial) {
  const merged = { ...projected };
  const editorialKeys = [
    'whyFamiliesLike',
    'goodToKnow',
    'warnings',
    'familyNotes',
    'parkingInfo',
    'estimatedSpend',
    'visitDurationMinutes',
    'pathSurface',
    'terrainNotes',
    'betaPriority',
    'lastChecked',
    'checkedBy',
    'enrichmentProvenance',
    'requestedStatus',
    'bestAges',
  ];
  for (const key of editorialKeys) {
    if (editorial[key] !== undefined) merged[key] = editorial[key];
  }
  return merged;
}

async function rebuildMetadataPayloadFromClaims(familypilotPlaceId, editorialExtras = {}) {
  const activeClaims = await getActiveClaims(familypilotPlaceId);
  if (activeClaims.length === 0) return null;

  const projected = projectActiveClaimsToPayload(activeClaims);
  return mergeEditorialFields(projected, editorialExtras);
}

async function venueHasActiveClaims(familypilotPlaceId) {
  const claims = await getActiveClaims(familypilotPlaceId);
  return claims.length > 0;
}

async function setClaimStatus(claimId, status) {
  if (!['active', 'disputed', 'expired', 'superseded'].includes(status)) {
    throw new Error(`Invalid claim status: ${status}`);
  }
  await updateClaimStatus(claimId, status);
}

async function disputeClaim(claimId) {
  await setClaimStatus(claimId, 'disputed');
}

async function expireClaim(claimId) {
  await setClaimStatus(claimId, 'expired');
}

function metadataRowFromPayload(familypilotPlaceId, payload, existing) {
  const status = resolveEnrichmentStatus(payload, existing);
  const bestAges = buildBestAges(payload);
  const terrain = payload.terrain || mapExtendedTerrain(payload.extendedTerrain);
  const facilities = facilitiesFromTriState(payload.familyFacilities);

  return {
    familypilot_place_id: familypilotPlaceId,
    enrichment_status: status,
    best_ages: bestAges,
    min_recommended_age: payload.minRecommendedAge ?? null,
    max_recommended_age: payload.maxRecommendedAge ?? null,
    age_notes: payload.ageNotes ?? null,
    terrain,
    extended_terrain: payload.extendedTerrain ?? null,
    terrain_notes: payload.terrainNotes ?? null,
    path_surface: payload.pathSurface ?? null,
    facilities,
    family_facilities: payload.familyFacilities ?? {},
    parking_info: payload.parkingInfo ?? null,
    visit_duration_minutes: payload.visitDurationMinutes ?? null,
    warnings: payload.warnings ?? [],
    good_to_know: payload.goodToKnow ?? [],
    why_families_like: payload.whyFamiliesLike ?? [],
    estimated_spend: payload.estimatedSpend ?? null,
    pushchair_suitability: payload.pushchairSuitability ?? null,
    environment: payload.environment ?? null,
    energy_level: payload.energyLevel ?? null,
    accessibility: payload.accessibility ?? {},
    send_info: payload.sendInfo ?? {},
    family_notes: payload.familyNotes ?? null,
    category_confirmed: payload.categoryConfirmed ?? null,
    enrichment_provenance: payload.enrichmentProvenance ?? {},
    last_checked: payload.lastChecked ?? null,
    checked_by: payload.checkedBy ?? null,
    beta_priority: payload.betaPriority ?? false,
    updated_at: new Date().toISOString(),
    updated_by: payload.checkedBy || 'enrichment-admin',
  };
}

module.exports = {
  createClaimsFromApproval,
  syncClaimsFromEditorSave,
  listClaimsForVenue,
  getActiveClaims,
  projectActiveClaimsToPayload,
  rebuildMetadataPayloadFromClaims,
  venueHasActiveClaims,
  setClaimStatus,
  disputeClaim,
  expireClaim,
  createApprovedClaim,
  isClaimActive,
  metadataRowFromPayload,
  INACTIVE_STATUSES,
  ACTIVE_STATUSES,
};
