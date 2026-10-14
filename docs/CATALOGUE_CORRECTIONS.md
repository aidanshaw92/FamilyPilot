# Catalogue classification corrections: ledger (proposed, none applied)

2026-10-13. **Nothing in this file has been applied to production.** It records, for each venue whose classification looks
wrong or too coarse: the original classification, the proposed one, the evidence, the reason and how sure we are. Evidence is
quoted from the venue's own pages already stored in `venue_source_evidence`, or from Google's recorded types and description.
Where the evidence is not enough, the row says so and the venue stays as it is until a person has looked.

How a correction would be applied, in increasing order of risk:

1. **Reviewed classification map in the app** (what the Explore pull request uses). The app reads the stored category, then the
   map overrides the *display group and subtype* for the venues listed here. No database row changes. Removing the map restores
   today's behaviour exactly.
2. **Data migration** of `place_records.category` and canonical links, from this ledger. A production change: needs a separate
   approval, a dry run showing every row before and after, and a rollback keyed by batch.
3. **Rule fixes in discovery** (section 4). These also change stored categories on the next refresh, so they need the same approval.

## 1. The five groups and where the stored categories go

| Group (as approved) | Stored categories | Subtype shown |
| --- | --- | --- |
| Parks and playgrounds | `park`, `beach` | park, nature reserve, garden, playground |
| Museums and galleries | `museum` | museum, gallery |
| Farms and animals | `farm`, `zoo` | city farm, farm, zoo, wildlife |
| Soft play and trampolines | `soft_play` | **soft play, indoor play centre, trampoline park** (can be more than one) |
| Attractions and activities | `attraction`, `activity` | attraction, bowling, ice skating, ... |

Swimming and classes are not in the catalogue and are not shown.

## 2. Soft play versus trampoline parks (the six stored as soft play)

Today all six are `soft_play`. The category was assigned by a name list (`trampoline`, `airhop`, `jump in`, ...) and by Google's
`indoor_playground` type, which Google applies to all of them. **None of the six is a verified toddler soft play centre in the
sense of a venue whose main offer is soft play for under-fives**; four offer a soft play area as one of several attractions, and
two are trampoline parks.

| Venue | Stored | Proposed | Evidence | Confidence |
| --- | --- | --- | --- | --- |
| Flip Out Canary Wharf | soft play | **Indoor play centre with soft play. Not a trampoline park.** | Its own page says "Flip Out Canary Wharf does not have trampolines" and calls itself "the ultimate indoor play centre with soft play options for all ages"; attractions listed include Toddler Soft Play, Ball Pits, Ninja Playground, Laser Quest, Bumper Cars (flipout.co.uk/locations/canary-wharf and its FAQ) | high |
| Flip Out Brent Cross | soft play | Trampoline park **and** has a soft play area | attractions listed: Trampolines, Kids Arena, Battle Cannon Arena, Soft Play, Drift Trikes, Inflatable (flipout.co.uk/locations/brent-cross) | high |
| Flip Out Watford | soft play | Trampoline park **and** has a soft play area | lists Trampolines, Soft Play, Toddler Soft Play; a "Stay and Play" session "strictly for ages 5 and under" (a session rule, **not** a venue age range) | high |
| Babylon Park London | soft play | Indoor play centre with soft play (arcade, restaurant) | its FAQ: "soft play areas for toddlers and kids" on the mezzanine; Google types `indoor_playground`, `video_arcade`, `amusement_center`; no mention of trampolines either way | medium-high |
| AirHop Adventure and Trampoline Park Enfield | soft play | **Trampoline park only** (soft play not evidenced) | name; Google's primary type is `park`, which is wrong; its site has not been read (0 stored pages) | medium (name only) |
| Jump In by AirHop Adventure and Trampoline Park Elstree | soft play | **Trampoline park only** (soft play not evidenced) | name; Google primary type `park`; its site has not been read (0 stored pages) | medium (name only) |

Consequences for search, which the Explore pull request implements:

- Searching **"soft play"** returns the four venues whose own pages say they have soft play, and lists the two trampoline-only
  parks as "Also nearby: trampoline parks", not as soft play.
- Searching **"trampoline"** returns Flip Out Brent Cross, Flip Out Watford, AirHop and Jump In. It does **not** return Flip Out
  Canary Wharf, whose page says it has none.
- A brand name is never enough: two Flip Out sites have trampolines and one does not.
- Genuine toddler-first soft play centres (stay-and-play, under-fives sessions) are **absent from the catalogue**. This is the
  largest category gap and the first priority of the expansion plan.

## 3. Other classification corrections

