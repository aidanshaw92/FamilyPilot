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

### The evidence this decision asked for, as gathered so far

Two live production runs, 2026-10-03, over five anchors chosen to span density. **Three of the four
anchors that answered were at the cap**, which is a higher rate than the single central-London case the
decision was taken on:

| Anchor | Covers | raw | Shown / found | At the cap? |
| --- | --- | --- | --- | --- |
| The National Gallery | central, dense | — | — | **never answered** (see below) |
| Victoria and Albert Museum | inner urban museum | 60 | 20 / 60 | **yes** |
| Hampstead Heath | large park | 60 | 20 / 57 | **yes** |
| Chiswick House | suburban, sparse | 60 | 20 / 58 | **yes** |
| Gladstone Park | suburban park, sparse | 8 | 8 / 8 | no |

This is **evidence, not a verdict**, and it is deliberately not being acted on: the decision was to
revisit the cap only if real parent usage shows a coverage problem, and five canary anchors are not parent
usage. What it does establish is that saturation is not confined to the densest anchors — Chiswick House
was chosen as a *sparse* suburban comparator and still returned 60. The honest reading is that a 1.2km
radius around most London anchors contains more than 60 eating places, and the 20 shown are the 20 that
ranked highest among an Overpass-ordered 60 rather than among all of them.

### The National Gallery does not answer at all, and that is a real coverage gap

It failed both runs with `503 FOOD_PROVIDER_UNAVAILABLE` after hitting the provider's 20-second deadline.
The second run had already ruled out the obvious explanation: the first run fired five lookups in fifteen
seconds and three timed out, so a 12-second gap was added between anchors — and under that spacing the two
other previous failures (Chiswick House, Gladstone Park) both succeeded. **The National Gallery was the
first request of the second run, with no preceding load at all, and still timed out.** So this is not
rate-limiting and not a canary artefact: the Overpass query for the densest square kilometre in London
genuinely exceeds 20 seconds.

The product behaviour is correct — a parent sees an honest "we could not look this up" rather than a
fabricated empty neighbourhood, and the `meal-lookup-failed` caveat says so — but a parent at Trafalgar
Square gets no lunch suggestions, which is the single place they would most expect them. **Not fixed
here**: it needs either a smaller radius for dense anchors or a longer deadline, and both are changes to
provider load that belong with the cap decision rather than slipped in beside it. Recorded so the next
person has the measurement rather than the suspicion.

### Two more things these runs found

**Every free OpenStreetMap cache row was recorded as one billable call.** `writeSearchCache` stored
`Math.max(1, Number(billableCalls) || 1)`, so zero was unreachable and a row that cost nothing was written
down as costing one. This was found by querying production, not by reading code: all four `nearby-food`
rows carried `billable_calls = 1`. It matters because `docs/canary/reconcile.sql` asserts *"nearby-food
rows recording a billable call (must be 0)"* — a check that could never have passed on a single row. **A
cost-reconciliation query that cannot pass is worse than no query**, because the first reader dismisses it
as noise and the second stops running it. Fixed so an explicit 0 is stored as 0, while a missing or
unparseable count still defaults to 1: *unknown must not read as free*, since that is the direction that
understates a bill.

The four existing rows still read 1 and are **not** being edited: they are cache rows with a six-hour TTL,
and the next write for each anchor upserts the corrected value. Until then that reconciliation line reads 4
rather than 0, for this reason and no other.

**A CDN replay of a cache miss repeated the miss's claims.** The food endpoint set
`s-maxage=21600` on every non-bypass response, including a `miss`. A `miss` body says
`cacheState: "miss"` and `overpassRequests: 1`, and both are true only at the instant it is produced — so
for six hours the edge told every reader an Overpass request had just been made when none had. Found
because the canary re-asked an anchor sixteen seconds after a miss, got `miss` back in **twelve
milliseconds**, and concluded "caching is not in play in this environment" in a run where two other anchors
had been served from the store. That conclusion was exactly inverted; twelve milliseconds is the edge, not
a round trip. Now only `hit` and `stale` responses carry the header, because those stay true however often
they are replayed, and the canary separates the two cases by latency and fails on the replay rather than
noting it.

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

## What is implemented against these decisions

Decisions 1, 2, 4 and 5 now have code. Decision 3 does not yet.

