# FamilyPilot — Project Status Summary

**Last updated:** 11 September 2026
**Production URL:** https://family-pilot-seven.vercel.app/
**Product constitution:** [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md) — read before any code change

> **Note on this update:** the previous version of this document (dated 7 August 2026) was badly out of
> date. It described the app as mock-data-only with no onboarding, no real geocoding, and no tests. None
> of that is true at HEAD. A large body of work landed between 8 August and 11 September 2026 — live
> Google/OSM places, real UK geocoding, a genuine evidence-backed trust pipeline, routine-aware family
> planning, family-to-family connections, and post-visit feedback — without the docs being kept in sync.
> This rewrite reflects what actually exists in the repository as of the commit below, verified by
> reading the code (not by re-reading old docs). One thing the old doc got right and this pass fixed:
> there was genuinely no CI — see "Fixed in this pass" below. Keep this document honest going forward:
> update it whenever a feature crosses from mock/partial to live, or vice versa.

**Verified against commit:** `43581a4` ("Fix profile location, Saved, and London place quality")
**Verified by:** installing dependencies fresh, running `npm run typecheck`, `npm test`, and
`npm run build:web` in `familypilot/`, and reading the actual source of every API route and the
screens that call them.

---

## Executive Summary

FamilyPilot is a personalised family decision engine: one family profile (location, children's ages,
routines, budget, max drive time) drives explainable **Family Match** scores on real London venues, an
evidence-based trust model for facility facts (baby changing, toilets, parking, pushchair suitability),
routine-aware "will this work today" planning, and consent-based planning between two families.

**This is a working, live-data product, not a static prototype or mock demo.** With `GOOGLE_PLACES_API_KEY`
set, Explore and Home show real London venues (Google Places, deduplicated and quality-filtered, with an
OSM Overpass fallback), onboarding geocodes a real UK postcode/town via postcodes.io or Google Geocoding,
and drive times/weather come from live providers. Every external dependency (Places, weather, drive-time,
AI parsing, Supabase) degrades gracefully and *honestly* when its key is absent — mock/estimated data is
always labelled as such, never presented as live.

**Current focus:** documentation and trust catch-up after a large feature push (family planning,
connections, post-visit feedback, London place-quality fixes) landed across ~30 commits without status
docs being updated. No urgent functional work is blocked; the priorities below are refinement, not
ground-up construction.

---

## What's real vs. partial vs. mock (verified by reading code, not docs)

### Real, live-data-capable (works today with the right API key; honest fallback without one)

