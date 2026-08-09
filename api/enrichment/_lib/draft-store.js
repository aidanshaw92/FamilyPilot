const fs = require('fs');
const path = require('path');

const { getSupabaseAdmin } = require('./supabase-admin');
const { generateDraft } = require('./ai-provider');
const { draftJsonToSavePayload } = require('./ai-draft-mapper');
const { normaliseDraftJson } = require('./ai-draft-schema');
const { createClaimsFromApproval } = require('./claims-store');
const { getMetadata, saveMetadata, listQueue } = require('./enrichment-store');
const { gatherEvidenceForVenue } = require('./evidence-pipeline');

const FILE_DRAFTS_DIR = '.data';
const FILE_DRAFTS_NAME = 'enrichment-drafts.json';
const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 25;

function getDraftFilePath() {
  return path.join(process.cwd(), FILE_DRAFTS_DIR, FILE_DRAFTS_NAME);
}

function ensureDraftFileStore() {
  const filePath = getDraftFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ drafts: [] }, null, 2));
  }
}

function readDraftFileStore() {
  ensureDraftFileStore();
  return JSON.parse(fs.readFileSync(getDraftFilePath(), 'utf8'));
}

function writeDraftFileStore(data) {
  ensureDraftFileStore();
  fs.writeFileSync(getDraftFilePath(), JSON.stringify(data, null, 2));
}

function isLegacyEvidenceStatus(status) {
  return status == null || status === 'legacy_no_sources';
}

function resolveDraftEvidenceStatus(row) {
  return row.evidence_status ?? (row.status === 'pending_review' ? 'legacy_no_sources' : undefined);
}

function rowToDraft(row) {
  if (!row) return null;
  let draftJson = row.draft_json;
  try {
    draftJson = normaliseDraftJson(row.draft_json);
  } catch {
    draftJson = row.draft_json;
  }
  return {
    id: row.id,
    familypilotPlaceId: row.familypilot_place_id,
    externalId: row.external_id,
    draftJson,
    model: row.model,
    generatedAt: row.generated_at,
    sourceContext: row.source_context ?? {},
    confidenceJson: row.confidence_json ?? {},
    status: row.status,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    evidenceStatus: resolveDraftEvidenceStatus(row),
    tokenUsage: row.token_usage ?? {},
    estimatedCostUsd: row.estimated_cost_usd,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getPlaceRecord(familypilotId) {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('place_records')
      .select('*')
      .eq('familypilot_place_id', familypilotId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  const storePath = path.join(process.cwd(), '.data', 'enrichment-store.json');
  if (!fs.existsSync(storePath)) return null;
  const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  return store.places?.[familypilotId] ?? null;
}

async function markAiDraftStatus(familypilotId) {
  const supabase = getSupabaseAdmin();
  const row = {
    familypilot_place_id: familypilotId,
    enrichment_status: 'ai_draft',
    updated_at: new Date().toISOString(),
    updated_by: 'ai-enrichment',
  };

  if (supabase) {
    const { error } = await supabase.from('venue_family_metadata').upsert(row, {
      onConflict: 'familypilot_place_id',
    });
    if (error) throw new Error(error.message);
    return;
  }

  const storePath = path.join(process.cwd(), '.data', 'enrichment-store.json');
  const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  store.metadata[familypilotId] = { ...(store.metadata[familypilotId] ?? {}), ...row };
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

async function clearAiDraftStatus(familypilotId) {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data } = await supabase
      .from('venue_family_metadata')
      .select('enrichment_status')
      .eq('familypilot_place_id', familypilotId)
      .maybeSingle();
    if (data?.enrichment_status === 'ai_draft') {
      await supabase
        .from('venue_family_metadata')
        .update({ enrichment_status: 'provider_only', updated_at: new Date().toISOString() })
        .eq('familypilot_place_id', familypilotId);
    }
    return;
  }

  const storePath = path.join(process.cwd(), '.data', 'enrichment-store.json');
  if (!fs.existsSync(storePath)) return;
  const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  if (store.metadata[familypilotId]?.enrichment_status === 'ai_draft') {
    store.metadata[familypilotId].enrichment_status = 'provider_only';
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  }
}

async function supersedePendingDrafts(familypilotId) {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase
      .from('venue_enrichment_drafts')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('familypilot_place_id', familypilotId)
      .eq('status', 'pending_review');
    return;
  }

  const store = readDraftFileStore();
  for (const draft of store.drafts) {
    if (draft.familypilot_place_id === familypilotId && draft.status === 'pending_review') {
      draft.status = 'superseded';
      draft.updated_at = new Date().toISOString();
    }
  }
  writeDraftFileStore(store);
}

async function saveDraftRecord(familypilotId, externalId, result) {
  const supabase = getSupabaseAdmin();
  const record = {
    familypilot_place_id: familypilotId,
    external_id: externalId ?? null,
    draft_json: result.draftJson,
    model: result.model,
    generated_at: new Date().toISOString(),
    source_context: result.sourceContext,
    confidence_json: result.confidenceJson,
    evidence_status: result.evidenceStatus ?? 'legacy_no_sources',
    status: 'pending_review',
    token_usage: result.tokenUsage ?? {},
    estimated_cost_usd: result.estimatedCostUsd ?? 0,
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    const { data, error } = await supabase
      .from('venue_enrichment_drafts')
      .insert(record)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return rowToDraft(data);
  }

  const store = readDraftFileStore();
  const id = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const row = { id, created_at: new Date().toISOString(), ...record };
  store.drafts.push(row);
  writeDraftFileStore(store);
  return rowToDraft(row);
}

async function getPendingDraft(familypilotId) {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('venue_enrichment_drafts')
      .select('*')
      .eq('familypilot_place_id', familypilotId)
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return rowToDraft(data);
  }

  const store = readDraftFileStore();
  const row = store.drafts
    .filter((d) => d.familypilot_place_id === familypilotId && d.status === 'pending_review')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  return rowToDraft(row);
}