| Decision | State |
| --- | --- |
| 1. Routes API `computeRouteMatrix` | **Implemented.** `server/context/lib/route-matrix.js`. The legacy Distance Matrix client is gone rather than kept alongside — an unused billable path is the exact thing the original audit found live by accident. |
| 2. Traffic-unaware | **Implemented.** `routingPreference: 'TRAFFIC_UNAWARE'` is set explicitly, not left to the API's default, and a test asserts the request carries no `TRAFFIC_AWARE`, no `departure_time` and no `duration_in_traffic`. |
| 3. TfL for transit | **Written and gated, NOT proven.** `server/context/lib/tfl-transit.js`, behind `TFL_TRANSIT_ENABLED`. Transit remains absent from the UI. See the limits below. |
| 4. Overpass cap unchanged, telemetry recorded | **Implemented.** See §4 above. |
| 5. Fail-closed | **Holds, and is asserted.** The gate runs before any request is built; a test proves the Routes API is not reached with the flag absent, and swapping the two lines fails it. |

Mutation-tested, because each of these is invisible until a bill arrives:

| Mutant | Result |
| --- | --- |
| `TRAFFIC_UNAWARE` → `TRAFFIC_AWARE` | 2 tests fail |
| `routingPreference` removed, default trusted | 1 test fails |
| Endpoint reverted to legacy Distance Matrix | 1 test fails |
| Gate moved below the request | 2 tests fail, in both suites |
| A zero-second duration allowed through as 0 minutes | 1 test fails |

The SKU on the `journeys` scope is now `route_matrix`. Renaming orphaned nothing — `distance_matrix` has
zero rows across every environment and all time — and `reconcile.sql` keeps a separate line for the legacy
SKU so a row appearing under it later cannot hide behind the rename.

### Our element counter is an upper bound on spend, not an equality

Worth predicting in writing now rather than discovering it as a mystery during the first reconciliation.

`assertPlacesAllowed` calls `countCall` **before** the request is made. So when a Routes API request fails
— a 500, a timeout, a network error — FamilyPilot has already charged itself the elements that Google did
not bill. `google_places_usage` will therefore read **at or above** actual spend, never below it.

That ordering is deliberate and should stay. Charging after a successful response would mean a crash
between the request and the write leaves real spend unrecorded, and two concurrent requests could both
clear the gate before either charged. Over-counting spends our own ceiling faster than reality, which
makes the cap bite sooner; under-counting spends money nobody is watching. The first is the direction to
be wrong in.

The consequence for reconciliation, since the brief requires discrepancies to be investigated rather than
silently corrected: **a Google invoice lower than our counter is expected, not a defect.** The gap is the
failed requests. A Google invoice *higher* than our counter is the real alarm, and would mean a billable
path exists that does not pass through this gate.

A refund-on-failure path was considered and rejected: it adds a write that can itself fail, and when it
does the state is exactly what we have now, for more moving parts.

### The TfL client: what is proven and what is not

Written against TfL's documented contract and exercised by 31 fixture tests. `api.tfl.gov.uk` is denied by
this development environment's egress policy, so **for as long as that was the only evidence, the parser had
never met the real service** and the flag was about an unproven parser rather than about money.

**That is no longer the only evidence. The parser was verified against the live service on 2026-10-03** —
see *Live verification* below. The flag stays, because transit coverage is still London-only and the UI
work to present a transit leg has not been done; it is now a scope flag rather than a doubt about the
parser.

What the fixtures DO prove, because each is a rule the brief attached to transit, and each was
mutation-tested:

| Rule | Mutant that breaks it | Tests that fail |
| --- | --- | --- |
| Outside London is **unknown**, never "no public transport" | report it as `unavailable` | 2 |
| 🚌 only when every transit leg is a bus; otherwise 🚇 | `some` instead of `every` | 2 |
| Off unless explicitly enabled | flag defaults to on | 2 |
| A TfL journey is `routed`, not an estimate | label it `estimated-distance` | 1 |
| A journey outside coverage spends no TfL request | take the slot before the coverage check | 1 |

Four more things are structural rather than conventional:

- **Nothing is cached.** A journey result embeds departure times, so a cached one serves a parent
  yesterday's bus. The endpoint sets `Cache-Control: no-store` and the result carries `cacheable: false`.
