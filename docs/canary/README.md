# Nearby food canary: what has actually been measured

Section 16. Dated 2 October 2026. **This records measurements, including the ones that could not be
taken.** Where a metric is unmeasured it says so rather than carrying a zero that would read as a result.

## The one real success

`The National Gallery` (51.5089, -0.1283), from a GitHub runner, 2026-10-02 20:43 UTC:

| Metric | Value |
| --- | --- |
| Overpass requests | **1** |
| Retries | 0 |
| Google billable calls | **0** |
| Candidates after validation, dedupe and radius filter | 60 |
| Candidates displayed | 20 |
| Cache state | miss (no Supabase credentials in CI, so every read is a miss) |
| Latency | **2088ms** |
| Provider | osm |
| Attribution | osm |
| Transit legs invented | **0** |
| Same-place duplicates | 0 |

Google's billable counters were unchanged across every scope — `discovery`, `details`, `photos`,
`refresh`, `probe`, `geocoding`, `journeys` all zero delta. Paid routing was refused, as intended, because
`GOOGLE_JOURNEYS_ENABLED` is unset.

**For OSM-only restaurant discovery the required result was Google Places calls = 0, and that is what was
measured.**

## What could not be measured, and why

| Metric group | Status |
| --- | --- |
| Four of five anchors (V&A, Hampstead Heath, Gladstone Park, Chiswick House) | **NOT MEASURED** |
| Cache hits / misses / hit ratio | **NOT MEASURED** as a ratio — CI has no Supabase credentials, so every read is a miss by construction |
| Raw OSM element count before validation | **NOT SEPARABLE** without a second request per anchor, which the brief forbids making to produce a statistic |
| Cached vs uncached latency | **NOT MEASURED** — see cache above |
| Venue Detail and plan-generation impact in production | **NOT MEASURED** — the production URL is unreachable from the development environment |
| Lunch-plan generation attempts, plans containing lunch, plans correctly omitting it | **NOT MEASURED in production**; measured against fixtures by the Phase 2 audit (277/277), which is a different claim |

The reason for the four unmeasured anchors is the finding below, not a defect in the product.

## The finding: a CI runner is the wrong vantage point

Three real attempts, in order:

1. Died before any request — `search-cache.js` required the Supabase client eagerly, so the discovery path
   would not load without a root dependency. **Real defect, fixed.**
2. The National Gallery succeeded in 2088ms. The V&A then spent **47 seconds** before giving up, because
   each request aborted at 15s and nothing bounded the sum of four attempts. **Real defect, fixed** with a
   20-second deadline on the whole lookup.
3. The National Gallery — the same anchor that had just succeeded — hit the new 20-second deadline.

Public Overpass rate-limits shared cloud address space heavily, which is entirely its right: it is a free
service funded by donations, and `osm-food.js` is built to be polite to it precisely because of that. The
practical consequence is that figures gathered from a GitHub runner describe the runner's standing with
Overpass, not the product's.

So two things changed:

- **The canary is no longer a pull-request gate.** It was, and that was wrong: it made pull requests red
  for reasons unrelated to their diff, and it invited re-running against public infrastructure until the
  result came back green. It is `workflow_dispatch` only now. A canary is a deliberate measurement.
- **I stopped re-running it.** Three attempts established what was there to establish. A fourth would have
  been hammering a donated service to improve a number in a document.

## What a complete canary still needs

Running from **production**, where the address and the User-Agent are the real ones and the Supabase cache
is present. That cannot be driven from the development environment: its egress policy denies
`overpass-api.de`, `overpass.kumi.systems` and `family-pilot-seven.vercel.app` alike — 403 to CONNECT on
all three, confirmed from the proxy's own failure log rather than inferred from a timeout.

The practical route is to open the five anchor venues on the deployed app once each, after merge, and read
the metrics back from `place_search_cache` and the structured logs. That is a few minutes of real use
rather than an automated sweep, and it is the honest version of "the smallest useful production canary".

## What the single success does and does not establish

**Does:** the discovery path works against real OpenStreetMap data; a dense central-London anchor returns
plenty of candidates; one anchor costs exactly one Overpass request; and zero Google spend is real rather
than asserted.

**Does not:** that four other anchor types behave the same way, that the cache performs as designed, or
that latency in production resembles 2088ms from a runner.

I would not call Section 16 complete on one anchor, and the success criteria list is marked accordingly.

## A note on the 60-element cap

`60 found` at the National Gallery is exactly `MAX_ELEMENTS`, so the Overpass result was truncated at the
cap. Ranking then ran over an Overpass-ordered 60 rather than the nearest 60. Every one of them is inside
the 1200m radius, so nothing shown is far away, but a nearer restaurant could in principle have been cut
before ranking saw it.

Raising the cap costs Overpass more work per request, which is a trade to make deliberately rather than
quietly. Left as it is, and recorded here.

## The access limitation, stated exactly

Recorded 2026-10-02, after `1985f92` was merged and deployment `dpl_6qX8KLtW7c1FSPXK6wPTXxGM6Yr8`
reached READY with the alias `family-pilot-seven.vercel.app`. Both of the two routes this session has to
production are closed, so the remaining four anchors are **NOT MEASURED** for an access reason and not a
product reason:

