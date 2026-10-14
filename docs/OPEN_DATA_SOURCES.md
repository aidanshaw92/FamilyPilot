# Open-data sources for the catalogue: what each is, what its terms allow, and what I could and could not read

2026-10-14. Authorised on 14 October: a zero-Google-cost investigation and dry run from open data, with no production import, no new
scheduled job and no paid API.

## Where this stands

**I could not read any dataset.** Every open-data host is refused by this environment's network policy (probe results in section 4), and
the web-fetch tool uses the same route. Web search works, so the licence findings below come from **search summaries of the holders' own
pages, not from the primary texts**. Treat each "found" as a lead to confirm, not as a read licence. I did not route around the block.

So **the supply of additional venues is unmeasured.** Section 6 says what each source should supply and how confident I am. Those are
hypotheses to be replaced by counts the moment one extract can be read. The dry-run method (section 5) is written and does not change.

## 1. The sources

"Found" means a search summary said it. "Confirm" means the primary text must be read before the first import.

| Source | Holder and identity | Licence found | Attribution | Access and limits | Redistribution and combining | Use here |
|---|---|---|---|---|---|---|
| **OpenStreetMap, Greater London extract** | OpenStreetMap contributors, via Geofabrik GmbH (`download.geofabrik.de`) | ODbL 1.0 on the data; Geofabrik's download service is free | "© OpenStreetMap contributors" with a link to the copyright page, plus an ODbL notice where the database is publicly used | One `.osm.pbf` file, refreshed daily. No published quota. Etiquette: download once, update with a diff tool, never re-download in a loop. Public files omit contributor names and ids | **Share-alike on a publicly used derivative database.** See [OSM_LICENCE_REVIEW.md](OSM_LICENCE_REVIEW.md) | **Primary source** for playgrounds, parks, museums, farms, zoos and indoor play |
| **OpenStreetMap, Overpass API** | Same data, public query service | ODbL 1.0 | as above | Public instance: roughly 10,000 requests and 1 GB a day, a small number of parallel slots per address, heavier users told to run their own. Our existing food lookup already uses it, bounded | as above | **Not needed** if the extract is readable. Use only for a handful of bounded checks |
| **OSM Nominatim** | OSMF geocoder | n/a | n/a | One request a second at most; **bulk geocoding is not allowed** | n/a | **Not used.** Postcodes go to postcodes.io, which the app already uses |
| **OS Open Greenspace** | Ordnance Survey, OS OpenData | Open Government Licence (found on the OS product page and technical specification) | "Contains OS data © Crown copyright and database right [year]" (the year changes with the release; confirm the current string) | Free download from the OS Data Hub; no key needed for the OpenData downloads (confirm). One national file, clipped to London locally | OGL allows copying, adapting and commercial use with attribution. Compatible with ODbL per the OSM wiki and the licence text (confirm) | **Authoritative** parks, play spaces and playing fields, with polygons |
| **Wikidata** | Wikimedia Foundation | CC0 for the data (well known; search did not return the clause, confirm) | none required | Query service: 60 seconds of processing per 60 seconds per client, a custom User-Agent is mandatory, abusive clients are blocked. Dumps avoid the query service | CC0, no conditions | **Museum and gallery identity**: a stable id, a website, coordinates |
| **Mapping Museums** (Birkbeck) | Birkbeck, University of London, AHRC funded | **CC BY** per the project site. One repository record lists a different licence (ODbL) for the March 2020 data files, so check each file | credit the Mapping Museums team | Browse and download from the project site and the Birkbeck repository (`museweb.dcs.bbk.ac.uk`, `researchdata.bbk.ac.uk`) | CC BY permits remixing and commercial use with credit | **Optional cross-check** for museum identity and opening and closing dates. Covers 4,000+ museums |
| **Arts Council England, Accredited Museums list** | Arts Council England | **Not confirmed.** The grants dataset is CC BY 4.0; the museum list's own licence was not found | confirm | One document download | confirm | **Optional.** Do not use until the licence is read |
| **Borough open data** (for example Sutton and Lambeth playgrounds) | London boroughs | Several are under OGL (found); the examples are old (2013 to 2016) | the provider's statement | Per borough, via data.gov.uk | OGL | **Only to cross-check OS and OSM play spaces.** Too old to be a primary source |
| **GiGL Spaces to Visit** | Greenspace Information for Greater London | **No longer open data since October 2025** (found on the London Datastore listing) | n/a | n/a | n/a | **Excluded. Do not use.** |
| **ONS and OS boundary files** | Office for National Statistics | OGL (standard for these releases; confirm) | the provider's statement | Download | OGL | Borough point-in-polygon, so coverage is measured per borough with no geocoder |
| **postcodes.io** | Ideal Postcodes, built on ONS data (confirm) | Free; the app uses it today for a typed postcode | per its terms | Free, rate limited | per its terms | Already in the app. Unchanged |

