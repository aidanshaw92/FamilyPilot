# Restaurant and routing workstream: sign-off

**Closed 2026-10-03.** This is the record of what was built, what was proven against real services, what
was deliberately left undone, and what the next person should not have to rediscover.

It exists because "the task was completed" and "this is ready" are different claims, and only the second
one is worth making. Everything below is either a measurement with a run id behind it or an explicit
statement that something is unproven.

---

## 1. What a parent can now do that they could not before

- **See real places to eat near a venue**, from OpenStreetMap, with walking and driving estimates that
  each say they are estimates. Public transport is **absent rather than guessed**, because a straight line
  says nothing about whether a bus runs.
- **Get a lunch stop inside a day plan**, drawn from the same source, with the plan saying so.
- **Be told when we could not look**, rather than shown an empty neighbourhood. A provider outage produces
  a `meal-lookup-failed` caveat, never `candidates: []` presented as "nowhere to eat near here".
- **See a routed drive time** where one has been measured, hedged differently from an estimated one:
  "that leg is 19 minutes" for a measured leg, "about 19 minutes" for an estimate.

## 2. What was verified against the real services

Neither provider could be reached from the development sandbox, so both were verified from GitHub Actions
against a deployed build. The workflows are the permanent record and can be re-run.

| What | Evidence | Result |
| --- | --- | --- |
| TfL transit | Actions run 37110186939 | `state: available`, `leg.source: routed`, `leg.mode: transit`, 40 min Southbank → Greenwich, attribution present, `cacheable: false`, 0 Google calls |
| TfL is live, not a fixture | same run | The runner made its OWN call to `api.tfl.gov.uk`: 3 journeys, quickest 40 min. Our endpoint said 40. **Difference 0.** A constant cannot track what TfL says today. |
| Routes API | Actions run 37112057021 | `provider: google`, leg `source: live`, 19 min Trafalgar Square → Tower. **Predicted 1 element → actual 1. Predicted 1 request → actual 1.** `TRAFFIC_UNAWARE`, `computeRouteMatrix` |
| Independent reconciliation | Supabase, after the canary | `google units today: journeys=1`. `route_matrix` rows ever: 1. `distance_matrix` rows ever: **0** — the legacy API has never been called. |
| Preview is fail-closed again | Actions run 37113715301 | All 7 Google scopes refuse in `preview`, read from the deployment's own `/api/places/status` |
| The probe is closed in production | Actions run 37116226154 | `probeEnabled: false`; probe and journeys both refuse by name while the product's own five scopes stay allowed, as designed |
| Food cache behaviour | Actions run 37114554155 | Cold: `miss`, `no-store`, `overpassHttpRequests: 1`, 0 Google. Repeat: `hit` from the store. Third: `x-vercel-cache: HIT` |
| Section 16 coverage | Actions runs 37111630552, 37112591540 | 4/5 anchors measured, 0 Google calls throughout, 3 of 4 at the 60-element cap |
| The probe was never exercised | Supabase, same reconciliation | `nearby_search` rows today: **0**. The exposure was latent, not used — no Google Nearby Search was billed through it. |
| Nothing a parent reads was disturbed | Supabase, before and after | 176 served claims, 67 venues, 155 place records, 0 failed enrichment jobs — unchanged across every canary |

**The first routed journey FamilyPilot has ever produced** was that 19-minute leg. Every journey before it
was a straight-line estimate.

### Cost actually incurred by this workstream

**$0.00.** One Routes element against the Essentials free tier; at the paid rate it would have been $0.005.
OpenStreetMap and TfL are both free. The Section 16 canaries made zero Google calls by construction.

## 3. The five owner decisions, and where each stands

| Decision | State |
| --- | --- |
| 1. Routes API `computeRouteMatrix`, not legacy Distance Matrix | **Done and verified.** A pre-flight check proves no legacy path exists in the provider's import graph. |
| 2. Traffic-unaware / Essentials, not Pro | **Done.** `TRAFFIC_UNAWARE` asserted on the serialized request, not on source text. |
| 3. TfL for London transit, not paid Google TRANSIT | **Done and verified live.** No Google TRANSIT path exists. |
| 4. Keep the Overpass 60-element cap; gather telemetry | **Done, and the telemetry says something.** See §5. |
| 5. Paid routing stays fail-closed | **Done.** Production has no `GOOGLE_JOURNEYS_ENABLED` variable at all, and the scope refuses unless enabled by name. |

## 4. Defects found, and how each was found

Not one of these came from reading code looking for problems. Each came from a measurement disagreeing
with something.

| Defect | How it surfaced |
| --- | --- |
| `overpassHttpRequests` never reached the API | The canary printed "HTTP requests: 0" beside "queries: 2". `nearby-food.js` rebuilt the response and dropped the field. |
| `billable_calls` could never be 0 | Querying production: all four free OpenStreetMap rows recorded 1 billable call, so `reconcile.sql`'s "must be 0" check could never pass. |
| The CDN replayed a cache miss | The canary re-asked an anchor and got `miss` back in **12 ms** — not a round trip. For six hours the edge repeated a claim that an Overpass request had just been made. |
| **The public probe could bill Google** | Asserting the posture against production found `probeEnabled: true`. `/api/places/status?probe=live` is unauthenticated, uncached, and takes coordinates from the query string. |
| A fourth unhedged travel figure | Auditing the surfaces, not the diff. |
| `create-plan` hedged a *routed* leg | Looking for the opposite-direction defect after fixing the first one. |
| The canary reported success on absent data | Running the success case, not only the failure cases. |

