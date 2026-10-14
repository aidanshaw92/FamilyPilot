# Why the Natural History Museum left Explore, and what else is leaving

2026-10-14. **Read-only investigation.** Every number is from a query against the production database (SQL in section 8) or from code and
git history on `main`. Nothing was written, fetched or enqueued and no Google request was made. I could not open the production app, so
"left Explore" is what the code and the stored rows say, not something I watched.

> **Update, 14 October (P0).** The "one timestamp for three things" below is four things once closure is included: existence, provider
> content, evidence freshness and confirmed closure. The recovery proposal is in [P0_CATALOGUE_RECOVERY.md](P0_CATALOGUE_RECOVERY.md); it
> also corrects the count of places served (142 today, not 145).

## The answer

1. **One timestamp stands for three different things.** `place_records.fetched_at` decides whether a place may be shown at all. A place
   whose Google content is 30 days old is hidden whole: its name, its position and the fact that it exists. Existence was tied to the
   age of cached provider content.
2. **The Natural History Museum could not be renewed.** It was stored on 11 September. On 3 October the discovery rule began rejecting any
   place with a `library` type, and the museum carries one. On 5 October the 30-day gate began hiding old rows. It crossed 30 days on
   11 October. The same rule also sits on the by-ID refresh path, so neither discovery nor a refresh could bring it back.
3. **It is not alone, and the larger problem is not the rule.** Nothing has fetched from Google since 9 October. Of the 145 places served
   today, 70 are not in the last live page and are renewed by nothing. Left alone, Explore shrinks on a known schedule and is **empty on 8
   November**.
4. **Stale evidence must not mean the venue is gone.** The fix is three separate states, not a longer timer: whether a venue exists and can
   be found, how fresh each fact about it is, and whether it is confirmed closed. Only the third hides a venue.
5. **Nothing here weakens Google's limits.** The proposal keeps every Google field on its 30-day clock and gets existence from sources whose
   licences allow it to be kept.

## 1. The Natural History Museum, step by step

| Date | What happened | Evidence |
|---|---|---|
| 2026-09-11 | Stored. Primary type `museum`; also `research_institute`, `library`, `event_venue`. | `place_records.fetched_at`, `field_provenance` |
| 2026-10-03 | The exclusion list, including `library`, `university`, `school`, and the any-type rule, arrive in #138. From here a place with any of those types is rejected before it is stored. | `git log -S` on `places-quality.js` |
| 2026-10-05 | The 30-day serve gate arrives in #159. Before it, a stored row of any age was served. | `git log -S` on `catalogue.js` |
| 2026-10-09 | The last live discovery run. It returned 79 places; the museum was not among them, and the rule as written would have rejected it on `library`. | `place_search_cache`, usage ledger |
| 2026-10-11 | 30 days after 11 September. Not served. | `fetched_at + 30 days` |

Two independent things had to be true. The rule had to stop it renewing, and the gate had to hide the stale row. The rule fix is in the
discovery-rules pull request. It does not bring the museum back by itself, because bringing it back needs a fetch.

## 2. Who else is affected

Right now (14 October, 04:20 UTC): **149** Google rows are stored. **145** are inside the 30-day window and served.

The four that are not served: the Natural History Museum, the Royal Academy of Arts (both 11 September), and two legacy rows that should
not be served (a theatre and a university library, both 7 August).

**The Royal Academy was not rejected by any rule.** Its types are a gallery and an educational institution. It simply never made the
top 20 in any of the nine grid areas on the one run that mattered. That is the second, quieter cause: discovery is ranked by popularity,
so a venue only renews if it stays in the top 20 of an area.

### What happens next if nothing fetches

| Date it stops being served | Rows | Categories |
|---|---:|---|
| 14 October | 1 | park |
| 20 October | 7 | attraction, park, zoo |
| 28 October | 2 | museum, soft play |
| 31 October | 2 | farm, museum |
| 4 November | 28 | activity, farm, museum, park, soft play, zoo |
| 7 November | 26 | activity, attraction, farm, museum, park, soft play, zoo |
| 8 November | 79 | the whole last live page |

Rows served, if nothing fetches: 145 now, 144 after today, 137, 135, 133, 105, 79, then **0 on 8 November**.

Seventy of the 149 are not in the last live page. They were stored by area syncs and are the venues discovery does not rank into its
top 20: **6 of 8 farms, 4 of 6 soft play venues**, 12 of 40 museums, 36 of 70 parks. These are exactly the categories a parent searches
for, so they leave first.

Even with discovery switched on, those 70 do not renew. Only the 79 in the live page do.

**Last billable call of any kind in the usage ledger: 9 October.** I cannot tell from here whether the switches are off or nobody has
used the production app since. Either way, nothing is renewing the catalogue.

## 3. Why "stale means gone" is the wrong rule

The 30-day gate is right about one thing: Google's terms limit how long cached provider content may be kept and shown. Their Places terms
allow latitude and longitude to be cached for up to 30 consecutive calendar days, and our own cost-control notes treat names, addresses,
hours and photo references the same way. The gate protects that.

But it protects it by hiding the **venue**, when what it needs to hide is the **Google content**. A museum does not stop existing because
a cached copy of its Google record is 31 days old.

## 4. Proposed: three states, never one timer