### Terms of Google's that constrain this work

Found by search summary; the primary text was not opened.

- **Cache limit.** Places latitude and longitude may be cached for up to 30 consecutive calendar days. The 30-day serve gate follows from
  this. Do not weaken it.
- **Place IDs.** Our cost-control notes treat place IDs as storable indefinitely. The search did not find a Places-specific exemption
  (it found one in the Geocoding terms). Confirm against Google's Places policy before relying on place IDs as the join key.
- **Non-Google maps.** Section 5.3 of the Places terms, in every version a summary was found for from 2018 to 2025, is titled "No use
  with a non-Google map". The Meet halfway map and the Explore Map plot Google-sourced positions on the app's own basemap. Section 5.1
  separately allows Places content in apps that show no Google map, with attribution.
- **Combining.** Google content must not be merged into an ODbL-licensed table, because share-alike would then reach content that cannot
  be relicensed. See the licence review and the ledger design: open-data rows live in their own table.

## 2. Access methods, in order of preference

1. **One file download, then everything local.** The Geofabrik Greater London extract (OSM), the OS Open Greenspace download, a Wikidata
   dump or a single bounded query. One request per source, recorded with its version.
2. **Bounded Overpass queries** only to check a specific finding, following the existing food backfill's limits: at most four, serial,
   identified, the first error stops the run.
3. **Never** Nominatim for bulk, never a loop that re-downloads, never an unidentified client.

## 3. What was assessed, and what is still to confirm

Confirm before the first import (each is a short read of the primary page):

1. The ODbL 1.0 text, clauses 4.2 to 4.5, and the OSMF Licence and Legal FAQ.
2. The current OS Open Greenspace attribution string and that the download needs no licence click-through.
3. The Wikidata data-access page (CC0 and query limits).
4. The licence of the Arts Council accredited list, and of each Mapping Museums file.
5. Google's Places policy on place IDs, and section 5.3.

## 4. Network probe, 14 October 2026

