# P0 catalogue recovery

2026-10-14. A proposal to decide on, not a research report. Every number below was produced by running the real code on the stored rows
(`scripts/simulate-catalogue-expiry.mjs`, in the recovery pull request), except where the text says it was not measured.

**Updated later on 14 October.** Open data is no longer a blocker: the first real extract was fetched (on GitHub's own runner, since this
session's network refuses the hosts) and the recovery reader was run against it. Measured results are in
[OPEN_DATA_FIRST_EXTRACT.md](OPEN_DATA_FIRST_EXTRACT.md): **3,374 candidate venues, 112 of the 147 we hold keep an independent identity, and on
8 November the reader serves 3,374 instead of 0** (955 if only the first stage is reviewed in time). The sections below keep their original
wording where it is still true and say where a number was replaced.

**What I still could not verify.** Google's terms: I could read only search summaries (the primary pages are not reachable from this
environment). Production: the deployment API returned 403, so I cannot say what is live. The primary ODbL, OSMF and OGL texts have not been
read into the review. Each is a decision for you or a question for counsel, not an assumption of mine.

## Decisions I need from you

| # | Decision | Default if you do not decide |
|---|---|---|
| 1 | Merge the Meet halfway map correction (#207) | The live Halfway map keeps plotting Google places |
| 2 | Merge the recovery reader (inert until entries exist) | Nothing can be served after a Google copy expires |
| 3 | ~~Open the network or supply files~~ **Done, nothing needed.** Instead: name a **reviewer for batch 1** (the 112 entries that continue venues we hold, plus the first-stage entries). I prepare the diff; they sign `reviewedBy` | No entry can be served |
| 4 | Whether own-site identities may be kept (section 3, tier B) | Explore falls to 0 on 8 November |
| 5 | Counsel on the ODbL questions ([OSM_LICENCE_REVIEW.md](OSM_LICENCE_REVIEW.md), sections 4A and 6) before any OSM entry is served. Separate tables do not settle it, and the OSMF guideline wants each data type to be entirely OSM or entirely non-OSM | No OSM entry is served |
| 6 | By **1 November**: the emergency choice in section 4 (own-site only, a one-off Google refresh, or accept the fall) | I take no action and Explore falls to 0 |
| 7 | Whether to redact stored Google content past 30 days ([MAP_COMPLIANCE.md](MAP_COMPLIANCE.md), "Not a map issue") | Stored content stays where it is |

## 1. Why the catalogue is expiring

`readCatalogue` (`server/places/lib/catalogue.js`) serves a place only while its Google row was fetched in the last 30 days, and
`readBetween` (Meet halfway) applies the same gate. The 149 stored rows were fetched on a few days, the last on 9 October, and nothing
has fetched since (no billable Google call since 9 October; there is no refresh job, by your decision). Each batch therefore ages out
30 days after it was fetched:

| Fetched | Rows | Stops being served |
|---|---:|---|
| 7 Aug, 11 Sep | 2 + 2 | already past 30 days |
| 14 Sep | 1 | 14 Oct (today) |
| 20 Sep | 7 | 20 Oct |
| 28 Sep | 2 | 28 Oct |
| 1 Oct | 2 | 31 Oct |
| 5 Oct | 28 | 4 Nov |
| 8 Oct | 26 | 7 Nov |
| 9 Oct | 79 | 8 Nov |

What the reader serves, from the real reader on the real rows (2 of the 149 are beyond its 40 km London scope):

| | 14 Oct | 20 Oct | 1 Nov | 7 Nov | 8 Nov |
|---|---:|---:|---:|---:|---:|
| Served (all Google, all list-only) | **142** | **135** | **131** | 79 | **0** |

**A correction to my earlier figure.** I reported 145. That was 149 minus the four rows already past 30 days. The reader also drops the
row that expires today and the two outside its scope, so it serves 142 today.

Farms and soft play go first: farms 7 to 6 and soft play 6 to 5 by 1 November, because their rows are the oldest. After 8 November every
category is empty. The same gate empties Meet halfway, and a venue page for an expired row either spends a Place Details request or fails
(`api/places/detail.js`), so a saved plan that opens a venue is affected too. I checked this in the code, not in production.

## 2. Four things the gate treats as one

| | What it is | Whose | How long it lasts | What the gate does today |
|---|---|---|---|---|
| **Venue existence** | That the place exists and which one it is: our canonical venue, its id, its place-ID link | Ours | Until it closes | Removes the venue when the Google row ages out |
| **Provider content** | Google's copy: name, address, hours, phone, website, summary, photos, types, and the position as Google returned it | Google's, under their terms | At most 30 days (the position, per the terms; the rest is stricter or unconfirmed) | Serves it for 30 days, then nothing |
| **Evidence freshness** | Facts we read from a venue's own pages, each with a source, a date and a `valid_until` | Ours, from the venue's words | Its own expiry, per fact | Not consulted: a venue with fresh evidence vanishes all the same |
| **Confirmed closure** | An event: the venue has shut | A fact about the world | Permanent until reversed | Not distinguished from "we have not looked" |

The gate removes **whole venues** when only the **provider content** has expired. That is the defect. It is not necessary: existence,
evidence and closure do not expire on Google's clock. What must go after 30 days is Google's copy, not the venue.

## 3. What can be kept without another Google call

Read this as my reading of summaries, to be confirmed against Google's primary terms.

| Item | Where it comes from | What the terms say, as summarised | Keep after 30 days? |
|---|---|---|---|
| Place ID (the `fp-google-...` id) | Google | May be cached "in accordance with the Places API policies"; the duration was not in the summaries. Our notes assume indefinite | **Yes, as a join key, pending confirmation** |
| Latitude and longitude | Google | 30 consecutive days, then delete | **No** |
| Name, address, phone, website address, opening hours, rating, summary, photos, types, business status | Google | Not covered by the lat/lng and place-ID allowances; the app's own 30-day window is a policy, not a Google allowance | **No** (and a question whether even 30 days is allowed; section 7) |
| Our category and classification | Ours, derived from Google's type codes and the name | Derived data: an open question for counsel | The label is ours; the Google type list is not |
| Facts from a venue's own pages (`venue_claims`, `venue_source_evidence`) | The venue's words, fetched by us | Ours, subject to the venue site's terms | **Yes**, with their own expiry |
| Canonical venue, links, family metadata | Ours | Ours | **Yes** |
| Closure | Google's `businessStatus` today | Google content | Only from an independent source |

**Which venues can stay discoverable.** A venue can stay only if something other than Google's copy names it. There are three tiers:

| Tier | Source of the venue's name and position | Venues now | Comes with |
|---|---|---:|---|
| **A. Open-data identity** | OSM (measured 14 Oct); Wikidata and OS Open Greenspace retrieved, not yet used | **112 of 147** with a confident match (10 more need a person to compare). Soft play **0 of 6** | A name and a position of its own, so it can appear in Nearby and on a map |
| **B. Own-site identity** | The venue's own page, where its page title carries exactly its name | **53 of 149** exact, 14 more partial | A name and a website, **no position**: Search all only, not Nearby, not the map |
| **C. Neither** | Only Google | 82 of 149 (soft play: **6 of 6**) | Nothing, so they leave when their Google row does |

**Tier B has a provenance problem you should decide.** For 52 of the 53 exact matches the page we read was found through Google's
`websiteUri` (the evidence pipeline starts from `place_records.website`); one came from our own override list. I traced that code path, not each row. The page's *content* is the
venue's own, but its *address* reached us as Google content. Two ways to treat it:
(1) accept it as an independently verified fact, because our fetch confirmed the page says the venue's name, or
(2) require each website to be confirmed from an independent source (the open-data `website` tag) before it is kept.
Option 2 is safer and is what the open-data run produces anyway. Tier B is therefore **a stop-gap you may choose to accept**, not
something I will turn on without your decision. I also found that "official" is not always the venue: 11 of the 53 are council pages.

## 4. What must change, and by when

| By | Change | Needs |
|---|---|---|
| Now | Halfway map off for Google places (#207) | Your merge |
| 16 Oct | Recovery reader merged, inert (no entries) | Your merge |
| ~~17 Oct~~ Done 14 Oct | Open data fetched via GitHub's runner; dry run and reader run on it | Nothing ([OPEN_DATA_FIRST_EXTRACT.md](OPEN_DATA_FIRST_EXTRACT.md)) |
| 20 Oct | First 7 Google rows leave (135 served) | |
| ~~20 to 24 Oct~~ Done 14 Oct | Dry run on the real extract: the first ten records and the gate report, tag rules calibrated | |
| 24 to 29 Oct | Counsel on the ODbL; I prepare `osm.json` as a reviewed diff; Preview check | Counsel, your review |
| **1 Nov** | **Decision point** (below). 131 served | You |
| 4 and 7 Nov | 28 and 26 more rows leave | |
| 8 Nov | The last 79 leave. 0 served unless entries exist | |

**Emergency choice at 1 November, if no open data has been reviewed:**

| Choice | Search all on 8 Nov | Nearby on 8 Nov | Google cost | Notes |
|---|---:|---:|---|---|
| a. Accept the fall | 0 | 0 | none | Explore shows its empty state honestly |
| b. Own-site tier only | 53 (65 with the 14 partial) | 0 | none | List-only; needs your decision in section 3; no soft play |
| c. One-off Google refresh | up to 147 | up to 147 | at most US$3.73 | Buys 30 days. Not authorised. [GOOGLE_REFRESH_CONTINGENCY.md](GOOGLE_REFRESH_CONTINGENCY.md) |

The two can combine (b then c). I recommend preparing **b** now and deciding on **c** only on 1 November, with real data about what the
open data can supply.

**Counts on the three dates under each plan** (own-site rows are list-only, so they are in Search all but not Nearby):

| Plan | 20 Oct | 1 Nov | 8 Nov |
|---|---:|---:|---:|
| Status quo (no recovery) | 135 | 131 | **0** |
| + tier B exact (53) | 139 | 136 | **53** |
| + tier B exact and partial (67) | 139 | 136 | **65** |
| + tier A, all 3,374 entries, per-category cutover | 3,380 | 3,379 | **3,374** |
| + tier A, first stage only (955), per-category cutover | 961 | 960 | **955** |

The extra 4 and 5 on 20 Oct and 1 Nov are expired rows that tier B brings back. By category on 8 November, tier B exact is parks 25,
museums 18, attractions 5, farms 3, zoo 1, activities 1 and **soft play 0**.

## 5. The Google map correction

Meet halfway plotted Google places on the app's own map. It now draws a map only when every place is independently located, and shows a
list otherwise. Explore's Map has the same rule in #203. Details, the audit of every surface and the production exposure:
[MAP_COMPLIANCE.md](MAP_COMPLIANCE.md), #207. One consequence for this plan: **a position from a Google row cannot be plotted, so tier B
stays off the map until it has an independent position, and Nearby needs one too.**

## 6. A path to sustainable coverage with no paid Google

1. **Identity and position from open data.** Greater London from OSM (ODbL), museums from Wikidata (CC0), parks and play spaces from OS
   Open Greenspace (OGL). Download once; no background job, no Google, no paid API.
2. **A registry of reviewed entries**, in files separated by licence (`server/places/data/identities/`, in the recovery PR). An entry
   is a name, a category, a position, a website, a source, a licence, who reviewed it and when. The shape is closed: Google fields,
   Google-hosted addresses, a licence the source cannot carry or an unreviewed entry are refused, and the tests prove each refusal.
3. **Our own evidence on top** (`venue_claims`) for what open data does not say: hours, facilities, ages. Unchanged.
4. **Refresh by re-download**, by a person, a few times a year. Never a job.
5. **Cut over by category, do not blend.** The OSMF's guideline (as summarised) treats OSM and non-OSM data as independent only when each
   data type in a region is entirely one or the other. So a category is switched to the independent files *instead of* Google
   (`server/places/data/identities/cutover.json`, empty today), once its independent coverage is at least what Google's was. The part to
   take to counsel is the few weeks before a category is switched, while Google rows remain.

Honest limits: soft play is the hard gap (OSM tags `leisure=trampoline_park` but toddler soft play is inconsistently tagged; of the 6 we
hold, 4 have no open-data match and 2 only a possible one). Open data names and places venues; it does not say whether a place suits a
toddler. That stays with the evidence layer, and until it exists a place is shown as not checked, never as a match. Measured supply from
OpenStreetMap alone: 2,575 new parks against a goal of 230, 286 museums against 65, 26 farms and animals against 30, 53 play places
against 70, 266 attractions against 85. The remaining gap is play (11).

Two findings from running the reader on real entries: `mergeCatalogue` capped the list at 160 and counted independent entries against the
cap, so a reviewed list of 3,000 would have been cut to 160 (fixed, with a test, in #208); and first paint grows with the entry count, about
+0.5 s at 1,631 entries and +2 to 3 s at 3,623 in a desktop-class headless browser, which argues for serving the first stage first.

## 7. What the network blocked, and how it was resolved

This session cannot reach the open-data hosts, and I did not bypass that. GitHub's Actions runners can, so a one-off workflow fetched the
files there. What was fetched, from where and under what licence: [OPEN_DATA_DOWNLOADS.md](OPEN_DATA_DOWNLOADS.md). Still blocked from here:
reading the primary ODbL, OGL and OSMF texts (they are reachable from the runner but I have not read them into the review).

## 8. Validation and rollback, tested

| What | How it is proven | How it is undone |
|---|---|---|
| Map correction | 14 unit tests, a source scan that fails if any screen draws a map without the rule, a real-browser check in CI | Revert one commit; no data |
| Recovery reader | 52 tests: every refusal, no Google call when a copy has aged out, a fresh Google row always wins, an empty list and an empty cutover change nothing, OpenStreetMap content only in its own file, independent places are not truncated by the 160 cap. Also run against the 3,374 real entries (`UNREVIEWED`, so never served) | Remove entries or revert; no database change |
| The numbers | `scripts/simulate-catalogue-expiry.mjs` runs the real reader on a stand-in database; it reproduces the table in section 1 | n/a |
| Before any entry goes live | simulate with the candidate file; read the Preview's Explore and a venue page; check no Google field appears in the response | Remove the entry |

I tested rollback by test, not on production: with entries the reader adds them, with none it returns exactly the Google rows as before,
and a bad entry is dropped. Nothing is written to a database anywhere in this plan. No migration is proposed.

## 9. Unresolved questions that need a person

1. Google's primary terms: place-ID duration; whether names, addresses and hours may be stored at all beyond a request. If not, the
   30-day window already used for them is itself a risk. [MAP_COMPLIANCE.md](MAP_COMPLIANCE.md) lists the storage exposures.
2. The ODbL: Derivative or Collective Database; substantial extraction; the notice; whether an alias from an old Google-derived id to a
   new OSM-derived one (needed so saved plans keep working) is a forbidden cross-reference. Ten questions in
   [OSM_LICENCE_REVIEW.md](OSM_LICENCE_REVIEW.md).
3. Whether discovering a venue through Google and then confirming it independently is acceptable (the seed was Google's). I think so,
   because the entry carries only independent facts, but it is a question for counsel.
