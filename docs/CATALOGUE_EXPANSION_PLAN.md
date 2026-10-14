# Catalogue expansion: phased plan toward about 500 useful venues

2026-10-13. A plan, not a change. **Nothing has been imported, fetched, enqueued or changed, and no Google request has been
made.** The direction is about 500 well-classified London venues with honest evidence, not a count to hit. Quality outranks count:
a venue that is wrongly classified, closed, or shown with invented facts costs more trust than a missing one.

Read with [CATALOGUE_BOTTLENECKS.md](CATALOGUE_BOTTLENECKS.md) (why the catalogue is the size it is),
[CATALOGUE_CORRECTIONS.md](CATALOGUE_CORRECTIONS.md) (what is mis-classified, with evidence) and the earlier
[CATALOGUE_PILOT_PLAN.md](CATALOGUE_PILOT_PLAN.md), which this extends. Where they disagree, this file wins; the differences are
listed in section 7.

## 1. Where we start

| | Today |
| --- | ---: |
| Rows in `place_records` | 168 |
| Reachable from Explore (Google rows, fresh, within 40 km, not an alias) | about 142 |
| After the classification corrections (Natural History Museum and Royal Academy back, two legacy rows out, one duplicate folded) | about 145 |
| of which with any confirmed family fact | 74 of 149 stored |
| of which fully usable (reviewed, website, photo, hours), per the earlier audit | 57 |
| With a recorded age range or a price | 0 |

The bottleneck is not storage, cost or enrichment. It is discovery: one popularity-ranked request of 20 results across 21 place
types, repeated, finds the same venues. Growth needs different sources or different questions, not more of the same call.

## 2. What "500" means, by group and by area

These are **goals**, chosen to make Explore useful in every direction. They are not estimates of what exists; supply is measured
by the dry run in Phase B and the goals are revised to what the evidence supports.

| Group | After corrections | Goal | Gap | Main source of the gap |
| --- | ---: | ---: | ---: | --- |
| Parks and playgrounds | 72 | 230 | 158 | OS Open Greenspace (parks, play spaces); borough playground data |
| Museums and galleries | 39 | 65 | 26 | Wikidata and Mapping Museums for identity; the venue's own site for facts |
| Farms and animals | 14 | 30 | 16 | needs a source: no open dataset is dedicated to city farms (see 4.2) |
| Soft play and trampolines | 6 | 70 | 64 | **the hardest gap**: no licensed open dataset covers it (see 4.2) |
| Attractions and activities | 14 | 85 | 71 | OSM-tagged leisure; official sites |
| **Total** | **145** | **480** | | plus up to 20 in thin boroughs, about 500 |

| Area (bearing from Charing Cross) | Today (149 stored) | Goal share | Why |
| --- | ---: | ---: | --- |
| Central (within 6 km) | 53 (36%) | at most 25% | museums are 60% central |
| North / East / South / West | 22 / 17 / 18 / 21 | each at least 17% | East and South are the thinnest |
| Beyond 25 km | 18 | labelled "outside London", not counted toward the goal | day trips from the edge |

A second, stronger measure once boroughs can be looked up (section 3, A5): **every London borough has at least 5 destinations,
at least one park with a recorded playground, and at least one indoor option.** Today a family in Romford has none within 5 miles.

## 3. Phase A: understand and correct (no new venues, no spend)

| # | Work | Needs approval? |
| --- | --- | --- |
| A1 | This investigation | done |
| A2 | A reviewed classification map in the app (Explore pull request), so soft play and trampoline parks are separated in search and the five groups are right. No data change | no, ships with the Explore draft |
| A3 | Rule fixes R1 to R6 as a draft pull request with the regression fixtures. They change stored categories on the next discovery run | **yes, before merging** |
| A4 | A person looks at the three unresolved rows (Tulleys Tulip Fields, Hyde Park Corner, Platform 9 3/4) and at the 10-row spot check | yes (a person) |
| A5 | A borough lookup from ONS boundary files (Open Government Licence), point-in-polygon on our own coordinates, so coverage is measured per borough with no geocoding call | needs the file (section 8) |
| A6 | A read-only catalogue health script that prints the tables in the bottlenecks document. Run on demand, not scheduled | no |
| A7 | Tombstone two legacy rows and apply ledger categories as a reviewed migration, with a before-and-after dry run | **yes, production data** |

