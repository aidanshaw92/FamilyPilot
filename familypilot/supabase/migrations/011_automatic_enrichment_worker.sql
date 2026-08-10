-- FamilyPilot — hands-off, server-only enrichment queue.

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
  dispatch_token UUID,
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
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT j.id FROM public.venue_enrichment_jobs j
    WHERE ((j.status = 'pending' AND j.available_at <= now())
      OR (j.status = 'processing' AND j.locked_at < now() - interval '10 minutes'))
      AND j.attempts < 5
    ORDER BY j.available_at, j.created_at
    FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE public.venue_enrichment_jobs j
  SET status='processing', attempts=j.attempts+1, locked_at=now(),
      dispatch_token=gen_random_uuid(), updated_at=now(), last_error=NULL
  FROM candidate WHERE j.id=candidate.id RETURNING j.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_venue_enrichment_dispatch(
  p_job_id UUID, p_dispatch_token UUID, p_familypilot_place_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE consumed BOOLEAN;
BEGIN
  UPDATE public.venue_enrichment_jobs
  SET dispatch_token=NULL, updated_at=now()
  WHERE id=p_job_id AND dispatch_token=p_dispatch_token
    AND familypilot_place_id=p_familypilot_place_id
    AND status='processing' AND locked_at > now() - interval '10 minutes';
  GET DIAGNOSTICS consumed = ROW_COUNT;
  RETURN consumed;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_venue_enrichment_job(p_job_id UUID)
RETURNS VOID LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$
  UPDATE public.venue_enrichment_jobs
  SET status='completed', completed_at=now(), locked_at=NULL,
      dispatch_token=NULL, updated_at=now(), last_error=NULL
  WHERE id=p_job_id AND status='processing';
$$;

CREATE OR REPLACE FUNCTION public.fail_venue_enrichment_job(p_job_id UUID, p_error TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE n INTEGER;
BEGIN
  SELECT attempts INTO n FROM public.venue_enrichment_jobs WHERE id=p_job_id FOR UPDATE;
  UPDATE public.venue_enrichment_jobs
  SET status=CASE WHEN n>=5 THEN 'failed' ELSE 'pending' END,
      available_at=CASE WHEN n>=5 THEN available_at
        ELSE now()+make_interval(mins=>LEAST(60,(2^n)::INTEGER)) END,
      locked_at=NULL, dispatch_token=NULL, updated_at=now(),
      last_error=left(COALESCE(p_error,'Unknown worker error'),2000)
  WHERE id=p_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_venue_enrichment_job() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_venue_enrichment_dispatch(UUID,UUID,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_venue_enrichment_job(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_venue_enrichment_job(UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_venue_enrichment_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_venue_enrichment_dispatch(UUID,UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_venue_enrichment_job(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_venue_enrichment_job(UUID,TEXT) TO service_role;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.worker_secrets (
  name TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.worker_secrets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_enrichment_worker_schedule(p_secret TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.worker_secrets
    WHERE name='enrichment_worker_schedule'
      AND secret_hash=encode(extensions.digest(p_secret,'sha256'),'hex')
  );
$$;
REVOKE ALL ON FUNCTION public.verify_enrichment_worker_schedule(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_enrichment_worker_schedule(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_new_place_for_enrichment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.venue_enrichment_jobs(familypilot_place_id,mode)
  VALUES(NEW.familypilot_place_id,'generate')
  ON CONFLICT(familypilot_place_id) DO UPDATE
  SET mode='generate',
      status=CASE WHEN venue_enrichment_jobs.status='processing' THEN 'processing' ELSE 'pending' END,
      attempts=CASE WHEN venue_enrichment_jobs.status='processing' THEN venue_enrichment_jobs.attempts ELSE 0 END,
      available_at=CASE WHEN venue_enrichment_jobs.status='processing' THEN venue_enrichment_jobs.available_at ELSE now() END,
      updated_at=now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_new_place_for_enrichment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enqueue_new_place_for_enrichment ON public.place_records;
CREATE TRIGGER trg_enqueue_new_place_for_enrichment
AFTER INSERT ON public.place_records FOR EACH ROW
EXECUTE FUNCTION public.enqueue_new_place_for_enrichment();

INSERT INTO public.venue_enrichment_jobs(familypilot_place_id,mode)
SELECT DISTINCT familypilot_place_id,'regenerate'
FROM public.venue_enrichment_drafts WHERE status='pending_review'
ON CONFLICT(familypilot_place_id) DO UPDATE
SET mode='regenerate',status='pending',attempts=0,available_at=now(),
    locked_at=NULL,dispatch_token=NULL,completed_at=NULL,last_error=NULL,updated_at=now();

DO $$
DECLARE schedule_secret TEXT := gen_random_uuid()::TEXT;
BEGIN
  INSERT INTO private.worker_secrets(name,secret_hash)
  VALUES('enrichment_worker_schedule',encode(extensions.digest(schedule_secret,'sha256'),'hex'))
  ON CONFLICT(name) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='familypilot_worker_schedule_secret') THEN
    PERFORM vault.create_secret(schedule_secret,'familypilot_worker_schedule_secret');
  END IF;
END $$;

SELECT vault.create_secret(
  'https://uuolfuebwimrsjfgffsm.supabase.co',
  'familypilot_project_url'
) WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='familypilot_project_url');

COMMENT ON TABLE public.venue_enrichment_jobs IS
  'Server-only retry queue. Generated drafts remain pending review and unpublished.';
