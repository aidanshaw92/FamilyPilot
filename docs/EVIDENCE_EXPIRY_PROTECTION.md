# Evidence expiry: what lapses, when, and what protects it

2026-10-08. Read-only investigation of production. Nothing was written, fetched or sent to Google.

The full claim-by-claim inventory is `docs/data/served-claims-2026-10-08.csv`: 248 rows, with source date, expiry, last
job, requeue date and recovery route for each claim.

## 1. The answer

**The scheduled refresh has not stopped.** It is idle because nothing is due yet. Unless something fails, it will
re-read every venue holding the 185 claims that lapse on 31 October **7 to 10 days before they lapse**.

**No fact is extended without a fresh reading.** A claim is renewed only when a new reading of its own source page still
states it. A page that can't be read gives a claim at most 14 days of *earned grace*: shown as "last confirmed", and
never able to satisfy or breach a requirement. After that it lapses.

The earlier report said "no jobs since 5 October". That was wrong in two ways:

- Jobs ran on 7 October: 102 `reextract` and 42 `refetch_official`.
- The pg_cron jobs that drive refresh have run on schedule every hour and every minute, every day:
  - `familypilot-venue-freshness`, hourly;
  - `familypilot-automatic-enrichment`, every minute.

What *is* true is that the 185 claims all come from pages read on 1 October. The 7 October `reextract` deliberately
re-used those readings, so it couldn't move their dates.

## 2. Inventory (served claims as of 8 October)

All 248 served claims are `source_evidence_auto_v2` claims, except 3 editor claims.

| Expires | Claims | Venues | Source read | Venue requeued by the scheduler | Days of margin |
| --- | ---: | ---: | --- | --- | ---: |
| 20 Oct | 1 | 1 | 20 Sep | 13 Oct | 7 |
| 26–29 Oct | 16 | 7 | 26–29 Sep | 16–22 Oct | 7–10 |
| **31 Oct** | **185** | **59** | **1 Oct** | **22 Oct** (57 venues), 16 Oct (2) | **9** |
| 1–6 Nov | 34 | 13 | 2–7 Oct | 22–24 Oct | 10–15 |
| 9 Nov | 3 | 1 | 11 Aug (editor) | none: no page to re-read | needs a person |
| 30–31 Dec | 9 | 9 | 1–2 Oct | 22 Oct | 69–70 |

- **The 134 London destinations hold 207 of these claims, across 68 venues.** 146 of those claims, at 49 venues, are the
  31 October cliff.
- **Fields:** cafe 31, playground 30, accessible toilet 29, parking 28, toilets 27, baby changing 21, free parking 10,
  wheelchair 10, environment 10, pushchair 9, other 2.
- **Every claim has a known website and a source page that was read successfully:** 231 `ok` and 14 `fetched_truncated`.
  Recovery is therefore possible for all 245 page-backed claims.
- **The 3 editor claims are Headstone Manor** (energy level, environment, terrain). They were entered by a person and
  have no page to re-read. They lapse on 9 November unless someone re-checks them.

## 3. How the scheduler protects them (read from production, 8 October)

`refresh_venue_data()` runs at :17 every hour while `private.venue_data_settings.refresh_enabled` is true, which it is.

**What it queues.** Once a day it queues up to **50 venues** whose last job is more than 14 days old, or that hold a
claim expiring within 7 days. They are queued as mode `regenerate`, oldest first.

**What a job does.** The every-minute worker takes one job at a time and calls `/api/enrichment?action=automation-run`.
That re-reads the venue's own website (`sourceOnly`, so no AI model) and auto-approves what the fresh reading states.

**How a claim gets renewed.** A new reading of the same page produces a claim with the new reading date, which
supersedes the old one (`isSameClaim` compares the date). So the date moves only when the page was read again and still
says it.

**The timetable this gives** (simulated from the job and claim tables):

| Date | Venues queued |
| --- | --- |
| 13 Oct | 1 |
| 16 Oct | 2 |
| 19–20 Oct | 5 |
| 22 Oct | 50 |
| 23 Oct | 50 |
| 24 Oct | the rest |

The 50-a-day cap is the reason for the three-day spread. The last venue holding a 31 October claim is read on
24 October at the latest, 7 days before its claims lapse.