**Measured at the end of Phase A**

| Measure | Now | Target |
| --- | ---: | ---: |
| Reachable venues | about 142 | at least 145 |
| Ledger rows rated "high" that are mis-grouped | 8 | 0 |
| Famous venues hidden by the freshness gate | 2 | 0 |
| Trampoline-only parks shown as soft play (chip or search) | 2 of the 6 soft play rows | 0 (automated test) |
| Venue's classification explained by a stored source | not recorded | every changed row has evidence in the ledger |

## 4. Phase B: expand, dry run first

### 4.1 Method

1. **Dry run, no database write.** A script reads licensed files from a local folder and writes a candidate list: source id, name,
   coordinates, proposed group, licence and attribution text, retrieval date, borough, and a de-duplication verdict against the
   stored rows and within the batch. It contains no network call to Google and no database client; a test fails the build if one is
   added. You review the list: size, per-borough table, a sample of 40, the rejected-as-duplicate list.
2. **Import in batches of at most 100**, each a reviewed migration with an `import_batch` id, source, licence, attribution and
   retrieval date on every row (a database check rejects a row without them). Rollback is `delete where import_batch = X` in a
   transaction with a count check, plus a read-path flag that hides a batch without deleting it.
3. **After each batch** measure the acceptance gates in 4.4 before starting the next.

### 4.2 Sources, by what each can and cannot supply

| Need | Source (all free) | Licence (verify at download) | Limits |
| --- | --- | --- | --- |
| Parks and play spaces | OS Open Greenspace | Open Government Licence v3; attribution to Ordnance Survey | polygons need a point inside, and a minimum size to be a destination |
| Playgrounds as places | borough open data where its licence allows; OpenStreetMap `leisure=playground` | OGL varies per dataset; OSM is ODbL | many are small and unnamed; only named, or inside a named park, count |
| Museums and galleries | Wikidata (identity, website), Mapping Museums | CC0; Mapping Museums terms to be read | gives identity and a website, not family facts |
| City farms and animal experiences | OSM (`tourism=zoo`, petting zoo, farm tags), then the venue's own site | ODbL | tagging is inconsistent; measure before counting |
| Soft play and trampoline parks | OSM (indoor play and trampoline tags), then the venue's own site | ODbL | **no licensed open dataset covers this.** Tagging coverage is unknown and is the first thing the dry run measures |
| Attractions and activities | OSM leisure tags (bowling, ice skating, adventure golf) | ODbL | quality varies |
| Facts for any of the above | the venue's own website, through the existing `refetch_official` and `reextract` modes | read with URL and date | about 27 current sites block our fetcher and we do not bypass that |

**Not used:** Google Places (excluded by your instruction; its terms also allow storing little beyond place ids), Foursquare
(category quality unverified), any paid provider, any scraper of a venue directory or review site.

**Where Google would be the only practical source:** soft play. If the dry run shows OSM cannot supply a meaningful number, the
bounded alternative is a one-off set of narrow-type Nearby Search requests (the soft play and indoor playground types only), one
per existing grid area: 9 requests, 18 if we also run farm and zoo types. For scale, discovery already makes 9 to 27 requests a
day. It is **not recommended by default** and would need your explicit approval with the request count stated. A narrow
type would give soft play all 20 slots in each area instead of competing with museums. Nine areas of 20 still cap it at 180, and
popularity ranking favours chains, so how much of London's soft play it would find is unknown and would have to be measured.

### 4.3 Avoiding duplicates, closed venues and misleading classifications