| Route | Result |
| --- | --- |
| Direct HTTPS from the development sandbox | 403 to CONNECT. `curl https://family-pilot-seven.vercel.app/api/health` exits without a response; the proxy's own failure log names the host and the policy denial. `overpass-api.de` is denied identically, so the canary script cannot be run locally either. |
| Vercel's deployment-read bypass (`web_fetch_vercel_url`, `get_access_to_vercel_url`) | `403 forbidden`, `stage: read_protection_bypass`, from `GET /v2/deployments/dpl_6qX8KLtW7c1FSPXK6wPTXxGM6Yr8/aliases`. The connection is authorised for the project's build and environment APIs but not for reading the deployment, so no share link can be minted. |

This is an authorisation boundary, not a defect to fix in code, and not a product decision. It is recorded
rather than worked around: minting a bypass another way, or routing the request through a database
extension so the packet leaves from somewhere permitted, would both be ways of getting past a control the
owner's accounts put there.

### The five requests that complete Section 16

One GET each, in this order, from a browser or shell with ordinary access to the deployment. Each is a
single Overpass request and **zero Google calls** by construction — the `intent=nearby-food` early return
in `api/places/search.js` happens before `primePlacesBudget()` and before provider selection.

```
https://family-pilot-seven.vercel.app/api/places/search?intent=nearby-food&lat=51.5089&lng=-0.1283&placeId=fp-google-ChIJeclqF84EdkgRtKAjTmWFr0I
https://family-pilot-seven.vercel.app/api/places/search?intent=nearby-food&lat=51.4966&lng=-0.1722&placeId=fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54
https://family-pilot-seven.vercel.app/api/places/search?intent=nearby-food&lat=51.5608&lng=-0.1629&placeId=fp-google-ChIJIzJDyggadkgROFAV19Ti070
https://family-pilot-seven.vercel.app/api/places/search?intent=nearby-food&lat=51.5574&lng=-0.2360&placeId=fp-google-ChIJ99IK4v8QdkgRZNGsdKK0pb8
https://family-pilot-seven.vercel.app/api/places/search?intent=nearby-food&lat=51.4837&lng=-0.2586&placeId=fp-osm-679119297
```

In order: The National Gallery (central, dense), the Victoria and Albert Museum (inner urban), Hampstead
Heath (large park), Gladstone Park (suburban, sparse), Chiswick House (suburban, sparse, and the one
anchor that is itself OpenStreetMap-sourced).

**Repeating the same URL a second time is the cache measurement** and the only repeat worth making: the
first call is a miss that writes a `place_search_cache` row under scope `nearby-food`, the second must be
a hit that issues no Overpass request at all. Comparing the two response times is the
cached-vs-uncached latency figure the table above marks NOT MEASURED. Do not loop beyond that — a third
call measures nothing new and spends somebody else's Overpass capacity.

The equivalent through the product, if the interest is Venue Detail's rendering and its effect on
plan generation rather than the endpoint's numbers, is `/venue/<placeId>` for the same five ids followed
by **Create a plan**. That is the surface the brief's product and performance metrics describe.

### Reading the results back

`reconcile.sql` in this directory is the read-only query set. It needs no access to the deployment, only
to Supabase, so it can be run from here once the requests above have been made. **Run it before the
requests as well as after**: it reports absolute counts, not deltas, so the comparison only exists if
both ends of it were measured. It gives the `nearby-food` cache rows with each anchor's coordinates and
candidate count, today's Google billable units by scope, `distance_matrix` rows ever, two
must-be-zero invariants (`billable_calls > 0` and `provider <> 'osm'` on any food row), and the
served-claims baseline that shows the canary disturbed nothing a parent reads.

It was executed against production on 2026-10-02 to confirm it runs and to take the before-baseline:
`google units today = none`, `distance_matrix rows ever = 0`, `nearby-food cache rows = 0`, both
invariants 0, `served claims = 176`, `distinct venues served = 67`, `failed enrichment jobs = 0`. The
query set is valid against the live schema; what is missing is the production traffic to measure, not
the means to measure it.

### Paid routing, explicitly

**Paid route calls = 0.** Not missing, not unmeasured. The project's full production environment was
listed on 2026-10-02 (`hiddenProductionEnvCount: 0`, so the list is complete) and it contains no
`GOOGLE_JOURNEYS_ENABLED` at all — nor any other `GOOGLE_PLACES_*_ENABLED` flag, including the master
switch. With the flag absent, `journeys` carrying `requiresExplicitEnable: true` means `describeScope`
refuses the scope by name rather than inheriting a default, and `journey-provider.js` returns its
estimated journeys with `fallbackReason: 'PLACES_DISABLED'`. `distance_matrix` rows in the usage
table: **0, ever.**

Proven rather than read, under `VERCEL_ENV=production` with no flags set:

```
discovery  ALLOWED
journeys   REFUSED -> PLACES_DISABLED | GOOGLE_JOURNEYS_ENABLED is not set to true;
                      this scope bills per element and must be enabled by name
```

That contrast is the whole point of the fix. In production an unset master switch is permissive, so
before `requiresExplicitEnable` existed the journeys scope was live purely because nobody had set its
variable. `discovery` still inherits, as a capability in daily use should; `journeys` refuses by name.
`getDriveTimes` under the same conditions returns `provider: 'fallback'`, `source: 'estimated'`,
`fallbackReason: 'PLACES_DISABLED'` — a labelled estimate, not a broken planner.
Every travel figure the product currently shows is a straight-line estimate, labelled as an estimate, and
no routed value exists to compare it against.
