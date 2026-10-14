# Why the catalogue is 168, and what a parent can actually reach

2026-10-13. **Read-only.** Every number below is from a query against the production database (SQL in section 8) or from code
on `main`. Nothing was written, imported, enqueued or fetched. No Google request was made. The Overpass host and the
open-data hosts are still blocked by this environment's network policy, so no external dataset was read (see the plan).

This builds on, and where stated corrects, [CATALOGUE_COVERAGE_AUDIT.md](CATALOGUE_COVERAGE_AUDIT.md),
[CATALOGUE_PILOT_PLAN.md](CATALOGUE_PILOT_PLAN.md) and [EXISTING_FACTS_AUDIT.md](EXISTING_FACTS_AUDIT.md).

## The answer in seven lines

1. **168 is every row in `place_records`, not the Explore catalogue.** 19 of them are OpenStreetMap rows kept for the lunch
   picker (17 restaurants and cafes, 2 museums) that Explore never reads. 149 are Google rows in Explore categories. 143 of
   those pass the freshness and distance gate that Explore applies, and about 142 after the existing alias filter. That is the
   number a parent can reach.
2. **Nothing is hiding.** The enrichment tables (drafts, jobs, evidence, claims, metadata) are keyed to the same 168 places with
   no orphans. There are no staging or archive tables. The one London search cache entry holds 79 places and all 79 are already
   stored. There is nothing to recover for free beyond the rows described in 5 and 6.
3. **The live path cannot grow the catalogue.** Discovery is nine Google Nearby Search requests, each capped by Google at 20
   results, ranked by popularity across 21 mixed place types. A request returns the 20 most popular places of any type, so parks
   and museums fill it (34 parks and 28 museums out of 79; 2 farms, 2 soft play venues). Re-running it returns nearly the same 79.
4. **Discovery rules silently reject real family venues.** A place is dropped if *any* of its Google types, not only the primary
   one, is on an exclusion list that includes `cafe`, `restaurant`, `library`, `lodging` and `school`. I ran the repository's own
   classifier: a soft play centre, a farm or a museum that Google also tags as a cafe is rejected. Family venues very often have a
   cafe. This is a likely reason genuine soft play is almost absent. It cannot be measured from stored data because rejected
   places are never stored.
5. **A freshness gate drops famous venues without telling anyone.** Explore serves stored rows only if fetched in the last
   30 days. The Natural History Museum was last fetched on 11 September, can no longer be re-discovered (its secondary type is
   `library`), and so **is not reachable from Explore since 11 October**. The Royal Academy of Arts is stale in the same way. This follows from the code
   and the stored rows; I could not open the production app from here to observe it.
6. **Several categories are mis-assigned by the mapping rules**, not by the data: a museum filed as an attraction, a nature
   reserve filed as an attraction, a park filed as an activity, and six venues filed as soft play of which none is a verified
   toddler soft play centre (section 5 and [CATALOGUE_CORRECTIONS.md](CATALOGUE_CORRECTIONS.md)).
7. **Family evidence is thin where parents filter.** Half the servable venues (74 of 149) carry any confirmed family fact. Baby
   changing is confirmed for 23, parking for 34 (21 yes, 13 no), a playground for 34 of 70 parks. Nobody has a recorded age range.

## 1. Reconciling the number

| Step | Rows | Note |
| --- | ---: | --- |
| All rows in `place_records` | 168 | 168 distinct place ids |
| minus OpenStreetMap rows | 149 | 14 restaurants, 3 cafes, 2 museums; Explore reads `provider = google` only |
| Google rows in the eight Explore categories | 149 | park 70, museum 40, attraction 12, farm 8, activity 7, zoo 6, soft play 6 |
| minus fetched more than 30 days ago | 145 | Troubadour Wembley Park Theatre and College Lane Campus LRC (both 7 Aug, both mis-mapped legacy rows), **Natural History Museum and Royal Academy of Arts (both 11 Sep)** |
| minus beyond 40 km of Charing Cross | 143 | Stockwood Park 45 km, Woodside Animal Farm 44 km |
| minus alias of a canonical venue | about 142 | Harry Potter Studio is a confirmed alias of Warner Bros. Studio Tour London |

The merge step that caps results (`mergeCatalogue`, limit 160) does **not** bind today: 142 is below 160. It would start to bind
at around 160 rows, which matters for any expansion (section 3).

