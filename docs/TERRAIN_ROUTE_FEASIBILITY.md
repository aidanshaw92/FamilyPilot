# Terrain and buggy routes: can FamilyPilot assess them from evidence?

Status: feasibility study, 7 Oct 2026. Separate from the evidence-recovery work in PR #165. Nothing here is built, and
nothing here changes what the app says today.

The question is whether FamilyPilot can tell a parent, from evidence it is allowed to hold, whether the route they
will actually push a buggy along is surfaced, level, step-free and dry, rather than whether the venue is "accessible"
in general. The answer below is yes for a useful minority of venues, from the operators' own published access text,
and no for the rest without either a parent's report or a call to the venue. The gain is real but narrow, and the
cheapest version of it reuses the pipeline that already exists.

**How this was researched.** The sandbox cannot reach venue or council websites, Google's documentation, Euan's
Guide, the OpenStreetMap Foundation or the Overpass API (egress is blocked), so operator statements below come from
the stored evidence already in production and from search-indexed text of the operators' pages. Quotes are the
operators' words as indexed; the page dates are mostly not visible. Before relying on any licence reading below,
read the source document directly.

## 1. What the app holds today

- **Buggy access** (`pushchairSuitability`: excellent / good / mixed / difficult) is a venue-wide verdict read from the
  venue's own wording ("buggy-friendly", "must be folded", "not accessible for prams"). Five destinations have one.
  It cannot say which route.
- **Terrain** (`extendedTerrain`: flat / mostly_flat / mixed / hilly / very_hilly) exists as a claim field and Family
  Fit already uses it: hilly or very hilly terrain without confirmed-good buggy access produces "A sling or carrier
  may be easier for Ozzie". But nothing produces it from evidence. One venue holds an active terrain claim, and it is
  an editor's `unknown`. `pathSurface` and `terrainNotes` exist on the metadata row as editorial fields only.
- **Post-visit reports** (`venue_visit_reports`) ask two or three adaptive questions, one of which is how the buggy
  coped. Zero reports have been filed. There is no route-level question.
- **Reviews from other platforms** are not read anywhere. Google Place Details is requested without the `reviews`
  field.

So today the app can say "buggy access is good here" for five venues and nothing about surfaces, slopes, steps or
gates for any.

## 2. What route-level terrain means, and what each source can supply

| Aspect | Needed to say | Official text | Open route data (CoL dataset) | OSM | Elevation (LiDAR / OS) | Reviews |
| --- | --- | --- | --- | --- | --- | --- |
| Path surface (paved, gravel, grass, uneven) | which paths | **yes, where stated** | yes (per section, Heath route only) | where tagged (`surface`, `smoothness`) | no | sometimes |
| Slopes and steep sections | where | sometimes ("gentle slope", "steep slope at New Gate") | yes (gradient class per section) | rarely (`incline`) | **yes, computed along a path** | sometimes |
| Steps, gates, narrow sections | which entrance | **yes, where stated** ("Lodge Gate has nine steps") | no | where tagged (`highway=steps`, `barrier=kissing_gate`, `width`) | no | sometimes |
| Step-free entrances and alternative routes | which | **yes, where stated** | partly | where tagged (`wheelchair`) | no | sometimes |
| Main accessible route vs other paths | the distinction | **yes, where the operator makes it** | yes (one route) | implicit | no | sometimes |
| Weather-sensitive (mud) | which paths | sometimes ("can be muddy in wet weather") | no | `surface=ground/dirt` hints | no | often, dated |

Only the operator's own text states the distinction the brief insists on: *this* route is surfaced, *those* paths are
not. Everything else either covers one route (the City of London dataset), covers geometry without surface or steps
(elevation), or depends on volunteer tagging whose completeness for these parks could not be checked from here (OSM).

## 3. Sources, permissions and cost

