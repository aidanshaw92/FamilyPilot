# Google Places: an exact spending cap across instances (opt-in)

Nothing here changes behaviour until the variables below are set in Vercel **and** the migration is applied. With none of them set, the code behaves as before.

## What was wrong
The daily limit was counted per process and refreshed from the shared ledger at most once a minute. Several serverless instances could each read "40 of 50" and each spend ten more; a failed ledger read, or a missing database client, left each instance counting alone; and a mistyped value such as `fifty` quietly became the default of 2000. `GOOGLE_PLACES_MAX_CALLS_PER_DAY` is also **per scope** (details, discovery, refresh, photos, ...), not a total.

## What this adds
| Change | Switch | Default |
|---|---|---|
| A cap that is set but unusable (`fifty`, `-5`) closes the gate instead of reverting to 2000 | none | on |
| Ceiling per scope per day | `GOOGLE_PLACES_MAX_CALLS_PER_DAY` (existing) | 2000 |
| Ceiling across **all** scopes per day | `GOOGLE_PLACES_MAX_TOTAL_PER_DAY` | unset |
| Ceiling across all scopes per **UTC calendar month** | `GOOGLE_PLACES_MAX_TOTAL_PER_MONTH` (atomic mode only) | unset |
| **Atomic reservation**: each billable call reserves its units in Postgres, in one transaction, before it is allowed | `GOOGLE_PLACES_ATOMIC_CAP=true` | off |
| Refuse paid calls unless the shared ledger was read in the last 5 minutes (non-atomic mode only) | `GOOGLE_PLACES_REQUIRE_LEDGER=true` | off |

`public.reserve_google_places_usage()` takes a transaction-scoped advisory lock on (month, environment), reads the scope, day and month figures, refuses if the request would cross any ceiling, and otherwise increments, all in one transaction. Two callers cannot both see room for the last unit. A refusal writes nothing. Units are reserved *before* the provider call, so a call that then fails at Google stays counted: the ledger over-counts, never under-counts.

## Every paid request goes through it
Verified by reading all server-side code and enforced by `src/__tests__/google-paid-call-sites.test.ts`, which fails if any file that uses a Google host or the `X-Goog-Api-Key` header does not call `reservePlacesCall`:

| Paid path | Where it reserves |
|---|---|
| Nearby Search, Place Details (search, venue detail, enrichment, backfill, the reachability probe) | `googleRequest()` in `server/places/lib/google-places.js`, the one function that reaches `places.googleapis.com` |
| Photo reference lookup and photo media | `api/places/photo.js`, two reservations, each before its `fetch` |
| Geocoding (town-name lookup) | `api/planning/location.js`, before the `maps.googleapis.com` request |
| Routes matrix (off unless `GOOGLE_ROUTES_*` is enabled) | `journey-provider.js`, before `route-matrix.js`; that file's only importer |
| Edge workers (`enrichment-worker`, `area-sync-worker`) | They contain no Google URL or key; they call the app's own endpoints, which reserve |
| `scripts/audit-google-quality.mjs` (operator script) | Uses the synchronous gate, which **refuses** when atomic mode is on |

In atomic mode the old synchronous `assertPlacesAllowed` refuses, so a call site added later and not migrated cannot spend outside the cap. Two things this cannot cover: someone using the API key outside this codebase, and a leaked key. See "Second layer" below.

## Database failure always fails closed
In atomic mode a call is **refused**, never counted locally, when the database returns an error, throws, returns an unreadable answer, has no configured client, does not answer within 3 seconds, or the function does not exist yet. Callers already turn that refusal into stored data where they have it (venue pages up to 30 days old) and a visible error where they do not. It recovers on its own when the database answers again. Tests: `google-cap-atomic.test.ts` (error, throw, unreadable, no client, hang, recovery).

## Safe order of activation
| Step | State | If you stop here |
|---|---|---|
| 1. Merge this PR | Code deployed, flag off, function absent | Behaves exactly as today |
| 2. Apply the migration | Function exists, unused | Behaves exactly as today |
| 3. Set the variables, redeploy | Atomic gate live | Capped |

