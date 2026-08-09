-- FamilyPilot — Trusted venue claims (field-level approved facts)
-- Projection layer: active claims → venue_family_metadata (consumer read model)

CREATE TABLE IF NOT EXISTS venue_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familypilot_place_id TEXT NOT NULL REFERENCES place_records(familypilot_place_id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  value_json JSONB NOT NULL,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
  source_url TEXT,
  evidence_excerpt TEXT,
  source_type TEXT,
  source_evidence_id UUID REFERENCES venue_source_evidence(id) ON DELETE SET NULL,
  checked_at DATE NOT NULL,
  valid_until DATE,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by TEXT NOT NULL,
  approved_from_draft_id UUID REFERENCES venue_enrichment_drafts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disputed', 'expired', 'superseded')),
  supersedes_claim_id UUID REFERENCES venue_claims(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_claims_place_status
  ON venue_claims (familypilot_place_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_claims_one_active_per_field
  ON venue_claims (familypilot_place_id, field_key)
  WHERE status = 'active';

ALTER TABLE venue_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue claims are publicly readable" ON venue_claims FOR SELECT USING (true);

COMMENT ON TABLE venue_claims IS 'Human-approved trusted facts — only active claims project into venue_family_metadata';
COMMENT ON COLUMN venue_claims.field_key IS 'Dot-path key e.g. familyFacilities.parking, pushchairSuitability, extendedTerrain';
COMMENT ON COLUMN venue_claims.value_json IS 'Structured value — tri-state yes|no|unknown, pushchair rating, terrain enum, or scalar';
COMMENT ON COLUMN venue_claims.status IS 'Only active claims contribute to metadata projection; superseded retains history';
