# Venue expansion pilot: preparation (Phase B, nothing written, nothing imported)

2026-10-08. This prepares the 60 to 80 destination pilot approved for £0 additional provider spend from appropriately licensed
open datasets. **No production write, no import, no provider call, no website fetch.**

## 0. The one thing I could not do, and what it blocks

The open-data hosts are not reachable from this environment (the network policy denied `api.os.uk`, `data.london.gov.uk`,
`data.gov.uk`, `overpass-api.de`, `www.wikidata.org`, `opendata.arcgis.com` and `www.activeplaces.com`). So **I have not
read a single dataset record**. Consequences, stated plainly:

- There is **no pilot list yet**. The previous draft's names-from-memory shortlist has been withdrawn (section 5): the list
  will be produced only from the licensed files.
- The licence statements in section 3 are my understanding of each publisher's terms; each must be read on the dataset page
  at the point of download and recorded in the batch.
- To go further I need network access to those hosts (Network access in the environment settings: add them under Allowed
  domains) or the downloaded files placed in the repository's working directory. Either is a decision for you, not a bypass
  I will attempt.

## 1. What a pilot row is, and is not

Two different bars, unchanged from the coverage audit and sharpened by the pricing and age findings.

**Discoverable** (listed, searchable, never headlined). Needs: a name, coordinates inside Greater London, a category taken
from the source's own classification (never guessed), a licensed source with attribution text and retrieval date recorded on
the row, a dedupe decision (no match, or a recorded merge), and an import batch id. Nothing about fit is asserted: Family Fit
already returns "Not reviewed" and caps the score for such a row, so it can appear in a thin area but cannot out-rank a reviewed
venue by itself.

