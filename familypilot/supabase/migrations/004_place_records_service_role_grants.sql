-- FamilyPilot — Ensure server-side enrichment writes can upsert place_records
--
-- Background:
-- place_records has RLS enabled with SELECT-only public policy from 002.
-- Inserts/updates must run as PostgreSQL role `service_role` (BYPASSRLS).
-- An RLS violation on INSERT means PostgREST received the anon/authenticated
-- JWT, not the service_role secret — usually SUPABASE_SERVICE_ROLE_KEY was
-- set to the anon key in Vercel.
--
-- These grants do not replace the service_role key requirement, but ensure the
-- service_role role can write when the correct secret is configured.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.place_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.venue_family_metadata TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
