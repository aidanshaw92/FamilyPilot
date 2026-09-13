-- Venue discovery doesn't change enough day to day to justify a daily Google
-- Places spend. Re-schedule area-sync-worker to twice a week (Monday and
-- Thursday, 03:00 UTC) instead of daily.

SELECT cron.schedule(
  'familypilot-automatic-area-sync',
  '0 3 * * 1,4',
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