- **The rate limit sits well under the ceiling.** Default 20 requests/minute. The two figures available
  disagree — an earlier note recorded roughly 500/day unauthenticated, the owner reports 50/minute
  anonymous and 500/minute registered — and this environment cannot settle it, so the implementation sits
  under **both** and `TFL_MAX_REQUESTS_PER_MINUTE` raises it once the real ceiling is known. A refused
  request spends no slot; a 429 is never retried, because a retry is another request against the limit we
  were just told we exceeded.
- **TfL's credit is carried on every answer**, including the unknown ones, and their branding is not used.
- **The module's import graph contains no Google client, key or billing gate**, asserted by walking
  `require.cache` rather than by reading the imports.

It lives inside `api/context/journey.js` rather than its own function because **Vercel's deployment budget
is twelve functions and this project is at twelve** — a thirteenth fails the deploy, the same constraint
that put nearby-food inside the places search handler. The transit branch returns before `getDriveTimes`
is reached.

### The Routes API: verified for exactly one element

Up to 2026-10-03 the request shape, the field mask and the duration parsing had never met the real service,
and this section said so: *"nothing here should be read as 'the Routes API integration works' — only as
'the Routes API integration is written, gated, and consistent with its documented contract.'"*

**One real element has now been bought and it came back routed.** See *Live verification* below for the
figures. What that does and does not establish:

- It **does** establish that the endpoint, the `POST` body, the `X-Goog-FieldMask`, `TRAFFIC_UNAWARE`, and
  the `"842s"`-style duration parse are all accepted by the live API and produce a usable journey.
- It **does not** establish anything about matrices larger than 1×1, about `condition` values other than
  `ROUTE_EXISTS`, or about behaviour at the 625-element provider ceiling. Those remain fixture-only.
- It is **not** authorisation to route in production. `GOOGLE_JOURNEYS_ENABLED` is unset in production and
  the scope `requiresExplicitEnable`, so production refuses routing by construction, not by convention.

## What the owner needed to do by hand

Two things, both now settled:

1. **Enable the Routes API** on the Cloud project. **Done** — the owner enabled it on 2026-10-03, which is
   what made the canary below possible.
2. **Register for a TfL application key**, if the anonymous rate limit proves too low for real usage. Set
   it as `TFL_APP_KEY`. **Not needed so far**: the live verification ran anonymously and TfL answered both
   the deployment and the CI runner without complaint. The client works without a key and simply stays
   under the lower anonymous ceiling.

Neither switched anything on by itself: enabling an API in Google Cloud makes a call *possible*, and the
application-side gate still has to be opened separately, per decision 5.

### The step that needed a person, and how it was closed

Neither provider could be reached from the development sandbox, so both were verified from GitHub Actions
against a **Preview** deployment. The two workflows are the permanent record and can be re-run:
`.github/workflows/transit-live-smoke.yml` and `.github/workflows/live-canaries.yml`.

Running the check from CI rather than from a laptop matters for a reason beyond convenience: it makes the
request through **the deployment's own egress, User-Agent and cache**, so what is measured is the request
the product actually makes, not the request a developer's machine makes.

## Live verification, 2026-10-03

Both providers were verified against the real services on 2026-10-03, against the branch Preview
deployment. **Production was not touched for either.**

### TfL: verified live (Actions run 37110186939)

| What | Result |
| --- | --- |
| `state` | `available` |
| `leg.source` | `routed` |
| `leg.mode` | `transit` (not `bus`) |
| Duration | 40 min, Southbank → Greenwich |
| Attribution | present |
| `cacheable` | `false`, and the response carried `Cache-Control: no-store` |
| Google calls | 0 |
| Cost | £0. TfL's Unified API is free open data. |

**Why this is a live answer and not a fixture.** The structural argument — `tfl-transit.js` contains no
fixture path and no fallback journey, so `state: "available"` is reachable only from a real 200 — is exactly
what someone who *had* added a fallback would say, so the check does not rest on it. The CI runner made its
own independent call to `api.tfl.gov.uk` and the two observations were compared: TfL offered 3 journeys,
quickest 40 minutes; the endpoint said 40 minutes; **difference 0**. A constant cannot track what TfL says
today. The assertion additionally fails on any of the five durations hard-coded in the unit fixtures.

