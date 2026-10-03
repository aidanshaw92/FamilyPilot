# Routing and transit: the owner's decisions

Dated 3 October 2026. These were decided by the owner after reading `routing-capability-audit.md`,
`routing-cost-model.md` and `transit-options.md`. This file is the record that work is built against, so
a later reader does not have to reconstruct the reasoning from a commit log.

**Nothing paid is enabled by these decisions.** They settle *which* provider to build toward, not
*whether* to switch it on. The fail-closed posture below is a decision in its own right.

## 1. Routed driving: Google Routes API `computeRouteMatrix`

**Decided: adopt it. Do not build new work on legacy Distance Matrix.**

The audit found `journey-provider.js` calling `maps.googleapis.com/maps/api/distancematrix/json`, which
is the legacy REST API: new Cloud projects can no longer enable it, and `DistanceMatrixService` was
deprecated in February 2026. Distance Matrix has never been called in production — `google_places_usage`
holds no `journeys` rows across all environments and all time — so nothing is being migrated away from.
The choice is which API to call the first time, and writing it against an endpoint that a fresh project
cannot enable would be a migration owed on day one.

`computeRouteMatrix` bills per **returned element**, which is why the element-based budgeting that landed
in #135 is the right shape rather than an over-engineering: `billableUnitsFor` refuses an element-billed
scope that is not told its origins and destinations.

## 2. Traffic awareness: not initially

**Decided: traffic-unaware (Essentials). Do not enable traffic-aware Pro routing.**

| | Essentials | Pro (traffic-aware) |
| --- | --- | --- |
| Free elements per month | 10,000 | 5,000 |
| Then, per 1,000 | $5.00 | $10.00 |

A traffic-aware request moves into Pro, so traffic awareness both doubles the unit price and halves the
free allowance. The owner's reasoning, recorded because it is the thing to revisit rather than the number:
a genuine routed 7 minutes without live traffic is already a large improvement on `~7 min estimated`, and
live traffic is not worth doubling the unit price before anyone has used the feature.

**Concretely, this means the Routes API request must not set a traffic-aware routing preference.** The
legacy call it replaces set `departure_time=now` and preferred `duration_in_traffic`, which is exactly the
Pro-tier behaviour being decided against — so this is a change in behaviour, not only in endpoint.

### What this session could not verify

`developers.google.com`, `cloud.google.com` and `mapsplatform.google.com` are all denied by this
environment's egress policy — rechecked on 3 October, still 403 to CONNECT. The figures above are the
owner's, and they agree with the independent secondary sources listed in `routing-cost-model.md`. Two
measurements agreeing is better than one, and neither is Google's own page. **Confirm against Google's
pricing page before committing spend**, and treat the free-tier allowances in particular as the kind of
thing that changes without anyone telling us.

One thing genuinely cannot be settled from here: whether this specific Cloud project retains Distance
Matrix access, and whether the Routes API is enabled on it. Both are a minute in the Cloud console. The
first no longer matters given decision 1; the second is a prerequisite the owner will need to action, and
the implementation will say so when it reaches that point.

## 3. Public transport: TfL Unified API for the London phase

**Decided: proceed with TfL, subject to its registration, terms and rate limits. Do not enable paid
Google TRANSIT.**

TfL's Unified API covers journey planning and live multi-modal data for London specifically, and TfL
publishes it as open data for third-party apps. Anonymous access is rate-limited (reported at 50
requests/minute, with a higher tier available on registration); registration raises that ceiling. For a
London beta that fits far better than paying Google per element for transit, and Google's TRANSIT mode
additionally caps a matrix at 100 elements against 625 for other modes.

Revisit the provider when FamilyPilot goes UK-wide: TfL stops at the London boundary, and a national
product needs a national source.

Until a TfL implementation is proven, **transit stays absent from the UI**. The existing rule holds: do
not fabricate transit, do not call a generic estimate "Bus", and show 🚌 only when the journey is
genuinely bus-specific.

### What this session could not verify

