# Open data: the exact requests, and how to get them to me

2026-10-14. This environment's network policy refuses every open-data host (probe results in [OPEN_DATA_SOURCES.md](OPEN_DATA_SOURCES.md),
section 4). I have not worked around that and will not. There are two ways to unblock the work. Pick one.

- **Route 1, allow the hosts (simplest).** In the session's cloud environment menu (title bar), choose Edit, then Network access, and add
  the hosts in the table under "Allowed domains", leaving "Allow package managers" ticked. Then I download each file once, record where
  it came from, and run the dry run in a local folder that is not committed.
- **Route 2, you download and hand me the files.** Run the commands below on your machine and push only the small result files to a
  throwaway branch, `data/open-data-inputs`, which is never merged. GitHub is reachable from here.

Either way: no paid Google, no paid Ordnance Survey product, no premium API, no production import, no migration.

## Hosts for Route 1

| Host | Why | Needed for | Cost |
|---|---|---|---|
| `download.geofabrik.de` | The Greater London OpenStreetMap extract | Tier A, the main source | free |
| `api.os.uk` | OS OpenData downloads (OS Open Greenspace). The file may redirect to a further host, which I will report rather than guess | Tier A, parks and play spaces | free, OpenData only |
| `query.wikidata.org` | One bounded SPARQL query for museums and galleries | Tier A, museum identity | free |
| `api.postcodes.io` | Looking up the postcodes on venues' own pages (about 33 postcodes) to give own-site venues a position | Optional: only if you accept tier B | free |
| `opendatacommons.org`, `wiki.osmfoundation.org`, `www.nationalarchives.gov.uk`, `www.openstreetmap.org` | The primary texts: ODbL 1.0, the OSMF Community Guidelines, the Open Government Licence v3, the OSM copyright page | Reading, so the licence review stops resting on summaries | free |

Most valuable first: `download.geofabrik.de`, then `api.os.uk`, then `query.wikidata.org`, then the licence-text hosts.

## The files

### 1. OpenStreetMap, Greater London (ODbL 1.0)

- **URL:** `https://download.geofabrik.de/europe/great-britain/england/greater-london-latest.osm.pbf` (and its `.md5` beside it)
- **Format:** `.osm.pbf`, about 100 MB (not verified). One request. Do not loop or re-download.
- **Terms:** ODbL 1.0; Geofabrik's service is free. Attribution: "© OpenStreetMap contributors" with a link to the copyright page.
- **Reduce it to what the dry run reads** (needs `osmium-tool`, free):

```
osmium tags-filter greater-london-latest.osm.pbf \
  nwr/tourism=zoo,aquarium,museum,gallery,theme_park \
  nwr/attraction=animal \
  nwr/leisure=trampoline_park,indoor_play,playground,nature_reserve,park,water_park,ice_rink,miniature_golf,bowling_alley \
  -o london-family.osm.pbf --overwrite
osmium export london-family.osm.pbf -f geojson -o london-family.geojson --overwrite
```

The result is a few megabytes of GeoJSON. The dry run (`node scripts/open-data/dry-run.mjs --osm london-family.geojson ...`, pull request
#206) takes exactly that file. These are the same tags its classifier uses, so nothing it needs is missing.

### 2. OS Open Greenspace (OGL v3) - OS OpenData only

- **Product page:** `https://www.ordnancesurvey.co.uk/products/os-open-greenspace`; download through the OS Data Hub OpenData downloads
  (`https://api.os.uk/downloads/v1/products/OpenGreenspace/downloads`), **GeoPackage**, Great Britain, no key for OpenData files (to confirm).
- **Format:** GeoPackage (`.gpkg`), clipped to London locally:

```
ogr2ogr -f GeoJSON greenspace-london.geojson OS_Open_Greenspace.gpkg GreenspaceSite \
  -t_srs EPSG:4326 -clipsrc -0.52 51.28 0.34 51.70
```

- **Attribution:** "Contains OS data © Crown copyright and database right [year]" (the year of the release you download). I would not use
  the data until the credit can be shown; the app's credit component currently names only Google and OpenStreetMap (a change I would
  make and test before any OS-derived record is served).
- **No paid OS product, no premium API, no OS Places, no AddressBase.**

### 3. Wikidata (CC0)

One bounded SPARQL query, not a dump, with a descriptive `User-Agent` (mandatory) and a single request:

```
SELECT ?item ?itemLabel ?coord ?website WHERE {
  VALUES ?class { wd:Q33506 wd:Q43501 wd:Q207694 }          # museum, zoo, art museum
  ?item wdt:P31/wdt:P279* ?class .
  ?item wdt:P131* wd:Q23306 .                                 # inside Greater London
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P856 ?website }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
```

Endpoint: `https://query.wikidata.org/sparql?format=json&query=<the query, URL-encoded>`. Save the JSON as `wikidata-london.json`.

### 4. postcodes.io (optional, for tier B only)

`POST https://api.postcodes.io/postcodes` with `{ "postcodes": [ ... up to 100 ... ] }`. About 33 postcodes in one request. Attribution
for Great Britain data is the Ordnance Survey, Royal Mail and National Statistics statements on postcodes.io's licence page (dated 2025
in the search summary; confirm the current wording). A position from a postcode is a postcode-unit centre, not a venue entrance.

**What the dry-run tool reads today.** Only the OpenStreetMap file. Adapters for OS Open Greenspace and the Wikidata JSON are not written,
because I would be guessing at the exact column names; I will write them, with synthetic tests, against the first real file (or sooner
if you want them written from the published specifications).

## What you hand me (Route 2)

Push to `data/open-data-inputs`: `london-family.geojson`, `greenspace-london.geojson`, `wikidata-london.json` (and `postcodes.json` if
wanted), and a `PROVENANCE.json` with, per file: the source URL, the retrieval time, the file's SHA-256, the licence, the attribution
text, and the version or release date. If a file is over GitHub's 100 MB limit, filter it first as above. Nothing is read from Google.

## What I do with them

1. Run the dry run locally, with no database connection and no network. 2. Produce the first ten real candidate records with source and
licence, original and proposed category, identity and duplicate checks, independent coordinates, confirmed family facilities, unknown
fields and the geographic spread, plus the expected import count. 3. Stop. Turning candidates into registry entries is a reviewed diff
(`server/places/data/identities/`) that you read and approve; there is no import and no migration in this plan.
