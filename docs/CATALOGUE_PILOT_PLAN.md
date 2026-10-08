# Venue expansion pilot: preparation (Phase B, nothing written, nothing imported)

2026-10-08. This prepares the 60 to 80 destination pilot approved for £0 additional provider spend from appropriately licensed
open datasets. **No production write, no import, no provider call, no website fetch.**

## 0. The one thing I could not do, and what it blocks

The open-data hosts are not reachable from this environment (the network policy denied `api.os.uk`, `data.london.gov.uk`,
`data.gov.uk`, `overpass-api.de`, `www.wikidata.org`, `opendata.arcgis.com` and `www.activeplaces.com`). So **I have not
read a single dataset record**. Consequences, stated plainly:

- The venue list in section 5 is a **provisional shortlist of named places I am confident exist**, written from general
  knowledge to give the matching step a target. It is **not** drawn from a licensed dataset yet, carries no coordinates or
  identifiers, and every row must be matched to a record in an OGL (or otherwise permitted) source and **dropped if it cannot
  be**. Nothing in it is a claim about opening hours, facilities, prices or ages.
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

## 5. Provisional shortlist for matching (unverified, see section 0)

Parks and green spaces with play provision, named by borough. Each is to be matched to an OS Open Greenspace record
(function class "Public Park Or Garden" or "Play Space") and **dropped if there is none or the licence is not as expected**.
Anything already stored is skipped at matching.

| Area | Named candidates |
| --- | --- |
| Outer South: Bromley | Crystal Palace Park; High Elms Country Park; Jubilee Country Park (Hayes); Kelsey Park (Beckenham); Norman Park; Priory Gardens (Orpington) |
| Outer South: Croydon | Lloyd Park; Wandle Park; South Norwood Country Park; Heathfield; Purley Beeches |
| Outer South: Sutton | Carshalton Park; Oaks Park; Cheam Park; Nonsuch Park |
| Outer South: Kingston and Merton | Canbury Gardens; Hogsmill Local Nature Reserve; Morden Hall Park; Wimbledon Park; Mitcham Common; Wandle Meadow Nature Park (allow 22 in total; trim by matching) |
| Outer East: Havering | Bedfords Park; Raphael Park; Havering Country Park; Hornchurch Country Park; Harrow Lodge Park |
| Outer East: Barking and Dagenham | Barking Park; Mayesbrook Park; Valence Park; Central Park (Dagenham) |
| Outer East: Redbridge | Fairlop Waters Country Park; Hainault Forest Country Park; Valentines Park; Wanstead Park; Claybury Park |
| Outer East: Bexley and Newham | Danson Park; Lesnes Abbey Woods; Hall Place and Gardens; Foots Cray Meadows; Thames Barrier Park; West Ham Park; Central Park (East Ham) |
| Central south: Lambeth, Southwark, Wandsworth | Kennington Park; Archbishop's Park; Brockwell Park; Southwark Park; Peckham Rye Park; Dulwich Park; Vauxhall Park; Ruskin Park; Myatt's Fields Park; Bermondsey Spa Gardens; Geraldine Mary Harmsworth Park; Clapham Common; Tooting Bec Common (16 slots; trim by matching) |
| Missing categories, by rule | up to 14 council swimming pools or leisure centres in the three target areas from Sport England Active Places (the first one or two per borough with a public pool), named only after the dataset is read |

About 58 named parks and green spaces plus 14 rule-selected leisure sites, trimmed to 74 or fewer by matching.

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

1. Your go for Phase B, **and** network access to the hosts in section 0 (or the files).
2. Confirmation that OGL-only (no OSM) is acceptable for the pilot.
3. Agreement that the pilot is described as *coverage with honest "not yet reviewed" labelling*, not as new recommendations.
