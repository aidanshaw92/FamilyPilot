# Google photograph spend: verification of the enforcement path (2026-10-08)

**Scope and limits.** Read-only. I made no Google call, changed no Vercel or Google Cloud setting and wrote nothing to the
database. The production host, Google's billing console, Google's documentation and its pricing pages are all unreachable
from this environment (egress blocked), so **prices and quota names below come from my understanding of Google's published
model and from search snippets, and are marked "verify" where it matters**. Counts come from the read-only
`google_places_usage` table and from code on `main`.

## 1. Bottom line

1. **The application cap is not a reliable global hard cap.** It is a best-effort guard. Only a quota set inside Google Cloud
   is a hard cap. I cannot see whether one exists.
2. **My earlier cost model was wrong in two ways.** (a) One displayed photograph that is not already cached costs **two**
   Google requests, not one (a Place Details lookup for the photo reference, then the photo media call). (b) The cap and the
   usage table count **requests, not photographs**, so "200 a day" in the environment variable means 100 photographs.
3. **The photo endpoint is public and will spend on any place identifier a caller supplies**, and its cache key includes
   query parameters a caller can vary, so the CDN cache is not a barrier against someone trying to spend.
4. **Recommendation: switch new paid photograph calls off now** (`GOOGLE_PLACES_PHOTOS_ENABLED=false`) and turn them back on
   only after a Google-side daily quota is verified in the console (section 7). Section 8 gives the exact steps, and what a
   200-a-day posture looks like once they are in place.
5. **One fact is unexplained and matters more than the rest:** the usage table accounts for about 684 photo requests (about
   340 photographs, a few dollars) in the week, yet the reported charge was about £100. The table is a lower bound and does
   not see anything that bypasses the application. Reconcile it against Google's own request counts before trusting any
   estimate in this document (section 6).

## 2. The request path, verified from `api/places/photo.js` on `main`

For every request that is not already in the CDN:

1. `primePlacesBudget()` reads today's shared total from Postgres (at most once a minute per instance).
2. `lookupPhotoReference` calls `GET places/{id}` with field mask `photos`, guarded by `assertPlacesAllowed({scope:'photos'})`.
   **Billable request 1.**
3. `resolveMediaUri` calls `GET {photoName}/media?maxWidthPx=800&skipHttpRedirect=true`, guarded by
   `assertPlacesAllowed({scope:'photos'})`. **Billable request 2.**
4. A 302 to the signed `googleusercontent.com` URL with `Cache-Control: public, max-age=600, s-maxage=3600`. Every failure is
   `no-store`.

Both requests are counted under scope `photos` (sku label `place_photos`). A photograph is therefore two units. The first
request is a Place Details call, not a media call, so it is probably billed on a Place Details SKU (the field mask `photos`
should select the lower Place Details tier; **verify in the SKU report**), and the second on the Place Photo SKU.

The browser then fetches the image from Google's image host. I expect that fetch not to be billed (it is not a Places API
call); **verify**.

## 3. Cost per photograph and exposure (list prices as I understand them; verify)

| Item | List price | Free allowance per month | Source of the figure |
| --- | ---: | ---: | --- |
| Place Photo media request | about $7 per 1,000 | about 1,000 | search snippets, not the pricing page |
| Place Details lookup, field `photos` | between $5 (Essentials) and $17 (Pro) per 1,000 | 10,000 / 5,000 | my understanding of the SKU tiers; **unverified** |

The highest-tier field in a request sets that request's SKU, and free allowances are **per SKU**, not shared.

| Scenario | Photographs / day | Requests / day | Cost / month, low (lookup $5) | Cost / month, high (lookup $17) |
| --- | ---: | ---: | ---: | ---: |
| 7 October as observed | about 170 | 339 | n/a | n/a |
| Proposed temporary limit (200 new photographs) | 200 | 400 | about $35 | about $52 |
| Proposed limit read as 200 requests | 100 | 200 | about $14 | about $14 |
| Code default, **assuming it were enforced exactly** (2,000 requests) | 1,000 | 2,000 | about $300 | about $630 |

(30-day months; free allowances applied; $1 is about £0.78.) My earlier figure of "about £330 a month at the default ceiling"
assumed one request per photograph; the corrected range is about £235 to £490 **if the cap held**. It does not hold exactly,
so the real ceiling is higher and, without a Google quota, **not bounded by anything I can show**.

## 4. Why the application cap is not a global hard cap

From `server/places/lib/places-budget.js`:

