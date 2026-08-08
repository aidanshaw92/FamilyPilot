-- FamilyPilot — AI enrichment drafts (separate from trusted metadata)

ALTER TABLE venue_family_metadata
  DROP CONSTRAINT IF EXISTS venue_family_metadata_enrichment_status_check;

ALTER TABLE venue_family_metadata
  ADD CONSTRAINT venue_family_metadata_enrichment_status_check
  CHECK (enrichment_status IN ('provider_only', 'ai_draft', 'enriched', 'verified'));

CREATE TABLE IF NOT EXISTS venue_enrichment_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familypilot_place_id TEXT NOT NULL REFERENCES place_records(familypilot_place_id) ON DELETE CASCADE,
  external_id TEXT,
  draft_json JSONB NOT NULL,
  model TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_context JSONB DEFAULT '{}',
  confidence_json JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'superseded')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  token_usage JSONB DEFAULT '{}',
  estimated_cost_usd NUMERIC(10, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_drafts_place_id
  ON venue_enrichment_drafts (familypilot_place_id);

CREATE INDEX IF NOT EXISTS idx_venue_drafts_status
  ON venue_enrichment_drafts (status)
  WHERE status = 'pending_review';

CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_drafts_one_pending_per_place
  ON venue_enrichment_drafts (familypilot_place_id)
  WHERE status = 'pending_review';

COMMENT ON TABLE venue_enrichment_drafts IS 'AI-generated draft metadata — never shown to consumers until human approval';
COMMENT ON COLUMN venue_enrichment_drafts.draft_json IS 'Structured AI output with per-field confidence — not trusted until approved';
