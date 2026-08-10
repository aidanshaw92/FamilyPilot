-- FamilyPilot — Service role access for canonical venue identity tables

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.canonical_venues TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.venue_place_links TO service_role;