The earlier audit's 151 and 134 are the same data cut differently (a Greater London box, then excluding food); nothing in them
is wrong. This document uses the Explore gate because that is what a parent can reach.

## 2. Why the live path cannot grow it

```
Explore (London)  =  stored catalogue (place_records, <=30 days, <=40 km, limit 400)
                  +  live London grid (9 areas x 12 km, cached 6 h in place_search_cache)
                  ->  mergeCatalogue(live first, cap 160)  ->  alias filter
production discovery upserts ONLY the live page into place_records
```

- **Google returns at most 20 places per request and offers no further page.** The grid is nine requests, so at most 180 raw
  results, of which 79 survive type filtering, chain de-duplication and cross-area de-duplication.
- **Ranking is by popularity, across 21 types at once.** The live page is 34 parks, 28 museums, 3 zoos, 2 farms, 2 soft play venues
  and 10 attractions or activities. A soft play centre competes with the British Museum for one of 20 slots.
- **The upsert writes only that page.** A place that never makes the top 20 of any of the nine areas is never stored, however
  many times the grid runs. The 79 on the page are already all stored, so another refresh adds nothing new.
- **Area searches add a handful.** A search for a named area runs one request and stores what it returns. These are also capped at
  20 and popularity-ranked, so they add little beyond the first search of an area.
- **Spend is small and the yield is flat.** Recorded Nearby Search requests: 116 over the eight days from 1 to 9 October
  (9 to 27 a day). That is the whole discovery cost to date, and the catalogue it bought is 149 rows.

## 3. Rules that lose venues (reproduced with the repository's own code)

I ran `isSupportedForIntent` and `mapGoogleCategory` from `server/places/lib/places-quality.js` on real and hypothetical type sets:

| Venue (types) | Accepted for Explore? | Category it gets |
| --- | :---: | --- |
| Natural History Museum (`museum`, `research_institute`, `library`, ...) | **no** (secondary `library`) | museum |
| A soft play centre also tagged `cafe` | **no** | soft play |
| A farm also tagged `cafe` | **no** | farm |
| A zoo also tagged `lodging` | **no** | zoo |
| Churchill War Rooms (`history_museum`, `tourist_attraction`, `museum`) | yes | **attraction** (should be museum) |
| Walthamstow Wetlands (`nature_preserve`, `tourist_attraction`, `park`) | yes | **attraction** (should be park) |
| Paddington Recreation Ground (`park`, `sports_complex`, `tennis_court`, ...) | yes | **activity** (should be park) |
| AirHop and Jump In trampoline parks (Google primary type `park`) | yes | soft play (a trampoline park) |

Causes, each a few lines of code and each independent:

1. **Exclusion tests every type, not only the primary.** Fix: apply the exclusion list to the primary type, and to secondary types
   only when the primary type is not itself a family category.
2. **First mapped type wins.** `mapGoogleTaxonomy` returns the first type that has a mapping, in Google's order, so
   `tourist_attraction` beats `museum`. The specificity list is only consulted when the primary type is generic. Fix: rank every
   candidate by specificity, and treat any `*_museum` as museum.
3. **Missing types.** `nature_preserve` and `history_museum` are not mapped.
4. **`sports_complex` outranks `park`.** A park with tennis courts becomes an activity.
5. **Soft play is defined by a name list.** `trampoline`, `airhop`, `jump in`, `inflatable` and `clip n climb` in a name give soft
   play, and so does the Google type `indoor_playground`, which Google applies to toddler soft play, trampoline parks and family
   entertainment centres alike. The category cannot tell them apart.
6. **Freshness is a filter, not a label.** 30 days is right for opening status and wrong for a name and a location. Fix: serve
   older rows, labelled with when they were last checked, and keep the closure and seasonal signals as the reason to hide.

**Important:** the discovery upsert rewrites `category` on every refresh ("update provider facts/category on repeat discovery").
Any change to rules 1 to 5 therefore changes production rows the next time discovery runs. That is a production data change by
side effect, so I have **not** changed these rules. They are listed as a proposal in the plan, to be approved first.

## 4. Coverage by category and by area

Counts are the 149 Google rows in Explore categories. Sector is the bearing from Charing Cross (north, east, south, west);
central is within 6 km; outer is beyond 25 km.