function placeRowToInput(row, existingMetadata, evidenceBundle) {
  const hours = row.opening_hours?.weekdayText?.join('; ') ?? row.opening_hours ?? null;
  return {
    familypilotPlaceId: row.familypilot_place_id,
    externalId: row.external_id,
    name: row.name,
    category: row.category,
    address: row.address,
    description: row.description,
    website: row.website,
    phone: row.phone,
    openingHours: typeof hours === 'string' ? hours : null,
    googlePrimaryType: row.field_provenance?.googlePrimaryType,
    googleTypes: row.field_provenance?.googleTypes ?? [],
    existingMetadata,
    evidenceBundle: evidenceBundle ?? null,
  };
}

async function listLegacyPendingDrafts(filters = {}) {
  const batchSize = Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, Number(filters.batchSize ?? DEFAULT_BATCH_SIZE)),
  );
  const protectedStatuses = new Set(['enriched', 'verified']);
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data: draftRows, error } = await supabase
      .from('venue_enrichment_drafts')
      .select('*')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);

    const legacyDrafts = (draftRows ?? []).filter((row) =>
      isLegacyEvidenceStatus(row.evidence_status),
    );
    if (legacyDrafts.length === 0) return [];

    const placeIds = [...new Set(legacyDrafts.map((row) => row.familypilot_place_id))];
    const { data: metaRows } = await supabase
      .from('venue_family_metadata')
      .select('familypilot_place_id, enrichment_status')
      .in('familypilot_place_id', placeIds);
    const metaById = Object.fromEntries(
      (metaRows ?? []).map((row) => [row.familypilot_place_id, row.enrichment_status]),
    );

    let placeQuery = supabase
      .from('place_records')
      .select('familypilot_place_id, name, external_id, provider')
      .in('familypilot_place_id', placeIds);
    if (filters.provider) placeQuery = placeQuery.eq('provider', filters.provider);
    const { data: placeRows } = await placeQuery;
    const placeById = Object.fromEntries(
      (placeRows ?? []).map((row) => [row.familypilot_place_id, row]),
    );

    const items = [];
    for (const row of legacyDrafts) {
      const enrichmentStatus = metaById[row.familypilot_place_id] ?? 'provider_only';
      if (protectedStatuses.has(enrichmentStatus)) continue;
      const place = placeById[row.familypilot_place_id];
      if (!place) continue;
      if (filters.provider && place.provider !== filters.provider) continue;
      items.push({
        familypilotPlaceId: row.familypilot_place_id,
        familypilotId: row.familypilot_place_id,
        externalId: place.external_id,
        name: place.name,
        draftId: row.id,
        evidenceStatus: resolveDraftEvidenceStatus(row),
        enrichmentStatus,
      });
    }

    return items.slice(0, batchSize);
  }

  const store = readDraftFileStore();
  const storePath = path.join(process.cwd(), '.data', 'enrichment-store.json');
  const placeStore = fs.existsSync(storePath)
    ? JSON.parse(fs.readFileSync(storePath, 'utf8'))
    : { places: {}, metadata: {} };

  const items = [];
  for (const row of store.drafts) {
    if (row.status !== 'pending_review' || !isLegacyEvidenceStatus(row.evidence_status)) continue;
    const enrichmentStatus =
      placeStore.metadata?.[row.familypilot_place_id]?.enrichment_status ?? 'provider_only';
    if (protectedStatuses.has(enrichmentStatus)) continue;
    const place = placeStore.places?.[row.familypilot_place_id];
    if (!place) continue;
    if (filters.provider && place.provider !== filters.provider) continue;
    items.push({
      familypilotPlaceId: row.familypilot_place_id,
      familypilotId: row.familypilot_place_id,
      externalId: place.external_id,
      name: place.name,
      draftId: row.id,
      evidenceStatus: resolveDraftEvidenceStatus(row),
      enrichmentStatus,
    });
  }

  return items
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, batchSize);
}

