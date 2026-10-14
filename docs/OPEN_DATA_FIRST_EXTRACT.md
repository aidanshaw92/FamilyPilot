# The first real open-data extract

2026-10-14. Everything here was measured on real files, in this repository's own tooling, with no database connection, no Google call and
nothing imported. Where a figure was not measured the text says so.

## The five answers

| Question | Answer |
|---|---|
| Can we obtain real open data? | **Yes, and it is done.** GitHub's own Actions runners can reach the hosts this session cannot. Free public-repository runners, no secret, no paid service; the run's own token could write only a throwaway branch. Nothing is needed from you for access |
| How many usable venues does the first extract provide? | **3,374 candidates**, 3,206 of them new, 168 matched to a place we already hold. These are *named, located, in-scope* venues. They are **not** reviewed and are mostly bare (no photos, hours or facilities); see "What an entry is" |
| Can the recovery reader prevent the 8 November collapse? | **Yes, mechanically.** On 8 November today's path serves **0**; with the entries it serves **3,374** (**955** if only the first, better-evidenced stage is reviewed in time). 112 of the 147 venues we hold keep an independent identity. Soft play does not: 0 of 6 |
| Earliest safe recovery deployment path | Merge the inert reader, review a first batch, settle the ODbL cutover with counsel, then add reviewed entries and a per-category cutover on a Preview before production. Earliest realistic production date **about 1 November**, a week before the cliff. Section 7 |
| What do I need from you? | Four small things, none of them about data. Section 8 |

## 1. What was fetched

One-off runs of a workflow on a throwaway branch (`data/open-data-fetch`, never merged, no schedule, no manual trigger). Each file was
downloaded once, from the host that publishes it, with a descriptive `User-Agent`, checked against the publisher's checksum where one is
given, and reduced by tag. The workflow runs end to end in about 80 seconds.

| Source | URL | Size | Licence and credit | Retrieved (UTC) |
|---|---|---|---|---|
| OpenStreetMap, seven Geofabrik regional extracts: Greater London, Hertfordshire, Surrey, Kent, Essex, Buckinghamshire, Berkshire | `https://download.geofabrik.de/europe/united-kingdom/england/<region>-latest.osm.pbf` (each with its `.md5`) | Greater London `.pbf` **123 MB**; the other six not recorded. Reduced by tag to **56.9 MB** GeoJSON (11.3 MB gzipped), SHA-256 `c067ce56…9d60b` | ODbL 1.0. "© OpenStreetMap contributors" | 2026-10-14 07:48 |
| OS Open Greenspace, grid squares **TQ** and **TL** (`opgrsp_essh_tq.zip`, `opgrsp_essh_tl.zip`, ESRI Shapefile) | `https://api.os.uk/downloads/v1/products/OpenGreenspace/downloads` (OS OpenData, no key) | Reduced to **13.4 MB** GeoJSON, 13,993 features, SHA-256 `017f243a…8a58d`. The zip sizes were not recorded | OGL v3. "Contains OS data © Crown copyright and database right 2026" | 2026-10-14 07:28 |
| Wikidata, museums, zoos and art museums inside Greater London (one bounded SPARQL query) | `https://query.wikidata.org/sparql` | **543 rows**, 337 KB, SHA-256 `bdc7afd8…5434` | CC0, no credit required | 2026-10-14 07:28 |

OpenStreetMap: 112,804 tag-filtered features across the seven files, 112,062 after merging by OSM id (features on a county border appear in
two files). Per region: Greater London 44,996; Kent 29,759; Surrey 13,653; Essex 10,752; Hertfordshire 5,373; Buckinghamshire 4,934;
Berkshire 3,337. Greater London alone does not cover the app's 40 km scope (13 of the 149 places we hold lie outside it), which is why the home counties were fetched too.

The full provenance (URL, retrieval time, size, SHA-256, licence, credit) is written beside each file by the workflow as
`PROVENANCE.json`. The files were published to a short-lived public data branch only so this session could read them (the artifact host is
refused here, and I did not work around that). The ODbL requires the credit and a notice, and the branch carried both. Those branches are
not needed any more; see section 9.