| Mechanism | What it really does | Consequence |
| --- | --- | --- |
| Window cap, default 60 requests per 60 s | an **in-memory counter per serverless instance** | N concurrent instances allow N times as many |
| Daily cap, default 2,000 | per scope, compared with `max(local count, last primed database total)` | the database total is read **at most once a minute per instance**, so each instance can overshoot by up to a minute of traffic |
| Recording | `record_google_places_usage` is **fire-and-forget** | if an instance is frozen after the response, a write can be lost, so the shared total can under-count and the daily cap may never converge. I cannot prove either way from here |
| Units | one number, `GOOGLE_PLACES_MAX_CALLS_PER_DAY`, applied to **every scope separately** | no photograph-specific cap; total across scopes can exceed the number; and it counts requests, not photographs |
| Failure mode | if the database is unreachable the guard falls back to the local counter | availability of the cap depends on Supabase |

So the worst case under a flood is roughly *(concurrent instances) x (60 requests per minute)* until the primed total
catches up, and it may not catch up if writes are lost. I have not tried to measure it (that would spend money).

## 5. Other ways photograph spend can arise

* **The endpoint is open.** `GET /api/places/photo?id=<any 1 to 200 character id>&index=0..2` needs no session and does not
  check that the id is one of ours. A caller can enumerate identifiers and each unseen id is two billable requests (a lookup
  for an id that does not exist may also be billed; **verify**).
* **The cache key includes the whole query string.** The `credit` and `photoUri` parameters exist for attribution but do not
  change the image, so a caller adding `&x=1`, `&x=2` produces a new cache entry each time and a new pair of requests. The CDN
  cache stops accidental repeat spend by honest clients; it does not stop deliberate spend. (The in-process `dedupe` only
  merges simultaneous requests inside one instance.)
* **Regional edge caches.** Vercel's edge cache is per region, so one photograph can be bought once per region per hour.
* **No durable copy.** Google's terms limit what may be stored, so there is no stored image to fall back on. "Existing
  cached photography continues to work" is true only for at most the CDN hour (plus 10 minutes in a browser). After that an
  image whose request is refused fails to the category artwork. Making that last longer needs either a longer `s-maxage`
  with `stale-while-revalidate`/`stale-if-error` (safe only if the signed image URL outlives the cache, which I cannot
  measure without a paid call) or storing images, which I recommend against.
* **Database cron jobs** (`area-sync` Nearby Search, `automatic-enrichment` and `venue-freshness` Place Details) do not call
  the photo endpoint. They matter for the total bill, not for photographs. The `venue-freshness` job and enrichment `generate`
  / `regenerate` use the detail field mask, which includes `websiteUri`, opening hours and `editorialSummary`; the highest
  field sets the SKU, so those are billed at a higher tier than the photo lookup (**verify**).
* **Search responses carry photo metadata.** `places.photos` is in the search field mask. Together with `websiteUri` and
  opening hours that probably places Nearby Search in the higher tier (**verify**). Not a photo media cost, but it is a
  reason the search estimate in the earlier audit may be low.
* **GitHub workflows.** None is scheduled. `live-canaries` and `nearby-food-canary` are manual; `opening-hours-live-smoke`
  stands down without a Preview opt-in. None calls the photo endpoint.
* **Key exposure.** The key is read server-side only (`GOOGLE_PLACES_API_KEY`, fallback `GOOGLE_MAPS_API_KEY`); no
  `EXPO_PUBLIC_` Google variable exists in the code. I cannot see the key's restrictions or where else it is used
  (`scripts/audit-google-quality.mjs` reads it from the local environment). Both are part of the reconciliation below.

## 6. The unexplained gap, and how to reconcile it (you; about five minutes)

The usage table shows, for 1 to 7 October, 684 photo requests, 88 Nearby Search, 14 Place Details and 2 geocodes. At the
prices above that is roughly $8 before free allowances. A charge of about £100 cannot come from that. The possibilities, in
likely order:

1. usage before 1 October (the table may start then);
2. other SKUs or products on the same Google project (Maps JavaScript, Static Maps, Routes, another app);
3. calls that did not pass the application (the same key used by a script, a laptop, a Preview deployment that did not
   record, or an exposed key);
4. the table under-counting (lost fire-and-forget writes);
5. prices above my assumptions (for example the higher Search tier).

To find out: Google Cloud Console, **Billing > Reports**, group by **SKU**, and note the SKU names and costs; then **APIs &
Services > Places API (New) > Metrics**, group by method, and compare the request counts for 1 to 7 October with the table.
If Google's counts are materially higher than the table's, something is bypassing the guard and the key needs restricting
before anything else.

## 7. What can and cannot be enforced

