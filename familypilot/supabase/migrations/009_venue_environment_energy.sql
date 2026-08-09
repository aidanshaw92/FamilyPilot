-- FamilyPilot — Trusted environment and energy level for day-out matching

ALTER TABLE venue_family_metadata
  ADD COLUMN IF NOT EXISTS environment TEXT
    CHECK (environment IN ('indoor', 'outdoor', 'mixed', 'unknown')),
  ADD COLUMN IF NOT EXISTS energy_level TEXT
    CHECK (energy_level IN ('low', 'moderate', 'high', 'mixed', 'unknown'));

COMMENT ON COLUMN venue_family_metadata.environment IS 'Trusted indoor/outdoor setting — human-approved, not inferred from category';
COMMENT ON COLUMN venue_family_metadata.energy_level IS 'Trusted activity energy level — human-approved, not inferred from category';
