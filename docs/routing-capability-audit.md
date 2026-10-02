# What FamilyPilot can actually route today

Section 7 of the nearby-restaurants brief: inventory the existing travel-time capability before
adding anything. Everything below was read off the code and checked against production, not
inferred. Dated 2 October 2026, against `main` at `4c1f141`.

## The short answer

There is exactly **one** routing path, it is **driving only**, and it has **no cache**.

Two different numbers reach a parent, and they are not the same kind of thing:

| What the parent sees | Where the number comes from | Billable | Routed |
| --- | --- | --- | --- |
| "14 min away" on a venue card, saved row, restaurant card | Haversine straight line ÷ 40 km/h × 1.25 | No | **No** |
| A journey leg on the Plan screen | Google Distance Matrix, driving, `departure_time=now` | **Yes** | Yes, when the call succeeds |

The Plan screen is honest about the difference: `plan-view-model.ts` labels each leg `Measured` or
`Estimated from distance`, and surfaces a `travel-estimated` caveat plus a provenance note counting
how many legs are which. The journey matrix deliberately refuses to let a batch-level "live" label
contaminate a per-element estimate, and downgrades a live label when the plan is for another date,
because traffic measured now is not traffic on another day.

**The venue cards are not honest about it.** `DecisionCard`, `SavedPlaceRow` and `RestaurantCard`
all print a bare `{driveMinutes} min away`, and that number is always a straight-line estimate
(`mergePlaceToVenue` calls `estimateDriveMinutes`). Section 4 of the brief forbids exactly this:
"Do not label a straight-line estimate as a routed journey." This is a pre-existing defect, not
something the lunch work introduces, and it is the one thing in this audit I would fix before
adding any mode beyond driving — adding walking and public transport to a surface that already
presents estimates as measurements multiplies the problem by three.

## The one billable path, in detail

`api/context/journey.js` → `server/context/lib/journey-provider.js` → `getDriveTimes`.

- **Provider**: Google Distance Matrix (`maps.googleapis.com/maps/api/distancematrix/json`).
- **Mode**: `driving`, hard-coded. There is no mode parameter anywhere in the codebase.
- **Traffic**: `departure_time=now`, and `duration_in_traffic` is preferred over `duration`.
- **Billing unit**: per origin-destination **element**, not per request. `MAX_DESTINATIONS = 25`,
  so one HTTP call is up to 25 billable elements.
- **Gate**: `assertPlacesAllowed({ scope: 'journeys' })`, the same gate as Places, which counts,
  logs and persists the call before it is made.
- **Fallback**: on a missing key, a closed gate, a budget refusal, a non-200, or a non-OK element,
  the straight-line estimate is returned labelled `source: 'estimated'`. A closed gate degrades
  accuracy; it does not break the planner. `fallbackReason` distinguishes switched-off from broken.
- **Cache**: **none, at any layer.** The endpoint sets `Cache-Control: public, max-age=300`, but it
  is a POST, which browsers and CDNs do not cache, so that header is inert. There is no
  `place_search_cache` equivalent for journeys, no react-query wrapper, and no in-process
  memoisation. Every plan generation pays again.
- **Authentication**: none. It is a public unauthenticated POST endpoint that can spend money. The
  gate and the daily cap are what stand between it and a bill.

## Is it live in production right now?

**Yes, the gate is open** — and nothing has gone through it yet.

- `GOOGLE_MAPS_API_KEY` is not set; the provider falls back to `GOOGLE_PLACES_API_KEY`, which **is**
  set for production and preview.
- `GOOGLE_JOURNEYS_ENABLED` is not set. An unset scope flag is permissive: `describeScope` only
  refuses on an explicit `false`.
- `GOOGLE_PLACES_ENABLED` is not set, so `masterEnabled()` falls back to
  `VERCEL_ENV === 'production'`, which is true in production and false in preview.

So in production the journeys scope is allowed and the key resolves. In preview the master gate is
shut, which is what keeps preview from spending — the owner's instruction that preview is not
authorised to spend holds, by the master gate rather than by the scope flag.

`google_places_usage` has **no `journeys` rows at all**, across all environments and all time. The
only recorded spend is 28 `place_photos`, 9 `nearby_search` and 5 `place_details`, all on
2026-10-01, all production. Distance Matrix has therefore never actually been called in production.
The straightforward reading is that no real plan has been generated in production since the P0
journey shipped; the capability is live and simply unexercised.