Setting the flag **before** step 2 is also safe, only unhelpful: every paid request is refused (fail closed) until the function exists, and venue pages serve stored data. The migration is idempotent (`create or replace`) and cannot lose data. **Undo:** remove `GOOGLE_PLACES_ATOMIC_CAP`, redeploy; nothing else needs reverting.

After step 3, one venue page that needs a refresh must raise `google_places_usage` by exactly 1 and `/api/places/status` must show `atomicCap: true` and the three ceilings.

## Proof of atomicity
`supabase/checks/places_atomic_reserve_concurrency.sh` opens up to 60 separate database connections at once. Three runs against PostgreSQL 16 each gave:

| Race | Allowed |
|---|---|
| 200 callers, 4 scopes, scope cap 30, daily total 50 | exactly 50 (no scope above 30) |
| 100 callers, one scope, cap 50 | exactly 50 |
| 20 callers x 25 units, cap 100 | exactly 4 |
| 100 callers, 30 already used earlier this month, month cap 80 | exactly 50 |
| *Control:* read-then-write in two statements, cap 50 | 68 to 76 |

CI runs the script and `places_atomic_reserve_check.sql` (not executable by `anon` or `authenticated`; pinned `search_path`; every ceiling applied; a refusal writes nothing).

## Proposed configuration and the monthly budget
| Variable | Value |
|---|---|
| `GOOGLE_PLACES_ATOMIC_CAP` | `true` |
| `GOOGLE_PLACES_MAX_CALLS_PER_DAY` | `50` (per scope) |
| `GOOGLE_PLACES_MAX_TOTAL_PER_DAY` | `60` |
| `GOOGLE_PLACES_MAX_TOTAL_PER_MONTH` | `900` |
| `GOOGLE_PLACES_PHOTOS_ENABLED` | `false` (owner is setting this) |

**Hard ceiling: 900 billable units a month, whatever the traffic.** 60 a day alone would allow 1,860 in a 31-day month; the monthly ceiling is what fixes the budget, so the daily figure only limits how fast it can be spent.

What each unit can cost, from our own field masks and [Google's price list](https://developers.google.com/maps/billing-and-pricing/pricing) (first tier, USD per 1,000):
- Nearby Search requests contact and opening-hours fields: **Enterprise, $35**.
- Place Details also requests `editorialSummary`: **Enterprise + Atmosphere, $25** (listed at $20 without Atmosphere, so $25 is the conservative reading).
- Photos $7 (switched off). Geocoding and Routes are off or rare.

Worst case, if all 900 units were Nearby Search: 900 x $35 / 1,000 = **$31.50 a month before any free allowance**. Each of these SKUs carries a monthly free allowance in the price list (1,000 for Enterprise SKUs), which would put 900 units a month at $0 if they fall inside one SKU's allowance; that depends on your billing account, so treat $31.50 as the budget and $0 as the likely outcome. Google bills in Pacific time and the ceiling counts UTC months, so month boundaries differ by hours; at this volume that is immaterial.

Fit with real use: the last 8 ledger days (excluding photos) averaged about 17 billable calls a day, about 520 a month, peaking at 34 on an area-sync day. 900 leaves about 1.7x headroom. If the cap is reached the app serves stored data (up to 30 days old) and discovery and refresh pause until the next month; the failure is stale pages, not a bill.

**Photos must stay off.** They are counted in the same totals; the 12 to 339 a day seen in the ledger would exhaust the monthly ceiling within days.

## Second layer, outside our code (owner action in Google Cloud)
Our cap protects against our own code. A leaked key, or any other use of it, is not covered. In Google Cloud: restrict the key to the Places API (New) and to the Vercel egress/referrers you use, set a daily request quota on that API, and add a Billing budget alert at about $15 and $30 so an overrun reaches you by email. These are independent of this PR and are the real hard stop for money.

## Cost of the mechanism
One database round trip (milliseconds) per billable Google call; cached and stored responses never reach it. The reservation replaces the fire-and-forget counter write, so database writes do not increase.