| State | Question it answers | Where the answer comes from | What expires | What a parent sees |
|---|---|---|---|---|
| **Existence and discoverability** | Is this a real place we can show and find, and where? | A source whose licence allows keeping it: OpenStreetMap, OS Open Greenspace, Wikidata, a reviewed record. Never Google content past its window. | Nothing on a timer. Re-confirmed when its source is refreshed. | The venue stays in Explore. |
| **Evidence freshness** | How fresh is each fact about it (hours, facilities, price, age guidance)? | Per fact, with the lifetimes the evidence system already uses (30 days for facilities and access, 90 for environment, 180 or 365 for prices). Google content: 30 days. | Each fact on its own clock. | A stale fact stops being shown as current. It says "last checked on ..." or reverts to unknown. The venue stays. |
| **Confirmed closure or invalidity** | Is it confirmed shut, or not a destination? | Positive evidence only: the official site says closed, an open-data source marks it disused or abandoned, Google said permanently closed within its window, or a person decided. | Not by age. A "temporarily closed" signal expires and falls back to unknown. | Only a confirmed permanent closure hides it. A temporary closure shows with a note. |

The one rule that ties them together: **no fresh evidence is never evidence of closure.** A missing or old reading moves a fact to
"unknown". It never moves a venue to "gone".

### What changes for a venue that is currently Google-only

Nothing can keep a Google-only venue discoverable past 30 days without keeping Google content longer than it may be kept, and that is
the one thing not to do. So the venue needs a **second identity**, from an open source:

1. Match each Google venue to its open-data counterpart (an OpenStreetMap element, a Wikidata item, an OS Open Greenspace site) by name
   and distance, run locally, reviewed by a person where the match is not certain.
2. Store the open-data identity (name, position, group) with its licence and attribution. Link it to the Google place ID, which is the
   only Google value the link needs.
3. Explore reads both. The Google overlay (rating, hours, photos) appears while it is fresh and disappears when it is not. The venue,
   its position and its group come from the open identity and stay.

This is the same ledger as the catalogue expansion: **the open-data identity layer is the freshness fix.** It is also what a venue
found only in open data needs to be discoverable at all. See [LEDGER_MIGRATION_PROPOSAL.md](LEDGER_MIGRATION_PROPOSAL.md).

## 5. What must not change

- Google fields keep their 30-day limit, in the serve gate and in anything stored.
- No Google content is stored or shown to make a venue reappear.
- The evidence lifetimes in the claims system are not extended.
- No new scheduled job and no new paid call.

## 6. Options for 8 November

| Option | Keeps the existing venues? | Google cost | Needs |
|---|---|---|---|
| **A. Do nothing** | No. Explore empties on 8 November. | none | nothing |
| **B. Open-data identity layer** (the proposal above) | Yes, once each venue is matched. | none | dataset access, the ledger migration, a reader change, a matching pass. About two weeks of work, so tight against 4 to 8 November. |
| **C. One bounded refresh by ID of the 149 stored places** | For 30 more days. | about US$3.70 at list price before any free allowance (149 Place Details calls at $25 per 1,000), 17% of the monthly cap already configured | an explicit decision to switch the refresh scope on once, with the cap in place |
| **D. One London discovery pass** | Only the 79 in the live page. | about US$0.32 (9 Nearby Search requests at $35 per 1,000) | an explicit decision to switch discovery on once |

**I have switched nothing on and will not.** My recommendation is B, started now. If B cannot be live by about 1 November, C is the
smallest way to avoid an empty Explore, and it is a one-off with a hard cap, not a schedule. It only brings the museum back if the discovery-rules pull request is merged first, because a refresh applies the same rule. D does not reach the farms and soft play
venues that are leaving first.

## 7. Open compliance observations

These were found on the way and are not changed here.

- **`place_records` is publicly readable.** Its row-level-security policy lets the public key read every row, including the Google
  content in it. The app's 30-day gate runs in our server code, so it does not bind a direct read of the table. This is separate from
  the "stored indefinitely" question already recorded in the cost-control notes, which concerns storage. It concerns serving.
- **Place IDs.** Our notes treat Google place IDs as storable without limit. A search of Google's published terms did not confirm a
  Places-specific exemption (it found one in the Geocoding terms). The place IDs are what the proposal links on, so this should be
  confirmed against Google's current Places policy before the migration.
- **Maps.** Google's Places terms appear to bar using Places content with a non-Google map (section 5.3 in the versions I could find a
  summary of). The Meet halfway map and the Explore Map both plot Google-sourced positions on the app's own basemap. See the Explore
  pull request. Positions that come from an open-data identity would remove the question for those places.

## 8. Reproduce

```sql
-- the schedule in section 2
with live as (
  select jsonb_array_elements(payload->'places')->>'familypilotId' as id
  from place_search_cache where cache_key like 'london|explore%'
)
select (fetched_at + interval '30 days')::date as stops_being_served,
       count(*) as rows,
       count(*) filter (where familypilot_place_id in (select id from live)) as in_last_live_page
from place_records
where provider = 'google'
  and category in ('park','museum','zoo','farm','attraction','activity','soft_play','beach')
group by 1 order by 1;

-- the last billable call
select usage_day, sku, scope, environment, sum(calls)
from google_places_usage where usage_day >= current_date - 14 group by 1,2,3,4 order by 1 desc;
```