**A warning that cost one run.** `osmium tags-filter -R` drops the nodes a polygon is built from, so the export kept only points: 858
features for Greater London against about 13,700 without it. Do not use `-R`. The dry-run tool's header now says so.

## 2. The dry run on the real extract

`node scripts/open-data/dry-run.mjs --osm osm-family-regions.geojson --version 2026-10-14 --out out --stored rows.json` (pull request #206).
Full report: [open-data-first-extract/dry-run-report.md](open-data-first-extract/dry-run-report.md).

| | |
|---|---:|
| Candidates | **3,374** |
| New places | 3,206 |
| Duplicates of a stored place, to be linked | 168 (the matcher flags 54 for a person to compare; the entry builder holds back 56) |
| Rejected | 108,688 |
| Expected import if ever approved | 3,206, in 33 reviewed batches of at most 100 |

Rejected, by the gate that stopped it: identity 75,718 (no name, duplicates, generic names); operating status 21,427 (disused, abandoned,
closed); location 6,689 (outside the app's 40 km London scope); significance 3,952 (a plain park under 1 ha, a general attraction with no
Wikidata link); classification 902 (no usable tag, an animal enclosure, a club or school).

| Group | Stored today | New from this source | Goal | Gap left |
|---|---:|---:|---:|---:|
| Parks and playgrounds | 70 | 2,575 | 230 | 0 |
| Museums and galleries | 40 | 286 | 65 | 0 |
| Farms and animals | 14 | 26 | 30 | 0 |
| Soft play, trampolines, indoor play | 6 | 53 | 70 | 11 |
| Attractions and activities | 19 | 266 | 85 | 0 |

By area the supply is not centre-weighted: of 2,575 new parks, 308 are central, 327 north, 409 east, 373 south, 472 west and 686 beyond
25 km. The east and south, the thinnest parts of today's catalogue, get 409 and 373 parks.

What the source itself states about a family: step-free access 254 of 3,374; opening hours 474; a fee 272; toilets **25**; baby changing
**7**; a minimum age 4. Everything else is unknown and shown as unknown. Open data names and places venues; it does not say whether one suits a
toddler.

### What the real rows taught the tool

The tool had met only a synthetic file. Reading real rows found these, each fixed with a regression test in #206:

1. A polygon's id came out as `feature/a5676116`, which names nothing in OSM. osmium writes an area as `a<n>`; the tool now decodes it.
2. A name containing `was:` rejected **Museum of the Home** and **Bushy Park** as closed (`was:name`, `was:dog:conditional`). History is not
   a closure; a former *use* (`was:tourism=museum`) still is.
3. Animal enclosures inside a zoo ("Coatis") counted as venues.
4. 3,983 small plain parks swamped the list. A park now needs 1 ha, a Wikidata or Wikipedia link, or a mapped playground inside it. A
   place we already hold is never judged by this gate.
5. 6,689 places were beyond the app's 40 km London scope.
6. City farms are `landuse=farmyard`, large parks can be `landuse=recreation_ground`, Kew is `leisure=garden`. Added, with a visitor-farm
   name test so a working farm is not listed.
7. A 40-row spot check showed about one row in seven was not a family destination: **229 of 739 recreation grounds were named for a club or a
   school** ("Beaconsfield Rugby Club", "Thorpe House School Playing Fields") and some names name nothing ("Animal Enclosure", "The
   Green"). They are now held back with the reason, never deleted: `rejected.csv` keeps them for a reviewer.
8. The review sample took the first match in file order, so all ten records were in Windsor and Staines. It now leads with places nearest the
   centre.

**Precision, honestly.** After these fixes I re-read a fresh seeded 40-row sample. About **5 of 40 are still doubtful**: a path tagged as a
park, a county showground, a commercial gallery with a Wikipedia link, a housing estate, a churchyard. So roughly one row in eight needs a
person's no. That is the reason review is the gate and why nothing here is served without it.

### The first ten records

[open-data-first-extract/first-ten-review.md](open-data-first-extract/first-ten-review.md): source and version, licence and credit, the source's
own category and ours, duplicate check, position from the source (never geocoded), the facilities the source states and what is unknown.
They start with the National Gallery (linked to a place we hold), then Victoria Embankment Gardens, Leicester Square, Trafalgar Square and
Vauxhall City Farm.

## 3. Against the venues we hold today

The reader's scope holds 147 of the 149 stored rows (two are beyond 40 km). Matched to the open data:

| | Venues |
|---|---:|
| Confident match, keeps an independent identity | **112** (museums 35, parks 58, attractions 7, farms 4, zoos 4, activities 4) |
| Possible match, needs a person to compare | 10 (farms 2, activities 2, museums 2, soft play 2, park 1, attraction 1) |
| No match at all | **25** (parks 10, soft play 4, attractions 4, museums 3, zoos 2, farm 1, activity 1) |

The 25 are the honest cost of this source: lost on 8 November unless another independent source names them. **Soft play: 4 of the 6 have
no match and the other 2 only a possible one**, and open data will never close that gap by tags.

## 4. Can the recovery reader prevent the collapse?

Run with `scripts/simulate-catalogue-expiry.mjs` (#208): the real reader on the real stored rows plus the real candidate entries marked
`UNREVIEWED (simulation only)`, which the registry loader would refuse to serve. Venues served, all list or map:

| Path | 14 Oct | 20 Oct | 1 Nov | 8 Nov |
|---|---:|---:|---:|---:|
| Today (no recovery) | 142 | 135 | 131 | **0** |
| All 3,374 entries, per-category cutover | 3,380 | 3,380 | 3,379 | **3,374** |
| First stage only: 955 entries that carry the source's own website or link to a place we hold, per-category cutover | 961 | 961 | 960 | **955** |
| All 3,374 entries, no cutover (Google rows win while fresh) | 3,407 | 3,405 | 3,404 | **3,374** |

The six venues above the entry count before 8 November are the soft-play rows, which have no independent source; they leave with the last Google rows (5 of them are still served on 1 November, none on 8 November). With a
per-category cutover the whole of Explore and Meet halfway can use the map from day one, because every place is independently located. Without
it a single Google-served place switches the screen to a list until 8 November (#207's rule).

By category on 8 November, all entries: parks 2,666; museums 338; attractions 214; activities 124; farms 17; zoos 15; soft play **0**.
First stage only: parks 486; museums 276; attractions 110; activities 65; farms 8; zoos 10; soft play 0.

**A finding that would have bitten on 8 November.** `mergeCatalogue` capped the list at 160 places, and it counted independent entries
against the cap, so a reviewed list of 3,000 would have been cut to 160 and the first entries in file order kept. Independently held places
are now exempt from the cap and a test proves it (#208). The cap still applies to Google rows, where it was meant to limit spend.

## 5. What an entry is, and what Explore does with 3,374

An entry is a name, a category, a position and a source with its licence, plus who reviewed it and when. It has **no photo, no hours, no
facilities and no age evidence**. In Explore each shows as "Not yet reviewed", with "Toilets still to be checked" and what is not recorded;
Measured with the real entries in the app (Playwright, fixture API, **zero Google requests**), on the first 3,623-entry set, before the club and
school gate in section 2 removed 249 of them: 790 places within 5 miles of NW1, the list and the map both work, the map is on because every
place is independent.
Screenshots: [list](open-data-first-extract/explore-nearby-real-open-data.png), [map](open-data-first-extract/explore-map-real-open-data.png).

**Performance, honestly.** First paint grows with the number of entries because the app filters and ranks them on the device. Measured in
a desktop-class headless browser (also before that gate): about **+0.5 s at 1,631 entries and +2 to 3 s at 3,623**. A phone was not measured, and I would expect it to be
worse. This argues for serving the first stage (955) first and for ranking on the server before the full list ships. I did not build that.

## 6. The other two sources

- **OS Open Greenspace** (13,993 features in TQ and TL): Play Space 4,234; Public Park or Garden 2,342; Other Sports Facility 1,986; Tennis
  Court 1,335; Playing Field 1,138; Religious Grounds 1,069; Allotments 1,006; Bowling Green 368; Cemetery 298; Golf Course 217. It would
  give park boundaries and 4,234 play spaces. **No adapter is written and nothing here uses it.** Two reasons to wait: its credit
  ("Contains OS data © Crown copyright and database right 2026") must be shown in the app before any OS-derived entry is served, and the
  OSM parks already cover the goal many times over.
- **Wikidata** (543 museum, zoo and art museum rows): retrieved, not yet used. Its value is identity (a stable Q-id and a website for a
  museum) and it is CC0, so it has no licence question. An adapter is the next small piece of work; it does not block anything.

## 7. The earliest safe recovery path

Nothing below is done without the approval named in the right-hand column. No production import, migration, paid Google call or recurring job.

| By | Step | Needs |
|---|---|---|
| Now | #207 merged (Meet halfway map off for Google places). #203's Explore gate merges when you have reviewed it on an iPhone | Your merge |
| Any day | #208 merged: the reader, inert (empty registry, no cutover). Changes nothing, and is the only code the recovery needs | Your merge |
| By 24 Oct | Counsel answers the ODbL questions that decide the design ([OSM_LICENCE_REVIEW.md](OSM_LICENCE_REVIEW.md) section 6, questions 1, 8, 9, 10: Collective or Derivative Database; the Google-id key as a cross-reference; a few weeks of Google and OSM side by side; whether the OSM position is independent) and the notice wording (question 4) | Counsel, via you |
| By 27 Oct | A named person reviews the first batch: the 112 entries that continue venues we hold, plus the first-stage entries, each with the source link beside it. I prepare the diff; they put their name in `reviewedBy` | A reviewer |
| 28 to 29 Oct | `osm.json` and `cutover.json` as a reviewed diff, simulated again, shown on a Vercel Preview (Explore, a venue page, Meet halfway, no Google field in the response) | Your read of the Preview |
| **About 1 Nov** | Production: the reviewed diff deployed. 131 Google rows still serve; every cut-over category is served from the entries. Seven days before the cliff | Your merge |
| 4 and 7 Nov | The last Google rows leave. Nothing visible changes except soft play | |

If counsel or the reviewer slips past 1 November, the three fallbacks in [P0_CATALOGUE_RECOVERY.md](P0_CATALOGUE_RECOVERY.md) (accept the fall,
own-site list-only, or one Google refresh of at most US$3.73) are still open. I would not serve OpenStreetMap entries before counsel has read the
questions, because the cutover design depends on the answer.

## 8. What I need from you

1. **Merge #207.** It is green and independent of everything else.
2. **Send the ODbL questions to counsel** (or tell me who decides). Ten are written up; questions 1, 4, 8, 9 and 10 must be answered before any entry is served.
3. **Name the reviewer for batch 1**, or tell me to prepare the diff and wait for a name.
4. **A decision on 1 November** only if 2 or 3 slip: the fallback in P0_CATALOGUE_RECOVERY.md section 4.

Nothing about data access, hosts, files or downloading is needed from you.

## 9. Leftovers, and how to rerun

- The workflow lives on `data/open-data-fetch` (not merged, no trigger but a push to that branch). To refresh in future, add a reviewed,
  manually dispatched workflow in a pull request, a few times a year, never on a schedule. I have not done that.
- The four throwaway data branches (`data/open-data-inputs`, `-regions`, `-diagnostic`, `-regions-2`) hold ODbL and OGL data in a public
  repository, with their notice. They are regenerable in about 80 seconds and carry nothing you need; delete them once you have read this.
- Not done and not claimed: the OS and Wikidata adapters, a staged first-paint plan, any measurement on a phone, a reading of the primary
  ODbL, OSMF and OGL texts. The licence pages are reachable from the runner, but the review still rests on summaries, and counsel should read the
  primary text.
