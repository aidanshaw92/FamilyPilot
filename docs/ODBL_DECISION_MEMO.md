# ODbL decision memo

14 October 2026. Written from the **primary texts**, fetched on 14 October from the publishers' own pages by a GitHub runner (this session's network cannot reach them): the ODbL 1.0 legal code (opendatacommons.org), the OpenStreetMap copyright page, and the OSMF Community Guidelines for Collective Database (endorsed 2016-06-17), Substantial (2014-06-06), Produced Work (2014-06-06), Geocoding (2017-08-24), Horizontal Layers, Trivial Transformations and Attribution, plus the OSMF Licence and Legal FAQ. It is an engineer's reading, not legal advice. The questions that need a lawyer are in section 4, ready to send.

## 1. The decision

**Recommended: serve OpenStreetMap-derived venues as a published, ODbL-licensed identity database, one category at a time, replacing Google's rows of that category entirely, with our own evidence kept as a separate layer that uses no OpenStreetMap data for the properties it supplies.** It costs publishing one JSON file and one credit line. It does not need Google's content to be relicensed, because Google's content is never in the same category as the OpenStreetMap entries.

| | A. OpenStreetMap, published and cut over | B. Wikidata (CC0) and venues' own pages only | C. Do nothing |
|---|---|---|---|
| Search depth for 8 November | thousands (3,309 candidates today) | hundreds (see [WIKIDATA_RECOVERY_PATH.md](WIKIDATA_RECOVERY_PATH.md)) | 0 |
| Licence obligations | attribution, publish the extract, keep Google out of it | none beyond Wikidata's CC0 and the venues' own pages | n/a |
| Needs a lawyer first | questions 1 to 5 | question 6 only | no |
| Needs engineering | the batches (done), a licence page, an alias map | an adapter | none |

A and B are not exclusive: B can go first as a smaller floor while A is cleared.

## 2. What the primary sources require

**Attribution.** The OSM copyright page and the Attribution Guidelines ask for "© OpenStreetMap contributors", linked to openstreetmap.org/copyright, which makes clear the data is under the ODbL. Where the credit appears is flexible for an app (a corner of a map, adjacent to it, or a startup screen with a "Data licences" link in a menu). The Guidelines prefer attribution only where OpenStreetMap data is actually used. **Already met:** `OSM_CREDIT` and `OSM_COPYRIGHT_URL` in `src/services/places/attribution.ts`, shown on cards for `osm` places. ODbL 4.3 also asks, for a Produced Work, for a notice "reasonably calculated" to tell a viewer the content came from the database and "is available under this License", for example "Contains information from OpenStreetMap, which is made available here under the Open Database License (ODbL)", with links.

**When share-alike bites.** ODbL 4.4(b): "Extraction or Re-utilisation of the whole or a Substantial part of the Contents into a new database is a Derivative Database". 4.4(c): a Derivative Database is Publicly Used "if a Produced Work created from the Derivative Database is Publicly Used". So if our registry of OSM entries is a Substantial extraction and the app is used by the public, **the registry must be offered under the ODbL**, and under 4.6 we must "offer to recipients ... a copy in a machine readable form of the entire Derivative Database (or a file of alterations or the method)", "free of charge if distributed over the internet". "Publicly" means to persons outside our control (definitions). Interaction with a user over a network is not "Conveying" (definitions) where no copy is transferred, which spares the 4.2 notices for the app itself but not 4.4 to 4.6. A phone that downloads and caches entries does receive a copy, which is one more reason to serve nearby results in pages rather than the whole catalogue.

**What is Substantial.** The Substantial Guideline treats as insubstantial: fewer than 100 features, one-off and not repeated; or more than 100 only if non-systematic and "clearly based on your own qualitative criteria". "Systematic extraction of all ... within an area" is systematic, and "repeated small extractions" count as one. Our 112 plus about 200 reviewed picks is over 100 and recurring. **Treat it as Substantial** unless counsel says otherwise.

**The architecture rule.** The Collective Database Guideline: OSM and non-OSM data in one database are "independent" (a Collective Database, so no share-alike on the non-OSM part) when, for each data type in a regional cut, the data is either **all OSM or all non-OSM**. It lists what does not trigger share-alike: datasets that do not reference each other; non-OSM data that **completely replaces** a type within the cut; non-OSM data that adds a type with no OSM data; and a non-OSM source replacing or adding a **property** using "either all OSM data or no OSM data for that property" within the cut. A join "by a key" counts as a reference. Its third example is our trap: a proprietary list complemented with OSM data and de-duplicated is "not covered by this guideline"; the proprietary data "may be subject to the ODbL share-alike terms". For Google content that is impossible, because Google's terms forbid relicensing it.

