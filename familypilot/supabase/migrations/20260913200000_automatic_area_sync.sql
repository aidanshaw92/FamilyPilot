-- Automatic venue discovery: the enrichment worker (011/012) already drafts and
-- auto-approves facts for any place_records row the moment it's inserted (via
-- trg_enqueue_new_place_for_enrichment), running every minute. Nothing, however,
-- ever discovers NEW venues automatically — that "sync" step (search a London-area
-- point via Google Places into place_records) has only ever been triggered by hand.
-- This adds the missing half: a scheduled worker that runs the same sync action
-- across a grid of London-area points on its own.

-- Expose the enrichment admin token to the service-role-authenticated Edge Function
-- without ever putting the raw value in application code or a committed migration -
-- same pattern as verify_enrichment_worker_schedule for the existing worker.
CREATE OR REPLACE FUNCTION public.get_enrichment_admin_token()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = 'familypilot_enrichment_admin_token';
$$;
REVOKE ALL ON FUNCTION public.get_enrichment_admin_token() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_enrichment_admin_token() TO service_role;