**What can still make a claim lapse:**

| Cause | What happens | Shown to parents |
| --- | --- | --- |
| The page no longer states the fact | not renewed; disputed if a complete reading contradicts it | it disappears, which is correct |
| The site times out or blocks us on the day | earned grace: 14 days past expiry | "last confirmed 1 Oct", demoted |
| The site is gone (404) or not HTML | lapses on its date | "not confirmed" |
| The scheduler is switched off or the worker fails | lapses on its date | "not confirmed" |

## 4. Cost, and the one decision for you

**The cost.** A `regenerate` run asks Google for Place Details when the stored Google record is 14 days old or more.
Records are re-touched by the twice-weekly area sync and by parents opening venues, so most will be younger than that.

- **Worst case for the 79 venues holding claims:** 73 Place Details calls, about $1.50 at the Pro list price. That's
  within the 2,000-a-day application cap.
- **Expected:** far fewer.

This spend is existing, previously approved behaviour, not something new. But it is a Google call made automatically.

**Option A: leave it as it is (recommended unless you want zero Google).** Nothing to approve. The protection in §3
happens on its own.

**Option B: refresh without Google (needs your approval; a production function change).**
`docs/sql/replenish_without_google.sql` changes one thing: venues with a stored website are queued as
`refetch_official` instead of `regenerate`.

- Same website re-read, same renewal, and Google never asked, because that mode has no Google call in it at all.
- Venues without a stored website keep `regenerate`.
- Pre-check, verify and rollback queries are in the file.

Either way, apply it before **13 October**, when the first venue is queued.

## 5. What the stored-page window means now

`reextract` (no network) can apply new rules only to readings 14 days old or less. So the **1 October readings stop
being usable on 15 October**, and the 26–27 September readings sooner.

This is no longer critical. The scheduled refetch on 22–24 October takes fresh readings and applies whatever rules are
deployed by then, including #176's parking fix and #177's pilot rules.

A `reextract` before 15 October only brings those corrections forward by about a week:

- the two parking corrections;
- the Sydenham Hill Wood toilet withdrawal;
- the 20 recovered facts.

Its commands are in `PRODUCTION_RECOVERY_PLAN.md`.

## 6. Watching it (read-only queries; I can run them for you each morning)

```sql
-- Served claims, and how many lapse within 7 days.
select count(*) filter (where valid_until >= current_date) as served,
       count(*) filter (where valid_until between current_date and current_date + 7) as lapsing_within_7_days
from venue_claims where status='active' and approved_by <> 'ai_auto_approved';

-- What the scheduler did yesterday, and how it ended.
select mode, status, count(*), max(last_error) as an_error from venue_enrichment_jobs
where updated_at > now() - interval '1 day' group by 1,2;

-- Claims renewed yesterday (a new reading superseded an older claim).
select count(*) from venue_claims where status='active' and supersedes_claim_id is not null
  and created_at > now() - interval '1 day';

-- Google calls by scope.
select usage_day, scope, sum(calls) from google_places_usage where usage_day >= current_date - 1 group by 1,2;
```

**Expected readings:**

- **22–24 October:** about 50 jobs a day completed, and served claims holding near 248.
- **Afterwards:** the 31 October row of the inventory gone, replaced by dates around 21–23 November.

**If served claims fall** by more than the venues that truly changed, look at `last_error` first. Blocked and timeout
failures are the transient kind, so those claims show as stale instead of vanishing.

## 7. Rollback, if a refresh writes something wrong

**Nothing is deleted.** A renewed or changed claim supersedes the old row (`status = 'superseded'`,
`supersedes_claim_id` on the new one).

**To put one venue/field back as it was:** mark the new row `disputed`, then set the superseded row it points at back
to `active`, in one transaction. It's the same pattern as the staged parking SQL in `PARKING_MISREADS.md`. I will not run
it without your go.

## Appendix: the replenisher as it runs in production

The function body is recorded verbatim at the top of `docs/sql/replenish_without_google.sql`, with exactly two
differences, both listed under ROLLBACK in that file:

1. `candidates` selects `has_site`.
2. The insert picks the mode from it.
