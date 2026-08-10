-- FamilyPilot — hands-off enrichment job queue and scheduler
-- Draft generation remains server-side and all results remain pending review.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE TABLE IF NOT EXISTS public.venue_enrichment_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familypilot_place_id TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL DEFAULT 'regenerate' CHECK (mode IN ('generate', 'regenerate')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_enrichment_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.venue_enrichment_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.venue_enrichment_jobs TO service_role;

CREATE INDEX IF NOT EXISTS idx_venue_enrichment_jobs_claim
  ON public.venue_enrichment_jobs (status, available_at, created_at)
  WHERE status IN ('pending', 'processing');

CREATE OR REPLACE FUNCTION public.claim_next_venue_enrichment_job()
RETURNS SETOF public.venue_enrichment_jobs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT j.id
    FROM public.venue_enrichment_jobs j
    WHERE (
      (j.status = 'pending' AND j.available_at <= now())
      OR (j.status = 'processing' AND j.locked_at < now() - interval '10 minutes')
    )
      AND j.attempts < 5
    ORDER BY j.available_at, j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.venue_enrichment_jobs j
  SET status = 'processing',
      attempts = j.attempts + 1,
      locked_at = now(),
      updated_at = now(),
      last_error = NULL
  FROM candidate
  WHERE j.id = candidate.id
  RETURNING j.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_venue_enrichment_job(p_job_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.venue_enrichment_jobs
  SET status = 'completed',
      completed_at = now(),
      locked_at = NULL,
      updated_at = now(),
      last_error = NULL
  WHERE id = p_job_id AND status = 'processing';
$$;

CREATE OR REPLACE FUNCTION public.fail_venue_enrichment_job(p_job_id UUID, p_error TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_attempts INTEGER;
BEGIN
  SELECT attempts INTO current_attempts
  FROM public.venue_enrichment_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  UPDATE public.venue_enrichment_jobs
  SET status = CASE WHEN current_attempts >= 5 THEN 'failed' ELSE 'pending' END,
      available_at = CASE
        WHEN current_attempts >= 5 THEN available_at
        ELSE now() + make_interval(mins => LEAST(60, (2 ^ current_attempts)::INTEGER))
      END,
      locked_at = NULL,
      updated_at = now(),
      last_error = left(COALESCE(p_error, 'Unknown worker error'), 2000)
  WHERE id = p_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_venue_enrichment_job() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_venue_enrichment_job(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_venue_enrichment_job(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_venue_enrichment_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_venue_enrichment_job(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_venue_enrichment_job(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_new_place_for_enrichment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.venue_enrichment_jobs (familypilot_place_id, mode)
  VALUES (NEW.familypilot_place_id, 'generate')
  ON CONFLICT (familypilot_place_id) DO UPDATE
  SET status = CASE
        WHEN public.venue_enrichment_jobs.status = 'processing' THEN 'processing'
        ELSE 'pending'
      END,
      mode = 'generate',
      attempts = CASE
        WHEN public.venue_enrichment_jobs.status = 'processing' THEN public.venue_enrichment_jobs.attempts
        ELSE 0
      END,
      available_at = CASE
        WHEN public.venue_enrichment_jobs.status = 'processing' THEN public.venue_enrichment_jobs.available_at
        ELSE now()
      END,
      updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_new_place_for_enrichment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enqueue_new_place_for_enrichment ON public.place_records;
CREATE TRIGGER trg_enqueue_new_place_for_enrichment
AFTER INSERT ON public.place_records
FOR EACH ROW EXECUTE FUNCTION public.enqueue_new_place_for_enrichment();

INSERT INTO public.venue_enrichment_jobs (familypilot_place_id, mode)
SELECT DISTINCT d.familypilot_place_id, 'regenerate'
FROM public.venue_enrichment_drafts d
WHERE d.status = 'pending_review'
ON CONFLICT (familypilot_place_id) DO UPDATE
SET mode = 'regenerate',
    status = 'pending',
    attempts = 0,
    available_at = now(),
    locked_at = NULL,
    completed_at = NULL,
    last_error = NULL,
    updated_at = now();

SELECT vault.create_secret(
  'https://uuolfuebwimrsjfgffsm.supabase.co',
  'familypilot_project_url',
  'FamilyPilot Edge Function base URL'
);

SELECT vault.create_secret(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1b2xmdWVid2ltcnNqZmdmZnNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDcxODEsImV4cCI6MjEwMTY4MzE4MX0.zc-6_gebW7QAVH7XR9GuGqU3EltGCuR3PcWY96-yS6M',
  'familypilot_anon_key',
  'Public JWT used only to authenticate the scheduled Edge Function invocation'
);

COMMENT ON TABLE public.venue_enrichment_jobs IS
  'Server-only, retryable queue for automated evidence-backed venue enrichment.';

-- The cron job is enabled only after the Edge Function and Vercel endpoint are deployed.