async function generateDraftForVenue(familypilotId, options = {}) {
  const metadata = await getMetadata(familypilotId);
  const status = metadata?.enrichmentStatus ?? 'provider_only';

  if (!options.regenerate && (status === 'enriched' || status === 'verified')) {
    throw new Error('Cannot generate AI draft for enriched or verified venue without regenerate flag');
  }

  const place = await getPlaceRecord(familypilotId);
  if (!place) throw new Error('Place record not found');

  await supersedePendingDrafts(familypilotId);
  const evidenceBundle = await gatherEvidenceForVenue(familypilotId, place);
  const input = placeRowToInput(place, metadata, evidenceBundle);
  const result = await generateDraft(input);
  result.evidenceStatus =
    evidenceBundle.sourceStatus === 'no_official_source' ? 'provider_only' : 'evidence_backed';
  result.sourceContext = {
    ...result.sourceContext,
    evidenceBundle,
    sourcePagesChecked: evidenceBundle.pagesChecked,
    sourceCacheHits: evidenceBundle.cacheHits,
    sourceStatus: evidenceBundle.sourceStatus,
  };
  const draft = await saveDraftRecord(familypilotId, place.external_id, result);

  if (status !== 'enriched' && status !== 'verified') {
    await markAiDraftStatus(familypilotId);
  }

  return {
    draft,
    tokenUsage: result.tokenUsage,
    estimatedCostUsd: result.estimatedCostUsd ?? 0,
    evidenceBundle,
  };
}