## How many elements a plan costs

`planProbes` issues one probe per family home (1 destination: the anchor) and one probe per stop
(destinations: every other stop, plus every family home, because any stop can be the last one).

For S stops and F families: `F + S × (S − 1 + F)` elements.

These figures are no longer hand-derived. `src/__tests__/journey-element-cost.test.ts` runs the real
`buildJourneyMatrix` with a probe that records request shapes and counts origins × destinations as
Distance Matrix would bill them. The formula held; one of my hand-computed rows did not (this table
first said 17 for three stops and two families, where the formula gives 14), which is why the numbers
now come from running the builder rather than from arithmetic in a document.

| Plan | Probes | Billable elements |
| --- | --- | --- |
| 1 stop, 1 family (what P0 ships today) | 2 | 2 |
| 2 stops, 1 family (venue + lunch) | 3 | 5 |
| 3 stops, 1 family | 4 | 10 |
| 3 stops, 2 families (the halfway-family future) | 5 | 14 |

So **adding a lunch stop takes a plan from 2 elements to 5**. That is the honest cost of Section 12,
and it is small — the expensive thing would be routing candidates during discovery, which Section 6
exists to prevent.

## Two control defects worth naming

1. **The budget counts calls, not elements.** `assertPlacesAllowed` is invoked once per
   `getDriveTimes`, recording 1, while that one call bills up to 25 elements. With
   `GOOGLE_PLACES_MAX_CALLS_PER_DAY = 2000` the journeys scope could therefore pass up to 50,000
   billable elements in a day while the counter reads 2,000. Every other scope bills per call, so
   the counter is right for them and wrong only here. Distance Matrix is the one SKU in the system
   whose billing unit is not the call.

2. **No cache means repeat cost is the same as first cost.** A parent who regenerates the same day
   twice pays twice. Two parents planning the same venue from the same town pay separately. Section
   9 asks for a cache keyed on anchor + destination + mode; there is currently nothing to extend.

Neither is urgent while the element count per plan is single digits and no production call has been
made. Both become urgent the moment routing is attached to discovery.

## What this means for the rest of the brief

- **Section 2 (OSM discovery)**: unaffected. Overpass does not route and is not being asked to.
- **Section 4 (three modes)**: there is no walking, public-transport, or cycling capability of any
  kind to extend. Driving is the only mode that exists. Walking can be estimated from distance
  honestly and for free, provided it is labelled as an estimate. Public transport cannot be
  estimated from distance in any defensible way — a straight line says nothing about whether a bus
  runs — so it needs either a real provider or an explicit unknown state.
- **Section 7's own question, "is Google Distance Matrix required?"**: required for *routed* driving,
  yes. There is no free routed-driving capability here and this audit should not be read as saying
  there is. What exists without Distance Matrix is straight-line distance turned into estimated
  minutes by an assumed average speed: a legitimate fallback, and the only honest presentation of it
  is `🚗 ~8 min estimated`. A routed `🚗 8 min` requires a route provider, and Distance Matrix is
  what buys it. The two are different products to a parent, not two accuracies of the same one.
- **Section 8**: no new billable routing behaviour is proposed in this audit, and none should be
  enabled before the cost model the brief asks for is put to the owner.

## What has changed since this audit, and what has not

Added 2026-10-02, after `1985f92`. The audit above is left as it was written at `4c1f141`, because an
audit that quietly updates itself stops being evidence of what was found. **Two of its findings are now
out of date and must not be read as current:**

### "Is it live in production right now? **Yes, the gate is open**" — no longer true

That was the finding, and it was the point: Distance Matrix was spendable in production purely because
nobody had set its variable. It is now closed, and closed by name rather than by a default:

- `journeys` carries `requiresExplicitEnable: true`, so `describeScope` refuses an absent flag instead of
  inheriting the master switch.
- The project's full production environment was listed and contains no `GOOGLE_JOURNEYS_ENABLED` at all.
- Under `VERCEL_ENV=production` with nothing set, `discovery` is ALLOWED and `journeys` is
  `REFUSED -> PLACES_DISABLED | GOOGLE_JOURNEYS_ENABLED is not set to true`.
- `getDriveTimes` then returns `provider: 'fallback'`, `source: 'estimated'`,
  `fallbackReason: 'PLACES_DISABLED'` — a labelled estimate, not a broken planner.

`google_places_usage` still has no `journeys` rows, across all environments and all time.

### Control defect 1, "the budget counts calls, not elements" — fixed

