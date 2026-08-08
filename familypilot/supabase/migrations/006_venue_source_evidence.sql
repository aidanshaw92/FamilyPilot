-- FamilyPilot — Evidence-backed AI enrichment storage

CREATE TABLE IF NOT EXISTS venue_source_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familypilot_place_id TEXT NOT NULL REFERENCES place_records(familypilot_place_id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'official_website', 'accessibility_page', 'visitor_info', 'faq_page',
    'family_page', 'council_page', 'google_provider'
  )),
  page_title TEXT,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash TEXT NOT NULL,
  extracted_text TEXT,
  extracted_evidence JSONB DEFAULT '[]',
  fetch_status TEXT NOT NULL DEFAULT 'ok'
    CHECK (fetch_status IN ('ok', 'cached', 'timeout', 'blocked', 'error', 'too_large', 'non_html')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_source_evidence_place
  ON venue_source_evidence (familypilot_place_id, retrieved_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_source_evidence_url_hash
  ON venue_source_evidence (familypilot_place_id, source_url, content_hash);

ALTER TABLE venue_enrichment_drafts
  ADD COLUMN IF NOT EXISTS evidence_status TEXT
    CHECK (evidence_status IN ('evidence_backed', 'legacy_no_sources', 'provider_only'));

COMMENT ON TABLE venue_source_evidence IS 'Fetched official source pages and structured field evidence — not trusted metadata';
COMMENT ON COLUMN venue_source_evidence.extracted_evidence IS 'Array of { field, value, confidence, evidenceText, sourceUrl, sourceType, retrievedAt }';
