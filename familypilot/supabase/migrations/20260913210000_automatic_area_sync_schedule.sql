-- Schedule the area-sync-worker (deployed alongside this migration) to run once a
-- day. It discovers new venues across a grid of Greater London areas via the
-- existing /api/enrichment?action=sync endpoint; every discovered place_records
-- row is then picked up automatically by the existing per-minute enrichment-worker
-- (011/012) for drafting and evidence-gated auto-approval. This is the last piece
-- needed to remove manual curl/browser-console calls from the workflow entirely.

SELECT cron.schedule(
  'familypilot-automatic-area-sync',
  '0 3 * * *',
  $cron$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'familypilot_project_url'
    ) || '/functions/v1/area-sync-worker',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-worker-schedule-secret', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'familypilot_worker_schedule_secret'
      )
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'scheduled_at', now()),
    timeout_milliseconds := 120000
  );
  $cron$
);
