# Notice and provenance for the files in this folder

Start with `REVIEW.md`. These files contain information from four sources, each used under its own licence. Nothing in this folder is a statement about opening hours, facilities or suitability for a child of any age, and **nothing in it is imported, served or signed off**: every entry says `UNREVIEWED (simulation only)`, which the registry loader refuses.

- **OS Open Greenspace** (Ordnance Survey), version 2026-04, grid squares TQ and TL. Contains OS data © Crown copyright and database right 2026, supplied under the Open Government Licence v3.0 (<https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/>). Used for the names and interior points of named public parks and gardens, their size, and whether a mapped play space lies inside (folder `A/`). OS describes the product as showing spaces "likely to be accessible to the public", generalised automatically from large-scale data.
- **Wikidata.** Structured data is CC0 1.0 (<https://www.wikidata.org/wiki/Wikidata:Licensing>). Used for the labels, coordinates, official websites and Wikipedia-article counts of museums, zoos, castles, palaces and parks (folder `A/`), and to corroborate OpenStreetMap candidates (folder `B/`).
- **OpenStreetMap** (folder `B/`, **held**). Names, positions, categories and websites come from OpenStreetMap, © OpenStreetMap contributors, made available under the Open Database Licence (ODbL) 1.0: <https://www.openstreetmap.org/copyright>, <https://opendatacommons.org/licenses/odbl/1-0/>. Extract: Geofabrik Greater London and the surrounding counties, fetched 14 October 2026 on a GitHub runner. These files are an extract of OpenStreetMap offered under the ODbL. The consequences are in `docs/ODBL_ASSESSMENT.md`; until its build steps are merged and its two judgments settled, **no OpenStreetMap entry is served**.
- **Venues' own websites.** `A/site-checks-wikidata.json` and `B/site-checks-osm.json` record, for the venues whose own website is evidence, one front-page request per venue made on a GitHub runner with an identifying User-Agent, `robots.txt` honoured, two seconds between requests and no cookies or logins. Only the result is recorded: whether the page answered and whether its title or heading names the venue. No page content is kept. A site that refused automated requests (403) or that we chose not to ask again is reported as "could not check", not as a failure.

## What is deliberately not here

No Google place ID, Google name, address or position. The cross-reference from each venue we hold to its entry, the stored names and the possible-duplicate pairs are Google content or derived from it, so they are in a private review folder outside the repository. Entries that continue a venue we hold are shown here under their open-data id; the copy that carries the stored venue's id is made privately when a person approves the batch.

## How the files were made

`node scripts/build-first-batch.mjs --osm-candidates ... --osm-links ... --osm-batch ... --greenspace ... --wikidata ... --stored ... --site-checks-osm ... --site-checks-open ... --out docs/recovery-batches/2026-10-14 --private-out <a folder outside the repository>`

A person puts their name on a batch with `scripts/apply-review.mjs`; this tool never writes a reviewer.
