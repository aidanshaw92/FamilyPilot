-- FamilyPilot — automatic enrichment queue
-- Background regeneration remains pending review and never publishes claims.

CREATE TABLE IF NOT EXISTS public.venue_enrichment_jobs (
  familypilot_place_id TEXT PRIMARY KEY REFERENCES public.place_records(familypilot_place_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'retry', 'completed', 'failed')),
  reason TEXT NOT NULL DEFAULT 'source_changed',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  last_draft_id UUID REFERENCES public.venue_enrichment_drafts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_enrichment_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.venue_enrichment_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_enrichment_jobs TO service_role;

CREATE INDEX IF NOT EXISTS idx_venue_enrichment_jobs_ready
  ON public.venue_enrichment_jobs (available_at, updated_at)
  WHERE status IN ('queued', 'retry');

CREATE OR REPLACE FUNCTION public.enqueue_venue_enrichment_job(
  p_familypilot_place_id TEXT,
  p_reason TEXT DEFAULT 'source_changed'
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  INSERT INTO public.venue_enrichment_jobs (
    familypilot_place_id, status, reason, attempts, available_at,
    locked_at, completed_at, last_error, updated_at
  )
  VALUES (
    p_familypilot_place_id, 'queued', p_reason, 0, now(),
    NULL, NULL, NULL, now()
  )
  ON CONFLICT (familypilot_place_id) DO UPDATE
  SET status = 'queued',
      reason = EXCLUDED.reason,
      attempts = 0,
      available_at = now(),
      locked_at = NULL,
      completed_at = NULL,
      last_error = NULL,
      updated_at = now();
$$;

REVOKE ALL ON FUNCTION public.enqueue_venue_enrichment_job(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_venue_enrichment_job(TEXT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_venue_enrichment_job()
RETURNS SETOF public.venue_enrichment_jobs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT familypilot_place_id
    FROM public.venue_enrichment_jobs
    WHERE (
      status IN ('queued', 'retry')
      AND available_at <= now()
    ) OR (
      status = 'processing'
      AND locked_at < now() - interval '10 minutes'
    )
    ORDER BY available_at, updated_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.venue_enrichment_jobs job
  SET status = 'processing',
      attempts = job.attempts + 1,
      locked_at = now(),
      updated_at = now()
  FROM candidate
  WHERE job.familypilot_place_id = candidate.familypilot_place_id
  RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_venue_enrichment_job()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_venue_enrichment_job()
  TO service_role;

CREATE OR REPLACE FUNCTION public.queue_place_record_enrichment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_venue_enrichment_job(
    NEW.familypilot_place_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'place_discovered' ELSE 'provider_refreshed' END
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_place_record_enrichment()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_queue_place_record_enrichment ON public.place_records;
CREATE TRIGGER trg_queue_place_record_enrichment
AFTER INSERT OR UPDATE OF external_id, name, category, address, description, website,
  phone, opening_hours, is_open, fetched_at, field_provenance
ON public.place_records
FOR EACH ROW EXECUTE FUNCTION public.queue_place_record_enrichment();

-- Queue every current unapproved venue once. Enriched/verified venues remain untouched.
INSERT INTO public.venue_enrichment_jobs (familypilot_place_id, status, reason)
SELECT pr.familypilot_place_id, 'queued', 'automation_backfill'
FROM public.place_records pr
LEFT JOIN public.venue_family_metadata vm
  ON vm.familypilot_place_id = pr.familypilot_place_id
WHERE COALESCE(vm.enrichment_status, 'provider_only') NOT IN ('enriched', 'verified')
ON CONFLICT (familypilot_place_id) DO UPDATE
SET status = 'queued',
    reason = 'automation_backfill',
    attempts = 0,
    available_at = now(),
    locked_at = NULL,
    completed_at = NULL,
    last_error = NULL,
    updated_at = now();

COMMENT ON TABLE public.venue_enrichment_jobs IS
  'Server-only queue for automatic evidence collection and pending AI draft regeneration.';
