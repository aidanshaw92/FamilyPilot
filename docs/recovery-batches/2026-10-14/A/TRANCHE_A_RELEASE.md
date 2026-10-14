# Tranche A: the proposed release

14 October 2026. **For your decision; nothing is served, imported or signed off.** Every entry still says `UNREVIEWED (simulation only)`, which the registry refuses; your name is written only by `scripts/apply-review.mjs` after you approve the final batch, and no Google value is in any entry (checked, see below). Not legal advice.

## What is proposed

**234 venues** (88 continue a venue we hold; 146 are new), from two sources that need no OpenStreetMap data:

| Source | Licence | Entries | What we take |
|---|---|---:|---|
| OS Open Greenspace (Ordnance Survey) | Open Government Licence v3.0 | 131 | the site's name; one point inside its polygon; category park |
| Wikidata | CC0 1.0 | 103 | the item's label, coordinates and official website; the category is ours |

| Category | Held today | Tranche A | Of which continue a venue we hold |
|---|---:|---:|---:|
| Parks and gardens | 69 | 136 | 49 |
| Museums and galleries | 40 | 58 | 29 |
| Attractions | 12 | 31 | 4 |
| Zoos and aquariums | 6 | 5 | 2 |
| Farms | 7 | 4 | 4 |
| Activities | 7 | 0 | 0 |
| Soft play | 6 | 0 | 0 |
| **All** | **147** | **234** | **88** |

**What parents lose with Tranche A alone:** 59 of the 147 venues we hold have no Tranche A successor: activities 7 (all), soft play 6 (all; none was genuine toddler soft play, see `docs/SOFT_PLAY_RECOVERY_PLAN.md`), attractions 8, museums 11, parks 20, zoos 4, farms 3. Twenty-nine of them continue only through OpenStreetMap (held) and 30 through no open source I found. Parks, museums and attractions grow; the rest shrink or go until Tranche B or the soft-play and activity work lands. This is the honest shape of the recovery, not a count to be proud of.

## What it is not

A name, a category and a position from a source with a licence. It does **not** say a place has toilets, a café, step-free access or opening hours, or suits a baby or a ten-year-old: those stay "not yet checked" until our own evidence says otherwise. OS describes its greenspaces as "likely to be accessible to the public" and generalises them automatically.

## What validation did (`scripts/validate-tranche.mjs`, tested)

Every entry was checked against the open source it names, and against the 149 stored rows to prove nothing of Google's reached it: the name, position, category and website are the source record's own; no Google marker or stored place id is in the entry; the registry's own validator accepts it; no duplicate, no club, school or cemetery name, inside the 40 km scope. Then every entry was read again live: all 132 selected OS sites in a fresh download (same name and type, position inside the polygon) and all 105 Wikidata items (same label, coordinates within 5 m, same website, none marked dissolved or closed). **234 of 234 pass.** Full report: `validation/VALIDATION.md`; sources, checksums and licence evidence: `PROVENANCE.json`.

### Removed during validation (3), proposed for your confirmation

- **Royal United Services Institute** (museum): Royal United Services Institute is a research institution. Wikidata files it under museum, but the source gives no sign of a visit the app could describe.
- **Royal Hospital Chelsea** (museum): The Wikidata item is the institution (a home for veterans). Wikidata files it under museum, and the source does not say whether or when visitors may enter, so its classification as a family visit is not defensible.
- **Royal Botanic Gardens** (park): The same place as Royal Botanic Gardens, Kew (fp-wd-q18748726), which is kept; the OS polygon is dropped so Kew is listed once.

### Reclassified during validation (12), each with its reason; you can reverse any line

- **Chartwell**: museum to **attraction**. Wikidata's only class is museum, but the name has no museum or gallery wording and it is a historic house and estate; classed as an attraction, as the app does for a house.
- **Cliveden**: museum to **attraction**. Wikidata's only class is museum, but the name has no museum or gallery wording and it is a historic house and estate; classed as an attraction.
- **Ightham Mote**: museum to **attraction**. Wikidata's only class is museum, but the name has no museum or gallery wording and it is a historic moated house; classed as an attraction.
- **Dorney Court**: museum to **attraction**. Wikidata calls it a historic house museum; the name has no museum or gallery wording and it is a manor house; classed as an attraction.
- **2 Willow Road**: museum to **attraction**. Wikidata's only class is museum, but the name has no museum or gallery wording and it is a house; classed as an attraction.
- **Milton's Cottage**: museum to **attraction**. Wikidata's only class is museum, but the name has no museum or gallery wording and it is a cottage; classed as an attraction.
- **Old Royal Naval College**: museum to **attraction**. Wikidata's only class is museum, but the name has no museum or gallery wording and it is a historic site; classed as an attraction.
- **Chislehurst Caves**: museum to **attraction**. Wikidata's only class is museum, but the name has no museum or gallery wording and it is a cave system; classed as an attraction.
- **Epping Ongar Railway**: museum to **attraction**. Wikidata's only class is museum, but the name says a railway; a heritage railway is a day out, not a museum visit; classed as an attraction.
- **Henry Moore Foundation**: museum to **attraction**. Wikidata lists it as an art museum, but the name is a foundation's, not a gallery's; classed as an attraction until its public programme is checked.
- **Madame Tussauds**: museum to **attraction**. Wikidata's only class is museum (a wax museum); the name has no museum or gallery wording, and the venue we hold was an attraction; kept as an attraction.
- **Queen's House**: attraction to **museum**. Wikidata lists Queen's House as a museum as well as a palace, and the venue we hold was a museum; nothing supports moving it, so it stays a museum.

