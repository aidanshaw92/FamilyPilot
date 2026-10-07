-- Two job modes that never ask Google, and the one query that decides when stored evidence needs re-reading.
--
--   reextract         re-read the latest STORED reading of each page with the current extractor; no network at all
--   refetch_official  re-crawl the website the catalogue already knows; Place Details is never requested
--
-- Both are dispatched by the existing every-minute worker. The worker forwards only a `regenerate` boolean, so the API
-- reads the mode from this row itself (server/enrichment/_lib/automation-store.js `getAutomationJobMode`).

ALTER TABLE public.venue_enrichment_jobs DROP CONSTRAINT IF EXISTS venue_enrichment_jobs_mode_check;
ALTER TABLE public.venue_enrichment_jobs
  ADD CONSTRAINT venue_enrichment_jobs_mode_check
  CHECK (mode IN ('generate', 'regenerate', 'reextract', 'refetch_official'));

-- Queue a job of one mode for named venues. Used for the canary and for the refetch of venues whose evidence is
-- missing or past the approval window. A job already processing is left alone; anything else is reset to pending.
CREATE OR REPLACE FUNCTION public.enqueue_venue_enrichment_jobs(p_mode text, p_place_ids text[])
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE queued integer;
BEGIN
  IF p_mode NOT IN ('generate', 'regenerate', 'reextract', 'refetch_official') THEN
    RAISE EXCEPTION 'unknown enrichment job mode %', p_mode;
  END IF;
  INSERT INTO public.venue_enrichment_jobs (familypilot_place_id, mode)
  SELECT p.familypilot_place_id, p_mode
  FROM public.place_records p
  WHERE p.familypilot_place_id = ANY (p_place_ids)
  ON CONFLICT (familypilot_place_id) DO UPDATE
    SET mode = EXCLUDED.mode, status = 'pending', attempts = 0, available_at = now(),
        locked_at = NULL, dispatch_token = NULL, last_error = NULL, updated_at = now()
    WHERE venue_enrichment_jobs.status <> 'processing';
  GET DIAGNOSTICS queued = ROW_COUNT;
  RETURN queued;
END;
$$;

-- Queue `reextract` for every venue the given extractor version has not yet been applied to and whose stored pages
-- can still produce a claim. "Can still produce a claim" is the approval rule itself (trusted-evidence.js
-- `eligibleFact`: a usable fetch, an eligible subject scope, a reading at most 14 days old), taken a day tighter so a
-- job that waits in the queue is still inside the window when it runs. A venue whose newest draft already carries the
-- version is skipped, which is what makes a second call after the same deploy a no-op.
CREATE OR REPLACE FUNCTION public.enqueue_reextract_jobs(
  p_extractor_version text,
  p_limit integer DEFAULT 500,
  p_place_ids text[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE queued integer;
BEGIN
  IF p_extractor_version IS NULL OR p_extractor_version = '' THEN
    RAISE EXCEPTION 'enqueue_reextract_jobs needs the extractor version';
  END IF;
  WITH readable AS (
    SELECT DISTINCT ON (e.familypilot_place_id, e.source_url)
      e.familypilot_place_id, e.retrieved_at, e.fetch_status, e.subject_scope
    FROM public.venue_source_evidence e
    ORDER BY e.familypilot_place_id, e.source_url, e.retrieved_at DESC
  ),
  eligible AS (
    SELECT familypilot_place_id, max(retrieved_at) AS newest
    FROM readable
    WHERE fetch_status IN ('ok', 'cached', 'fetched_truncated')
      AND subject_scope IN ('venue_own_subtree', 'venue_named_page')
      AND retrieved_at >= now() - interval '13 days'
    GROUP BY familypilot_place_id
  ),
  newest_draft AS (
    SELECT DISTINCT ON (d.familypilot_place_id) d.familypilot_place_id, d.model
    FROM public.venue_enrichment_drafts d
    ORDER BY d.familypilot_place_id, d.generated_at DESC
  ),
  candidates AS (
    SELECT p.familypilot_place_id
    FROM public.place_records p
    JOIN eligible el USING (familypilot_place_id)
    LEFT JOIN newest_draft nd USING (familypilot_place_id)
    LEFT JOIN public.venue_enrichment_jobs j USING (familypilot_place_id)
    WHERE p.category NOT IN ('restaurant', 'cafe')
      AND (nd.model IS DISTINCT FROM p_extractor_version)
      AND (p_place_ids IS NULL OR p.familypilot_place_id = ANY (p_place_ids))
      AND (j.id IS NULL OR j.status <> 'processing')
    ORDER BY el.newest ASC
    LIMIT GREATEST(0, p_limit)
  )
  INSERT INTO public.venue_enrichment_jobs (familypilot_place_id, mode)
  SELECT familypilot_place_id, 'reextract' FROM candidates
  ON CONFLICT (familypilot_place_id) DO UPDATE
    SET mode = 'reextract', status = 'pending', attempts = 0, available_at = now(),
        locked_at = NULL, dispatch_token = NULL, last_error = NULL, updated_at = now();
  GET DIAGNOSTICS queued = ROW_COUNT;
  RETURN queued;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_venue_enrichment_jobs(text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_reextract_jobs(text, integer, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_venue_enrichment_jobs(text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_reextract_jobs(text, integer, text[]) TO service_role;

COMMENT ON FUNCTION public.enqueue_reextract_jobs(text, integer, text[]) IS
  'Run once after a deploy that changes EXTRACTOR_VERSION: queues a no-network re-read of stored evidence for the venues it has not reached.';
