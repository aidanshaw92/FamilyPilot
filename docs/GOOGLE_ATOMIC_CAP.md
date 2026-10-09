# Google Places: an exact daily cap across instances (opt-in)

Nothing here changes behaviour until the variables below are set in Vercel **and** the migration is applied. With none of them set, the code behaves as before.

## What was wrong
The daily limit was counted per process and refreshed from the shared ledger at most once a minute. Several serverless instances could each read "40 of 50" and each spend ten more; a failed ledger read, or a missing database client, left each instance counting alone; and a mistyped value such as `fifty` quietly became the default of 2000. `GOOGLE_PLACES_MAX_CALLS_PER_DAY` is also **per scope** (details, discovery, refresh, photos, ...), not a total.

## What this adds
| Change | Switch | Default |
|---|---|---|
| A cap that is set but unusable (`fifty`, `-5`) closes the gate instead of reverting to 2000 | none | on |
| A ceiling across **all** scopes together | `GOOGLE_PLACES_MAX_TOTAL_PER_DAY` | unset (no total) |
| Refuse paid calls unless the shared ledger was read in the last 5 minutes | `GOOGLE_PLACES_REQUIRE_LEDGER=true` | off |
| **Atomic reservation**: each billable call reserves its units in Postgres, in one transaction, before it is allowed | `GOOGLE_PLACES_ATOMIC_CAP=true` | off |

Atomic mode is the one that is exact. `public.reserve_google_places_usage()` takes a transaction-scoped advisory lock on (day, environment), reads the per-scope and total figures, refuses if the request would cross a ceiling, and otherwise increments, all in one statement. Two callers cannot both see room for the last unit. A refusal writes nothing. Units are reserved *before* the provider call, so a call that then fails at Google stays counted: the ledger over-counts, never under-counts.

## Database failure
In atomic mode the call is **refused**, never counted locally, when the database returns an error, throws, returns an unreadable answer, has no configured client, or does not answer within 3 seconds. Callers already turn that refusal into stored data where they have it (venue pages up to 30 days old) and a visible error where they do not. It recovers by itself when the database answers again. Tests: `src/__tests__/google-cap-atomic.test.ts`.

Every call site now uses `reservePlacesCall`. In atomic mode the old synchronous `assertPlacesAllowed` refuses, so a call site added later and not migrated cannot spend outside the cap.

## Proof of atomicity
`supabase/checks/places_atomic_reserve_concurrency.sh` opens up to 60 separate database connections at once and races for the last units. Run three times against PostgreSQL 16:

| Race | Allowed | Stored total |
|---|---|---|
| 200 callers, 4 scopes, per-scope cap 30, total cap 50 | exactly 50 (no scope above 30) | 50 |
| 100 callers, one scope, cap 50 | exactly 50 | 50 |
| 20 callers x 25 units, cap 100 | exactly 4 | 100 |
| *Control:* read-then-write in two statements, cap 50 | 74, 75, 76 | 74 to 76 |

The control is the old pattern and overshoots by roughly half. CI runs the script (see `.github/workflows/ci.yml`) plus `places_atomic_reserve_check.sql` (privileges: not executable by `anon` or `authenticated`; pinned `search_path`; ceilings applied; NULL means no ceiling).

## Cost implications
- **Ceiling, exact:** with `MAX_CALLS_PER_DAY=50` and `MAX_TOTAL_PER_DAY=60`, at most 60 billable units a day, 1,800 in a 30-day month, whatever the traffic or number of instances.
- **Today's use:** about 9 to 34 billable calls a day excluding photos (last 14 days of the ledger), so 60 leaves headroom but not much; a Monday/Thursday area sync day plus several stale-venue Place Details can approach it.
- **Worst-case money at Google's published first-tier rates** ([price list](https://developers.google.com/maps/billing-and-pricing/pricing)): Nearby Search Pro $32 per 1,000, Place Details Pro $17 and Enterprise $20 per 1,000, photos $7 per 1,000; each SKU also has a monthly free allowance (5,000 for Pro, 1,000 for Enterprise). 1,800 calls a month is therefore at most about $58 if every call were Nearby Search at full rate, and in practice $0 to about $30 after the free allowances. Confirm which SKU tier our field masks bill in Cloud Billing before relying on the lower figure.
- **Compared with now:** the current default is 2,000 *per scope* per day, i.e. a worst case of tens of thousands of calls a month per scope.
- **Added cost of the mechanism:** one database round trip (milliseconds) per billable Google call, not per page view. Cached and stored responses never reach it. The reservation replaces the fire-and-forget counter write, so database writes do not increase.
- **Availability cost of a tight cap:** when a cap is reached, discovery and refresh stop for the rest of the UTC day and venue pages fall back to stored data. A cap that is too low shows up as stale pages, not as a bill.

## Rollout (needs the owner's approval; nothing is applied by this PR)
1. Merge this PR (no behaviour change).
2. Apply `20261009120000_places_atomic_reserve.sql` to production.
3. Set `GOOGLE_PLACES_MAX_CALLS_PER_DAY=50`, `GOOGLE_PLACES_MAX_TOTAL_PER_DAY=60`, `GOOGLE_PLACES_ATOMIC_CAP=true` and redeploy.
4. Run the `live-canaries` posture check and read `/api/places/status` (it now reports `atomicCap`, `maxUnitsTotalPerDay`).
5. Undo: remove `GOOGLE_PLACES_ATOMIC_CAP` (and redeploy) to return to the old counting; the function can stay.