| Venue | Stored | Proposed | Evidence | Reason | Confidence and note |
| --- | --- | --- | --- | --- | --- |
| Paddington Recreation Ground | activity | Parks and playgrounds | Google primary type `park`; description "27-acre park features a cafe and a gym, plus tennis, cricket and other outdoor sports" | a park with sports facilities was ranked as an activity because `sports_complex` outranks `park` | high. The operator (Everyone Active) also runs a sports centre on the site; its pages have not been read |
| Walthamstow Wetlands | attraction | Parks and playgrounds (nature reserve, outdoor) | Google primary type `nature_preserve`; description "Urban nature reserve comprising 10 reservoirs, with birdwatching plus a cafe and visitors centre"; its official page lists toilets, cafe, picnic area, accessible toilet, baby changing, disabled parking | `nature_preserve` is not mapped, so `tourist_attraction` won | high |
| Churchill War Rooms | attraction | Museums and galleries | Google primary type `history_museum`, also `museum`; operator iwm.org.uk | the first mapped type in Google's order wins, and that was `tourist_attraction` | high |
| Gunnersbury Park | museum | Parks and playgrounds, with a museum on site | Google primary type `park` (also `museum`); its site describes a park with historic buildings and family events | the museum type beat the park | medium. "Park and museum" is a fair description; park is the primary use |
| SEA LIFE London Aquarium | attraction | Farms and animals (aquarium) | Google primary type `aquarium` | a parent asking for animals expects it | medium. Optional |
| Tulleys Tulip Fields | farm | **Needs a person to look.** Likely a seasonal outdoor attraction, not an animal farm | Google primary type `farm` (also `market`); no hours stored and flagged closed; its site has not been read (0 stored pages) | the name describes a flower field | low. Do not show under Farms and animals until read |
| Hogwarts Castle | attraction | Not a separate venue: **part of Warner Bros. Studio Tour London** | coordinates within metres of the Studio Tour; no website, no pages; Google types `castle`, `historical_place` | the earlier audit found a triple listing of one site | medium-high. Link with role `part_of`, hide from lists |
| Harry Potter Studio | attraction | no change | already a confirmed alias of Warner Bros. Studio Tour London in `canonical_venues` | | done |
| Platform 9 3/4 | attraction | no change; show as "not reviewed" | Google primary type `tourist_attraction`; no website, no pages | separate real place at King's Cross | low evidence |
| Hyde Park Corner | park | **Needs a person to look** | Google primary type `park`; the name is a junction | may not be a destination | low |
| Troubadour Wembley Park Theatre | park | **Exclude** (a theatre) | Google primary type `performing_arts_theater` | a legacy row from before the exclusion list; not served (stale since 7 Aug) | high. Needs approval to remove |
| College Lane Campus LRC | museum | **Exclude** (a university library, Hatfield) | Google primary type `library` | legacy row; not served | high. Needs approval to remove |
| Stanborough Park Water Sports Centre, Hertfordshire Zoo, Willows Activity Farm, Thorpe Park, Woodside Animal Farm, Stockwood Park | as stored | no change | 26 to 45 km from Charing Cross | outside London; fine for Search all, label "outside London" | |
| Lane7 London Camden | activity | no change | bowling alley, no further evidence | family suitability unknown | shown with Family Fit "not enough evidence", no claim made |
| William Morris Gallery, Hyde Park Winter Wonderland | as stored | no change | flagged closed with no schedule | seasonal or temporary closure suspected; read their own sites | verify |

## 4. Rule-level corrections (code, not applied)

Each fix corrects a cause, so the next refresh does not recreate the problem. All are in `server/places/lib/places-quality.js`
and its TypeScript mirror. They change stored categories on the next discovery run, so they need approval before merging.

| # | Fix | Venues it corrects or recovers |
| --- | --- | --- |
| R1 | Apply the exclusion list to the primary type; check secondary types only if the primary type is not a family category | recovers the Natural History Museum (`library`); allows any soft play centre, farm or museum Google also tags as a cafe or hotel |
| R2 | Choose the most specific mapped type among all candidates, not the first | Churchill War Rooms |
| R3 | Map `nature_preserve` to park and any `*_museum` to museum | Walthamstow Wetlands, Churchill War Rooms |
| R4 | Rank `park` above `sports_complex` | Paddington Recreation Ground |
| R5 | Stop defining soft play from a name list and `indoor_playground` alone: store `indoor_playground` as the category and record subtypes from evidence (section 5) | the six venues in section 2 |
| R6 | Serve rows older than 30 days labelled "details last checked on ...", and keep closure and seasonal signals as the reason to hide | Natural History Museum, Royal Academy of Arts |

Regression fixtures to add with the fix: the Natural History Museum type set, a museum with a cafe type, a farm with a cafe type,
a zoo with a lodging type, and the Flip Out Canary Wharf / Brent Cross pair.

## 5. What is missing from the data model

Subtype evidence (has soft play, has trampolines, has a toddler area) has no place to live. The claims table already stores a
`field_key`, a value, a source URL and an excerpt, so the smallest change is two new claim keys, `activities.softPlay` and
`activities.trampolines`, produced by the existing official-site extractor and approved the same way as other claims. Until that
exists, the reviewed map described at the top carries the six venues above and nothing else; every other venue in the soft play group
shows as "Indoor play (soft play not confirmed)".

## 6. Do not merge (regression set, kept apart on purpose)

Science Museum and Natural History Museum (62 m). National Gallery and National Portrait Gallery (56 m). Golders Hill Park and
Golders Hill Park Zoo (95 m). Horniman Museum and Horniman Butterfly House (125 m). The two venues named Victoria Park (one in
Hackney, one in north London, about 12 km apart): different places that need their locality in the list.

## 7. Review status

The proposals above were made by me from stored evidence, not by a person who has visited or phoned the venues. The "high" rows
rest on a venue's own words or on Google's recorded primary type. Rows marked low or "needs a person" must not be applied
without a human decision. Spot-check at least ten rows before any migration.
