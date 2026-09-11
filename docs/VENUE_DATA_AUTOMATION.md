# Venue data and post-visit feedback

Updated 10 September 2026. Changes extend PR #67 and do not mean the production app has been deployed.

## What is implemented

- Routine worker requests now use deterministic extraction of explicit official website facts. They do not need an OpenAI call. Manual AI draft generation remains available to editors, but AI output is never sufficient for automatic publication.
- Publication re-extracts fetched page text and requires a recent official source, its URL, an excerpt and a supported field value. Missing information stays unknown. A conflicting field is withheld while unrelated supported fields can publish.
- Cached text is re-extracted under current rules. Scheduled/report-driven regeneration fetches pages again instead of just recycling cached facts.
- Facility/accessibility/buggy/SEND claims expire after 30 days; other reviewed claims after 90 days. Legacy claims with no expiry also have an effective lifetime. Old `ai_auto_approved` claims are excluded from consumer responses because those rules accepted model confidence without proof.
- If a successfully re-fetched page no longer supports an automatically published fact, the claim is withdrawn. Failed fetches do not prove absence; normal expiry applies.
- Model-guessed age ranges and suggested visit lengths are not automatically published. Age suitability still needs explicit editorial review; this can reduce recommendation coverage, especially for babies. Do not loosen essential requirements to fill results.
- Home and Plans automatically ask about a saved outing one hour after its scheduled end, when the app is open or next opened. They do not infer attendance from a saved plan. Prompts expire after 30 days and can be skipped or snoozed for 24 hours.
- After confirming attendance, a parent answers up to three questions prioritised by unknown/disputed/old details. Options distinguish absence, temporary unavailability and “didn’t check.” Parents can also report a recent visit directly from venue details.
- Submitting requires an authenticated, non-anonymous account. Only venue ID, visit date and selected observations are submitted. No child details, routines, location trail, names, photos or free text are submitted.
- Reports are private server-side records. Public summaries include observation values, recency and counts of accounts, not identities. Repeat visits by one account count once. These are self-reported visits, not verified attendance or independent-family guarantees.
- A new conflicting report makes the affected field unknown for matching until a later source check resolves it or the report ages out. A report does not overwrite a source claim. Positive reports remain observations rather than manufacturing official verification.
- Reports trigger a rate-limited venue recheck through the existing worker. Exact request retries are idempotent. Limits: one changed report per minute, ten reports per account/day, one report per venue/account/date; rechecks of a completed venue are spaced by at least 24 hours.
- Parents can load and delete their reports from Families & routines. Summaries use the latest 90 days. Search responses are not cached at the CDN, so a new conflict is reflected on the next request; app queries are invalidated after submission.

## What is already applied

The additive `venue_visit_reports` table and `submit_venue_visit_report` RPC are applied to the existing Supabase project. RLS is enabled; anonymous and authenticated client roles have neither direct table privileges nor RPC execution privileges. The server validates the bearer token and binds every action to that user.

A rolled-back database test verified submission, idempotent retry, rate limiting, RLS and denied direct client access. No test account or report was retained. Security advisors report only informational “RLS enabled, no policies” on intentionally server-only tables with client grants revoked.

The existing enrichment worker's every-minute schedule was active when inspected, with 15 completed jobs. That is evidence of the existing queue state, not proof that the new application code is deployed.

## Production activation — pending

Automatic approval review rejected the original combined production migration because it changed existing claim statuses, installed recurring work and deleted reports older than 180 days. The additive schema was accepted separately. **The refresh/retention activation script has NOT been run.**

The exact remaining changes are saved in `docs/sql/activate_venue_refresh.sql`. Once approved and the new production API is confirmed deployed, this script:

1. Creates the private refresh configuration and the hourly maintenance schedule.
2. Assigns expiry to legacy undated claims; expires overdue claims and disputes old confidence-only automatic approvals.
3. Queues at most 50 periodic venue rechecks per day, normally after 14 days or ahead of claim expiry. This cap excludes new-place discovery and explicit parent-report rechecks.
4. Recovers worker leases exhausted after five attempts; existing retry/backoff handles ordinary failures.
5. Permanently deletes visit reports older than 180 days.
6. Enables maintenance and runs an initial pass.

Do not activate against the old production API, which still uses its old approval rules. Do not rerun the creation script after successful installation without checking object state. Disabling refresh does not erase existing reports or claims.

## Deployment and settings

Deployment packaging: shared Node helpers live under `server/`, outside Vercel's
`api/` function discovery directory. The ten HTTP entrypoints and their public
URLs remain in `api/`. `api-deployment.test.ts` checks the 12-function budget
and loads every entrypoint to catch broken helper imports. This addresses the
PR preview's Hobby function-limit failure; a successful hosted deployment still
needs verification before production activation.

1. Deploy PR #67 to the existing Vercel project. Its production worker endpoint is `https://family-pilot-seven.vercel.app/api/enrichment?action=automation-run`.
2. Preserve `SUPABASE_URL`, server-only `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SECRET_KEY`, and Google server credentials. Set `ENRICHMENT_AUTO_APPROVE=true` (v2 defaults on unless explicitly false). Never expose the service secret in an `EXPO_PUBLIC_*` variable.
3. Web/native builds need `EXPO_PUBLIC_SUPABASE_URL` and the publishable/anon key for parent sign-in. Native apps also need `EXPO_PUBLIC_PLANNING_API_URL` pointing to the deployed `/api/planning` endpoint.
4. Verify the deployed feedback endpoint and a controlled two-account flow. Then approve and run the activation script. Production deployment and native/browser end-to-end verification have not been performed in this update.
5. No outside-the-app push notification delivery is claimed. These are automatic in-app prompts; native push permissions, APNs/FCM credentials and scheduling remain a separate release feature.

## Operations

Check job counts, failures and the existing internal enrichment queue for exceptions. Never publish unknown facilities simply to clear an empty result. A missing official website, ambiguous source text, site access restrictions, age suitability and unresolved conflicts need editorial attention.

Read-only health queries:

```sql
select status, count(*) from public.venue_enrichment_jobs group by status;
select familypilot_place_id, attempts, last_error, updated_at
from public.venue_enrichment_jobs where status='failed' order by updated_at desc;
select jobname, schedule, active from cron.job
where jobname in ('familypilot-automatic-enrichment','familypilot-venue-freshness');
```

After activation, stop periodic maintenance with:

```sql
update private.venue_data_settings set refresh_enabled=false where id=true;
```

This stops this maintenance function, not the pre-existing discovery/report worker. Diagnose and resolve the underlying issue before re-enabling it.

## Validation and practical limits

320 automated tests passed across 32 suites; shipped app type checking and the 47-route web export passed. Tests cover unsupported/model-invented facts, stale/future sources, contradictory evidence, withdrawal after source changes, field expiry, attendance/date validation, reminder timing, report conflicts, repeated accounts and source rechecks.

No automated system can guarantee a facility is available at arrival. Website statements can be incomplete, closures can be temporary, and reports can be mistaken. Keep exact sources, dates and uncertainty visible. Provider terms, geographical source scope, opening windows, venue coverage, wider accessibility requirements, provider monitoring and a real-parent pilot remain launch work described in `FAMILY_PLANNING_BUILD.md`.