| Control | Hard cap? | Notes |
| --- | --- | --- |
| Google Cloud per-method **requests per day** quota on Places API (New) | **Yes**, once set; Google returns 429 beyond it | the only reliable one. The exact quota names and whether each method offers a per-day limit (rather than only per minute) I could not read; confirm in the console |
| Google Cloud budget and alerts | **No** | they notify; they do not stop spend. A budget can drive a programmatic action (for example disabling the API) but with a delay of hours |
| API key restrictions (API restriction to the Places and Routes/Geocoding APIs actually used; no client use) | Reduces exposure | does not cap volume |
| `GOOGLE_PLACES_PHOTOS_ENABLED=false` | **Yes for photographs**, immediately, for this app | applies on the next deployment/instance; it stops the application calling, not other users of the key |
| `GOOGLE_PLACES_MAX_CALLS_PER_DAY`, `..._PER_WINDOW` | **No** (see section 4) | a speed bump and early warning only |

## 8. Exact instructions (I have changed nothing)

**A. Stop new paid photograph calls now (recommended until C is done).** Vercel: Project **FamilyPilot > Settings >
Environment Variables**. Add `GOOGLE_PLACES_PHOTOS_ENABLED` = `false` for **Production** (and Preview), then redeploy the
production deployment (an env change applies only to new deployments). Effect: every cache miss returns 503, which the app
treats as "no photograph" and draws the category artwork. Images already in the CDN keep working until their hour expires.
Note I have not rendered the app with this switch off in a browser against production; the hardening change in section 9
adds a verified fixture for that state.

**B. Google Cloud: restrict the key.** Console **APIs & Services > Credentials**, open the key used as
`GOOGLE_PLACES_API_KEY` > **API restrictions > Restrict key** > tick only the APIs the app uses (Places API (New); Routes and
Geocoding only if enabled). Confirm no other app or script uses it; create a separate key for local scripts.

**C. Google Cloud: set hard daily quotas.** Console **APIs & Services > Enabled APIs & services > Places API (New) >
Quotas & System Limits**. Filter by the method names containing *photo* and *place* (the photo media method and the
Place Details method). Use the pencil (edit) on a **per-day** row. Suggested values for the 200-new-photographs posture:

| Method | Daily limit | Reason |
| --- | ---: | --- |
| photo media (`GetPhotoMedia`) | 200 | the 200 new photographs |
| Place Details (`GetPlace`) | 300 | 200 photo lookups plus the daily freshness ceiling of 50 and a margin |
| Nearby Search (`SearchNearby`) | 100 | the area-sync job is about 10 requests twice a week plus 6-hour cached user searches |

If a method offers only a per-minute row, a daily cap is not available for it; then do not re-enable that call path without
the application hardening in section 9, or use a budget-triggered action as a slower backstop. After saving, re-open the
page and confirm the new value is shown against the correct method.

**D. Google Cloud: budget.** **Billing > Budgets & alerts > Create budget** for the project: monthly amount £30, alerts at
50 %, 90 % and 100 %, notifications to your email. Optionally connect the budget to a Pub/Sub topic if you later want
automatic disabling.

**E. Vercel caps (only after C).** `GOOGLE_PLACES_MAX_CALLS_PER_DAY` = `400` (requests, so 200 photographs, but also applied
to every other scope separately), `GOOGLE_PLACES_MAX_CALLS_PER_WINDOW` = `30`. Then set `GOOGLE_PLACES_PHOTOS_ENABLED=true`
and redeploy. Treat these as defence in depth, not as the cap.

**F. Verify.** Next morning, compare **Places API (New) > Metrics** (requests by method) with `google_places_usage` for the
same day. They should agree within a few percent; if the Google figure is higher, stop and investigate before leaving photographs on.

## 9. Proposed hardening (separate PR; no production change until you approve)

Small, code-only, no new feature: (1) accept only identifiers present in our `place_records` and only the three known query
parameters, so the endpoint cannot be used to spend on arbitrary places or cache keys; (2) a photograph-specific daily
limit counted in photographs, not requests; (3) a fixture and verifier proving the app renders correctly with photographs
disabled. A transactionally enforced global cap (an atomic reserve-and-count database function) is possible but needs a
migration and, given Google's own quota is the real control, I do not recommend it until C is confirmed unavailable.

## 10. Corrections to earlier documents

`PROVIDER_SPEND_AUDIT.md` and `BETA_READINESS_REPORT.md` are amended on this branch: two requests per photograph, requests
not photographs in the cap, the corrected exposure range, and the unexplained gap.