async function generateDraftBatch(params = {}) {
  const batchSize = Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, Number(params.batchSize ?? DEFAULT_BATCH_SIZE)),
  );
  const betaLat = params.betaLat != null ? Number(params.betaLat) : 51.643;
  const betaLng = params.betaLng != null ? Number(params.betaLng) : -0.36;
  const betaRadiusKm = params.betaRadiusKm != null ? Number(params.betaRadiusKm) : 15;

  const queue = await listQueue({
    status: 'provider_only',
    sort: 'priority',
    betaLat,
    betaLng,
    betaRadiusKm,
    provider: 'google',
  });

  const candidates = queue.slice(0, batchSize);
  const results = [];
  let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let estimatedCostUsd = 0;

  for (const item of candidates) {
    try {
      const { draft, tokenUsage: tu, estimatedCostUsd: cost } = await generateDraftForVenue(
        item.familypilotId,
      );
      tokenUsage.promptTokens += tu?.promptTokens ?? 0;
      tokenUsage.completionTokens += tu?.completionTokens ?? 0;
      tokenUsage.totalTokens += tu?.totalTokens ?? 0;
      estimatedCostUsd += cost;
      results.push({
        familypilotPlaceId: item.familypilotId,
        name: item.name,
        ok: true,
        draftId: draft.id,
      });
    } catch (error) {
      results.push({
        familypilotPlaceId: item.familypilotId,
        name: item.name,
        ok: false,
        error: error instanceof Error ? error.message : 'Generation failed',
      });
    }
  }

  return {
    processed: candidates.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    tokenUsage,
    estimatedCostUsd,
  };
}

async function approveDraft(familypilotId, payload, reviewedBy) {
  const draft = await getPendingDraft(familypilotId);
  if (!draft) throw new Error('No pending AI draft to approve');

  const fromDraft = draftJsonToSavePayload(draft.draftJson, {
    model: draft.model,
    approvedAt: new Date().toISOString(),
    reviewedBy,
    sourceContext: draft.sourceContext,
    evidenceStatus: draft.evidenceStatus,
  });

  const savePayload = {
    ...fromDraft,
    ...(payload && Object.keys(payload).length > 0 ? payload : {}),
    requestedStatus: 'enriched',
    checkedBy: reviewedBy ?? payload?.checkedBy ?? fromDraft.checkedBy,
    enrichmentProvenance: {
      ...(fromDraft.enrichmentProvenance ?? {}),
      ...(payload?.enrichmentProvenance ?? {}),
      sourceType: 'ai_assisted',
      checkedBy: reviewedBy,
    },
  };

  const checkedAt = savePayload.lastChecked || new Date().toISOString().slice(0, 10);
  await createClaimsFromApproval({
    familypilotPlaceId: familypilotId,
    draftJson: draft.draftJson,
    editorPayload: payload ?? {},
    reviewedBy: reviewedBy ?? 'enrichment-admin',
    draftId: draft.id,
    checkedAt,
  });

  const metadata = await saveMetadata(familypilotId, savePayload, { fromClaims: true });
  await updateDraftStatus(draft.id, 'approved', reviewedBy);
  return { metadata, draftId: draft.id };
}

async function rejectDraft(familypilotId, reviewedBy) {
  const draft = await getPendingDraft(familypilotId);
  if (!draft) throw new Error('No pending AI draft to reject');

  await updateDraftStatus(draft.id, 'rejected', reviewedBy);
  await clearAiDraftStatus(familypilotId);
  return { rejected: true, draftId: draft.id };
}

async function updateDraftStatus(draftId, status, reviewedBy) {
  const supabase = getSupabaseAdmin();
  const updates = {
    status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewedBy ?? 'enrichment-admin',
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    const { error } = await supabase.from('venue_enrichment_drafts').update(updates).eq('id', draftId);
    if (error) throw new Error(error.message);
    return;
  }

  const store = readDraftFileStore();
  const draft = store.drafts.find((d) => d.id === draftId);
  if (draft) Object.assign(draft, updates);
  writeDraftFileStore(store);
}

module.exports = {
  generateDraftForVenue,
  generateDraftBatch,
  listLegacyPendingDrafts,
  getPendingDraft,
  approveDraft,
  rejectDraft,
  supersedePendingDrafts,
  isLegacyEvidenceStatus,
  resolveDraftEvidenceStatus,
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
};
