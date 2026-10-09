# Google spend: photos off, Place Details kept on (for now), a daily cap

9 October 2026.

## Photos
**Status: NOT yet switched off.** The ledger shows 44 `place_photos` calls at 06:27 UTC today. Nothing is claimed until the canary passes after your redeploy:

`live-canaries` workflow, run on `main` with: `base_url` = the production address (default), `run_nearby_food` = false, `run_routes` = false, `assert_fail_closed` = **true**, `posture_profile` = **production**, `expect_off` = **photos**, `verify_client_config` = true. It makes no provider request. I also read `google_places_usage` for the following day: zero photo rows is supporting evidence, never proof.

## Place Details: tested before deciding; I recommend leaving it on
With `GOOGLE_PLACES_DETAILS_ENABLED=false`, a venue page behaves like this (tested against the real handler with a fetch tripwire, `places-detail-details-off.test.ts`, 4 cases; Google is never asked in any of them):

| Stored copy of the venue is | The page |
|---|---|
| under 7 days old | served from the store, no refresh needed |
| 7 to 30 days old | **still served from the store**, response marked "not refreshed" |
| over 30 days old (the limit Google lets us cache) | **a visible error** ("Live venue details are unavailable"); the app shows its "couldn't load, try again" screen. Not served, not refreshed |
| none | the same visible error |

Production today (149 Google venues): 133 under 7 days, 14 between 7 and 30, 2 over 30. Of the ten pilot venues nine were refreshed this morning by a Home search; **the Natural History Museum's copy is 28 days old and passes 30 on the morning of 11 October.** A Home search refreshes a copy only if that venue appears in the results, which NHM's did not this morning. So with Details off, **NHM's page would show an error from 11 October unless a search happens to refresh it.** That breaks the product for a pilot venue, so **I do not recommend switching Details off now.**

**Instead, for predictable spending:** keep Details on and set `GOOGLE_PLACES_MAX_CALLS_PER_DAY` = `300` (default 2000, all paid scopes together). Current use is about 10 to 30 billable calls a day (searches plus a Details when a stale venue is opened), so 300 leaves room for ten families and caps the worst case. When the cap is reached the app already falls back to stored data and says so. Your trial criterion "no new Place Details calls" then becomes "no more than a handful a day, none from anything but a parent opening a venue", which the daily ledger shows exactly. If you want zero Details, the safe order is: first make sure a refresh path exists that costs nothing (a Home search that includes NHM), then turn it off; I would not do it before 11 October.
