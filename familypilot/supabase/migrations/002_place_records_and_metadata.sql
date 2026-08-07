-- FamilyPilot — External places cache + FamilyPilot metadata separation
-- Run via Supabase CLI: supabase db push

-- Provider cache: facts from Google, OSM, etc.
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
  photos JSONB DEFAULT '[]',
  is_open BOOLEAN,
  field_provenance JSONB DEFAULT '{}',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (provider, external_id)
);

-- FamilyPilot-owned enrichment — never overwritten by provider sync
CREATE TABLE IF NOT EXISTS venue_family_metadata (
  familypilot_place_id TEXT PRIMARY KEY,
  place_record_id UUID REFERENCES place_records(id) ON DELETE SET NULL,
  best_ages TEXT,
  terrain TEXT CHECK (terrain IN ('flat', 'hilly', 'mixed')),
  facilities JSONB DEFAULT '[]',
  parking_info TEXT,
  visit_duration_minutes INTEGER,
  warnings JSONB DEFAULT '[]',
  good_to_know JSONB DEFAULT '[]',
  community_tips JSONB DEFAULT '[]',
  estimated_spend TEXT,
  pushchair_access TEXT CHECK (pushchair_access IN ('confirmed', 'not_available', 'not_confirmed')),
  baby_changing TEXT CHECK (baby_changing IN ('confirmed', 'not_available', 'not_confirmed')),
  step_free_access TEXT CHECK (step_free_access IN ('confirmed', 'not_available', 'not_confirmed')),
  accessible_toilet TEXT CHECK (accessible_toilet IN ('confirmed', 'not_available', 'not_confirmed')),
  accessibility_notes TEXT,
  send_notes TEXT,
  family_notes TEXT,
  field_provenance JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT 'familypilot'
);

CREATE INDEX IF NOT EXISTS idx_place_records_location ON place_records (lat, lng);
CREATE INDEX IF NOT EXISTS idx_place_records_provider ON place_records (provider);
CREATE INDEX IF NOT EXISTS idx_place_records_fetched ON place_records (fetched_at DESC);

ALTER TABLE place_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_family_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Place records are publicly readable" ON place_records FOR SELECT USING (true);
CREATE POLICY "Venue family metadata is publicly readable" ON venue_family_metadata FOR SELECT USING (true);

-- Service role writes via Edge Functions / server API only (no anon insert policies)

COMMENT ON TABLE place_records IS 'Cached external place facts — provider + external_id separate from FamilyPilot IDs';
COMMENT ON TABLE venue_family_metadata IS 'FamilyPilot editorial metadata — age suitability, terrain, SEND, accessibility, Family Match inputs';
