# Google Places cost control

Written after a **£104.11** Google Places API (New) bill for **September 2026**.

This document has three jobs: say what in this codebase can spend money, say what now stops it, and
give the owner the Google Cloud settings to apply by hand. The last section is the one that has to be
done outside the repository, and it is the only real cap — everything in the code can be changed by a
commit.

---

## 1. Every code path that can bill Google

Six locations in the repository reach `googleapis.com`. All six now pass through
`server/places/lib/places-budget.js`. Nothing else may.

| # | Location | Google endpoint | Who invokes it | Automatic? | Billable calls per execution |
|---|---|---|---|---|---|
| 1 | `server/places/lib/google-places.js` → `searchGoogle` | `places:searchNearby` | `api/places/search.js`, `api/enrichment` sync, audit scripts | yes (cron area sync) | 1 per call; **9 per London-scope page load** |
| 2 | `server/places/lib/google-places.js` → `getGooglePlace` | `GET /v1/places/{id}` (Place Details) | `api/places/detail.js`, `evidence-pipeline`, `opening-hours-backfill`, admin refresh | yes (enrichment queue) | 1 |
| 3 | `api/places/photo.js` | Place Details (`fieldMask=photos`) **and** `GET /v1/{photo}/media` | every `<img>` the app renders | yes, on render | **2 per image** |
| 4 | `server/context/lib/journey-provider.js` | `maps/api/distancematrix/json` | `api/context`, planner | on request | 1 request, **up to 25 billable elements** |
| 5 | `api/planning/location.js` | `maps/api/geocode/json` | parent types a town name | no | 1 |
| 6 | `scripts/audit-google-quality.mjs` | `places:searchNearby` (legacy field mask) | a developer | no | **12** (6 locations × 2) |

### Fan-out, caching and concurrency, as it was

| Property | Before | Now |
|---|---|---|
| Kill switch | none | `GOOGLE_PLACES_ENABLED` + six per-scope switches |
| Default outside production | **on** (`vercel.json` sets `PLACES_PROVIDER=google` for every environment, so Preview billed like production) | off |
| Default under vitest | on | off, and not overridable except by `GOOGLE_PLACES_ALLOW_LIVE_TEST` |
| Server-side search cache | none; `cached: false` was hardcoded | `public.place_search_cache`, 6h TTL |
| CDN caching | `Cache-Control: no-store` on search, photo and status | `s-maxage` on the success path, `no-store` on every error path |
| Client cache | 10min search / 30min detail in AsyncStorage — real, but empty in any fresh browser context | unchanged, now backed by the server cache |
| Concurrent duplicate suppression | none; three deck layers bought three lookups | coalesced per process |
| Detail refresh TTL | none; `/api/places/detail` called Google on every open | 7 days, hard-stopped at 30 |
| Enrichment refresh guard | `website && description` — **unsatisfiable**, see below | 14-day freshness window |
| Per-run ceiling | none | 60 calls / 60s per process |
| Daily ceiling | none | 2000 per scope, counted in Postgres across instances |
| Retry multiplication | `googleRequest` does not retry; `opening-hours-backfill` has `RETRY_DELAYS_MS` | unchanged, now inside the ceilings |
| Pagination | none used; `maxResultCount` caps at 20 | London grid asserted at 9 areas |
| Reachable from a test | yes | no, and a `fetch` tripwire in the vitest setup proves it |
| Reachable by rendering the app | yes, repeatedly | search and detail from cache; photos from the CDN |
| Reachable by an anonymous stranger | yes — `/api/places/search`, `/api/places/photo` and `/api/places/status` are all public and unauthenticated | gated, cached and capped |

### What produced the September bill

Stated as evidence and arithmetic, not as a conclusion. **Only the Google Cloud SKU breakdown can
confirm the attribution**, and it should be read before acting on the figures below.

The dominant path was not production traffic. It was **CI**.

`.github/workflows/home-visual-regression.yml` ran `on: pull_request` for any change under
`familypilot/**`, and pointed the build under test at `https://family-pilot-seven.vercel.app`. From
the GitHub Actions API:

* **49 runs in September 2026** (50 to date; the workflow's history begins 2026-09-11).
* Plus 4 runs of a since-deleted "Home photo capture" workflow, 3 of "TEMP — fetch Google Maps asset
  and capture Home", and 3 of the opening-hours live smoke test. **59 billable CI runs in total.**
* `ci.yml` makes no Google calls — read in full and confirmed.

Per visual-regression run, counted from the scripts:

* 8 Home page loads in **fresh browser contexts** (4 viewports in `verify-home-against-figma.mjs`,
  1 in `compare-home-to-figma.mjs`, 1 + 1 reload in `verify-deck-gesture.mjs`, 1 in
  `report-photo-evidence.mjs`). A fresh context has empty `localStorage`, so the client cache never
  hit.
* Each load = **9 billable Nearby Search** requests, because `places-repository.ts` searches at
  lat 51.5074 / radius 40km, which `places-api-client.ts` turns into `scope=london`, which
  `api/places/search.js` turns into a nine-point grid. Plus 9 more from the workflow's own
  `curl` step. **≈ 72 Nearby Search per run.**
* Photographs: `report-photo-evidence.mjs` logged exactly **3 photo responses per load**, all `302`.
  `verify-deck-gesture.mjs` logged "**15 cards**", so the deck walk loads roughly 15 more. At 2
  billable calls per image through the `no-store` proxy, **≈ 39 image requests → ≈ 78 billable
  calls per run.**

**≈ 150 billable Google requests per run × 49 runs ≈ 7,350 requests in September**, of which
≈ 3,500 are Nearby Search — the most expensive SKU family of the three.

Three other findings, each independently verified:

1. **The enrichment guard could never be satisfied.** `ensurePlaceDetails` returned early only when
   `placeRow.website && placeRow.description`. `description` is Google's `editorialSummary`, which
   Google does not supply for most places. Measured against production on 2026-10-01: of **136**
   stored Google venues, **129** have a website but only **44** have a description. So **93 venues,
   68% of the catalogue**, failed the guard on every enrichment run and bought a Place Details call
   to re-learn that Google still had no editorial summary for them.
2. **`/api/places/status` billed a Nearby Search on every anonymous GET.** Public, unauthenticated,
   no rate limit. Anyone who found the URL could spend by refreshing it, and an uptime monitor
   pointed at it would have done so continuously.
3. **`Cache-Control: no-store` was set deliberately on all three public places endpoints.** That is
   the single line that turned "render a venue" into "buy a venue", and nothing in the test suite
   held it in place — a mutation test confirmed that putting it back broke nothing, which is why
   there are now tests on the headers themselves.

### What was automatic vs what a person triggered

| Automatic, no human in the loop | Human-triggered |
|---|---|
| `home-visual-regression.yml` on every PR touching `familypilot/**` | `scripts/audit-google-quality.mjs` |
| `opening-hours-live-smoke.yml` on changes to `google-places.js` | `scripts/audit-category-mapping.mjs --live` |
| `familypilot-automatic-enrichment` pg_cron, **every minute** → enrichment worker → Place Details per job | admin venue refresh via `/api/enrichment` |
| `familypilot-automatic-area-sync` pg_cron, Mon+Thu 03:00 → **10 Nearby Search** per run | a parent typing a town name (Geocoding) |
| `familypilot-venue-freshness` pg_cron, hourly, gated to once per UTC day | |
| **any page view of Home or Explore** → 9 Nearby Search + 3 image requests | |
| **any venue page open** → 1 Place Details | |

---

## 2. The switches

All of these are environment variables. Unset means "inherit the layer above".

| Variable | Default | Effect |
|---|---|---|
| `GOOGLE_PLACES_ENABLED` | on **only** when `VERCEL_ENV=production` | master switch for every Google API below |
| `GOOGLE_PLACES_DISCOVERY_ENABLED` | follows master | `places:searchNearby` — the expensive fan-out |
| `GOOGLE_PLACES_DETAILS_ENABLED` | follows master | Place Details for a parent opening a venue |
| `GOOGLE_PLACES_REFRESH_ENABLED` | follows master | Place Details from background enrichment and backfill |
| `GOOGLE_PLACES_PHOTOS_ENABLED` | follows master | the photo proxy |
| `GOOGLE_PLACES_PROBE_ENABLED` | follows master | `/api/places/status?probe=live` |
| `GOOGLE_GEOCODING_ENABLED` | follows master | town-name lookup |
| `GOOGLE_JOURNEYS_ENABLED` | follows master | Distance Matrix drive times |
| `GOOGLE_PLACES_ALLOW_LIVE_TEST` | unset | the **only** way a test runtime may spend |
| `GOOGLE_PLACES_MAX_CALLS_PER_DAY` | `2000` | per scope, counted across instances in Postgres |
| `GOOGLE_PLACES_MAX_CALLS_PER_WINDOW` | `60` | per process per rolling 60s |
| `PLACES_SEARCH_CACHE_TTL_HOURS` | `6` | server-side discovery cache |
| `PLACES_DETAIL_FRESH_DAYS` | `7` | how long a stored venue is served without a refresh |
| `ENRICHMENT_DETAILS_REFRESH_DAYS` | `14` | how often enrichment re-buys Place Details |

**To stop all Google spend immediately:** set `GOOGLE_PLACES_ENABLED=false` in the Vercel production
environment and redeploy. The app keeps serving stored venues and says in each response that it did
not refresh. Nothing silently falls back to a live call, and nothing silently falls back to demo
venues either.

An unrecognised value (`GOOGLE_PLACES_ENABLED=flase`) reads as **off**. A typo must not cost money.

### Recommended Vercel environment settings

**Production:**
```
GOOGLE_PLACES_MAX_CALLS_PER_DAY=500
GOOGLE_PLACES_MAX_CALLS_PER_WINDOW=30
```
Leave the scope switches unset so they follow the master default. 500/day/scope is far above what
the measured workload needs once caching is in place, and far below a runaway.

**Preview** — needed only so `opening-hours-live-smoke.yml` can make its single Place Details call:
```
GOOGLE_PLACES_ENABLED=true
GOOGLE_PLACES_DISCOVERY_ENABLED=false
GOOGLE_PLACES_PHOTOS_ENABLED=false
GOOGLE_PLACES_REFRESH_ENABLED=false
GOOGLE_GEOCODING_ENABLED=false
GOOGLE_JOURNEYS_ENABLED=false
GOOGLE_PLACES_MAX_CALLS_PER_DAY=25
PLACES_DETAIL_FRESH_DAYS=0
```

`PLACES_DETAIL_FRESH_DAYS=0` is the one that is easy to miss, and it was missed. Without it
`/api/places/detail` serves the stored copy of a venue and reports `provider: "google"` — correctly,
since the data did come from Google — so the smoke test passed all eight assertions against a copy of
Whitechapel Gallery fetched 0.45 days earlier, without Google being contacted at all. The check exists
precisely to prove that Google's live response still carries what the mapper expects, and it was
proving nothing while green. `assert-live-opening-hours.mjs` now fails on `cached: true` and names this
variable, so the gap announces itself rather than hiding behind a pass. Zero days means Preview always
refreshes, which is what Preview is for.

If you would rather no Preview deployment can ever spend, set nothing at all and let the smoke test
fail — it prints the exact variables it needs, so the failure explains itself.

**Development:** set nothing. Google is off.

---

## 3. What may and may not be stored

The Google Maps Platform terms draw a line that matters here:

* **Place IDs may be stored indefinitely.** `place_records.familypilot_place_id` and
  `external_id` are therefore permanent, and rows are never deleted to "expire" them.
* **Other Places content may be cached temporarily, not stored indefinitely.** Names, addresses,
  opening hours, editorial summaries, photo references.

What this codebase does with that:

| Data | Where | Retention | Verdict |
|---|---|---|---|
| Place ID | `place_records`, `venue_claims.familypilot_place_id` | indefinite | permitted |
| Search results | `public.place_search_cache` | 6h TTL, not served past 30 days, purged by `purge_expired_place_search_cache()` | permitted |
| Venue name, address, hours, website | `place_records` | **indefinite today** | ⚠️ see below |
| Photo reference | not stored | n/a | deliberately not stored — see `photoProxyPath` |
| Signed photo URL | not stored; proxied per request | CDN, 1h | permitted |
| Our own extracted evidence | `venue_source_evidence`, `venue_claims` | indefinite | not Google content |

**⚠️ One open compliance question, flagged rather than silently changed.** `place_records` retains
Google-derived venue content indefinitely, and `/api/places/detail` now refuses to serve a copy
older than 30 days — which addresses the serving side but not the storage side. As of 2026-10-01 only
**3 of 136** rows are older than 30 days, so the exposure is small, but the architecture does not
expire this content. Deciding whether to add a 30-day refresh-or-redact policy to `place_records` is
an owner decision about terms compliance, not a cost decision, and it is deliberately **not** bundled
into this cost work. It should not be resolved by deleting rows: the place IDs in them are what make
the catalogue stable, and they may be kept.

---

## 4. Observability

Every billable request emits one line to stdout, which Vercel captures:

```json
{"tag":"google_places_billable","sku":"nearby_search","scope":"discovery",
 "reason":"london_grid","subject":"51.5074,-0.1278 r=12km explore","cache":"miss",
 "environment":"production","executionId":"...","jobId":null,"dayCount":37,"windowCount":4}
```

Every **blocked** request emits `{"tag":"google_places_blocked", ...}` with the reason. A closed
switch is visible, not silent.

No line ever carries the API key, a full request URL, or a header. A test asserts this.

Daily totals, by SKU family, scope and environment:

```sql
select usage_day, sku, scope, environment, calls
from public.google_places_usage
where usage_day >= current_date - 14
order by usage_day desc, calls desc;
```

The posture of a running deployment, free and without a billable request:
`GET /api/places/status` → the `placesBudget` object.

**Known limitation, stated rather than hidden.** The daily cap is primed from Postgres at most once a
minute per process, so with many concurrent serverless instances it bounds overshoot rather than
enforcing an exact figure. It is a ceiling with a lag, not a transactional limit. The Google Cloud
quotas in the next section are the hard limit.

---

## 5. Google Cloud settings to apply by hand

**A budget alert is not a spending cap.** It sends an email after the money is spent. The things that
actually prevent spend are: disabling APIs, restricting the key, and setting quotas. Do those first.

Start conservative. Hitting a quota is recoverable in a minute; a surprise bill is not.

### 5.1 Disable every API the project does not use

Google Cloud console → **APIs & Services → Enabled APIs & services**. This project needs exactly
these, and nothing else:

| Keep enabled | Why |
|---|---|
| **Places API (New)** | search, details, photos |
| **Geocoding API** | town-name lookup in `api/planning/location.js` |
| **Distance Matrix API** | drive times in `journey-provider.js` |

**Disable** everything else, and specifically: Places API (legacy), Maps JavaScript API, Maps Static
API, Maps Embed API, Directions API, Roads API, Routes API, Time Zone API, Elevation API, Street View
Static API, Address Validation API, Air Quality API, Solar API, Maps Datasets API. None is referenced
anywhere in this repository. Disabling an API is the only change that makes a call *impossible* rather
than merely capped.

### 5.2 Restrict the API key

**APIs & Services → Credentials → the key used by `GOOGLE_PLACES_API_KEY`.**

* **API restrictions:** *Restrict key* → select only Places API (New), Geocoding API, Distance Matrix
  API.
* **Application restrictions:** this key is used **only from Vercel server functions**, never from a
  browser or an app. So:
  * Do **not** use "HTTP referrers" — that is for client-side keys and would not restrict a server.
  * Vercel serverless functions do not have stable egress IPs on Hobby/Pro, so "IP addresses" is
    usually not workable. If the project is on a plan with a static egress IP, use it — it is the
    strongest option available.
  * Otherwise leave application restrictions as **None** and rely on the API restrictions above plus
    the quotas below. The key is server-only, is never sent to a client, and is not in the repository.
* **Create a second, separate key** for anything that ever needs to be client-visible, and never give
  that key the Places API. Note that `docs/ARCHITECTURE.md` lists an
  `EXPO_PUBLIC_GOOGLE_PLACES_KEY` variable; **nothing in the code reads it**, and it must never be
  set — an `EXPO_PUBLIC_*` variable is compiled into the browser bundle.

### 5.3 Set quotas — the actual cap

**APIs & Services → Places API (New) → Quotas & System Limits.** Set *per day* limits, which is what
caps spend; per-minute limits only smooth bursts.

Suggested starting figures for a single-developer project with caching in place. These are
deliberately tight.

| Quota | Set to | Reasoning |
|---|---|---|
| Nearby Search requests **per day** | **200** | The measured production need is ~10/run × 2 cron runs a week, plus one London grid (9) per 6h cache window ≈ 36/day. 200 leaves room and still caps the worst case hard. This is the most expensive SKU — cap it tightest. |
| Place Details requests **per day** | **300** | Enrichment now refreshes at most once per venue per 14 days across 136 venues ≈ 10/day, plus venue opens. |
| Place Photos requests **per day** | **500** | Three images per Home load, now CDN-cached for an hour. |
| Requests per minute (each) | **30** | Bounds a burst without affecting normal use. |

**Geocoding API → Quotas:** requests per day **50**. It is only reached when a parent types a town
name rather than a postcode.

**Distance Matrix API → Quotas:** *elements* per day **500**, elements per minute **60**. Remember
this API bills per element, and one request carries up to 25.

Raise any of these only after `public.google_places_usage` shows the real figure for a normal week.

### 5.4 Then add the budget alert

**Billing → Budgets & alerts → Create budget.** Scope it to this project, amount **£10/month**, with
alerts at 50%, 90% and 100%, and tick *Email alerts to billing admins*.

£10 rather than £100: the point is to hear about a problem in the first day, not at the end of the
month. September's £104.11 would have tripped this on roughly day three.

Optionally connect the budget to a Pub/Sub topic and a function that disables billing — Google
documents this, and it is the only way a budget becomes a true cap. Until that exists, **the quotas
in 5.3 are the cap and the budget is only a smoke alarm.**

### 5.5 Read the SKU breakdown before trusting section 1's arithmetic

**Billing → Reports**, group by **SKU**, filter to September 2026. The audit above predicts roughly
3,500 Nearby Search, 1,900 Place Details and 1,900 Place Photos requests. If the real breakdown is
materially different — especially if a SKU appears that this repository has no code for — that is a
finding, not a rounding error, and it should be investigated rather than explained away.