| Feature | Entry points | Provider(s) |
|---|---|---|
| Onboarding: name, home postcode/town → geocode, children (name + DOB/age), max drive, budget | `app/(onboarding)/setup.tsx` → `api/planning/location.js` | postcodes.io, Google Geocoding |
| Profile edit, re-geocoding on location change | `app/profile/edit.tsx` | same |
| Live London venue discovery (Home + Explore grid, area search e.g. "Richmond", "NW7") | `api/places/search.js`, `src/services/places/places-repository.ts` | Google Places (searchNearby), OSM Overpass fallback, mock last resort |
| Venue detail (address, photos, hours, open status) | `api/places/detail.js`, `api/places/photo.js` | Google Places detail/photos |
| Drive time / distance | `api/context/journey.js`, `server/context/lib/route-matrix.js` | Google **Routes API `computeRouteMatrix`**, traffic-unaware, **fail-closed** (refuses unless `GOOGLE_JOURNEYS_ENABLED=true`); Haversine estimate fallback (labelled `estimated`). Legacy Distance Matrix is **never called** — see `docs/routing-decisions.md` §1 |
| Public transport journeys (London) | `api/context/journey.js`, `server/context/lib/tfl-transit.js` | **TfL Unified API**, free, verified live; off unless `TFL_TRANSIT_ENABLED=true`, and not yet surfaced in the UI. Outside London returns `unknown`, never "no public transport" |
| Places to eat near a venue (`RestaurantsCloseBy` on venue detail, and the lunch stop in a day plan) | `api/places/search.js?intent=nearby-food` → `server/places/lib/nearby-food-endpoint.js`, `osm-food.js` | **OpenStreetMap Overpass**, free, **zero Google calls by construction** — the module's whole import graph holds no API key, budget gate or Google client. Cached in Postgres for 6h. An outage surfaces as a `meal-lookup-failed` caveat, never as an empty neighbourhood. Walking and driving figures are labelled estimates; transit is deliberately **absent** rather than guessed |
| Weather-aware recommendations | `api/context/weather.js` | OpenWeather; deterministic seasonal estimate fallback (labelled `estimated`) |
| Family Match scoring, explainable reasons | `src/services/scoring/*`, personalisation in `services/api/index.ts` | client-side, driven by real profile + real venue data |
| Venue facility trust model (confirmed / not yet confirmed — never "No" for unknown) | `server/enrichment/_lib/consumer-projection.js`, `FacilityGrid.tsx`, venue detail screen | Supabase-backed evidence/claims pipeline (see below) |
| Evidence-backed enrichment pipeline (fetch official sources → extract facts → editor/AI draft → approved claim) | `server/enrichment/_lib/*`, `api/enrichment/index.js`, internal console at `/internal` | Google Places, official venue websites, OpenAI (optional, for AI drafts) |
| Saved places (device-local, survives reload) | `app/(tabs)/saved.tsx`, `src/stores/saved-store.ts` (AsyncStorage) | local only — **not yet synced across devices/accounts** |
| Free-text "Plan a day" parsing | `api/recommendations/parse-request.js` | OpenAI JSON mode; deterministic mock parser fallback |
| Routine-aware planning ("leave by X so you're back before nap") | `app/(tabs)/trips.tsx` and supporting `src/services`/`src/components/planning` | client-side scheduling logic over real venue + profile data |
| Family-to-family consent connections (share a code, connect, plan together) | `api/planning/connections.js` | Supabase (service-role), hashed connection codes, 7-day expiry |
| Post-visit feedback (baby changing / pushchair / parking / age fit) | `api/planning/feedback.js`, `src/components/planning/VisitFeedback.tsx` | Supabase RPC `submit_venue_visit_report`, rate-limited, triggers re-enrichment on conflicting reports |
| Cloud backup of planning workspaces | `planning_workspaces` table, Supabase client auth | requires `EXPO_PUBLIC_SUPABASE_*` client keys |

### Mock/legacy (Phase-1 screens, intentionally deferred from the pilot build)

These are hidden by default in the pilot build via `src/config/pilot-features.ts`
(`EXPO_PUBLIC_SHOW_DEFERRED_FEATURES=true` reveals them for internal QA):

- Need Something Now (`app/need-now.tsx`) — mock inventory, filters are visual-only
- Holiday planner (`app/holiday.tsx`) — mock provider comparison
- Packing list (`app/packing.tsx`) — static checklist, not trip/weather-driven
- Car fit checker (`app/car-fit.tsx`) — fixed mock vehicle/equipment data
- Restaurant browsing (`app/restaurant/[id].tsx`, Explore's Restaurants category, Saved's Restaurants
  filter), the **mock** `EatNearbySection`, and the Concierge modal — behind the same flag
  - **THERE ARE TWO "EAT NEARBY" THINGS AND THEY ARE NOT THE SAME.** `EatNearbySection` is the mock one,
    gated behind `eat_nearby`. `RestaurantsCloseBy` is the **real** one — OpenStreetMap-backed, live, and
    **not gated** — and it renders on every venue detail today. Reading "Eat Nearby is behind a flag" and
    concluding no real restaurant data ships would be wrong. Same hazard as `CommunitySection` versus
    `VenueTrustPanel` below.
- `CommunitySection` on venue detail — renders mock `communityTips` if present (harmless: renders nothing for real venues, which have none); **the real feedback signal is `VenueTrustPanel`**, not this component — don't confuse the two when reading venue detail code.

### Known gap: the old Supabase schema is unused