`api.tfl.gov.uk` is also denied by this environment's egress policy (checked 3 October). A TfL client
therefore cannot be exercised against the live API from here — it can only be built against recorded
fixtures, and its rate-limit handling and response parsing stay **unproven against the real service**
until run somewhere with access. That will be stated plainly wherever the client is described, rather
than implied to be tested.

## 4. The Overpass element cap: unchanged at 60

**Decided: keep it. Record truncation telemetry. Revisit only if real usage shows a coverage problem.**

The National Gallery returned exactly `MAX_ELEMENTS = 60`, so that response was truncated and ranking ran
over an Overpass-ordered 60 rather than the nearest 60. The owner's reasoning: do not increase load on
volunteer-funded infrastructure because one dense central anchor hit the cap; up to 20 candidates inside
the radius are still displayed; collect real evidence first, and if parents are genuinely missing useful
restaurants, fix it with better spatial querying and ranking rather than by pulling more rows.

The telemetry this requires now exists, and it costs nothing:

| Field | Meaning |
| --- | --- |
| `rawElements` | What Overpass returned, before any validation |
| `elementCap` | The cap that applied: 60, or 25 if the narrower retry produced the response |
| `saturatedCap` | `rawElements >= elementCap` — **evidence** of truncation, not proof |
| `afterValidation` | Survived becoming a candidate at all (a name, usable coordinates) |
| `afterDedupe` | Survived same-name-within-40m merging |

Three things about it are deliberate:

- **No extra request.** Every count comes from the one response already made. An earlier version of the
  canary doc called the raw count "not separable without a second request"; that was wrong, and this
  corrects it.
- **`saturatedCap` is named for what is observed.** Overpass returning exactly the cap when exactly that
  many places exist is not a loss, and a field called `truncated` would have invited reading a
  coincidence as a confirmed one.
- **The cap that applied, not a constant.** The narrow retry asks for 25, so 25 elements from it is
  saturated while 25 from the first query is nowhere near the limit. A single hardcoded 60 would make the
  signal wrong whenever the retry fired.

It is recorded two ways: a `osm_food_cap_saturated` structured log line, and `payload.discovery` on the
`place_search_cache` row, which needs no migration because `payload` is `jsonb`. The question is then
answerable by SQL over rows that already exist:

```sql
select count(*) filter (where (payload -> 'discovery' ->> 'saturatedCap') = 'true') as saturated,
       count(*) filter (where payload -> 'discovery' is not null)                   as measured,
       count(*)                                                                     as rows
from place_search_cache
where cache_key like 'nearby-food%';
```

`measured` matters: a row written before this field existed has no record, and that is not the same as a
row that recorded no saturation.

### One thing this found on the way

`overpassRequests` counted **queries**, not HTTP requests. On a 429, a 504 or a network error the provider
fails over to the second endpoint with the same query, so one query can be two requests — and the count
understated our load on a donated service exactly when we were retrying, which is the worst time to be
wrong in that direction. `overpassHttpRequests` now reports requests actually sent, alongside the query
count under its existing name so no past measurement's meaning changes. The canary prints both.

## 5. Paid routing stays fail-closed

**Decided: paid Google routing remains fail-closed until the Routes API implementation, the element
budget, the quota and the canary are all ready.**

This is already the posture and it is now a recorded decision rather than an implementation detail. The
`journeys` scope carries `requiresExplicitEnable: true`, so `describeScope` refuses an absent flag instead
of inheriting the master switch. Verified on 3 October under `VERCEL_ENV=production` with nothing set:

```
discovery  ALLOWED
journeys   REFUSED -> PLACES_DISABLED | GOOGLE_JOURNEYS_ENABLED is not set to true
```

The project's full production environment contains no `GOOGLE_JOURNEYS_ENABLED` at all. Switching it on
is a deliberate act by the owner, after the four prerequisites above exist and a canary has measured
predicted against actual billable elements.

## What the owner will need to do by hand

Two things, and the implementation will say when it reaches each rather than leaving them to be
discovered:

1. **Enable the Routes API** on the Cloud project, if it is not already enabled.
2. **Register for a TfL application key**, if the anonymous rate limit proves too low for real usage.

Neither is needed before the code is written, and neither switches anything on by itself.
