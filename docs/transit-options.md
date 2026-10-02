# Public transport: what exists, and what choosing it would mean

Section H. **An audit and a set of options, not a selection.** Nothing here is implemented and no
provider is signed up to. Dated 2 October 2026.

## Where transit stands today

**Absent, deliberately, and it should stay absent until a real source is chosen.** A straight line
between two points says nothing about whether a bus runs, where it stops, how often, or whether it runs
on a Sunday. Estimating a public-transport duration from distance would be the worst kind of
manufactured fact: unlike a walking estimate, which is wrong by a factor, a transit estimate can be
wrong about whether the journey is possible at all.

So `nearby-food.js` emits no transit leg, the Restaurants close by section says once that it has no
public transport times, and `TravelMode` carries `transit` and `bus` as distinct values so that a bus is
never labelled as generic public transport, nor a tram or train called a bus. That is Section 5
honoured by the type rather than by a convention someone has to remember.

## What FamilyPilot already has: nothing that can do this

Checked rather than assumed. The project connects to four external services:

| Service | Could it give a transit journey? |
| --- | --- |
| Google Places / Maps (`GOOGLE_PLACES_API_KEY`) | Not as used. Routes API supports a TRANSIT mode, which is a *new paid path*, not existing infrastructure. |
| OpenWeather | No. |
| OpenAI | No. A language model inventing a bus time is the fabrication this product exists to avoid. |
| Supabase | Storage only. |

There is no GTFS feed, no NaPTAN data, no stop or route table, and no transit code anywhere in the
repository. Nothing can be switched on; something would have to be built.

OpenStreetMap does carry public-transport *topology* — stops, platforms, route relations — and
`osm-food.js` could read it. It does not carry **timetables**, so OSM can say a bus route passes nearby
and can never say when. For a parent deciding whether lunch is reachable before a nap, the timetable is
the entire question. OSM is therefore not a transit source for this purpose, and reading its route tags
would produce something that looks like an answer and is not one.

## The options, if transit is wanted

### Option 1 — TfL Unified API (free, London only)

The strongest fit for a product that currently searches London and 45km around it.

| | |
| --- | --- |
| Provider | Transport for London |
| API | Unified API, Journey Planner (`/Journey/JourneyResults/{from}/to/{to}`) |
| Billing unit | **None. Free.** Open data under TfL's transport data terms. |
| Registration | Free; an `app_key` raises throughput. Unauthenticated requests work but are limited to roughly 500/day. |
| Caching | Needs care. A journey result embeds *departure times*, so unlike a restaurant list it goes stale by the minute. A cache keyed on origin + destination + mode would serve a parent yesterday's bus. Cacheable: the stops near a venue, and whether any service exists at all. Not cacheable: "the next bus is in 6 minutes". |
| Request volume | One per venue-and-restaurant pair a parent actually looks at, so it has the same shape as discovery and the same mitigation — but without a durable cache for the time-sensitive part. |
| Attribution | **Required**: "Powered by the Transport for London Journey Planner API" in the credits. TfL branding must NOT be used, and the app must not imply it is official. |
| Coverage | London and its immediate surroundings only. Outside that it returns nothing, which the UI must treat as unknown rather than as "no service". |

### Option 2 — Google Routes API, TRANSIT mode (paid, wide coverage)

| | |
| --- | --- |
| Provider | Google |
| API | Routes API `computeRouteMatrix` or `computeRoutes`, `travelMode: TRANSIT` |
| Billing unit | origins × destinations, same as driving |
| Cost | Per the routing cost model: $10.00 / 1,000 elements at Pro, after 5,000 free a month. Three restaurants from one anchor is 3 elements, so transit alone roughly triples a discovery routing bill if discovery is ever routed. |
| Hard constraint | A TRANSIT request is capped at **100 elements** against 625 for other modes. Fine for this product's shapes; a real limit on anything matrix-shaped. |
| Caching | Google's terms restrict what may be retained. A departure-time-dependent result is also stale quickly, so the same freshness problem as TfL applies on top of the licensing one. |
| Coverage | Wide, which matters only if FamilyPilot leaves London. |

### Option 3 — leave it absent

Costs nothing, claims nothing, and is where the product is now. The honest version of this is what is
already shipped: the section says it has no public transport times rather than leaving a gap a parent
reads as "there is no bus".

## What I would recommend, and why it is not my decision

**TfL first, if transit is wanted at all.** It is free, its coverage matches the product's actual
geography, and its attribution requirement is a line of credit rather than a licensing regime. The real
work is not the integration — it is that a journey result is time-sensitive in a way nothing else in
this codebase is, so the caching strategy that makes discovery cheap does not transfer. Getting that
wrong means showing a parent a bus that left.

**This is where I stop.** Per the brief, a new provider or a paid Google route mode is an owner
decision. Nothing here is implemented, no key is requested, and no transit leg is produced by any code
path.

## Sources

- [TfL Unified API documentation](https://tfl.gov.uk/info-for/open-data-users/api-documentation)
- [TfL open data terms](https://tfl.gov.uk/info-for/open-data-users/our-open-data)
- [TfL Journey Planner API — DfT Find Transport Data](https://findtransportdata.dft.gov.uk/dataset/tfl-journey-planner-api)
- [computeRouteMatrix reference, including the TRANSIT element cap](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRouteMatrix)
- Google pricing: see `docs/routing-cost-model.md`, including the caveat that Google's own pricing pages
  are unreachable from this environment.
