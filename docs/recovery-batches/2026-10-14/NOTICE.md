# Notice and provenance for the files in this folder

These files contain information from three sources, each used under its own licence. Nothing in this folder is a statement about opening hours, facilities or suitability for a child of any age.

- **OpenStreetMap.** Names, positions, categories and websites come from OpenStreetMap, © OpenStreetMap contributors, made available under the Open Database Licence (ODbL) 1.0: <https://www.openstreetmap.org/copyright>, <https://opendatacommons.org/licenses/odbl/1-0/>. Extract: Geofabrik Greater London and the surrounding counties, fetched 14 October 2026 on a GitHub runner (provenance in the throwaway branch `data/open-data-fetch`). The ODbL consequences for how these files may be used and published are in `docs/ODBL_DECISION_MEMO.md`; until counsel has answered its questions, **no entry here is served**.
- **OS Open Greenspace.** Contains OS data © Crown copyright and database right 2026, under the Open Government Licence v3.0. Used only to corroborate that a green space of the same name exists at the same place (the `os_greenspace` column).
- **Wikidata.** Structured data is CC0. Used only to corroborate (the `wikidata` column).
- **Venues' own websites.** `site-checks.json` records, for 169 venues whose own website is the only independent source open data can offer, one front-page request per venue made on a GitHub runner with an identifying User-Agent, `robots.txt` honoured, two seconds between requests and no cookies or logins. Only the result is recorded: whether the page answered and whether its title or heading names the venue. No page content is kept. 43 sites did not answer (mostly 403, a site refusing automated requests) and are reported as "could not check", not as failures.

## What is deliberately not here

No Google place ID, Google name, address or position. The cross-reference from each existing venue to its entry, the stored names and the possible-duplicate pairs are Google content or derived from it, so they are in a private review folder that is not in the repository. Entries continuing an existing venue are keyed by their open-data id (`fp-osm-...`), which is what the memo recommends before any entry is served.

## How the files were made

`node scripts/select-recovery-batches.mjs --candidates ... --links ... --batch ... --stored ... --wikidata ... --greenspace ... --site-checks site-checks.json --target 200 --seed 7 --out docs/recovery-batches/2026-10-14 --private-out <a folder outside the repository>`

Every entry says `UNREVIEWED (simulation only)`, which the registry loader refuses to serve. A reviewer puts their name on a batch by replacing that field; this tool never does.
