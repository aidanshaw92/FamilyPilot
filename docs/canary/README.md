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
