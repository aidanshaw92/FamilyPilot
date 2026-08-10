-- FamilyPilot — Canonical venue identity (Stage 2)
-- Links duplicate provider place records without deleting source rows or draft history.

CREATE TABLE IF NOT EXISTS canonical_venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name TEXT NOT NULL,
  primary_familypilot_place_id TEXT NOT NULL REFERENCES place_records(familypilot_place_id) ON DELETE RESTRICT,
  review_status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (review_status IN ('confirmed', 'uncertain', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (primary_familypilot_place_id)
);

CREATE TABLE IF NOT EXISTS venue_place_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_venue_id UUID NOT NULL REFERENCES canonical_venues(id) ON DELETE CASCADE,
  familypilot_place_id TEXT NOT NULL REFERENCES place_records(familypilot_place_id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('primary', 'alias', 'uncertain')),
  provider TEXT,
  external_id TEXT,
  match_method TEXT,
  match_confidence NUMERIC(4, 3),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (familypilot_place_id),
  UNIQUE (canonical_venue_id, familypilot_place_id)
);

CREATE INDEX IF NOT EXISTS idx_canonical_venues_review_status
  ON canonical_venues (review_status);

CREATE INDEX IF NOT EXISTS idx_venue_place_links_canonical
  ON venue_place_links (canonical_venue_id);

CREATE INDEX IF NOT EXISTS idx_venue_place_links_link_type
  ON venue_place_links (link_type);

ALTER TABLE canonical_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_place_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Canonical venues are publicly readable"
  ON canonical_venues FOR SELECT USING (true);

CREATE POLICY "Venue place links are publicly readable"
  ON venue_place_links FOR SELECT USING (true);

COMMENT ON TABLE canonical_venues IS 'Stable FamilyPilot venue identity spanning duplicate provider listings';
COMMENT ON TABLE venue_place_links IS 'Maps place_records to a canonical venue without deleting source rows';

-- Resolve the known Warner Bros / Harry Potter duplicate when both records exist.
-- Primary is the longer official Warner Bros listing; Harry Potter Studio remains linked as alias.
DO $$
DECLARE
  warner_id TEXT := 'fp-google-ChIJC9pWSLVBdkgRMA5Q9eG6egM';
  hp_id TEXT := 'fp-google-ChIJLcZnZgBBdkgRVa6ewdVh-1w';
  canon_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM place_records WHERE familypilot_place_id = warner_id)
     AND EXISTS (SELECT 1 FROM place_records WHERE familypilot_place_id = hp_id) THEN
    INSERT INTO canonical_venues (
      display_name,
      primary_familypilot_place_id,
      review_status,
      notes
    )
    VALUES (
      'Warner Bros. Studio Tour London',
      warner_id,
      'confirmed',
      'Known duplicate pair: Warner Bros. Studio Tour London (primary) and Harry Potter Studio (alias)'
    )
    ON CONFLICT (primary_familypilot_place_id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          review_status = EXCLUDED.review_status,
          notes = EXCLUDED.notes,
          updated_at = NOW()
    RETURNING id INTO canon_id;

    IF canon_id IS NULL THEN
      SELECT id INTO canon_id
      FROM canonical_venues
      WHERE primary_familypilot_place_id = warner_id;
    END IF;

    INSERT INTO venue_place_links (
      canonical_venue_id,
      familypilot_place_id,
      link_type,
      provider,
      external_id,
      match_method,
      match_confidence,
      reviewed_at,
      reviewed_by
    )
    SELECT
      canon_id,
      warner_id,
      'primary',
      pr.provider,
      pr.external_id,
      'manual:known_duplicate_pair',
      1.000,
      NOW(),
      'migration:013'
    FROM place_records pr
    WHERE pr.familypilot_place_id = warner_id
    ON CONFLICT (familypilot_place_id) DO UPDATE
      SET link_type = EXCLUDED.link_type,
          match_method = EXCLUDED.match_method,
          match_confidence = EXCLUDED.match_confidence,
          reviewed_at = EXCLUDED.reviewed_at,
          reviewed_by = EXCLUDED.reviewed_by;

    INSERT INTO venue_place_links (
      canonical_venue_id,
      familypilot_place_id,
      link_type,
      provider,
      external_id,
      match_method,
      match_confidence,
      reviewed_at,
      reviewed_by
    )
    SELECT
      canon_id,
      hp_id,
      'alias',
      pr.provider,
      pr.external_id,
      'manual:known_duplicate_pair',
      0.950,
      NOW(),
      'migration:013'
    FROM place_records pr
    WHERE pr.familypilot_place_id = hp_id
    ON CONFLICT (familypilot_place_id) DO UPDATE
      SET canonical_venue_id = EXCLUDED.canonical_venue_id,
          link_type = EXCLUDED.link_type,
          match_method = EXCLUDED.match_method,
          match_confidence = EXCLUDED.match_confidence,
          reviewed_at = EXCLUDED.reviewed_at,
          reviewed_by = EXCLUDED.reviewed_by;
  END IF;
END $$;
