# What routed travel would cost

Section 8. Produced before enabling anything, and **nothing here is enabled**. Dated 2 October 2026.

> **The decisions this fed into are now made** — see `routing-decisions.md` (3 October). In short:
> Routes API `computeRouteMatrix`, **traffic-unaware Essentials** at $5.00/1,000 after 10,000 free
> elements per month, and still fail-closed. The recommendation below was for traffic-unaware and the
> owner took it, so the Pro column here is the tier deliberately **not** chosen, kept for the comparison
> rather than as a live option. The prices were independently confirmed by the owner and still have not
> been read off Google's own page from this environment.

## Read this first: two things that change the answer

**1. There is no free routed driving.** What FamilyPilot has without a route provider is straight-line
distance divided by an assumed average speed. That is a legitimate fallback and the only honest way to
show it is `🚗 ~8 min estimated`. A routed `🚗 8 min` requires a provider and costs money. The earlier
routing audit said Distance Matrix was not required "for driving"; that conflated the two and is
corrected.

**2. The existing call is traffic-aware, which bills at the higher tier.**
`server/context/lib/journey-provider.js` sets `departure_time=now` and prefers `duration_in_traffic`.
Traffic-aware routing is what moves a request from Essentials to Pro, so the unit price to assume is
**$10.00 per 1,000 elements, not $5.00**. Dropping traffic-awareness halves it, at the cost of the
accuracy that was the reason to route at all. That is a real product lever and it is the owner's.

## Where these prices come from, and the one caveat

`developers.google.com` and `cloud.google.com` are blocked by this sandbox's egress policy, so I could
not read Google's own pricing page. The figures below come from several independent secondary sources
published in 2026 that agree with each other; they are listed at the end. **Confirm against Google's
own pricing page before committing spend** — I would not want a four-figure monthly decision resting on
a third-party table, and I am flagging that rather than presenting these as primary.

| | Essentials | Pro (traffic-aware) |
| --- | --- | --- |
| Free elements per month | 10,000 | 5,000 |
| 0–100,000 billable | $5.00 / 1,000 | $10.00 / 1,000 |
| 100,001–500,000 | $4.00 / 1,000 | $8.00 / 1,000 |
| 500,001–1,000,000 | $3.00 / 1,000 | $6.00 / 1,000 |
| 1,000,001–5,000,000 | $1.50 / 1,000 | $3.00 / 1,000 |

Billing unit for both: **origins × destinations**, per request.

## A second finding, which may matter more than the price

**The API this codebase calls is legacy.** `journey-provider.js` calls
`maps.googleapis.com/maps/api/distancematrix/json`, the legacy Distance Matrix REST API. Per the
sources below, new Cloud projects can no longer enable Distance Matrix, and
`google.maps.DistanceMatrixService` was deprecated in February 2026. The replacement is the Routes API
`computeRouteMatrix`, which bills on the same origins × destinations basis.

Whether FamilyPilot's existing project retains Distance Matrix access depends on when the project was
enabled, and I cannot establish that from here. It is checkable in the Cloud console in a minute and
should be checked before any work is done against the legacy endpoint: writing routing against an API
that cannot be enabled on a fresh project is a migration already owed.

**Distance Matrix has never been called in production.** `google_places_usage` holds no `journeys` rows
across all environments and all time. So nothing is being migrated away from — the choice is which API
to call the first time.

## Elements per plan, measured not derived

`src/__tests__/journey-element-cost.test.ts` runs the real `buildJourneyMatrix` with a probe that
records request shapes, and counts origins × destinations as the provider would bill them. The formula
`F + S × (S − 1 + F)` for S stops and F households holds against the implementation at every shape
tested. One figure in the earlier audit did not: it said 17 elements for three stops and two
households, where the formula and the builder both give 14. The numbers below come from running the
builder.

| Plan shape | Requests | Billable elements |
| --- | --- | --- |
| Single activity, one household | 2 | **2** |
| Activity + lunch | 3 | **5** |
| Activity + lunch + second activity | 4 | **10** |
| Three stops, two households | 5 | 14 |

Adding a real lunch stop therefore takes a plan from 2 elements to 5.

## Elements for restaurant discovery

One anchor, three shortlisted restaurants: 1 origin × 3 destinations = 3 elements per mode.

| Modes routed | Billable elements |
| --- | --- |
| Driving only | **3** |
| Walking + driving | **6** |
| Walking + driving + public transport | **9** |

Only the first row is worth pricing today, for two reasons. The product does not display a routed
public-transport time at all, and the brief forbids calculating a mode the product will not show.
And `computeRouteMatrix` caps a TRANSIT request at 100 elements against 625 for other modes, which is
a constraint to design around rather than a cost.

Note the driver is different from the plan's. Discovery routing is charged per *anchor per cache
lifetime*, not per plan: with the current six-hour TTL a continuously popular venue costs at most four
refreshes a day, and a venue nobody opens costs nothing. So its cost scales with *distinct venues
opened*, not with plans generated, and the table below deliberately does not blend the two.

## Scale model: routed plans, assuming activity + lunch (5 elements)

30-day month. Pro tier, because the current call is traffic-aware.