### Accepted exceptions (5): a rule overruled with a reason, never hidden

See `validation/allow.json`: the Royal Academy of Arts (its name trips the arts-centre and school rules; Wikidata classes it an art museum), the National Gallery (a different gallery from the National Portrait Gallery, 65 m away), Crystal Palace Park, Golders Hill Park Zoo and Boston Manor (each a different venue from the park or house beside it).

## Your sample: 20 records drawn at random from the 234

Eight continue a venue we hold, twelve are new, spread across parks, museums and the rest. For each, open **where it is** and the record, and check: **is it the right place, is the category right, would you be content to see it in Explore?** If two or more fail, reject the batch; a single failure is a gate to tighten and I will redraw.

- [ ] **Holland Park** · Parks and gardens · Central (within 6 km) · [where it is](https://www.openstreetmap.org/?mlat=51.502777&mlon=-0.203401#map=17/51.502777/-0.203401) · OS Open Greenspace (no page per record) · matches a venue we hold: name similarity 1, inside the polygon
- [ ] **Waterlow Park** · Parks and gardens · North · [where it is](https://www.openstreetmap.org/?mlat=51.568376&mlon=-0.144807#map=17/51.568376/-0.144807) · OS Open Greenspace (no page per record) · matches a venue we hold: name similarity 1, inside the polygon
- [ ] **Southwark Park** · Parks and gardens · Central (within 6 km) · [where it is](https://www.openstreetmap.org/?mlat=51.494773&mlon=-0.054647#map=17/51.494773/-0.054647) · OS Open Greenspace (no page per record) · matches a venue we hold: name similarity 1, inside the polygon
- [ ] **National Portrait Gallery** · Museums and galleries · Central (within 6 km) · [where it is](https://www.openstreetmap.org/?mlat=51.509444&mlon=-0.128056#map=17/51.509444/-0.128056) · [Wikidata record](https://www.wikidata.org/wiki/Q238587) · matches a venue we hold: name similarity 1, 6 m
- [ ] **Royal Academy of Arts** · Museums and galleries · Central (within 6 km) · [where it is](https://www.openstreetmap.org/?mlat=51.509167&mlon=-0.139444#map=17/51.509167/-0.139444) · [Wikidata record](https://www.wikidata.org/wiki/Q270920) · matches a venue we hold: name similarity 1, 41 m; accepted exception (see below)
- [ ] **Madame Tussauds** · Attractions · Central (within 6 km) · [where it is](https://www.openstreetmap.org/?mlat=51.52279&mlon=-0.15517#map=17/51.52279/-0.15517) · [Wikidata record](https://www.wikidata.org/wiki/Q186309) · matches a venue we hold: name similarity 1, 58 m; **reclassified to attraction** (see changes below)
- [ ] **London Eye** · Attractions · Central (within 6 km) · [where it is](https://www.openstreetmap.org/?mlat=51.503333&mlon=-0.119722#map=17/51.503333/-0.119722) · [Wikidata record](https://www.wikidata.org/wiki/Q160659) · matches a venue we hold: name similarity 1, 21 m
- [ ] **Golders Hill Park Zoo** · Zoos and aquariums · North · [where it is](https://www.openstreetmap.org/?mlat=51.566852&mlon=-0.188938#map=17/51.566852/-0.188938) · [Wikidata record](https://www.wikidata.org/wiki/Q56856819) · matches a venue we hold: name similarity 1, 32 m; accepted exception (see below)
- [ ] **Edgwarebury Park** · Parks and gardens · North · [where it is](https://www.openstreetmap.org/?mlat=51.626122&mlon=-0.282508#map=17/51.626122/-0.282508) · OS Open Greenspace (no page per record)
- [ ] **Nonsuch Park** · Parks and gardens · South · [where it is](https://www.openstreetmap.org/?mlat=51.358095&mlon=-0.233424#map=17/51.358095/-0.233424) · OS Open Greenspace (no page per record)
- [ ] **Eastbrookend Country Park** · Parks and gardens · East · [where it is](https://www.openstreetmap.org/?mlat=51.550907&mlon=0.181013#map=17/51.550907/0.181013) · OS Open Greenspace (no page per record)
- [ ] **Norman Park** · Parks and gardens · South · [where it is](https://www.openstreetmap.org/?mlat=51.388064&mlon=0.0259#map=17/51.388064/0.0259) · OS Open Greenspace (no page per record)
- [ ] **Beddington Park** · Parks and gardens · South · [where it is](https://www.openstreetmap.org/?mlat=51.373168&mlon=-0.145088#map=17/51.373168/-0.145088) · OS Open Greenspace (no page per record)
- [ ] **Dulwich Picture Gallery** · Museums and galleries · South · [where it is](https://www.openstreetmap.org/?mlat=51.446111&mlon=-0.086389#map=17/51.446111/-0.086389) · [Wikidata record](https://www.wikidata.org/wiki/Q1241163)
- [ ] **Musical Museum** · Museums and galleries · West · [where it is](https://www.openstreetmap.org/?mlat=51.4879&mlon=-0.2931#map=17/51.4879/-0.2931) · [Wikidata record](https://www.wikidata.org/wiki/Q3868648)
- [ ] **Bank of England Museum** · Museums and galleries · Central (within 6 km) · [where it is](https://www.openstreetmap.org/?mlat=51.5141&mlon=-0.088059#map=17/51.5141/-0.088059) · [Wikidata record](https://www.wikidata.org/wiki/Q1893754)
- [ ] **Ightham Mote** · Attractions · Beyond 25 km · [where it is](https://www.openstreetmap.org/?mlat=51.2583&mlon=0.26855#map=17/51.2583/0.26855) · [Wikidata record](https://www.wikidata.org/wiki/Q1254903) · **reclassified to attraction** (see changes below)
- [ ] **Chiswick House** · Attractions · West · [where it is](https://www.openstreetmap.org/?mlat=51.483611&mlon=-0.258611#map=17/51.483611/-0.258611) · [Wikidata record](https://www.wikidata.org/wiki/Q1074877)
- [ ] **Boston Manor** · Attractions · West · [where it is](https://www.openstreetmap.org/?mlat=51.4919&mlon=-0.3184#map=17/51.4919/-0.3184) · [Wikidata record](https://www.wikidata.org/wiki/Q4947974) · accepted exception (see below)
- [ ] **Hogarth's House** · Attractions · West · [where it is](https://www.openstreetmap.org/?mlat=51.4871&mlon=-0.258875#map=17/51.4871/-0.258875) · [Wikidata record](https://www.wikidata.org/wiki/Q5877115)

## The nine flagged continuing matches, with a recommendation for each

Four are in Tranche A and are in the numbers above; five are in Tranche B (held) and are here so the list is complete.

| Venue | What is flagged | Recommendation |
|---|---|---|
| Churchill War Rooms | we held it as an attraction; the source says museum | **Keep as a museum.** Wikidata's only class is museum, and the held category was Google's. |
| Madame Tussauds | held as an attraction; the source says museum (a wax museum) | **Attraction (applied).** No museum or gallery wording in the name, and it was held as an attraction. |
| Sea Life London Aquarium | held as an attraction; the source says zoo or aquarium | **Keep as Zoos and aquariums**, the group an aquarium belongs to. |
| Queen's House | held as a museum; the house rule moved it to attraction | **Museum (applied).** Wikidata lists it as a museum and a palace; nothing supports moving it. |
| Paddington Recreation Ground (B) | held as an activity; OSM says park | Park, when Tranche B is released. |
| Hackney Marshes (B) | positions 227 m apart | Keep: the marsh is large; either point is inside it. |
| Willows Activity Farm (B) | held as a farm; OSM says attraction; 215 m apart | Farm: the name says so. |
| Thorpe Park (B) | held as an activity; OSM says attraction; 186 m apart | Attraction (a theme park). |
| Princess Diana Memorial Playground (B) | name differs (0.8 similarity) | Same place; keep as a park. |

## Attribution and notices (in the code, tested)

"Contains OS data © Crown copyright and database right 2026", linked to the Open Government Licence, is shown on the venue page for an OS place, on cards and lists, and on the About screen; the licence notice sits beside the registry files and names what was done to the data; Wikidata is named on About. The OS download's own `licence.txt` and OS's acknowledgement guidance were read on 14 October (PROVENANCE.json). The licence statement is OS's; confirm it still matches on the OS site at release.

## What happens to saved places and plans

Saved places and plans live on each parent's device (production holds none on a server). A saved place whose venue has a new listing keeps drawing from its stored copy but will not open ("Place not found"). The recommended fix, which asks the parent and never chooses for them, is in `docs/SAVED_PLACE_CONTINUITY.md`; it is separate from Tranche A and is best released with it.

## To release, once you approve the final batch

1. You approve this batch (and any change you make to the lines above).
2. I run `node scripts/apply-review.mjs --reviewer "<your name>" --date <date> --entries A/tranche-a.entries.UNREVIEWED.json --write`, which writes your name and the date and validates every entry first, and set the five categories in `cutover.json` in the same commit (so no Google row is served beside an independent one of the same type).
3. The Preview is rebuilt from that commit and you check it, then production is deployed and verified before 8 November, with the one-step rollback recorded beforehand.