- **Duplicates.** Candidate match within 150 m and a normalised-name overlap of at least 0.6, or a polygon that contains a stored
  pin. Hits go to a review list as `same`, `part of` or `different`. Only `same` creates a canonical link; `part of` (a playground
  inside a stored park) becomes a fact on the existing row, not a new venue. The regression set that must stay apart is in the
  corrections ledger, section 6, and is a fixture test.
- **Closed or stale.** Drop sources' own closed, disused or abandoned flags. Where a website exists, one page fetch through the
  existing mode records HTTP status and the first few hundred characters; a 404, a parking page or "permanently closed" text holds
  the row back. Every row shows "details last checked on ...". Seasonal venues carry a season, not a closure.
- **Misleading classification.** The category comes from the source's own classification, never guessed from a name. A name list is
  not used. Soft play subtypes come from the venue's own words (corrections ledger, section 2). A row with no reliable category does
  not go in.
- **Facts.** Nothing is inferred. A missing fact is *unknown*; *checked and not found* is recorded only when a source was read.

### 4.4 Acceptance gates for each batch

1. Every row has a source, licence, attribution, retrieval date and batch id.
2. Zero merges of the regression set; every other duplicate hit has a recorded decision.
3. Family Fit shows "not reviewed" and the capped score for every imported row; none appears in headline positions on its own.
4. `google_places_usage` shows no new rows. The import path has no Google call (a test fails if one is added).
5. Search latency within 20% at the larger table, measured.
6. Rollback exercised once on a copy: counts return and the existing rows are untouched.
7. The share goals in section 2 improve, or the next batch is chosen to improve them.

### 4.5 The first batch

The earlier pilot targeted 74 rows: 22 outer south, 22 outer east, 16 central south, 14 in missing categories (swimming and
leisure centres, playgrounds). Swimming and classes are now out of scope for Explore until the catalogue supports them, so those
14 become playgrounds and soft play candidates. The list is produced from the files only; no name is written from memory.

## 5. Phase C: family evidence and freshness

Ordered by return per unit of effort.

| # | Work | Source | Cost |
| --- | --- | --- | --- |
| C1 | **Existing-facts recovery**: 74 current venues can show at least one new fact from pages already stored (existing-facts audit). Do this before adding rows | stored pages | none |
| C2 | **Playground presence for parks** by joining mapped play spaces to parks. Record a distinct source ("mapped data"), and record *not found in mapped data* as "not confirmed", never as "none" | OS Open Greenspace, OSM | none |
| C3 | Subtype claims `activities.softPlay` and `activities.trampolines` from the extractor, approved like other claims, so the reviewed map can be retired | venue pages | none |
| C4 | Official-site facts for new rows (toilets, baby changing, parking, cafe, buggy access, hours) through the existing modes, in batches, respecting blocks | venue pages | none; LLM fallback about US$0.001 to 0.003 a venue |
| C5 | Age suitability stays under the existing contract: only a venue's own recommended range counts, never a session or a ticket band. Expect little from parks and museums; pilot on soft play and farms, where operators publish ages | venue pages | none |
| C6 | Freshness monitoring: a bounded weekly job, **no Google**, one page fetch per venue with a website, capped (for example 150 a week), recording status and "last checked", flagging closures for a person | venue pages | needs approval as a scheduled job |

**Measured outcomes (goals, to be revised with the dry-run supply)**

| Measure | Now | After C |
| --- | ---: | ---: |
| Parks with a recorded playground answer (yes, or not found in mapped data) | 26 of 70 yes | at least 90% answered |
| Destinations with at least two confirmed family facts | about 74 of 149 with any | at least 70% |
| Facts showing "last checked" | not shown | 100% |
| Venues with a recorded age range | 0 | only where a venue publishes one |
| Rows needing a person to review a classification | not tracked | tracked, with a cap per batch |

## 6. Cost and safeguards

| | Phase A | Phase B | Phase C |
| --- | --- | --- | --- |
| Google requests | 0 | 0 (optional soft play set: 9 or 18, one-off, only on approval) | 0 |
| Other paid providers | none | none | none |
| Overpass (OpenStreetMap) | none | a handful of bounded queries, following the existing food backfill (at most 4, serial, identified, first error stops the run) | none |
| Language-model enrichment | none | none | about US$0.001 to 0.003 a venue as a fallback; the rule-based extractors cost nothing |
| Storage | none | a few hundred rows | claims for the same rows |
| Ongoing | health script on demand | none | the weekly freshness job, only if approved |