**One real finding.** TfL's chosen journey had leg modes `walking, national-rail, walking, bus, walking` — a
genuinely mixed journey containing a bus. The `every`-not-`some` rule labelled it `transit` rather than
`bus`, which is the behaviour the brief asked for and which a bus-free fixture could not have exercised.

### Routes: one real element, and it came back routed (Actions run 37112057021)

Predicted before the request, confirmed after:

| Measure | Predicted | Actual |
| --- | --- | --- |
| Billable route-matrix elements | 1 | **1** |
| HTTP requests to Google | 1 | **1** |
| Method | `computeRouteMatrix` | `computeRouteMatrix` |
| Routing preference | `TRAFFIC_UNAWARE` | `TRAFFIC_UNAWARE` |
| Matrix shape | 1 origin × 1 destination | 1 × 1 |

Result: `provider: google`, `source: live`, leg `source: live`, **19 minutes** for Trafalgar Square → Tower
of London (about 4 km across central London — plausible, and inside the 4–60 minute band the assertion
requires). **This is the first routed journey FamilyPilot has ever produced.** Every previous journey was a
straight-line estimate.

Cost: 1 element against the Essentials free tier, so **$0.00 billed**, and at the paid rate it would have
been $0.005.

**Six confirmations were gated before the request, not after.** `scripts/preflight-routes-canary.mjs` runs
first and makes zero requests; the run spends nothing unless all six pass. It asserts on the **serialized
request** — `JSON.stringify(body)` plus the headers — rather than on source text, because an earlier version
asserted on the module and failed three checks on the prose in its own header comment, which names
`departure_time` and the legacy URL while describing why they are not used. The legacy-path scan strips
comments first; naively stripping `//` would truncate every `https://` literal and make the scan pass
vacuously, so it discriminates both directions in its own tests.

### The Preview configuration used, and its removal

The canary needed Preview to permit exactly one element. The configuration applied was deliberately the
narrowest that could work: master switch on, journeys scope on, **all five other Google scopes explicitly
`false`**, and `GOOGLE_PLACES_MAX_CALLS_PER_DAY=5` so that even a looping bug could spend at most five
elements in a day. Production was not modified.

Immediately after the canary, both spend-enabling variables were set back to `false`. Setting them to
`false` is **stricter than deleting them**: `describeScope` refuses on `scoped === false` outright, whereas
an absent variable is refused by `requiresExplicitEnable`, which is one code change away from inheriting the
master switch. The Vercel MCP surface available to this session has no delete-env operation, so the nine
variables still exist with value `false` and carry comments saying they are safe to delete; removing them in
the dashboard is tidying, not a control.

Because **Vercel bakes environment values at build time**, editing the variables does not change the running
Preview. "I set it back to false" is a claim about the dashboard, not about the deployment. So the revert is
verified against the deployment's own `/api/places/status` by `scripts/assert-places-fail-closed.mjs`, run
from CI with `assert_fail_closed=true`. It sweeps every scope, fails if the scope map is empty rather than
passing vacuously, and makes no provider request.

### What verifying the posture found, which was not about routing at all

The owner asked for Preview to be verified fail-closed after the Routes canary. Writing that check and
then running it against production found something the routing work had not been looking for:
**`probeEnabled: true` in production.**

`/api/places/status` is public and unauthenticated, `?probe=live` reaches Nearby Search with no cache, and
the coordinates come from the query string — so a stranger with one URL and a loop could spend the daily
cap and bill the project. It was open because `masterEnabled()` defaults to true in production and the
probe scope had no `requiresExplicitEnable`, so an unset variable inherited "on". It now requires its
variable by name, like journeys. Details in `docs/GOOGLE_PLACES_COST_CONTROL.md` §2.1.

Worth recording for its own sake: **the first version of that check was wrong**, and that is how the probe
was found. It asserted that every scope must refuse, which is right for Preview and wrong for production,
where Google Places discovery *is* the product. Run against production it reported six failures for six
scopes behaving as designed. Being wrong about the expectation is not the same as being wrong to look.

### What this verification does not claim

- It does not claim production routing works. Production has **no** `GOOGLE_JOURNEYS_ENABLED` variable at
  all, and the scope `requiresExplicitEnable`, so production refuses routing.
- It does not replace the Google-side quota. The code-level controls remain defence in depth, per the
  owner's standing instruction.
- It does not establish matrix behaviour above 1×1, and the element budget's arithmetic for larger matrices
  is still fixture-only.