`supabase/migrations/001_initial_schema.sql` (`profiles`, `family_members`, `saved_items`, `trips`,
etc.) was written in Phase 1 and **is not used by the client**. Family profile lives in Zustand +
AsyncStorage (`src/stores/family-store.ts`); Saved lives in AsyncStorage (`src/stores/saved-store.ts`).
The tables actually in use today (`place_records`, `venue_family_metadata`, `venue_enrichment_drafts`,
`venue_source_evidence`, `venue_claims`, `canonical_venues`, `venue_place_links`,
`planning_workspaces`, `planning_connections`, `venue_visit_reports`) come from migrations `002`–`20260909205743`
and back the trust/enrichment/planning system, not user profiles. If/when Saved and the family profile
need cross-device sync, they need new tables (or reuse of `planning_workspaces`'s pattern) — the old
14-table schema should be treated as dead weight, not a foundation to build on.

---

## Fixed in this pass (11 September 2026)

1. **Dependencies installed and a real baseline established.** `npm install` (root + `familypilot/`),
   then `npm run typecheck`, `npm test`, `npm run build:web` all run clean:
   - **Typecheck:** was failing — `tsconfig.json` had no `exclude`, so it was type-checking the Deno
     edge function (`supabase/functions/enrichment-worker`) against a Node/RN config, and several test
     files had latent implicit-`any`/possibly-null errors from dynamically importing untyped `.js`
     server modules. Fixed both (added `exclude: ["node_modules", "supabase/functions/**"]`; typed the
     dynamic-import results in the affected test files). **0 errors now.**
   - **Tests:** 324/324 pass (34 files). Three `remediation.test.ts` cases need `dist/` to exist first
     (`npm run build:web`) — not a real failure, just build-then-test ordering.
   - **Build:** `expo export --platform web` succeeds, 47 static routes exported.
2. **Fixed a real wiring bug:** `app/(tabs)/_layout.tsx` never applied the `trips_tab` pilot-feature
   flag to the Plans tab, so it was visible in the pilot build despite the flag's own comment and a
   passing test (`pilot-features.test.ts`) both declaring it should be hidden by default. Wired the
   flag through so intent and behaviour match. The feature itself is fully built and unaffected —
   `EXPO_PUBLIC_SHOW_DEFERRED_FEATURES=true` reveals it for QA at any time.
3. **Added `familypilot/.env.example`** — no such file existed anywhere in the repo despite ~30 env
   vars being referenced across `api/`, `server/`, and the client. Documents every var, what it unlocks,
   where to get it, and what happens when it's absent.
4. **Added `.github/workflows/ci.yml`.** There was genuinely no CI (the one thing the stale August doc
   got right) — nothing enforced typecheck/tests/build on a PR, which is exactly how the tsconfig and
   test-typing regressions above went unnoticed. CI now runs `npm ci`, `typecheck`, `build:web`, then
   `test` (in that order — three tests assert `dist/` exists) on every PR and push to `main`.
5. **Rewrote this document** to match reality.

None of the above changed runtime behaviour for a fully-configured deployment — they fix developer
experience (clean typecheck/tests, regressions caught before merge instead of by the next agent), one
visibility bug, and documentation debt.

---

## Verified end-to-end (by reading the actual request path, not by re-trusting docs)

- **No silent Central London fallback for user-entered locations.** `resolveUkLocation()`
  (`src/services/location/location-client.ts`) throws a real error on failed geocoding; both onboarding
  (`setup.tsx`) and Explore area search (`explore.tsx` → `venueService.searchArea`) surface that error
  to the user instead of swallowing it. The only remaining Central-London fallback
  (`geo-utils.ts: DEFAULT_HOME`) fires solely for **legacy profiles saved before geocoding existed** and
  has no live user data to affect yet (Saved/profile are device-local, pre-launch).
- **Unknown facility data never renders as "No".** `FacilityGrid` only renders confirmed-yes facilities
  or a generic "Not confirmed — family facilities not yet reviewed" line; `VenueTrustPanel` renders
  explicit per-field statuses (`Source checked`, `FamilyPilot review`, `Parents have reported; source not
  confirmed`, or `Not yet confirmed`) — there is no boolean coercion anywhere in this path.
- **Explore area search is a genuine live radius search**, not a filter over a pre-loaded list:
  `venueService.searchArea()` geocodes the typed area, guards it to within 45km of central London, then
  calls the real `/api/places/search` with those coordinates.
- **Saved persists across reload** via AsyncStorage (`familypilot-saved-v2` key) — confirmed by reading
  the store, not by manual UI testing (see Known Gaps below for why manual testing wasn't possible here).

---

## Known gaps & next priorities

1. **No cross-device sync for Saved or family profile.** Both are AsyncStorage-only. Low risk pre-launch,
   but plan a migration to Supabase (reusing the `planning_workspaces` RLS pattern) before multi-device
   use matters.
2. **Old `001_initial_schema.sql` schema is dead code.** Either delete it or explicitly mark it
   superseded so a future agent doesn't build on it by mistake.
3. **Live verification of real providers is now possible, and has been done — from CI, not from here.**
   This item is **substantially revised (3 Oct 2026)**; what it said before was accurate in September and
   is no longer.

   The sandbox's egress limits still hold: it cannot reach the production URL, a preview deployment,
   `api.tfl.gov.uk`, `overpass-api.de` or Google's documentation. **The way around that is GitHub
   Actions**, which has ordinary egress and can call a deployed build. Two workflows now do exactly that
   and are the pattern to reuse: `.github/workflows/live-canaries.yml` and
   `.github/workflows/transit-live-smoke.yml`. Running the check from CI is also *better* than from a
   laptop: it makes the request through the deployment's own egress, User-Agent and cache, so what is
   measured is the request the product actually makes.

   What has been verified live this way: TfL transit (cross-checked against the runner's own independent
   call to TfL), one real Routes API element, the food cache's behaviour, and the Google cost posture of
   both Preview and production. See `docs/RESTAURANT_ROUTING_SIGNOFF.md` for the run ids.

   **The Vercel MCP connector is not 403-scoped to another account** — it works for this project. One
   quirk worth knowing, because it looks exactly like a permissions problem: passing the project **id**
   together with `teamId` returns `403 forbidden`, while passing the project **name** (`family-pilot`)
   with no team parameter succeeds. If a Vercel call 403s, try the name before concluding you lack access.

   **The client-side Supabase vars now exist in Production** (`EXPO_PUBLIC_SUPABASE_URL`,
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), so the Plans tab's account flow is configured there. They are
   **absent from Preview**, so that flow will not work on a preview deployment — which is a real trap when
   testing a PR rather than production.

   Still outstanding, and genuinely needing a person: **manually walking `docs/PARENT_TESTING_GUIDE.md`**
   against production (NW7, Richmond, Greenwich, Bromley, an invalid postcode; save/unsave persistence;
   provider-failure behaviour). Automated checks cover request paths and cost posture; they do not tell
   you whether the app feels right to a parent.
4. **Mock/legacy Phase-1 screens** (Need Now, Holiday, Packing, Car Fit) remain behind the pilot flag —
   correctly deferred per the master build priority (P2), not a bug.
5. **`docs/` still contains many stale files** dated 6–8 August 2026 (`PHASE_2_REMEDIATION.md`,
   `TRUST_AND_POLISH_PASS.md`, `FINAL_BETA_POLISH.md`, `LIVE_GOOGLE_QUALITY_PASS.md`, etc.) that predate
   the September planning/connections/feedback work. They're historically accurate for their date but
   are no longer a reliable picture of current state — this document supersedes them for "what works
   today"; treat them as changelog entries, not current-state references.

---

## Required credentials

See `familypilot/.env.example` for the full list with descriptions and where to obtain each key.

**Confirmed already configured in Vercel (Production + Preview), 11 Sept 2026:**
`GOOGLE_PLACES_API_KEY`, `OPENWEATHER_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_URL`, `PLACES_PROVIDER`, `ENRICHMENT_ADMIN_TOKEN`. This covers every server-side provider —
live places, weather, drive times, AI parsing/enrichment, and server-side Supabase (connections,
feedback, enrichment pipeline) should all be live in production and on PR preview deployments.

**Still missing — only blocks client-side Supabase auth (connecting families / cloud backup):**

| Missing credential | What it unlocks | Get it from |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Client-side Supabase connection | Same Supabase project (`uuolfuebwimrsjfgffsm`) → Project Settings → API → Project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `EXPO_PUBLIC_SUPABASE_ANON_KEY`) | Client-side auth for the Plans tab's "connect a family" / cloud-backed plans account flow | Same page → anon/publishable key (**not** the service role secret — this one is safe to expose client-side) |

Add these as Vercel env vars (Production **and** Preview, like the others) to light up that last piece.

A Supabase project (`uuolfuebwimrsjfgffsm`, region `eu-west-1`) already exists and is active with real
data in it (51 place records, 49 venue family-metadata rows, 294 evidence rows, 56 approved claims) —
the schema is deployed, it's specifically the *env vars pointing the app at it* that weren't present in
this sandbox.

---

## How to run

```bash
npm install                 # repo root
cd familypilot && npm install
npm run typecheck            # 0 errors
npm test                     # 324/324 pass
npm run build:web            # exports to familypilot/dist
npm start                    # Expo dev server (i/a/w for iOS/Android/web)
```

No environment variables are required to start the app — every provider has a labelled fallback. Add
keys from `.env.example` incrementally to light up real data.

---

## Documentation index

The documents below were the pre-existing index and remain useful for historical context and specific
subsystems, but **defer to this document for current end-to-end state** — several are stale by a month
or more as noted above.

### Product constitution (read first)

| Document | Purpose |
|----------|---------|
| [MASTER_PRODUCT_VISION.md](./MASTER_PRODUCT_VISION.md) | Canonical product vision |
| [DECISION_PRINCIPLES.md](./DECISION_PRINCIPLES.md) | Build / no-build gates for every change |
| [MVP_SCOPE.md](./MVP_SCOPE.md) | Scope for parent testing (verify against this doc before trusting — see note above) |
| [FAMILY_MATCH.md](./FAMILY_MATCH.md) | Scoring model & explainability |
| [PRIVACY_MODEL.md](./PRIVACY_MODEL.md) | Privacy rules for location & sensitive prefs |

### Trust / data / enrichment subsystem (accurate in substance; the most sophisticated part of the codebase)

| Document | Purpose |
|----------|---------|
| [DATA_PROVENANCE.md](./DATA_PROVENANCE.md) | Provenance model for venue facts |
| [PLACES_DATA_ARCHITECTURE.md](./PLACES_DATA_ARCHITECTURE.md) | Places data layer design |
| [VENUE_ENRICHMENT_WORKFLOW.md](./VENUE_ENRICHMENT_WORKFLOW.md), [AI_VENUE_ENRICHMENT.md](./AI_VENUE_ENRICHMENT.md), [EVIDENCE_BACKED_ENRICHMENT.md](./EVIDENCE_BACKED_ENRICHMENT.md) | Enrichment pipeline (evidence → claims → consumer projection) |
| [FAMILY_GRAPH.md](./FAMILY_GRAPH.md) | Family-to-family connection model |
| [FAMILY_PLANNING_BUILD.md](./FAMILY_PLANNING_BUILD.md) | **Up to date (10 Sept 2026)** — the actual spec for the Plans tab, routine-aware scheduling, fair meeting suggestions, connections, and cloud backup implemented in this pass. Read this instead of the Phase-1 Trips description elsewhere. |
| [VENUE_DATA_AUTOMATION.md](./VENUE_DATA_AUTOMATION.md) | Data pipeline / applied schema / release steps behind the above |

### Cost, routing and live verification (current as of 3 Oct 2026)

| Document | Purpose |
|---|---|
| [RESTAURANT_ROUTING_SIGNOFF.md](./RESTAURANT_ROUTING_SIGNOFF.md) | **Read this first** for anything touching restaurants, routing or transit. What was verified against the real services with run ids, what it cost, every defect and how it surfaced, and what was deliberately left undone with the measurement attached |
| [routing-decisions.md](./routing-decisions.md) | The five owner decisions on routing and transit, and the live verification of each |
| [GOOGLE_PLACES_COST_CONTROL.md](./GOOGLE_PLACES_COST_CONTROL.md) | Every path that can bill Google, the switches and their defaults (§2), what may be stored (§3), and the Google Cloud settings to apply by hand (§5). **§2.1 covers the two switches that refuse unless enabled by name, and why the publicly reachable probe is one of them** |

### Engineering & QA (dated — see notes above)

| Document | Purpose |
|----------|---------|
| [PARENT_TESTING_GUIDE.md](./PARENT_TESTING_GUIDE.md) | Tester instructions — use this as the manual QA script once credentials are available |
| [PHASE_2_REMEDIATION.md](./PHASE_2_REMEDIATION.md), [TRUST_AND_POLISH_PASS.md](./TRUST_AND_POLISH_PASS.md), [FINAL_BETA_POLISH.md](./FINAL_BETA_POLISH.md), [LIVE_GOOGLE_QUALITY_PASS.md](./LIVE_GOOGLE_QUALITY_PASS.md) | Historical changelogs — accurate for their date, not current state |
| [ARCHITECTURE.md](./ARCHITECTURE.md), [INFORMATION_ARCHITECTURE.md](./INFORMATION_ARCHITECTURE.md) | Technical/navigation architecture |

---

*This document should be updated whenever a feature moves between mock/partial/live, or a new
subsystem lands — not just "at the end of each phase". Stale status docs actively mislead future work;
the previous version of this file cost real time to un-learn.*