**Fully usable recommendation** (eligible for the Home deck's best matches). Additionally needs: the venue's own website
verified, opening hours from a stated source, at least two reviewed family facts, a photograph with a recorded right (or the
category artwork), and for any activity-fit sentence the venue's own published ages. This is the existing evidence pipeline's bar;
the import never lowers it.

**What to expect, honestly.** Pilot rows will not carry a website, so the website-discovery step that normally follows
(it reads the website from Google Place Details) cannot run. A pilot row therefore starts **discoverable and stays that way**
unless a website comes from Wikidata (CC0), Sport England's dataset, or a person. I expect at most **10 to 15 % of the pilot
rows to become fully usable without further work**. The pilot's value is *coverage*: a family in Bromley or Havering sees real
places with an honest "not yet reviewed", instead of a near-empty list. It does not by itself make those places good
recommendations, and it should be described that way.

## 2. Gaps it targets (from the coverage audit: 134 destinations excluding food)

| Area | Today (Google destinations) | Pilot target |
| --- | ---: | ---: |
| Outer South London (Bromley, Croydon, Sutton, Kingston, Merton) | 1 | 22 |
| Outer East London (Havering, Barking and Dagenham, Redbridge, Bexley, outer Newham) | 2 | 22 |
| Central areas south of the river (Lambeth, Southwark, north Wandsworth) | 6 | 16 |
| Missing categories anywhere (swimming and leisure centres; named playgrounds) | 0 | 14 |
| **Total** | | **74** |

Missing categories (swimming and leisure, playgrounds as places in their own right, libraries, nature sites) are filled by rule
from the datasets rather than by name: **libraries are left out of the pilot** (borough data is uneven in licence and quality)
and nature sites are covered only where OS Open Greenspace classifies them as a public park or garden.

## 3. Sources and licences (verify each at download)

| Source | Gives | Licence (my understanding) | Use in pilot |
| --- | --- | --- | --- |
| OS Open Greenspace | public parks and gardens, play spaces, playing fields as polygons with a function class | Open Government Licence v3; attribution "Contains OS data © Crown copyright and database right [year]" | **Primary**: parks and play spaces |
| Sport England Active Places | swimming pools, leisure centres, sports halls with names, coordinates, often a website | published as open data; **confirm** the exact licence on the dataset page (I believe OGL) | leisure and swimming, and a website source |
| Wikidata | identity, coordinates and often an official website for notable parks, museums, heritage sites | CC0 | website and identity links; never family facts |
| London Datastore and borough open data | named playgrounds, leisure facilities | **varies per dataset** (many OGL; GiGL data has its own terms) | only datasets whose licence is read and recorded; otherwise excluded |
| OpenStreetMap | playgrounds, pitches | ODbL share-alike on a derived database | **excluded from the pilot** (recommendation unchanged: keeps licensing unambiguous) |
| Foursquare Open Source Places | POIs and websites | Apache 2.0 with NOTICE | excluded: category quality unverified |
| Google Places | the current source | terms allow storing place ids only | **excluded** (your instruction) |
| Venue websites | hours, facilities, ages, prices | read by our extractor with URL and date; photographs are not ours | only after a website exists, through the no-spend `refetch_official` / `reextract` modes |

Photographs: none in the pilot. Rows show the category artwork. (Wikimedia Commons images with attribution are a later,
separate decision.)

## 4. De-duplication (no row is merged or deleted without a recorded decision)

1. **Candidate match** against the 168 stored rows and within the batch: a pilot point that falls **inside a stored venue's
   neighbourhood (150 m) AND shares a name token set (normalised, stop-words and "park/gardens/centre" removed) with a ratio of
   at least 0.6**, or an OS polygon that **contains** a stored Google pin. Polygons matter: a park's centroid can be hundreds of
   metres from the pin Google holds.
2. **Never by distance and name alone for neighbours that are different places**: Science Museum and Natural History Museum
   (62 m), National Gallery and National Portrait Gallery (56 m), Golders Hill Park and its zoo (95 m), Horniman Museum and its
   Butterfly House (125 m) are the regression set; the matcher must keep each apart.
3. A hit is written to a review list with both records and a proposed action (`same`, `part of`, `different`). Only
   `same` uses the existing `canonical_venues` / `venue_place_links` model, which never deletes a source row. `part of`
   (a playground inside a park already stored) becomes a facility on the existing row, not a new venue.
4. The expected hit rate is low because the targeted areas are the thin ones, but the dense central-south slots will collide
   with existing rows such as Burgess Park and Battersea Park; those are skipped, not duplicated.

## 5. The pilot list comes from the datasets, not from names

**Revised 2026-10-08.** An earlier draft of this section listed places by name from general knowledge to steer matching. That has
been withdrawn: no pilot row, and no candidate list, will be written from memory. The list is produced only from licensed
records, once the files can be read:

1. Download OS Open Greenspace (and, where its licence is confirmed, Sport England Active Places) and record each file's
   licence text, version and retrieval date.
2. Keep features inside the three target areas whose source classification is a public park or garden or a play space (pools
   and leisure centres from Active Places, with a public pool).
3. Drop anything already stored (section 4), anything too small to be a destination (a minimum area, set and published with the
   list), and anything without a name in the source.
4. Rank by area and by distance from the target areas' centres, and take up to 74.
5. Publish that list, with each row's source identifier, licence, attribution and coordinates, **before** any import, for review.

## 6. Acceptance criteria (measured, not asserted)

1. Every row has a source, a licence string, an attribution string, a retrieval date and a batch id (a database check
   rejects a row without them).
2. Zero merges of the four neighbour pairs in section 4 (a fixture test), and every other hit has a recorded decision.
3. No pilot row reaches the Home deck's headline positions on its own: Family Fit shows "Not reviewed" and the capped score,
   asserted on 10 households by 20 pilot rows.
4. Search latency unchanged within 20 % at the larger table (measured, not assumed).
5. `google_places_usage` shows no new rows during or after the import; the import path contains no Google call (a test
   fails the build if one is added).
6. Rollback exercised once on a copy: delete by batch id restores row counts and leaves the 168 source rows untouched.

## 7. Projected cost

| Item | Provider spend |
| --- | ---: |
| Dataset downloads | £0 |
| Matching, import, verification | £0 (local compute and one reviewed migration) |
| Ongoing | £0 |
| Storage | a few hundred rows; negligible |
| Website discovery for pilot rows | **not done** (it is a Google call); websites only from Wikidata, Sport England or a person |

## 8. Rollback

Every pilot row carries `import_batch`. Rollback is `delete from place_records where import_batch = '<batch>'` plus the
links and canonical rows that batch created (also keyed by the batch), run in a transaction with a before-and-after count
check. Source rows for existing venues are never touched. A feature flag at the catalogue read path (`PILOT_BATCHES`) lets the
rows be hidden from the app without deleting them, which is the first lever.

## 9. What I need before starting

0. The existing-facts recovery comes first (`EXISTING_FACTS_AUDIT.md`): 74 current venues can gain a visible fact from pages
   we already hold, which is a better return than new rows that start with none.
1. Your go for Phase B, **and** network access to the hosts in section 0 (or the files).
2. Confirmation that OGL-only (no OSM) is acceptable for the pilot.
3. Agreement that the pilot is described as *coverage with honest "not yet reviewed" labelling*, not as new recommendations.
