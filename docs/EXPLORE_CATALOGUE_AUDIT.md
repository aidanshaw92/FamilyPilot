# Explore: what the catalogue can honestly support

Read-only audit of the production catalogue (`place_records`, `venue_family_metadata`, `venue_claims`) and the app's taxonomy
(`src/utils/venue-taxonomy.ts`, `src/utils/filter-venues.ts`), 13 Oct 2026, for the Explore proposal. Counts are from the live
database; nothing was changed. Names are given only where they explain a classification.

## 1. What is in the catalogue (168 places)

| Stored category | Places | Within 8 km of central London | Beyond 20 km | Hours known | Photo | Notes |
|---|---|---|---|---|---|---|
| park | 70 | 27 | 8 | 48 | 69 | includes playgrounds (OpenStreetMap `leisure=playground` is stored as `park`) |
| museum | 42 | 26 | 3 | 38 | 37 | includes galleries |
| restaurant / cafe | 17 | 0 | 0 | 0 | 0 | not activities; shown only in the Restaurants pilot mode |
| attraction | 12 | 7 | 3 | 10 | 12 | London Eye, SEA LIFE, Churchill War Rooms, Warner Bros. Studio Tour, cable car, Platform 9¾, Graffiti Tunnel, St Katharine Docks, Walthamstow Wetlands… |
| farm | 8 | 2 | 3 | 7 | 8 | city farms, Willows, Woodside, a tulip field |
| activity | 7 | 4 | 2 | 5 | 7 | ice rink, Winter Wonderland, bowling (×2), a recreation ground, a water-sports centre, Thorpe Park |
| soft_play | 6 | 2 | 1 | 5 | 6 | five of six are trampoline parks (Flip Out, AirHop, Jump In); one soft play (Babylon Park) |
| zoo | 6 | 2 | 1 | 6 | 6 | London Zoo, Hanwell, Hertfordshire, Golders Hill, Hobbledown Heath, a butterfly house |
| beach | 0 | | | | | in the type, nothing stored |

Geography: latitude 51.39 to 51.86, longitude −0.54 to 0.17 (Greater London and the north-west edge: Watford, Hertfordshire). East
and south London are thin: 26 museums and 27 parks are within 8 km of the centre; most of the rest is north and north-west.

## 2. What is known about each place (the facts the filters can use)

Family metadata exists for all 168, but almost all of it is draft or provider-only; **no row is in an approved or published
state**, and the active claims that project into trusted facts are few. Coverage of the facts a filter would read:

| Fact | Known for | Source |
|---|---|---|
| Opening hours / open now | 125 of 168 | provider (Google) hours; "Open now" is true only where the provider said open |
| Facilities list (cafe, playground, toilets, baby changing, parking) | 72 places list at least one: cafe 40, playground 35, toilets 35, baby changing 26, parking 21 | `facilities` (AI draft or provider): a listed facility is a claim, an unlisted one is unknown |
| Environment (indoor / outdoor / mixed) | 9 of 168 confirmed; the rest is inferred from the category (museum→indoor, park/farm→outdoor, zoo/attraction→mixed, activity→unknown) | `environmentOf()` says `confirmed: false` for the inferred ones |
| Pushchair suitability | 10 | metadata |
| Baby changing (as a tri-state fact) | 0 (only as a listed facility, 26) | |
| Parking (as a fact) | 0 (only as a listed facility, 21) | |
| **Minimum / maximum recommended age** | **0** | `min_recommended_age` / `max_recommended_age` are null for every place; `venue_age_policy` is empty |
| Price / estimated spend | 0 as a stored field; the app parses `£` tiers where present | |

**Consequence:** "Suitable for my children's ages" cannot hide anything today. A confirmed age incompatibility exists for no venue,
so Nearby's "hidden: not suited to Mia's age" is correct behaviour with nothing to act on until ages are reviewed. Family Fit still
ranks by what is known (facilities, environment, category), which is what the grading was built for.

## 3. The taxonomy today versus the categories asked for

| Asked for | Today | Verdict |
|---|---|---|
| Soft play | `soft_play` chip (6 places; 5 are trampoline parks) | **Supported but thin**, and mislabelled: trampoline parks are not soft play for a two-year-old. Relabel the chip **Soft play & trampolines** or split when there is inventory |
| Museums | `museums` (42) | **Supported** |
| Farms and animals | `farms` (8) and `animals` (farm + zoo, 14) | **Overlap:** every farm is in both chips. Consolidate to one **Farms & animals** (farm + zoo) |
| Parks and playgrounds | `parks` (park + beach, 70) | **Supported**; rename **Parks & playgrounds** (playgrounds are stored as parks). Beach has no inventory |
| Indoor activities / Outdoor activities | Home conditions only; Explore has Indoor/Outdoor in the filter sheet, not as categories | **Keep as attributes** that combine with a category (Indoor + Museum), as asked. Inferred for 159 of 168, so say "usually indoor" where not confirmed |
| Classes and activities | `activities` (activity + attraction, 19) | **Not supported as classes:** nothing stored is a class; the chip mixes bowling, an ice rink, a theme park and the London Eye. Rename **Attractions & activities**; do not offer "Classes" |
| Swimming | nothing | **Not supported:** no pool or lido is stored (one water-sports centre). Do not offer |
| All activities | `all` | **Supported** |

Categories are mutually exclusive in storage (one `category` per row) but the chips already overlap by rule (animals = farm + zoo),
so a venue can sit under several chips without a data change. Indoor/Outdoor are attributes, not categories, and combine with any chip.

Misclassified or doubtful rows seen: trampoline parks as `soft_play`; "Paddington Recreation Ground" as `activity` (a park);
"Tulleys Tulip Fields" as `farm`; "Walthamstow Wetlands" as `attraction` (a nature reserve, outdoor); "Hogwarts Castle" and
"Platform 9¾" as separate attractions (one is inside the Studio Tour, the other a shop photo spot). These are editorial fixes in the
enrichment tool, not code.

## 4. Search today

Explore's search matches **venue name and address only** (`filterVenues`). "soft play" finds nothing unless a name contains it;
"museum" finds places with "Museum" in the name and misses galleries. The area search (a town or postcode) runs a separate live,
budget-gated provider search. For the proposal: search should also match the category's words and synonyms (soft play, trampoline,
playground, gallery, zoo, farm, aquarium) through the taxonomy, with no new request.

## 5. What this means for Explore (summary)

- Offer: **All · Parks & playgrounds · Museums & galleries · Farms & animals · Soft play & trampolines · Attractions & activities**,
  each only when at least three places are in hand (the existing rule). Indoor / Outdoor / Open now / Free as quick filters.
- Do **not** offer Swimming or Classes until something is stored; say so in the proposal rather than show an empty chip.
- Age suitability: offer the filter wording honestly ("places with a confirmed age limit your children are outside are hidden")
  and expect it to hide nothing until ages are reviewed; never treat unknown age as unsuitable.
- Facilities: "listed" versus "unknown" everywhere; 72 of 168 have any facility listed, so a Parking + Baby changing filter leaves
  about 10 to 20 places London-wide and fewer nearby. The empty state must say that the rest were not checked, not that they lack it.
- Coverage: north and central London are reasonably covered; a parent in south or east London, or outside the M25, will see few
  places Nearby and should be told the catalogue is the limit, with Search all one tap away.