### Defects in my own checks, which is why they are listed here too

A check that cannot fail is worse than no check, so these are recorded as defects rather than as process:

- A canary printed **two green checks on an `undefined` provider**, and crashed after printing them, so a
  genuine success would have exited 1.
- The fail-closed assertion took one posture — every scope must refuse — which is right for Preview and
  wrong for production, where discovery *is* the product. **That wrong check is what found the probe.**
- A live assertion read `s-maxage` from a response header. Vercel consumes that directive and does not
  pass it on, so it was testing something unobservable. Replaced with the CDN's own `x-vercel-cache`.
- The cold-cache key was pinned to one radius, so the check worked exactly once per six hours.
- An audit assertion matched `/LUNCH/i`, which my own caveat wording satisfied. The check was wrong, not
  the product.
- The refusal reason said "bills per element" for every fail-closed scope. True of journeys and **false of
  probe**, which bills per call — so the production diagnostic an operator reads was telling them
  something untrue about what the refusal protects them from. Spotted in the output of the very run that
  confirmed the fix.
- A test passed unchanged through a rewrite that was supposed to change its behaviour. Green proved
  nothing; an absent field defaulted to the old value.

## 5. Left undone on purpose, with the measurement attached

These are not oversights. Each has evidence and a reason for not acting.

**The National Gallery returns no restaurants.** It fails with `503 FOOD_PROVIDER_UNAVAILABLE` after the
20-second provider deadline. The obvious explanation was ruled out: it was the **first** request of a run
with no preceding load, and under the same spacing two previously-failing anchors succeeded. So the
Overpass query for the densest square kilometre in London genuinely exceeds 20 seconds. The product
behaviour is correct — an honest "could not look this up" — but a parent at Trafalgar Square gets no lunch
suggestions where they would most expect them. The fix is a smaller radius for dense anchors or a longer
deadline, and both change provider load, so they belong with the cap decision rather than beside it.

**Three of four answering anchors saturated the 60-element cap**, including Chiswick House, which was
chosen as a *sparse* suburban comparator. So a 1.2km radius around most London anchors holds more than 60
eating places, and the 20 shown ranked highest among an Overpass-ordered 60 rather than among all of them.
Decision 4 was to revisit only if real parent usage shows a coverage problem, and five canary anchors are
not parent usage. Recorded, not acted on.

**Four production cache rows still read `billable_calls = 1`.** They are cache rows with a six-hour TTL and
the next write per anchor upserts the corrected value, so they self-correct without touching production
data. Until then `reconcile.sql`'s billable-call line reads 4 rather than 0, for this reason and no other.

That prediction has since been **measured rather than assumed**: the two rows written after the fix
deployed carry `billable_calls = 0`, while the four written before it still read 1. The mechanism works, and
the remaining 4 will clear themselves as each anchor is next asked for.

**Transit is not in the UI.** The parser is verified against the real service, but presenting a transit leg
is UI work that has not been done, and coverage is London-only. `TFL_TRANSIT_ENABLED` is now a scope flag
rather than a doubt about the parser.

**Routing is verified at 1×1 only.** Nothing is established about larger matrices, about `condition` values
other than `ROUTE_EXISTS`, or about the 625-element provider ceiling. Those remain fixture-only.

**`app/restaurant/[id].tsx` could not be render-verified.** The hedging fix there is correct by reading,
but the screen sits behind `DeferredPilotGate` and no parent surface reaches it, so no screenshot exercises
it. Stated rather than implied.

## 6. What is still a manual step

Nine temporary Preview environment variables exist with value `false` (and one cap of `5`). They are
**harmless** — `false` is stricter than absent, because `describeScope` refuses on `scoped === false`
outright rather than relying on `requiresExplicitEnable` — but they are clutter. The Vercel MCP surface
available to this session has no delete-env operation, so removing them is a dashboard action. Each carries
a comment saying it is safe to delete.

To use the live Google probe after this change: set `GOOGLE_PLACES_PROBE_ENABLED=true`, redeploy, look,
then unset it and redeploy again.

## 7. The standing caveats this workstream does not lift

- **The application-side gate is not the cap.** The Google-side quotas remain the real limit; the code
  controls are defence in depth.
- **Our usage counter is an upper bound on spend, not an equality.** The budget is charged *before* the
  request, so a failed request is counted here and not on Google's invoice. An invoice **below** our
  counter is expected. An invoice **above** it means a billable path bypasses the gate, and that is the
  alarm.
- **Free is not unlimited.** Overpass is donated infrastructure. Every canary spaces its requests, none
  retries a failure, and a failure is recorded as a measurement rather than re-asked.

---

## Key files

| Area | Path |
| --- | --- |
| Owner decisions and live verification | `docs/routing-decisions.md` |
| Cost posture and the switches | `docs/GOOGLE_PLACES_COST_CONTROL.md` |
| Routes API client | `server/context/lib/route-matrix.js` |
| TfL client | `server/context/lib/tfl-transit.js` |
| OSM food discovery | `server/places/lib/osm-food.js` |
| Food endpoint and cache | `server/places/lib/nearby-food-endpoint.js`, `server/places/lib/nearby-food.js` |
| The gate | `server/places/lib/places-budget.js` |
| Live verification workflows | `.github/workflows/live-canaries.yml`, `.github/workflows/transit-live-smoke.yml` |
| Reconciliation query | `docs/canary/reconcile.sql` |