Each host was requested once, over HTTPS, through the session proxy. Every request below failed to connect (the proxy answers 403
to hosts outside the environment's allow-list). Only GitHub answered.

| Refused | |
|---|---|
| `overpass-api.de`, `overpass.kumi.systems`, `overpass.private.coffee`, `lz4.overpass-api.de` | OSM query service and mirrors |
| `download.geofabrik.de`, `planet.openstreetmap.org` | OSM extracts |
| `www.openstreetmap.org`, `wiki.openstreetmap.org`, `nominatim.openstreetmap.org` | OSM site, wiki, geocoder |
| `api.os.uk`, `osdatahub.os.uk` | Ordnance Survey downloads |
| `www.wikidata.org`, `query.wikidata.org` | Wikidata |
| `data.london.gov.uk`, `data.gov.uk`, `geoportal.statistics.gov.uk`, `services1.arcgis.com` | London Datastore, national and ONS data |
| `mappingmuseums.org`, `opendatacommons.org`, `www.nationalarchives.gov.uk`, `creativecommons.org`, `en.wikipedia.org`, `api.postcodes.io` | museums, licence texts, reference |

**Minimum to unblock the dry run** (in order of value): `download.geofabrik.de`, then `api.os.uk` (the OS Downloads API; its files may be
served from a further host named in the redirect, which I will report), then `www.wikidata.org` and `query.wikidata.org`. The licence
pages (`opendatacommons.org`, `www.nationalarchives.gov.uk`, `www.ordnancesurvey.co.uk`, `osmfoundation.org`) are small and would let me
read the primary texts. Mapping Museums and the Arts Council list are optional.

## 5. The dry run: no database write, no network call to Google

The tool that does this is in pull request #206 (`scripts/open-data/`), tested on a synthetic extract. It has not yet met real data.

1. **Read** each licensed file from a local folder. Record source, version, licence, attribution and retrieval time for the batch.
2. **Select** by source tags: for OSM, `leisure=playground`, `leisure=park`, `tourism=museum`, `tourism=zoo`, `tourism=attraction`,
   `leisure=trampoline_park` and the indoor-play tags; for OS, the greenspace function; for Wikidata, museums and galleries in London.
3. **Classify** into the five Explore groups, with the tags that decided it kept. A place that cannot be classified from its tags is
   not a candidate.
4. **Gate.** A candidate passes only if all of these hold, and says which failed if not:

| Gate | Passes when |
|---|---|
| Identity | a name from the source, and a stable source id; not an alias of a stored place (name and distance) and not a duplicate within the batch |
| Classification | a group decided by the source's own tags, never by the name alone |
| Location | a coordinate (or a point inside the polygon) inside London, from the source, not geocoded |
| Operating status | not tagged disused, abandoned or closed; otherwise "unknown", never "open" |
| Provenance | batch, source id, licence, attribution and retrieval time present |
| Family facilities | each fact only if the source states it (a `wheelchair`, `toilets`, `changing_table` tag); otherwise unknown |
| Age suitability | only a recorded `min_age` or `max_age`; otherwise unknown |

5. **Write** a candidate file (not committed) and a report: counts by group and by borough, the rejected-with-reason list, the
   de-duplication verdicts, a 40-row spot check.
6. **Stop.** Nothing is imported. The batches, if approved, are at most 100 rows each, each a reviewed migration.

## 6. Expected coverage, by category and area

**These are goals and hypotheses, not measurements.** The goals are the ones in the expansion plan. The "likely source" column says where
I expect supply to come from and how sure I am. The counts replace this table after the first readable extract.

| Group | Today (after corrections) | Goal | Likely source | Confidence that the source can supply it |
|---|---:|---:|---|---|
| Parks and playgrounds | 72 | 230 | OS Open Greenspace for parks and play spaces; OSM `leisure=playground`; a spatial join to find parks that contain a playground | **High** for existence. Medium for "actual playground", which needs the join |
| Museums and galleries | 39 | 65 | Wikidata and OSM `tourism=museum`; Mapping Museums as a cross-check | **High** for identity. Family suitability still needs evidence |
| Farms and animals | 14 | 30 | OSM `tourism=zoo` and farm tags; London has only a few dozen city farms and animal attractions | **Medium.** Depends on how consistently they are tagged |
| Soft play and trampolines | 6 | 70 | OSM `leisure=trampoline_park` exists (about 230 uses worldwide, per the tag page), and indoor-play tagging is inconsistent | **Low.** Likely tens, not 64. Genuine toddler soft play is the hardest gap. Open data may not close it; operator websites and curation will have to |
| Attractions and activities | 14 | 85 | OSM leisure and tourism tags | **Medium** |

By area: the plan's goal is each of north, east, south and west at 17% or more of the catalogue, and every borough with at least five
destinations. East and South are the thinnest today. Open data is **uniform in geography**: unlike popularity-ranked discovery it does
not favour the centre, so it should help the thin areas most. That is a reason for the approach, not a measurement.

## 7. What I will not do

No Google request of any kind. No import, migration or production write. No scheduled job. No dataset used before its licence is read.
No row without batch, source, licence and attribution.