| Category | Total | Central | North | East | South | West | Outer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Parks | 70 | 15 | 11 | 8 | 14 | 15 | 7 |
| Museums and galleries | 40 | **24** | 4 | 6 | 2 | 2 | 2 |
| Attractions | 12 | 7 | 1 | 1 | 0 | 0 | 3 |
| Farms | 8 | 2 | 1 | 1 | 1 | 0 | 3 |
| Activities | 7 | 3 | 2 | 0 | 0 | 0 | 2 |
| Zoos | 6 | 1 | 1 | 0 | 1 | 2 | 1 |
| Soft play (as stored) | 6 | 1 | 2 | 1 | 0 | 2 | 0 |
| **All** | **149** | **53** | **22** | **17** | **18** | **21** | **18** |

What a parent sees depends on where they live. Venues within 5 miles of a representative home (all categories; parks with a
confirmed playground in brackets):

| Home area | 2 mi | 5 mi | 10 mi | Parks | Museums | Farms and zoos | Soft play (as stored) | Attractions and activities |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| NW5 Kentish Town | 13 | **70** | 121 | 26 (7) | 25 | 4 | 2 | 13 |
| W12 Shepherds Bush | 5 | 59 | 117 | 24 (7) | 21 | 3 | 2 | 9 |
| E8 Hackney | 10 | 59 | 111 | 19 (4) | 21 | 4 | 2 | 13 |
| SW11 Battersea | 6 | 55 | 117 | 24 (8) | 21 | 1 | 0 | 9 |
| SE22 East Dulwich | 7 | 49 | 105 | 23 (10) | 16 | 3 | 1 | 6 |
| CR0 Croydon | 1 | 16 | 62 | 13 (7) | 1 | 2 | 0 | 0 |
| HA1 Harrow | 3 | 13 | 71 | 9 (5) | 2 | 1 | 1 | 0 |
| N9 Edmonton | 1 | 12 | 83 | 7 (1) | 1 | 0 | 1 | 3 |
| SE18 Woolwich | 0 | 11 | 78 | 3 (0) | 5 | 1 | 1 | 1 |
| TW9 Richmond | 2 | 9 | 82 | 5 (0) | 2 | 2 | 0 | 0 |
| BR1 Bromley | 1 | 9 | 56 | 6 (4) | 1 | 2 | 0 | 0 |
| RM1 Romford | 0 | **0** | 9 | 0 | 0 | 0 | 0 | 0 |

Read plainly: the catalogue is built for inner north and west London. A family in Romford has nothing within 5 miles and nine
venues within 10; a family in Richmond, Bromley or Woolwich has about ten within 5 miles. **A "Nearby" tab will be honest about
this only if it says so.** Distances are straight-line from the postcode centre.

## 5. Which filters give a useful answer today

"Confirmed" means an active, human-approved claim projected into the venue's family facilities. Unconfirmed means *not recorded*,
which is different from "checked and none".

| Filter | Venues with a confirmed *yes* | Confirmed *no* | Not recorded | Verdict |
| --- | ---: | ---: | ---: | --- |
| Playground | 34 (26 of 70 parks) | 0 | 115 | useful for parks; 44 parks have nothing recorded |
| Cafe | 39 | 0 | 110 | useful |
| Toilets | 35 | 0 | 114 | useful |
| Parking | 21 | 13 | 115 | useful, and the only fact with recorded "no" |
| Free parking | 8 | 4 | 137 | thin |
| Baby changing | 23 | 0 | 126 | thin; say how many are unchecked |
| Pushchair suitability | 9 | | 140 | thin |
| Accessible toilet / wheelchair | 36 / 20 (claims) | | | secondary |
| Indoor or outdoor | 10 confirmed | | 139 | inferred from category for the rest; say so |
| Open now | 118 have a weekly schedule | | 31 | reliable where a schedule exists; unknown otherwise (22 of the 31 are parks) |
| Age range | **0** | | 149 | cannot be a filter |
| Price | **0** `estimated_spend` | | 149 | cannot be a filter |

Combinations a parent will try, against today's data:

| Question | Matches |
| --- | ---: |
| Farm with confirmed parking and baby changing | **0** (farm with parking 1; farm with baby changing 3) |
| Park with confirmed playground and toilets | 9 |
| Park with confirmed playground and parking | 6 |
| Museum with baby changing and a cafe | 11 |
| Soft play with baby changing | 1 |
| Soft play within 5 miles | 0 to 2 in every area above |

The honest result of the first and last rows is an explanation and a way to relax, not an empty list.

**`is_open` is not "closed".** The column holds Google's `openNow` at the moment of the fetch, falling back to `false` for closed
business status. 87 rows read `false` because they were fetched out of hours. The app already ignores that snapshot where a
weekly schedule exists (`resolveOpenNow`), so Explore is right. Closure detection therefore cannot use this column. The 3 rows
that are `false` and have no hours at all (Hyde Park Winter Wonderland, Tulleys Tulip Fields, William Morris Gallery) are
seasonal or temporarily closed candidates to verify against their own sites.

## 6. Evidence gaps that limit Family Fit and filtering

1. **Age suitability: zero recorded ranges** (`min`/`max_recommended_age`, `venue_age_policy`). The earlier yield audit found one
   sentence in 151 that reads as a venue-wide recommended age and judged it unsafe to publish. I re-checked the one source that
   looks like age evidence for soft play: Flip Out Watford says "Stay and Play ... strictly for ages 5 and under". That is a
   **session rule**, which the age contract excludes, so it supports classification only, not an age range.
2. **Playground presence for parks** is recorded for 26 of 70 and never as "no". A playground is the single most useful fact for a
   park, and the best free source for it is mapped data (OS Open Greenspace play spaces), not a venue website.
3. **Baby changing, toilets and cafe** exist for a third of the servable venues, almost all museums and bigger parks.
4. **Opening hours** are missing for 31 venues, 22 of them parks (parks rarely publish hours; "open daily, dawn to dusk" is the
   truthful value and needs a source).
5. **Price and visit duration** are empty everywhere.
6. **Fetching limits.** About 27 venues' sites block our fetcher and about 23 return almost no text (see the existing-facts audit).
   That is unchanged, and we do not work around bot challenges.
7. **Evidence exists that is not used.** Official-site pages already stored say that Babylon Park has "soft play areas for toddlers
   and kids" and that Flip Out lists soft play among its attractions. That is the evidence needed to separate soft play from
   trampoline-only venues, and it has no home in the data model today (section 3 of the corrections ledger).

## 7. Cost, in what is actually recorded

| Item | Recorded |
| --- | --- |
| Google Nearby Search (discovery), 1 to 9 Oct | 116 requests; none recorded after 9 Oct |
| Google Place Photos | up to 339 a day (7 Oct); a separate scope, not discovery |
| Place Details | 15 over the same period |
| Enrichment, rule-based extractors ("official-source-rules") | US$0 recorded per draft |
| Enrichment, language-model fallback (`gpt-4o-mini`) | about US$0.001 to 0.003 per venue where it was used (177 drafts, US$0.064 in total) |

The Nearby Search field mask includes opening hours and website, which places each request in Google's higher-priced Nearby Search
tier; check the current price in the Google Cloud console rather than rely on a number written here.

## 8. Reproduce (all read-only)

```sql
-- 1. Reconciliation
select provider, category, count(*), count(*) filter (where fetched_at < now() - interval '30 days') stale30
from place_records group by 1,2 order by 1,3 desc;
-- 2. The London cache: places held, and how many are missing from place_records
with c as (select jsonb_array_elements(payload->'places') p from place_search_cache where cache_key like 'london|explore%')
select count(*) cached, count(*) filter (where p->>'familypilotId' in (select familypilot_place_id from place_records)) stored from c;
-- 3. Orphans in every enrichment table
select count(*) from venue_enrichment_drafts where familypilot_place_id not in (select familypilot_place_id from place_records);
-- 4. Facility coverage
select kv.key, kv.value, count(*) from venue_family_metadata m join place_records p using (familypilot_place_id),
  jsonb_each_text(m.family_facilities) kv where p.provider='google' group by 1,2;
-- 5. Usage
select usage_day, sku, scope, calls from google_places_usage order by 1;
```

Classifier reproduction: `node -e "const q=require('./server/places/lib/places-quality.js'); console.log(q.isSupportedForIntent('museum',['museum','library'],'explore','x'))"`.
