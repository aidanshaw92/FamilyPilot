# Venue data and post-visit feedback

Updated 10 September 2026. Changes extend PR #67 and do not mean the production app has been deployed.

## What is implemented

- Routine worker requests now use deterministic extraction of explicit official website facts. They do not need an OpenAI call. Manual AI draft generation remains available to editors, but AI output is never sufficient for automatic publication.
- Publication re-extracts fetched page text and requires a recent official source, its URL, an excerpt and a supported field value. Missing information stays unknown. A conflicting field is withheld while unrelated supported fields can publish.
- Cached text is re-extracted under current rules. Scheduled/report-driven regeneration fetches pages again instead of just recycling cached facts.
- Facility/accessibility/buggy/SEND claims have a 30-day lifetime; other reviewed claims 90 days. Legacy claims with no recorded expiry get an effective lifetime from the same rule. Old `ai_auto_approved` claims are excluded from consumer responses because those rules accepted model confidence without proof.
- Reaching that lifetime is not an immediate cliff. See **Claim freshness lifecycle** below: a claim whose own source could not be re-read for a transient reason is retained, demoted, for at most 14 further days.
- If a successfully re-fetched page no longer supports an automatically published fact, the claim is disputed and withdrawn. That is a successful evidence evaluation, not a refresh failure, so it never earns the claim extra life. Failed fetches do not prove absence.
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

## Claim freshness lifecycle

A trusted claim is in exactly one of four states, derived at read time from its own `valid_until`
and the outcome of the last attempt to re-read **the source page backing that claim**. No state is
stored, so nothing can drift out of step with the clock.

| State | When | Consumer-visible | Satisfies a hard requirement | Can exclude a venue |
|---|---|---|---|---|
| `fresh` | more than 7 days before `valid_until` | yes | yes | yes |
| `refresh_due` | within 7 days of `valid_until` | yes | yes | yes |
| `stale` | past `valid_until`, at most 14 days, grace earned | display only | **no** | **no** |
| `expired` | past the 14-day grace, or grace not earned | no | no | no |

**Refresh starts 7 days before expiry.** The hourly maintenance function queues a venue whose
soonest active claim expires within 7 days, and separately re-enriches venues untouched for more
than 14 days. One persistent job row per venue means a venue with eight claims expiring the same
day still gets one job.

**Grace lasts at most 14 days and has to be earned.** It applies only when the page backing that
specific claim was re-read around expiry and failed for a transient reason — a timeout, bot
mitigation, a 429 or 5xx, or a request that got no response. A 404, a page that is not HTML, a
page too large to read, a source no longer trustworthy, a permanently closed venue or an
unresolvable provider identity are all permanent, and earn nothing.

**Grace is per source, never per venue.** One refresh routinely succeeds on some pages and fails on
others while still completing, so job completion says nothing about whether a given claim was
re-read. A timeout on `/family-visits` can protect the baby-changing claim without touching the
parking claim backed by `/accessibility`.

**Contradiction is never granted grace.** Evidence that has been successfully re-read and no longer
supports a fact disputes the claim, and a disputed claim is not in the active set at all, so it
cannot be classified stale.

**A stale claim is display-only and unscored.** It never reaches `MatchableVenueFacts`, so it
cannot satisfy a required facility, cannot rule a venue out, and earns no Family Match score. A
family who needs baby changing is told it is not confirmed, not that it is available.

**Stale facts reach a parent through one route only.** `/api/places/detail` returns a `staleFacts`
array as a sibling of `metadata` — never a field inside it — carrying `fieldKey`, `value`,
`lastConfirmed`, `graceUntil` and `recheckPending`. Search responses carry none. A surface that
knows nothing about freshness reads the metadata field as absent and resolves it to unknown, with
no cooperation required from that surface.

**`getActiveClaims()` keeps its original meaning** — usable, unexpired trusted claims. Freshness is
additive, via `listClaimsWithFreshness()`, whose `trusted` set is exactly what `getActiveClaims()`
already returned.

## Production activation — installed and enabled

`docs/sql/activate_venue_refresh.sql` supersedes the original version, which was never applied. The
original contained an immediate hard expiry:

```sql
update public.venue_claims set status='expired' where status='active' and valid_until<current_date;
```

That statement is **removed**. It was redundant, because expiry is already enforced when claims are
read, and destructive, because a claim stamped `expired` can never be reinstated and the grace
window can never be evaluated. Claim expiry is a read-time derivation and no scheduled job mutates
a claim's status to reflect it.

The installed script:

1. Creates the private refresh configuration and the hourly maintenance schedule.
2. Assigns expiry to legacy undated claims, using the same 30/90-day rule as the application, and
   disputes old confidence-only automatic approvals.
3. Queues at most 50 periodic venue rechecks per day with `mode='regenerate'`, either after 14 days
   or ahead of claim expiry. This cap excludes new-place discovery and explicit parent-report
   rechecks.
4. Recovers worker leases exhausted after five attempts; existing retry/backoff handles ordinary
   failures.

Retention of old visit reports is deliberately **not** part of this script; it is unrelated policy
and belongs in its own reviewed change.

Do not rerun the creation script after successful installation without checking object state.
Disabling refresh does not erase existing reports or claims.

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
4. Verify the deployed feedback endpoint and a controlled two-account flow. The activation script has since been reviewed, installed and enabled; see **Production activation** above. Native/browser end-to-end verification has not been performed in this update.
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

Periodic maintenance is enabled. The kill switch stops it without touching data:

```sql
update private.venue_data_settings set refresh_enabled=false where id=true;
```

This stops this maintenance function, not the pre-existing discovery/report worker. Diagnose and resolve the underlying issue before re-enabling it.

## Validation and practical limits

320 automated tests passed across 32 suites; shipped app type checking and the 47-route web export passed. Tests cover unsupported/model-invented facts, stale/future sources, contradictory evidence, withdrawal after source changes, field expiry, attendance/date validation, reminder timing, report conflicts, repeated accounts and source rechecks.

No automated system can guarantee a facility is available at arrival. Website statements can be incomplete, closures can be temporary, and reports can be mistaken. Keep exact sources, dates and uncertainty visible. Provider terms, geographical source scope, opening windows, venue coverage, wider accessibility requirements, provider monitoring and a real-parent pilot remain launch work described in `FAMILY_PLANNING_BUILD.md`.
