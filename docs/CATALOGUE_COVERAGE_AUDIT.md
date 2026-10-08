# London venue catalogue: coverage audit and pilot proposal (Phase A, read-only)

Everything below is from read-only queries on 2026-10-07 and code on main. **Nothing was imported, enqueued or fetched, and no
provider was called.** Phase B (a pilot import) needs your explicit approval; the proposal is at the end.

## 1. What the catalogue is today

| | Count |
| --- | ---: |
| Rows in `place_records` | 168 (168 distinct place ids, 167 distinct names) |
| Inside a Greater London box (lat 51.28 to 51.69, lng -0.51 to 0.33) | **151** (the "151 destinations") |
| of which Google-sourced destinations | 132 |
| of which OpenStreetMap rows (17 restaurants/cafes, 2 museums) | 19 |
| Outside London (Hertfordshire and beyond, e.g. Warner Bros. Studio Tour) | 17 |
| Google, in London, **reviewed** (`enriched` or `verified`) | 68 |
| ...and with official website, a photograph and opening hours | **57** |
| ...with a published recommended age range | **0** |
| ...with an `estimated_spend` | **0** |
| Google rows without a website / without a photograph | 5 / 3 |
| `canonical_venues` (the de-duplication table) | 3 rows, 6 links |

**Read plainly:** 151 rows exist; **57 are fully usable** (reviewed, with a website, a photograph and hours) which is 9.5% of
the 600 planning target and 7% of the 800 stretch. Zero rows carry activity-age evidence or a price, so those two product
promises are not yet supportable from data.

Category mix of the 149 Google rows (17 of the 168 rows are outside London): parks 70, museums 40, attractions 12, farms 8, activities 7, zoos 6, soft
play 6. There are no libraries, swimming/leisure centres, playgrounds as places in their own right, indoor activity centres
beyond six soft-play venues, or nature/woodland sites. The product's priority categories (parks/playgrounds, farms/animals,
museums/galleries, soft play, indoor activity, outdoor attractions, educational, swimming/leisure, nature, other) are covered
only for parks, museums, farms, zoos and soft play.

## 2. Geography

132 Google destinations by distance from Charing Cross and compass sector:

| Ring | N | E | S | W | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Central (under 6 km) | 14 | 12 | **6** | 21 | 53 |
| Inner (6 to 14 km) | 16 | 15 | 17 | 13 | 61 |
| Outer (over 14 km) | 5 | **2** | **1** | 10 | 18 |

Thin: **south of the river in the centre (6)**, **outer south (1)** and **outer east (2)**. A family in Bromley, Croydon,
Sutton, Havering or Barking has almost nothing to be shown. Only borough-level counts would be exact; the catalogue has no
borough column, so this is the honest resolution available without adding a geocoding call.

## 3. Duplicates and identity

- Triple listing of one site: "Warner Bros. Studio Tour London", "Harry Potter Studio", "Hogwarts Castle" (6 to 28 m apart).
  (Outside London, but a ranking risk if a household is near enough.)
- Legitimate neighbours that must NOT be merged: Science Museum / Natural History Museum (62 m), National Gallery / National
  Portrait Gallery (56 m), Golders Hill Park / its Zoo (95 m), Horniman Museum / its Butterfly House (125 m).
- So "same place" cannot be decided by distance and name alone; the existing `canonical_venues` + `venue_place_links` model
  (never deletes source rows) is the right mechanism and is almost unused (3 canonical venues). Any import needs a dedupe key of
  normalised name + 150 m + category, with a human check for hits, before it is written.

## 4. Where more venues can come from, and what each costs and permits

