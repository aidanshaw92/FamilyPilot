-- FamilyPilot — Fresh Supabase bootstrap (places + enrichment only)
-- Safe to run on an empty Supabase project via SQL Editor (single paste).
-- Does NOT create unrelated MVP product tables from 001_initial_schema.sql.
--
-- Replaces for fresh install:
--   familypilot/supabase/migrations/002_place_records_and_metadata.sql
--   familypilot/supabase/migrations/003_venue_enrichment_workflow.sql
--
-- Still required separately if you need full MVP product schema:
--   familypilot/supabase/migrations/001_initial_schema.sql

-- ---------------------------------------------------------------------------
-- Extensions (002 uses uuid_generate_v4(); not declared in 002 itself)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- place_records — provider-owned external place facts (Google, OSM, mock)
-- Matches api/enrichment/lib/enrichment-store.js upsert/select
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS place_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  familypilot_place_id TEXT NOT NULL UNIQUE,
  external_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('mock', 'google', 'osm', 'familypilot')),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  address TEXT,
  description TEXT,
  opening_hours JSONB,
  website TEXT,
  phone TEXT,
  photos JSONB DEFAULT '[]'::jsonb,
  is_open BOOLEAN,
  field_provenance JSONB DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (provider, external_id)
);

COMMENT ON TABLE place_records IS 'Cached external place facts — provider + external_id separate from FamilyPilot IDs';
COMMENT ON COLUMN place_records.field_provenance IS 'Per-field provenance; e.g. googlePrimaryType stored during sync';

CREATE INDEX IF NOT EXISTS idx_place_records_location ON place_records (lat, lng);
CREATE INDEX IF NOT EXISTS idx_place_records_provider ON place_records (provider);
CREATE INDEX IF NOT EXISTS idx_place_records_fetched ON place_records (fetched_at DESC);

-- ---------------------------------------------------------------------------
-- venue_family_metadata — FamilyPilot-owned enrichment (never overwritten by sync)
-- Matches api/enrichment/lib/enrichment-store.js metadataToRow / rowToMetadata
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venue_family_metadata (
  familypilot_place_id TEXT PRIMARY KEY,
  place_record_id UUID REFERENCES place_records(id) ON DELETE SET NULL,

  -- Enrichment state (003)
  enrichment_status TEXT CHECK (enrichment_status IN ('provider_only', 'enriched', 'verified')),

  -- Core suitability (002 + 003)
  best_ages TEXT,
  min_recommended_age INTEGER,
  max_recommended_age INTEGER,
  age_notes TEXT,
  category_confirmed TEXT CHECK (category_confirmed IN ('yes', 'no', 'unknown')),

  -- Terrain & access (002 + 003)
  terrain TEXT CHECK (terrain IN ('flat', 'hilly', 'mixed')),
  extended_terrain TEXT CHECK (extended_terrain IN ('flat', 'mostly_flat', 'mixed', 'hilly', 'very_hilly', 'unknown')),
  terrain_notes TEXT,
  path_surface TEXT CHECK (path_surface IN ('paved', 'gravel', 'grass', 'mixed', 'unknown')),
  pushchair_suitability TEXT CHECK (pushchair_suitability IN ('excellent', 'good', 'mixed', 'difficult', 'unknown')),
  pushchair_access TEXT CHECK (pushchair_access IN ('confirmed', 'not_available', 'not_confirmed')),
  baby_changing TEXT CHECK (baby_changing IN ('confirmed', 'not_available', 'not_confirmed')),
  step_free_access TEXT CHECK (step_free_access IN ('confirmed', 'not_available', 'not_confirmed')),
  accessible_toilet TEXT CHECK (accessible_toilet IN ('confirmed', 'not_available', 'not_confirmed')),

  -- Facilities (002 legacy array + 003 tri-state map)
  facilities JSONB DEFAULT '[]'::jsonb,
  family_facilities JSONB DEFAULT '{}'::jsonb,

  -- Practical info (002)
  parking_info TEXT,
  visit_duration_minutes INTEGER,
  warnings JSONB DEFAULT '[]'::jsonb,
  good_to_know JSONB DEFAULT '[]'::jsonb,
  why_families_like JSONB DEFAULT '[]'::jsonb,
  community_tips JSONB DEFAULT '[]'::jsonb,
  estimated_spend TEXT,

  -- Accessibility & SEND (003 JSONB blobs)
  accessibility JSONB DEFAULT '{}'::jsonb,
  send_info JSONB DEFAULT '{}'::jsonb,
  accessibility_notes TEXT,
  send_notes TEXT,
  family_notes TEXT,

  -- Provenance & freshness (002 + 003)
  field_provenance JSONB DEFAULT '{}'::jsonb,
  enrichment_provenance JSONB DEFAULT '{}'::jsonb,
  last_checked DATE,
  checked_by TEXT,
  beta_priority BOOLEAN DEFAULT false,

  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT 'familypilot'
);

COMMENT ON TABLE venue_family_metadata IS 'FamilyPilot editorial metadata — age suitability, terrain, SEND, accessibility, Family Match inputs';
COMMENT ON COLUMN venue_family_metadata.enrichment_status IS 'Explicit editorial state — provider sync must never overwrite';
COMMENT ON COLUMN venue_family_metadata.family_facilities IS 'Tri-state family facility map: yes | no | unknown per key';
COMMENT ON COLUMN venue_family_metadata.enrichment_provenance IS 'Source type, reference, checked date, checked by, evidence notes';

CREATE INDEX IF NOT EXISTS idx_venue_metadata_enrichment_status
  ON venue_family_metadata (enrichment_status);
CREATE INDEX IF NOT EXISTS idx_venue_metadata_last_checked
  ON venue_family_metadata (last_checked DESC);
CREATE INDEX IF NOT EXISTS idx_venue_metadata_beta_priority
  ON venue_family_metadata (beta_priority) WHERE beta_priority = true;

-- ---------------------------------------------------------------------------
-- Row Level Security — public read; writes via service role only (server API)
-- Matches 002: anon/authenticated clients may SELECT; no public INSERT/UPDATE
-- ---------------------------------------------------------------------------
ALTER TABLE place_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_family_metadata ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'place_records' AND policyname = 'Place records are publicly readable'
  ) THEN
    CREATE POLICY "Place records are publicly readable" ON place_records FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'venue_family_metadata' AND policyname = 'Venue family metadata is publicly readable'
  ) THEN
    CREATE POLICY "Venue family metadata is publicly readable" ON venue_family_metadata FOR SELECT USING (true);
  END IF;
END $$;