**What must never be in the published file.** ODbL 4.4(d): do not add Contents to a Derivative Database that are incompatible with the licence. #208's closed entry shape already refuses every Google field, and a test proves it.

**Compare, do not take.** The FAQ: OSM data may verify your own without share-alike "provided that you are only comparing and do not copy any OpenStreetMap data". Our use of Wikidata and OS Open Greenspace to corroborate OSM candidates, and of OSM to corroborate venues' own pages, is comparison.

## 3. What follows for the design

1. **Cut over by category, with no overlap.** For a category served from OSM, serve no Google row of that category (`cutover.json`, merged inert in #208). Our categories are broader than OSM primary features (`park` covers park, recreation ground, nature reserve, garden, playground), so cutting over the whole category is the safe superset. The weeks when old Google rows and new OSM entries coexist in one category are the exposed period (question 4): switch a category's Google rows off at the moment its entries go live.
2. **Publish the registry.** `server/places/data/identities/osm.json` is already in a public repository, which is itself "free of charge over the internet". Add a licence notice file beside it and a "Data licences" link in the app that names the ODbL and points to it.
3. **Keep Google out of the published file.** Do not use `fp-google-...` ids as keys or fields in `osm.json`. Google's terms exempt `place_id` from caching ([Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms) 3, and the Places policies page: "store place ID values indefinitely") but say nothing that lets us republish it. Key entries `fp-osm-...` and keep a private map from stored Google ids to them for saved plans (production has no synced plans yet, so this is cheap now and expensive later). **#208 currently keys continuity entries by Google id**; this is the one change to make before any entry is served.
4. **Our evidence layer stays ours.** Hours, facilities and ages we read from venues' own pages are non-OSM data supplying properties. They are safe if, within the cut, a property comes from one side only: do not mix OpenStreetMap's own `opening_hours`, `wheelchair` or `toilets` values with ours for the same property. The entries carry only name, category, position and website, and the facts the source states are used only to rank evidence gaps, never shown as facts.
5. **Credit where OSM data is shown**, per the Attribution Guidelines. Already done on cards. Add the ODbL link on the "Data licences" page.

## 4. Questions for a lawyer (send these, nothing else)

1. Is a reviewed, hand-selected set of OpenStreetMap features in a regional cut (about 300 now, perhaps thousands later) a "Substantial" extraction (ODbL 4.4(b); Substantial Guideline), given the selection is by our own quality criteria but covers a category across an area?
2. If so, is publishing the entry file in our public repository with a licence notice, and linking it from the app, enough to meet 4.4 and 4.6? Are our category label and review metadata part of the Derivative Database?
3. Does keying our own evidence dataset to OSM-derived entries make that dataset part of a Derivative Database, or does the Collective Database Guideline's property rule ("all OSM data or no OSM data for that property") keep it independent?
4. Is the transition acceptable if, for a category, Google rows are switched off at the same moment OSM entries are switched on, with no coexistence? Is any overlap, even for days, a problem?
5. May a private table mapping Google `place_id` values to OSM element ids be kept, and may a Google `place_id` appear in a published ODbL file?
6. For Wikidata (CC0): do any facts we take from it carry a licence risk from an upstream source, given Wikidata's own page says it avoids but does not warrant the absence of non-CC0 data?

## 5. If advice does not arrive in time

Engineering does not wait. Done or doable now: the quality gates and batches (this PR set), the licence page and notice, the alias map, the performance work. Blocked until advice: serving any OSM entry. If there is no answer by about 27 October, the fallback is Plan B in [WIKIDATA_RECOVERY_PATH.md](WIKIDATA_RECOVERY_PATH.md) and the own-site list-only tier in `P0_CATALOGUE_RECOVERY.md`, both with no ODbL dependency, then the one-off Google refresh decision on 1 November. Note the refresh is itself non-compliant for names and addresses (see [GOOGLE_RETENTION_AUDIT.md](GOOGLE_RETENTION_AUDIT.md)).