| Source | Gives | Licence and conditions (verify at point of use) | Cost |
| --- | --- | --- | --- |
| Existing stored official pages (2,212 pages, 156 venues) | facts for venues already listed | our own extraction with a source URL; already how claims work | £0 |
| **OS Open Greenspace** | parks, playing fields, play areas' green space polygons, with function class | Open Government Licence v3: commercial reuse allowed; attribution "Contains OS data (c) Crown copyright and database right [year]" (use the wording in the product's current documentation) | £0 |
| London Datastore / borough open data (playgrounds, libraries, leisure centres, children's centres) | named public facilities with coordinates | mostly OGL v3; **each dataset's own licence must be read before use** | £0 |
| Sport England Active Places | swimming pools, leisure centres, sports halls | published as open data; confirm the licence on the dataset page | £0 |
| Mapping Museums / Wikidata | museums and galleries, identity and website links | Wikidata is CC0; Mapping Museums terms to be confirmed | £0 |
| OpenStreetMap extracts (already used for restaurants) | playgrounds (`leisure=playground`), pitches, nature reserves | **ODbL: attribution and share-alike on a derived database.** Storing extracts in our database is allowed, but a public re-publication of that database carries share-alike duties. Keep OSM-derived rows separately tagged and use them for identity, not as the evidence for family facts | £0 |
| Foursquare Open Source Places | POI name, coordinates, website, category | Apache 2.0 with a NOTICE; no opening hours; category quality unverified | £0 (large download) |
| Official venue websites | hours, prices, facilities, ages | permitted as read by our extractor with a URL and date; respect robots and terms; **photographs are not ours to copy** | £0 |
| Google Places | the current source | Terms allow storing only place ids indefinitely; other content is temporary. **Not used for expansion** | **billable; excluded by your standing instruction** |

Photographs: only (a) venue-supplied with permission, (b) Wikimedia Commons with the licence's attribution, or (c) none (a
category placeholder). Google photographs are served through a billable proxy and may not be stored.

## 5. Two different bars

**To be imported (listed, searchable, never headlined)** needs: a name, coordinates inside London, a category from the
product's list taken from the source (not guessed), a licensed source recorded with its attribution text and retrieval date, a
dedupe check that found no match or a recorded merge, and an import batch id. Nothing about fit is asserted: it shows as "not
yet reviewed", which Family Fit already handles (never Good, never Poor on guesses).

**To be prominently recommended (Home deck, Excellent/Good badge)** additionally needs: an official website verified as the
venue's own; opening hours from a stated source; at least two reviewed family facts (not only category); a photograph with a
recorded right, or a placeholder; and for any activity-fit sentence, the venue's own published ages. These are the rules the
evidence pipeline already enforces; the import adds rows, it never lowers them.

## 6. Proposal for Phase B (needs your approval; nothing has been started)

**Target:** 60 to 80 destinations, aimed at the thin areas (outer south and east, south-of-river centre) and the missing
categories (playgrounds, libraries with children's areas, leisure/swimming, nature sites), chosen from OS Open Greenspace and
borough open data. Cost: **£0 provider spend** and no Google call.

**Steps:** (1) pull the open datasets locally; (2) filter to London and the chosen categories; (3) dedupe against the 168 rows
and the batch itself, writing proposed merges for review; (4) record licence and attribution per row in `field_provenance` with
an `import_batch` id; (5) insert as `provider_only`/`not reviewed` rows through a reviewed migration; (6) run the existing
website-discovery and `refetch_official`/`reextract` jobs (no Google) to attach official pages and facts where a venue has one;
(7) measure.

**Acceptance criteria:** every row has a licensed source, an attribution string and a batch id; zero merges of
legitimate neighbours (checked by hand against the list in section 3); no row recommended prominently without section 5's
second bar; Family Fit on a sample of 10 households x 20 new rows shows no Good or Poor from imports alone; search latency
unchanged within 20% (a 250-row table is trivial for a bounding-box query; this is to be measured, not assumed); the
provider-usage table shows no new Google calls; rollback is `delete where import_batch = X` (source rows for existing venues
are untouched).

**What I need from you before starting:** a go for Phase B, and which of OSM-derived rows you are comfortable holding given the
ODbL share-alike (my recommendation: exclude OSM from the pilot and use only OGL sources, which keeps the licensing
unambiguous). Phase C (toward 600) only after the pilot is verified and you approve again.