| Plans/day | Elements/day | Elements/month | Billable (Pro) | Cost/month | Cost/day | Cost/month if Essentials |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | 500 | 15,000 | 10,000 | **$100** | $3.33 | $25 |
| 500 | 2,500 | 75,000 | 70,000 | **$700** | $23.33 | $325 |
| 1,000 | 5,000 | 150,000 | 145,000 | **$1,360** | $45.33 | $660 |
| 5,000 | 25,000 | 750,000 | 745,000 | **$5,670** | $189.00 | $2,820 |

For the other plan shapes, at Pro:

| Plans/day | Single activity (2 el) | Activity + lunch (5 el) | Three stops (10 el) |
| --- | --- | --- | --- |
| 100 | $10/mo | $100/mo | $250/mo |
| 500 | $250/mo | $700/mo | $1,360/mo |
| 1,000 | $550/mo | $1,360/mo | $2,560/mo |
| 5,000 | $2,560/mo | $5,670/mo | $8,685/mo |

The September 2026 Places bill that started all of this cost-control work was £104.11. At 500 plans a
day with a lunch stop, routed traffic-aware driving is roughly seven times that, every month.

## Quota interaction

- Google-side quotas are **per-minute and per-day request limits**, not spend limits. They do not cap a
  bill: 60 requests a minute, each carrying 25 elements, is 1,500 billable elements a minute within
  quota. A request-shaped quota is the wrong instrument for an element-billed SKU, which is the same
  confusion the application budget had until this week.
- The code-level controls are **defence in depth, not a substitute for Google-side quotas**. Both are
  needed, and the Google-side ones have to be set in units Google actually enforces.
- Budget alerts are after-the-fact. They tell you what has been spent, not what is about to be.

## FamilyPilot's proposed application-side hard ceiling

The existing defaults (`GOOGLE_PLACES_MAX_CALLS_PER_DAY = 2000`,
`..._PER_WINDOW = 60`) are now enforced in **billable units** rather than requests, and the ceiling
refuses a request that would cross it rather than one that already has. Those defaults are shared
across scopes, so for routing specifically I propose:

| Control | Proposed | Why that number |
| --- | --- | --- |
| `GOOGLE_JOURNEYS_ENABLED` | **unset (refused)** | Already implemented: the scope must be enabled by name. |
| Journeys units/day | **600** | 120 lunch-shaped plans a day at 5 elements. Roughly $4/day, $120/month at Pro — a bounded pilot, not a product launch. |
| Journeys units/minute | **50** | Ten plans a minute. Above any plausible organic rate; a runaway loop hits it in seconds. |
| Per-request element cap | **25** | Already enforced by `MAX_DESTINATIONS`, and asserted by the builder so a grown plan fails loudly rather than losing legs silently. |
| Google-side daily quota | **set in elements, matching 600** | Because the application cap lags by one priming interval across serverless instances, so it is a bound on overshoot, not a guarantee. |

The honest limit of the application cap: it is primed from Postgres at most once a minute, so many warm
instances can collectively overshoot by up to one priming interval's worth. That is why the Google-side
quota matters and is listed as a proposal here rather than assumed.

## Recommendation, which is not a decision

If routed driving is wanted, the cheapest honest version is:

1. Check in the Cloud console whether the project can still enable Distance Matrix at all. If not, this
   is a Routes API `computeRouteMatrix` integration, not a Distance Matrix one.
2. Route the **plan's legs only** — the stops a parent has actually committed to. That is 5 elements for
   a lunch-shaped day.
3. Leave **discovery estimated**. Twenty candidates across three modes is 60 elements per venue open,
   for numbers a parent skims past; the arithmetic estimate is honest and free, and the brief's own
   staged design exists to prevent exactly that spend.
4. Decide deliberately about traffic-awareness, because it is the difference between $10 and $5 per
   1,000. Traffic matters for a 9am arrival; it matters much less for a 14-minute hop to lunch.
5. Keep public transport absent until a real transit source is chosen. See the transit section of the
   nearby-food work: a straight line cannot say whether a bus runs.

**Nothing in this document has been enabled.** `GOOGLE_JOURNEYS_ENABLED` remains unset, so the paid path
is refused in production and preview alike.

## Sources

Google's own pricing and billing pages are egress-blocked from this environment, so these are the
secondary sources the figures agree across. Verify against Google before committing spend.

- [Google Maps API Pricing 2026: 3 Scales, Real TCO — Woosmap](https://www.woosmap.com/blog/google-maps-api-pricing-breakdown)
- [Google Maps API Pricing and Licensing in 2026: Exact Cost Per 1,000 Calls Across Every SKU — mapatlas.eu](https://mapatlas.eu/blog/google-maps-api-pricing-2026)
- [Google Maps API Pricing 2026 — Full Cost & SKU Breakdown — mapsi.dev](https://mapsi.dev/google-maps-api-pricing)
- [Google Maps APIs: free caps, Essentials–Pro–Enterprise — lazige.agency](https://lazige.agency/articles/understanding-google-maps-apis-a-comprehensive-guide-to-uses-and-costs)
- [Google Maps Distance Matrix API Alternatives (legacy status, Feb 2026 deprecation) — TravelTime](https://traveltime.com/blog/alternative-google-driving-distance-matrix-api)
- [A developer's guide to the Google Routes API — afi.io](https://blog.afi.io/blog/a-developers-guide-to-the-google-routes-api/)
- Unreachable from here, listed because they are the authoritative versions:
  [core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing),
  [Routes API usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing),
  [computeRouteMatrix reference](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRouteMatrix).
