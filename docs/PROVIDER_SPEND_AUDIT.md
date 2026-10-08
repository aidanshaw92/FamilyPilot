# Provider spend: current state, estimates and what needs your decision

Written 2026-10-07 after the unexpected Google charge (about £100). **Corrected 2026-10-08: one photograph is two Google
requests, the usage table counts requests, and the application cap is not a hard global cap; see
`GOOGLE_PHOTO_SPEND_VERIFICATION.md`, which supersedes the photograph figures below.** **I made no Google call, enqueued no job and changed no
setting or quota in producing this.** It builds on `GOOGLE_PLACES_COST_CONTROL.md`, which already describes the six call sites and
the budget guard; this is a verification of the current state plus estimates.

## 1. Verified from code on main

- Six places reach Google (Nearby Search, Place Details, Place Photos, Distance/Route Matrix, Geocoding, and a developer audit
  script). **All pass through `server/places/lib/places-budget.js`.** Re-checked: `route-matrix.js` has no guard of its own
  but is called only by the guarded `journey-provider.js`.
- No GitHub workflow runs on a schedule. The visual-regression workflow that ran on every PR uses a **local fixture** unless
  someone dispatches it with `production`; `live-canaries` and `nearby-food-canary` are manual only; `opening-hours-live-smoke`
  runs on PRs that touch `google-places.js` and stands down (a `NOT PROVEN` warning, no spend) unless the Preview environment
  explicitly allows one Place Details call; `transit-live-smoke` uses TfL. Opening a PR from the current work triggers none
  of the billable paths (PR #168's capture job used the fixture).
- Photos: the proxy sets a 10-minute browser and 1-hour CDN cache on success, `no-store` on errors. **Correction:** each
  uncached photograph is **two** billable requests (a Place Details lookup for the photo reference, then the media call),
  both counted under scope `photos`; the table below therefore counts requests, so 339 on 7 October is about 170 photographs.
- **Correction:** the application cap (per-instance window, per-instance read of a shared total at most once a minute,
  fire-and-forget recording) is a best-effort guard, not a global hard cap. Only a Google Cloud quota is.
- Defaults if nothing is set: 2,000 calls per scope per day, 60 per window, and **production is on by default**
  (`VERCEL_ENV=production`); Preview and development are off.

## 2. What production has actually spent (read-only `google_places_usage`)

| Day | Photos | Nearby Search | Place Details | Geocoding |
| --- | ---: | ---: | ---: | ---: |
| Oct 1 | 28 | 9 | 5 | 0 |
| Oct 3 | 98 | 9 | 0 | 0 |
| Oct 4 | 12 | 9 | 0 | 0 |
| Oct 5 | 116 | 25 | 9 | 0 |
| Oct 6 | 91 | 9 | 0 | 0 |
| Oct 7 (so far) | **339** | 27 | 0 | 2 |
| **Total** | **684 requests (about 340 photographs)** | **88** | **14** | **2** |

(Plus one Routes element in Preview on Oct 3.) These are production-environment rows, i.e. real traffic: your own testing and
anyone else opening the app. The sandbox cannot reach the production host, so none of it is mine.

**Estimated cost of that week from this table alone, at the list prices as I understand them: roughly $8 to $10 before free
allowances.** That cannot account for a charge of about £100, so **the table is a lower bound and the gap is unexplained**
(possible causes and the reconciliation steps are in `GOOGLE_PHOTO_SPEND_VERIFICATION.md` section 6). I have no access to
Google billing and prices change: treat this as an order of magnitude and read the SKU report. The detail and search field
masks include website, opening hours and `editorialSummary`; the highest field sets the SKU, so those calls are probably in a
higher tier than the figures I used. Google's
monthly free allowances may absorb some or most of it; do not rely on that.

## 3. Standing sources of automatic spend

| Source | Schedule | Spends on Google? | Notes |
| --- | --- | --- | --- |
| `familypilot-automatic-area-sync` (pg_cron) | Mon and Thu 03:00 | **yes, about 10 Nearby Search a run** | active; discovery of new places |
| `familypilot-automatic-enrichment` (pg_cron) | every minute | only for jobs whose mode needs Place Details (`generate`, `regenerate`) | `reextract` and `refetch_official` pass `googleAccess: disabled` and cannot spend |
| `familypilot-venue-freshness` (hourly, once a day effective) | queues up to 50 `regenerate` jobs per day for rows that are stale | **yes, one Place Details per job** | `refresh_enabled = true`, last run today. Ceiling about 50 x $0.02 = $1 a day, and it grows with the catalogue |
| Every Home/Explore view | on demand | photos (about 3 per card shown) and a cached search | the dominant, traffic-driven cost |

Job table: 102 `reextract` and 42 `refetch_official` jobs completed (no Google), 17 `generate` and 7 `regenerate`
completed (the 14 Place Details above).

## 4. What the beta would cost if nothing changes (corrected)

Photographs dominate and scale with use. About 420 distinct photographs are in the catalogue (about 140 venues x 3). Each
uncached photograph is two requests: a lookup (probably $5 to $17 per 1,000) and the media call (about $7 per 1,000).
Corrected exposure, **if the daily cap held exactly** (it does not):

| Use | Photographs / day | Requests / day | Cost per month |
| --- | ---: | ---: | ---: |
| today's pace | 100 to 350 | 200 to 700 | about $15 to $60 |
| 200 new photographs a day (proposed limit) | 200 | 400 | about $35 to $52 |
| the 2,000-request default, every day | 1,000 | 2,000 | about $300 to $630 (£235 to £490) |

Because the endpoint is public, accepts any place identifier and keys its cache on the whole query string, volume can be
driven by a caller and is bounded only by the leaky application cap unless a Google quota exists.

Nearby Search is bounded by the 6-hour search cache plus the Mon/Thu sync; Place Details by the daily 50-job ceiling. Both
probably sit in a higher SKU tier than first assumed; verify against the SKU report.

## 5. What I could not verify, and what only you can do

- **Vercel environment variables** (are `GOOGLE_PLACES_MAX_CALLS_PER_DAY=500` and `..._PER_WINDOW=30` set, which scope switches
  are on in Production and Preview): the Vercel integration available to me returns no teams, so production settings cannot be
  read. The usage table shows the production switch is ON.
- **Google Cloud quotas, budgets and alerts** (the only real cap, per the cost-control note) cannot be seen from here.
- Whether free allowances apply to this project.

## 6. Recommendations (all need your decision; I have changed nothing)

0. **Revised 2026-10-08:** switch new paid photograph calls off now and re-enable only after a Google-side daily quota is
   confirmed (`GOOGLE_PHOTO_SPEND_VERIFICATION.md` section 8 has the exact steps).
1. **Aim for £0 additional Google spend in the beta by switching photographs off or capping them**, because they are the only
   line that grows with the number of families. Options in order of cost-to-you: (a) set `GOOGLE_PLACES_PHOTOS_ENABLED=false`
   (a refused photograph is a failed image load, which `VenueImage` handles by falling back to its category artwork; I have not rendered that state in a browser with the flag off, so check it before relying on it); (b) cap it with a **Google Cloud quota** (the application variable counts requests and is not a hard cap), e.g. 200
   photographs a day (about $35 to $52 a month); (c) replace Google photos with owned or licensed imagery over time (the
   only permanent fix, and a content task).
2. Put the Google Cloud-side budget alert and a hard per-API quota (photos, Nearby Search, Place Details) in place; code
   controls can be changed by a commit, quotas cannot.
3. Consider pausing `familypilot-automatic-area-sync` until the catalogue expansion plan is approved (about £0.30 a run), and
   keeping `refresh_enabled` true only if the 50-a-day ceiling is acceptable.
4. Keep `GOOGLE_JOURNEYS_ENABLED` and the probe switch unset (they must be set by name to spend).
5. Catalogue expansion should use the open datasets in `CATALOGUE_COVERAGE_AUDIT.md`: **one-off cost £0, ongoing cost £0**,
   because it needs no Google call; any pilot would also pass through `reextract`/`refetch_official`, which cannot spend.

## 7. Estimates for the work proposed in this programme

| Item | One-off | Ongoing |
| --- | --- | --- |
| Stable Family Fit, defaults, Families action, pricing foundation (PRs A to D) | £0 (no provider call added; one forecast fetch per list removed) | £0 |
| Catalogue pilot from open datasets | £0 | £0 |
| Pricing extraction from stored pages | £0 | £0 |
| Today's production traffic | n/a | unreconciled (see section 2); photographs about $15 to $60 a month at today's pace; $300 to $630 if the default cap held exactly, higher if it does not |
