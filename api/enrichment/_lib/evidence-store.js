const fs = require('fs');
const path = require('path');

const { getSupabaseAdmin } = require('./supabase-admin');
const { hashContent } = require('./source-fetcher');

const FILE_EVIDENCE_PATH = path.join(process.cwd(), '.data', 'venue-source-evidence.json');
const CACHE_TTL_DAYS = Number(process.env.SOURCE_EVIDENCE_CACHE_DAYS || 14);

function ensureFileStore() {
  const dir = path.dirname(FILE_EVIDENCE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE_EVIDENCE_PATH)) {
    fs.writeFileSync(FILE_EVIDENCE_PATH, JSON.stringify({ records: [] }, null, 2));
  }
}

function readFileStore() {
  ensureFileStore();
  return JSON.parse(fs.readFileSync(FILE_EVIDENCE_PATH, 'utf8'));
}

function writeFileStore(data) {
  ensureFileStore();
  fs.writeFileSync(FILE_EVIDENCE_PATH, JSON.stringify(data, null, 2));
}

function isCacheFresh(retrievedAt) {
  const ageMs = Date.now() - new Date(retrievedAt).getTime();
  return ageMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

function rowToRecord(row) {
  return {
    id: row.id,
    familypilotPlaceId: row.familypilot_place_id,
    sourceUrl: row.source_url,
    sourceType: row.source_type,
    pageTitle: row.page_title,
    retrievedAt: row.retrieved_at,
    contentHash: row.content_hash,
    extractedText: row.extracted_text,
    extractedEvidence: row.extracted_evidence ?? [],
    fetchStatus: row.fetch_status,
    error: row.error,
  };
}

async function getCachedEvidence(familypilotPlaceId, sourceUrl) {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data } = await supabase
      .from('venue_source_evidence')
      .select('*')
      .eq('familypilot_place_id', familypilotPlaceId)
      .eq('source_url', sourceUrl)
      .order('retrieved_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && isCacheFresh(data.retrieved_at)) return rowToRecord(data);
    return null;
  }

  const store = readFileStore();
  const row = store.records
    .filter(
      (r) =>
        r.familypilot_place_id === familypilotPlaceId &&
        r.source_url === sourceUrl &&
        isCacheFresh(r.retrieved_at),
    )
    .sort((a, b) => new Date(b.retrieved_at) - new Date(a.retrieved_at))[0];
  return row ? rowToRecord(row) : null;
}

async function saveEvidenceRecord(record) {
  const supabase = getSupabaseAdmin();
  const row = {
    familypilot_place_id: record.familypilotPlaceId,
    source_url: record.sourceUrl,
    source_type: record.sourceType,
    page_title: record.pageTitle ?? null,
    retrieved_at: record.retrievedAt ?? new Date().toISOString(),
    content_hash: record.contentHash ?? hashContent(record.extractedText),
    extracted_text: record.extractedText ?? null,
    extracted_evidence: record.extractedEvidence ?? [],
    fetch_status: record.fetchStatus ?? 'ok',
    error: record.error ?? null,
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    const { data, error } = await supabase
      .from('venue_source_evidence')
      .upsert(row, {
        onConflict: 'familypilot_place_id,source_url,content_hash',
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return rowToRecord(data);
  }

  const store = readFileStore();
  const existingIndex = store.records.findIndex(
    (item) =>
      item.familypilot_place_id === row.familypilot_place_id &&
      item.source_url === row.source_url &&
      item.content_hash === row.content_hash,
  );
  const existing = existingIndex >= 0 ? store.records[existingIndex] : null;
  const saved = existing
    ? { ...existing, ...row }
    : {
        id: `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        created_at: new Date().toISOString(),
        ...row,
      };
  if (existingIndex >= 0) store.records[existingIndex] = saved;
  else store.records.push(saved);
  writeFileStore(store);
  return rowToRecord(saved);
}

async function listEvidenceForVenue(familypilotPlaceId) {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('venue_source_evidence')
      .select('*')
      .eq('familypilot_place_id', familypilotPlaceId)
      .order('retrieved_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToRecord);
  }

  const store = readFileStore();
  return store.records
    .filter((r) => r.familypilot_place_id === familypilotPlaceId)
    .map(rowToRecord)
    .sort((a, b) => new Date(b.retrievedAt) - new Date(a.retrievedAt));
}

module.exports = {
  getCachedEvidence,
  saveEvidenceRecord,
  listEvidenceForVenue,
  isCacheFresh,
  CACHE_TTL_DAYS,
};