`SCOPES` now declares a `billingUnit` per scope, `billableUnitsFor` throws rather than guessing for an
element-billed scope given no request shape, and the daily and per-window caps apply to units. The
`journeys` gate is told `origins: 1, destinations: n`. A request carrying 25 billable elements can no
longer consume one unit of budget, and a test asserts exactly that rather than trusting the arithmetic.

### Control defect 2, "no cache" — still open, deliberately

There is still no journey cache. It stays open because nothing is spending: with the gate closed there is
no routed value to cache. Building a cache for a capability that is switched off would be work done
against a guess about how it will be used. Section 9's design — keyed on anchor, destination and mode,
with a retention window inside what the provider's terms allow — is the right shape when routing is
enabled, and not before.

### The honesty defect, "the venue cards are not honest about it" — fixed, and it took two passes

The audit named `DecisionCard`, `SavedPlaceRow` and `RestaurantCard`. All three now route through
`travelTimeLabel`, as do `RecommendationPattern`, `StoreCard`, `PlaceShowcaseCard` (via
`getTravelSignal`), `EatNearbyCompactCard`, `FocusedRecommendationCard` and
`WeatherAlternativeSection`.

**A fourth surface the audit did not name survived that pass.** The Restaurant detail hero printed a bare
`{distanceMinutes} min` twenty lines above a banner that said `about N min from <activity>` — the same
number, stated two different ways on one screen. Neither input is routed: `driveMinutesFromActivity` comes
from a hard-coded proximity table in `mock-restaurants.ts` and `driveMinutes` is Haversine over an assumed
speed.

**What that fourth surface is not: a live defect.** Say this plainly, because the fix is easy to overstate.
`app/restaurant/[id].tsx` is wrapped in `DeferredPilotGate feature="explore_restaurants"`, and both
`explore_restaurants` and `eat_nearby` are in `DEFERRED_PILOT_FEATURES`, so what renders today is
"Restaurants coming later" and no parent has seen the bare label. That was checked by loading
`/restaurant/restaurant-1` in the built bundle, not assumed from reading the flag list. It also means the
corrected label **could not be render-verified**: building with `EXPO_PUBLIC_SHOW_DEFERRED_FEATURES=true`
did not open the gate, and chasing why is a build-config question outside this brief. The evidence for this
one is the source guard below plus `travelTimeLabel`'s own tests — not a screenshot — and it is recorded
that way rather than counted as a verified render.

Two more sites were inconsistent rather than wrong-by-omission. `restaurant-score.ts` wrote its reasons as
`"12 minutes from <venue>"` where `family-score.ts` and `trusted-family-score.ts` both say
`"About 12 minutes from <venue>"` for the same kind of number; it now matches. It is behind the same flag,
so the same caveat applies. The surfaces that **are** live, and were fixed before this pass, are the ones
on Home, Explore and Saved: `DecisionCard`, `SavedPlaceRow`, `RecommendationPattern`, `PlaceShowcaseCard`
and `WeatherAlternativeSection`, each traced to the screen that renders it (Explore, Saved, Home via
`RecommendationDeck`, and Venue Detail) rather than assumed to be reachable. `StoreCard` is behind
`need_now` and `EatNearbyCompactCard` behind `eat_nearby`, so both carry the caveat too.
`FocusedRecommendationCard` has no importer at all — it is hedged, but a component nobody renders is not
evidence of anything, and it is left alone rather than deleted here because tidying it is not this
brief's work.

And one was wrong **in the opposite direction**, which is the direction nobody checks for:
`create-plan.ts` worded every travel-limit failure as `"That leg is about 48 minutes"` unconditionally,
including when the matrix leg was genuinely routed. Hedging a measurement is the same class of error as
stating an estimate exactly. The failure now carries `travelSource` from the matrix leg, and the message is
worded from it. `sequencer.ts` does the same for its own sentence. Both directions are mutation-tested:
forcing the hedge on fails the routed case, forcing it off fails the estimated case.

Reviewing for this by eye has now failed twice, so `src/__tests__/travel-label-honesty.test.ts` scans every
file under `app/` and `src/components/` and fails on any travel-ish identifier interpolated straight
against a minutes unit. It distinguishes a journey claim from a ceiling the parent typed in themselves:
`maxDriveMinutes` echoed back on the Profile screen is their own input and claims nothing. The guard was
verified by reintroducing the Restaurant detail line and watching it fail.
