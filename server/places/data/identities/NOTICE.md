# Licences for the independent place lists in this folder

Each file holds places from **one** source and carries that source's licence. A file stays empty until a named person has reviewed a set of entries (`reviewedBy`, `reviewedAt`); an entry that says it is unreviewed is refused by the reader and never served.

| File | Source | Licence | Credit |
|---|---|---|---|
| `osm.json` | OpenStreetMap: name, category, position and website of a feature | Open Database Licence (ODbL) 1.0, <https://opendatacommons.org/licenses/odbl/1-0/> | © OpenStreetMap contributors, <https://www.openstreetmap.org/copyright> |
| `os-greenspace.json` | OS Open Greenspace (Ordnance Survey): name and an interior point of a named public park or garden | Open Government Licence v3.0, <https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/> | Contains OS data © Crown copyright and database right 2026 |
| `wikidata.json` | Wikidata: label, coordinates, official website | CC0 1.0, <https://www.wikidata.org/wiki/Wikidata:Licensing> | none required |
| `official-site.json` | A venue's own website: a name and the address of its page | none claimed; the venue's own words, read once | none |

## For the ODbL (`osm.json`)

- **Notice (ODbL 4.2).** This file is, or will be, a Derivative Database of OpenStreetMap, made available under the ODbL. The licence text is at the address above; keep this notice with the file.
- **What was done to the data.** A selection of features by category and area; a category label assigned by us; entries reviewed by a named person. No OpenStreetMap tag other than the name, a website and a position is kept. No Google field is, or may be, in this file (the registry's validator refuses it).
- **Access (ODbL 4.6).** The whole file is in this public repository and can be read and copied free of charge. The app links here from its About screen.
- **Not mixed.** For each type of feature in a region, the lists are either entirely OpenStreetMap or entirely something else (`cutover.json`): a category is switched from Google's rows to these files in one release, never blended with Google's rows.
- **Produced Work notice (ODbL 4.3).** The app shows "Contains information from OpenStreetMap, which is made available here under the Open Database License (ODbL)." on its About screen, and "© OpenStreetMap contributors" on places whose position is OpenStreetMap's.

Background and the judgments that remain open: `docs/ODBL_ASSESSMENT.md`.

## For the Open Government Licence (`os-greenspace.json`)

- **Source and licence.** OS Open Greenspace is supplied by Ordnance Survey under its OS OpenData licence, which is the Open Government Licence v3.0 (the link in the data's own `licence.txt`, <http://os.uk/opendata/licence>, leads to the OGL v3.0 page, and OS's acknowledgement guidance says "We use the Open Government Licence (OGL) for OS OpenData"). Checked on 14 October 2026; see `docs/recovery-batches/2026-10-14/A/PROVENANCE.json` for the file checksums.
- **Statement.** The app shows "Contains OS data © Crown copyright and database right 2026" with a link to the licence on places taken from this file, and on its About screen. That is the wording OS publishes as the statement to use. The licence file inside the download words the same acknowledgement as "Contains Ordnance Survey data © Crown copyright and database right 2026"; both are OS's.
- **What was done to the data.** A selection of named public parks and gardens by area; the name as OS gives it; one interior point of each site's polygon, computed by us; the category park. No other attribute is kept. OS describes these sites as "likely to be accessible to the public" and generalises them automatically; the app does not say more than that about access.
- **No endorsement.** Nothing here suggests that Ordnance Survey endorses FamilyPilot or this use.

## For Wikidata (`wikidata.json`)

- Wikidata's structured data is CC0 1.0 (<https://www.wikidata.org/wiki/Wikidata:Licensing>); no credit is owed, and the About screen names Wikidata anyway. Label, coordinates and official website are taken as Wikidata gives them; the category is ours.

