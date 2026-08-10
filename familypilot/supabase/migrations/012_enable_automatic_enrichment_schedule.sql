-- Enable the Vault-authenticated FamilyPilot enrichment worker once per minute.
-- The worker claims at most one job per run and leaves every result pending review.

SELECT cron.schedule(
  'familypilot-automatic-enrichment',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'familypilot_project_url'
    ) || '/functions/v1/enrichment-worker',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-worker-schedule-secret', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'familypilot_worker_schedule_secret'
      )
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'scheduled_at', now()),
    timeout_milliseconds := 60000
  );
  $cron$
);