Standing safeguards, unchanged: no paid Google request without explicit approval; no scheduled job added or enlarged without
approval; no import without a dry run and approval; no production write without a separate approval; nothing invented; privacy and
consent untouched; every change reversible by batch.

## 7. How this differs from the earlier pilot plan

- The unit of reporting is the **reachable** catalogue (about 142), not the row count (168).
- OSM is no longer excluded outright: soft play, city farms and playgrounds have no open licensed dataset, so excluding OSM
  means not having them. OSM-derived rows stay separately tagged and attributed (decision in section 8).
- Swimming and leisure centres leave the first batch.
- Phase A gains three new fixes the earlier audits did not find: the exclusion rule that rejects venues Google also tags as a cafe
  or library, the freshness gate that dropped the Natural History Museum, and the soft play versus trampoline distinction.
- Existing-facts recovery (74 venues) is first in Phase C, as the earlier audit recommended.

## 8. Decisions and blockers

| # | Needed | Why | Recommendation |
| --- | --- | --- | --- |
| 1 | **Reach the open-data hosts**: allow `overpass-api.de`, `api.os.uk`, `data.london.gov.uk`, `data.gov.uk`, `www.wikidata.org` in the environment's network settings, or put the files in the repository's working directory | without a read of real files there is no candidate list and no measured supply; the host was denied again today | allow, so the dry run can be produced |
| 2 | **OpenStreetMap-derived rows allowed, tagged and attributed** | the only free source for soft play, farms and playgrounds. ODbL needs attribution and share-alike on a *published derived database*; the app shows individual results and the product already stores 19 OSM rows | allow, with your own reading of the licence |
| 3 | **Rule fixes R1 to R6** | change stored categories on the next discovery run | approve after the draft pull request shows the category diff on all 149 rows |
| 4 | **Ledger migration** (two rows out, categories corrected) | a production data change | approve after the 10-row spot check |
| 5 | A one-off narrow Google soft play query (9 or 18 requests) | only if the dry run shows OSM cannot supply soft play | decide after the dry run, not now |
| 6 | A bounded weekly freshness job | a scheduled job | decide in Phase C |

Items 1 and 2 unblock everything else. Items 3 to 6 are not needed to ship Explore.

## 9. Decisions recorded on 14 October 2026, and where each stands

| Decision | State |
|---|---|
| Zero-Google-cost investigation and dry run from open data, with confirmation of each source's identity, licence, limits and attribution first | **Authorised.** Blocked on reading any source: the network policy refuses every open-data host. See [OPEN_DATA_SOURCES.md](OPEN_DATA_SOURCES.md) |
| OSM-derived records approved in principle, subject to the licence | **Reviewed, with seven open legal questions.** See [OSM_LICENCE_REVIEW.md](OSM_LICENCE_REVIEW.md). Not legal advice |
| Discovery-rule fixes as a separate draft pull request | **Done**, pull request #204, with the replay on the 149 stored rows |
| Natural History Museum freshness issue, urgently | **Investigated.** See [FRESHNESS_DISCOVERABILITY.md](FRESHNESS_DISCOVERABILITY.md). The larger finding is that nothing has fetched since 9 October and Explore empties on 8 November |
| Ledger migration | **Not applied.** Schema, rollback and implications in [LEDGER_MIGRATION_PROPOSAL.md](LEDGER_MIGRATION_PROPOSAL.md). The real ten-row sample waits for one readable extract |
| No paid Google soft-play query, no new weekly freshness job, no new paid provider, no uncontrolled background processing | **Honoured.** Decisions 5 and 6 in section 8 are closed |
| Stop for approval before production database changes, imports, new recurring jobs, paid API use, or merging the feature pull requests | **Honoured** |