| Source | Permission | What it gives | Cost | Verdict |
| --- | --- | --- | --- | --- |
| Operators' own access pages (City of London park pages, RAF Museum access page and Access Guide PDF, council park pages) | Public web pages, the same class the crawler already reads under the existing approval rules | Named routes, gates, steps, surfaces, slopes, mud warnings, mobility-scooter entrances | None beyond the existing crawl; a `/accessibility` page is already a speculative path | **Use first.** The only source that states the route distinction in the operator's own words |
| City of London "Accessibility route" dataset ([data.gov.uk](https://www.data.gov.uk/dataset/e46b1e78-ab04-44d0-8415-11342f9aafca/accessibility-route1)) | Open Government Licence v3 (attribution) | One short and one long accessible route on Hampstead Heath from Gospel Oak, split into sections of equal gradient class and surface; gradient from LiDAR, surface from field visits; dated 2018-12-10; WFS/WMS | Free; one-off ingest | **Usable for the Heath.** Old (2018) and one route only, so it supports "a published accessible route exists" rather than a current surface verdict |
| OpenStreetMap paths | ODbL. Attribution is already implemented (`© OpenStreetMap contributors`, `services/places/attribution.ts`). A *stored table of route verdicts derived from OSM* is a derivative database and carries share-alike obligations; a per-request display is a produced work | `surface`, `smoothness`, `incline`, `highway=steps`, `barrier=kissing_gate`, `wheelchair`, `width` on paths inside a park | Free; the server already queries Overpass for food with endpoint failover and a usage policy | **Possible, unproven.** Tag coverage inside these parks could not be queried from the sandbox. Decide only after one server-side Overpass query per launch park shows whether paths carry `surface` at all |
| Elevation: Environment Agency LiDAR Composite DTM 1 m; OS Terrain 50 | Open Government Licence (both) | Gradient along any path geometry; LiDAR at 1 m resolves a park path, OS Terrain 50 does not | Free; offline processing, then a stored gradient per path section | **Usable for slopes only.** Says nothing about surface, steps or gates. Worth doing only once OSM path geometry is confirmed adequate |
| Google Maps terrain layer, Elevation API, Street View | Google Maps Platform terms: no caching or storing Content beyond narrow allowances (place IDs and panorama IDs indefinitely; Routes lat/lng up to 30 days); "No creating content from Google Maps Content" (Google's own example: an index of tree locations built from Street View); display on a Google map required. Read via indexed summaries of the terms ([Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms), [Street View policies](https://developer.google.com/maps/documentation/streetview/policies)); the pages themselves could not be fetched from the sandbox | Elevation per point; imagery of entrances | Billable per request | **Not suitable for stored facts.** Deriving a persistent surface or gradient record from Street View or Elevation results is exactly what the terms prohibit, and paying for the API does not change that. Display-only use would add a map feature, not a reliable fact. With OGL elevation data free, there is also no need |
| Google reviews (Place Details `reviews`) | Billable; must carry author attribution; cannot be stored beyond the allowances ([Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)) | Visitors' remarks, some about buggies | Per call, Enterprise + Atmosphere SKU | **Not usable as evidence.** Could only be shown live with attribution; cannot become a dated, stored observation |
| Euan's Guide | Public reviews by disabled visitors with mobility context; the site's reuse terms could not be read from the sandbox | For the RAF Museum: several reviews including a detailed Hangar 1 review and one noting the Changing Places toilet ([venue page](https://www.euansguide.com/venues/royal-air-force-museum-london-london-5469/information)) | Free to read | **Cite and link only** until the terms are read. Never copy review text into the store |
| Accessible Countryside for Everyone (ACE) | Volunteer project; states it cannot check every entry and asks users to check locally; copyright terms not found | Pages for Highgate Wood and Hampstead Heath that largely repeat the operators' text | Free | Use as a pointer to the operator's statement, not as a source |
| TripAdvisor, Google Maps web UI, social media | Scraping prohibited | — | — | **Do not use** |
| Parents' post-visit reports (first party) | FamilyPilot's own consented channel, aggregated, no names | Whatever is asked; today only "how did the buggy cope" | None | **The one review source that can be stored with route, date and qualifications.** Needs route-level questions |

## 4. Five launch venues

Chosen for the shapes the brief asked for: a surfaced park, a woodland, a site with several entrances and routes, an
outdoor site with no access statement, and an indoor multi-building site as a control.

### Golders Hill Park (surfaced park)

- **Directly supported** (operator's page, cityoflondon.gov.uk): "Most of the paths in Golders Hill Park are even and
  surfaced with tarmac, including the path around the Zoo." "All entrances to the park are step free." "The park is
  on a gentle slope." Parking is "eight bays in the park for Blue Badge holders only."
- **Reasonable, unverified:** a standard buggy will manage the surfaced paths; the walled garden and the hill garden
  paths may differ.
- **Unknown:** which paths are the "most" and which are not; the gradient of the slope beyond "gentle"; wet-weather
  state of unsurfaced areas.
- **What the app could say:** "Golders Hill Park says most paths are even tarmac, including the path round the zoo,
  and all entrances are step-free; the park is on a gentle slope. Paths off the surfaced ones have not been checked."
- **Gain beyond today's pipeline:** three route facts (surface, step-free entrances, gradient) where the app now says
  nothing about buggies here at all. The existing classifier yields no buggy verdict for this venue because the page
  never uses the word buggy.
- **Ongoing cost:** none beyond the existing crawl; a 90-day re-read.

### Highgate Wood (woodland)

- **Directly supported** (cityoflondon.gov.uk visit page): "Highgate Wood is an ancient woodland and while some of
  the paths are tarmacked, others are rough unmade paths which can be muddy in wet weather." "All gates are
  accessible to wheelchairs, except Lodge Gate which has nine steps and New Gate which is located at the bottom of a
  steep slope. Mobility scooter access is via Onslow Gate only." Disabled parking is via Onslow Gate near the café.
  Two wheelchair-accessible toilets, by the playground and by the café.
- **Reasonable, unverified:** the tarmac paths link Onslow Gate, the café and the playground (the operator places
  parking, scooters and toilets there).
- **Unknown and contradictory:** which paths are tarmac; the gradient of the tarmac paths; the current state of the
  unmade paths. The existing classifier would read "steep" and "muddy" into a venue-wide *mixed*, which is exactly
  the blanket verdict to avoid here: the operator's statement is per gate and per path type.
- **What the app could say:** "Highgate Wood says some paths are tarmac and others are unmade and can be muddy when
  wet. Lodge Gate has nine steps and New Gate is at the bottom of a steep slope; Onslow Gate has the disabled parking
  and is the scooter entrance. Which paths are tarmac has not been checked."
- **Gain:** the first venue where the app could name the entrance to avoid with a buggy. Today it says nothing.
- **Cost:** none beyond the crawl.

### Hampstead Heath (many entrances and routes)

- **Directly supported** (operator's accessibility page and stored text): "A large number of surfaced paths suitable
  for wheelchairs and mobility scooters." "Dedicated disabled parking bays at each of our four car parks" (Parliament
  Hill Lido, East Heath, Jack Straws, Golders Hill Park). Mobility scooters bookable free through Heath Hands. An
  accessible route starting and ending at Gospel Oak station, published on an interactive map, and as an open dataset
  (OGL v3, 2018) split into sections of equal gradient class and surface.
- **Reasonable, unverified:** the surfaced paths are concentrated near the car parks and Parliament Hill; most of the
  Heath's paths are unsurfaced and many are steep.
- **Unknown:** everything about any entrance other than Gospel Oak; the current state of a 2018 route; the Heath's own
  text never names a surface for a specific path.
- **What the app could say:** "Hampstead Heath has a published accessible route from Gospel Oak station and says it
  has a large number of surfaced paths; the rest of the Heath's paths have not been checked. Disabled parking at all
  four car parks."
- **Gain:** an honest entrance-specific pointer, not a verdict. The open dataset adds gradient classes for that one
  route, with attribution, if ingested.
- **Cost:** one-off ingest of the OGL dataset if used; otherwise none.

### Belmont Children's Farm (outdoor, no access statement)

- **Directly supported** (own pages, stored): "You can park in the top car park and walk down to reception, or follow
  the driveway down to the second car park or … the third car park in the bottom of the valley where there is further
  parking spaces and disabled parking." Café and soft play confirmed.
- **Reasonable, unverified:** the site slopes from the road to the valley bottom; there is a driveway a buggy can be
  pushed down; the ground between animal areas is a farm's.
- **Unknown:** every surface, every gradient, whether there are steps or gates, the route from the top car park to
  reception. No access page exists on the site; nothing specific was found in indexed reviews.
- **What the app could say:** nothing about routes. "Buggy route not confirmed by the farm" is the honest line.
- **Gain:** none from published sources. This is the venue where a first-party report ("we went in October with a
  buggy; the driveway was fine, the field was muddy") or the phone call already in the verification queue is the only
  way to know.
- **Cost:** a call, or waiting for reports.

### RAF Museum London (indoor, several buildings; control)

- **Directly supported** (access page and Access Guide PDF, Aug 2025; stored text): "We have step free access around
  our site and lifts to upper levels." "All of our hangars offer the following: Wide aisles, enabling access for
  wheelchairs and pushchairs, Lifts to upper levels." Level access from the car park and the pedestrian entrance to
  Hangar 1; the pedestrian entrance "has a small ramp up from street level"; automatic doors on H1, H3, H4, H5 and H6;
  wheelchairs and scooters to borrow. Baby changing in every hangar's accessible toilets; the Changing Places toilet
  in Hangar 2.
- **Review evidence (link only):** Euan's Guide carries reviews from disabled visitors describing Hangar 1 in detail
  and the Changing Places toilet. They corroborate the operator; they are not stored.
- **Unknown:** the surface and distance of the outdoor routes between hangars; whether Hangar 2's door is manual.
- **What the app could say:** "The museum confirms step-free access around the site, lifts to upper levels and wide
  aisles for pushchairs. The pedestrian entrance has a small ramp." (It already says buggy access is good.)
- **Gain:** small. The venue-wide verdict is already right here; route detail adds the ramp and the lifts.
- **Cost:** none.

### What the five show

- Two of five (Golders Hill Park, Highgate Wood) yield exactly the route-level statements the brief wants, from the
  operator's own words, with the main-route/other-paths distinction intact. One (the Heath) yields an entrance-specific
  pointer and an open dataset. One (RAF) is already covered. One (Belmont) yields nothing and will not without a
  person.
- The gain is concentrated in council and City of London parks, which publish access pages. Commercial attractions
  mostly publish a wheelchair statement that is not a buggy route.
- Every supported statement is a sentence a parent can read, with a quote. None needs imagery, a map or a new provider.

## 5. The smallest useful implementation

Only if the value above is worth having. It reuses the evidence pipeline and changes no approval rule.

1. **A route-observation producer, official text only.** A classifier in `server/enrichment/_lib` alongside
   `pushchair-evidence.js`, reading sentence-level statements into observations rather than a verdict:
   `{ aspect: surface | gradient | steps | gate | entrance | wet_weather, scope: main_route | named:<name> |
   other_paths | site, value, quote }`. "Lodge Gate which has nine steps" → `steps, named:Lodge Gate, 9`. "some of the
   paths are tarmacked, others are rough unmade" → `surface, main_route, paved` and `surface, other_paths, unmade`.
   "The park is on a gentle slope" → `gradient, site, gentle`. Nothing is inferred from "wheelchair accessible
   entrance" or "flat area".
2. **Published as a list claim, like age policy, not as a tri-state.** Field `routeAccess`, each observation carrying
   the usual provenance (source URL, quote, reading date, scope) and the usual gates: official source type, eligible
   subject scope, reading under 14 days old. Expiry 90 days (paths change slowly), except `wet_weather`, which is a
   standing caveat rather than a dated fact. Two observations with different scopes are not a conflict; the same scope
   with different values is, and goes unknown.
3. **Family Fit reads it narrowly.** A paved main route with step-free entrances → "Main route suits a buggy: <quote>".
   Steps or a steep slope on a named entrance → "Avoid <gate> with a buggy: <quote>". `other_paths` unmade → "Other
   paths not surfaced; can be muddy when wet." Nothing on `routeAccess` is a venue-wide verdict, and it never changes
   `pushchairSuitability`. The existing carrier advice gains one more trigger: a steep named route for a family whose
   child also goes in a sling.
4. **Terrain stays separate from facilities.** `routeAccess` sits beside baby changing, toilets, café and parking in
   the facts the detail screen lists; it does not enter the facilities score. Ranking uses it only through the
   existing terrain/buggy carrier logic.
5. **Different buggies only where the text says so.** Record a width or type only when the operator states it ("gates
   may be too narrow for double buggies"); otherwise say nothing about buggy types.
6. **Parents' reports, route-level.** Add to the adaptive post-visit set, for a family with a buggy: which entrance
   they used, whether the route was surfaced, and whether there were steps. Store with date and route; show as
   "Parents reported" in a separate block from "The venue says". One report is one report: the display states the
   count and the dates and never upgrades an official unknown.
7. **Optional later, zero provider cost:** ingest the City of London OGL route dataset for the Heath with attribution;
   run one Overpass query per launch park to see whether OSM paths carry `surface` before deciding on OSM or LiDAR
   gradients. Not Google.

**Estimated effort:** the producer, its tests on real sentences (the five venues above give the first fixtures), the
`routeAccess` claim field and projection, and two Family Fit lines. No migration beyond a field key. **Ongoing cost:**
none in provider spend; the existing refresh and `reextract` passes re-read it.

## 6. Limits of this study

- Operator statements were read through search-indexed text and the stored evidence, not the live pages; page dates
  are mostly unknown. The City of London dataset is dated 2018.
- Google's terms, Euan's Guide's terms and the OSM Foundation's guidance were read through indexed summaries because
  the pages are egress-blocked from the sandbox. Read them directly before relying on any reading above.
- No Overpass or LiDAR data was examined, so OSM tag coverage and gradient feasibility are untested claims.
- No review text was read beyond titles and snippets; nothing from any review platform was stored.
- Five venues is a shape test, not a coverage estimate. A count of how many launch venues publish an access page is
  the first thing to measure if this goes ahead; the stored evidence makes that a query, not a crawl.
