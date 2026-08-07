-- FamilyPilot — Venue enrichment workflow extensions
-- Extends venue_family_metadata for internal editorial workflow

ALTER TABLE venue_family_metadata
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT
    CHECK (enrichment_status IN ('provider_only', 'enriched', 'verified')),
  ADD COLUMN IF NOT EXISTS min_recommended_age INTEGER,
  ADD COLUMN IF NOT EXISTS max_recommended_age INTEGER,
  ADD COLUMN IF NOT EXISTS age_notes TEXT,
  ADD COLUMN IF NOT EXISTS family_facilities JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pushchair_suitability TEXT
    CHECK (pushchair_suitability IN ('excellent', 'good', 'mixed', 'difficult', 'unknown')),
  ADD COLUMN IF NOT EXISTS path_surface TEXT
    CHECK (path_surface IN ('paved', 'gravel', 'grass', 'mixed', 'unknown')),
  ADD COLUMN IF NOT EXISTS extended_terrain TEXT
    CHECK (extended_terrain IN ('flat', 'mostly_flat', 'mixed', 'hilly', 'very_hilly', 'unknown')),
  ADD COLUMN IF NOT EXISTS terrain_notes TEXT,
  ADD COLUMN IF NOT EXISTS accessibility JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS send_info JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS why_families_like JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS enrichment_provenance JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_checked DATE,
  ADD COLUMN IF NOT EXISTS checked_by TEXT,
  ADD COLUMN IF NOT EXISTS beta_priority BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS category_confirmed TEXT
    CHECK (category_confirmed IN ('yes', 'no', 'unknown'));

CREATE INDEX IF NOT EXISTS idx_venue_metadata_enrichment_status
  ON venue_family_metadata (enrichment_status);

CREATE INDEX IF NOT EXISTS idx_venue_metadata_last_checked
  ON venue_family_metadata (last_checked DESC);

CREATE INDEX IF NOT EXISTS idx_venue_metadata_beta_priority
  ON venue_family_metadata (beta_priority) WHERE beta_priority = true;

COMMENT ON COLUMN venue_family_metadata.enrichment_status IS 'Explicit editorial state — provider sync must never overwrite';
COMMENT ON COLUMN venue_family_metadata.family_facilities IS 'Tri-state family facility map: yes | no | unknown per key';
COMMENT ON COLUMN venue_family_metadata.enrichment_provenance IS 'Source type, reference, checked date, checked by, evidence notes';
