# Evidence coverage audit (served cohort) and the post-visit loop

Status: PR #159, not merged, not deployed. Numbers are from read-only queries against the production database on
5 Oct 2026, over the cohort a parent can actually browse: the **138** stored places in the explore categories (park,
museum, zoo, farm, attraction, activity, soft play, beach), not the raw 155 rows (the other 17 are OpenStreetMap
restaurants and cafes, which are context for a day out, not destinations).

The acceptance test for this document is not a percentage. It is: FamilyPilot says only what it can show, knows enough
useful family facts to make a meaningful recommendation, says clearly what it does not know, and has a credible way of
getting better every time families use it.

## 1. The cohort, field by field

"Confirmed" means an active claim with a quoted source (`venue_claims.status = 'active'`). "Disputed" means a claim
exists but is **not served as a fact**: the subject-scope guard or a source conflict quarantined it (for example Tate
Britain's baby-changing claim was read from the Tate Liverpool page). "Unknown" means nothing is held. Nothing is
inferred from a category.

| Field | Confirmed yes | Confirmed no / limited | Disputed (quarantined) | Unknown | Stale (> 60 days) | Parent reports |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baby changing | 21 | 0 | 8 | **109** | 0 | 0 |
| Buggy access | 1 good · 1 other value | 4 difficult or mixed | 5 | **127** | 0 | 0 |
| Toilets | 21 | 0 | 7 | **110** | 0 | 0 |
| Parking | 14 | 11 | 11 | **102** | 0 | 0 |
| Café / on-site food | 5 | 0 | 0 | **133** | 0 | 0 |
| Age suitability (recommended range or door policy) | 0 | 0 | 0 | **138** | 0 | 0 |
| Terrain | 1 | 0 | 0 | **137** | 0 | 0 |

Context: playground is confirmed for 29, accessible toilet 34, wheelchair access 10. The oldest active claim is 55
days old (11 Aug), so nothing is stale at the 60-day line yet; the 30-day rule for age-policy claims is unused because
none exist. Visit reports: **0** (the table exists; nothing ever asked for one before this PR).

Primary sources in use today: the venue's own pages (stored as `official_website` 280 rows, `visitor_info` 1,033,
`accessibility_page` 158, `family_page` 84, `faq_page` 94), each extracted sentence-by-sentence with its quote and
timestamp. Google supplies identity, hours and photographs, not family facilities. OpenStreetMap supplies "food nearby"
only. Parents supply nothing yet.

## 2. Why coverage is low (measured, not guessed)

Two causes explain most of it, and neither is "the extractor is bad".

**A. Often there is no usable page.** Of 138 venues, **39 (28%) have no cleanly fetched page at all**: 10 have no
website stored, 31 sit behind a Cloudflare challenge (the fetcher correctly does not try to defeat it), and the rest
returned 404 or timed out. A further **22 to 68** venues per field have clean pages that simply do not mention it:
most parks are run by councils and trusts whose pages do not say whether there is baby changing. Silence is
**unknown, not "no"**.

| Field | Venues with no usable page | Pages exist but are silent | Own pages mention it | Confirmed from those |
| --- | ---: | ---: | ---: | ---: |
| Baby changing | 39 | 63 | 28 | 21 |
| Buggy access | 39 | 68 | 26 | 6 |
| Toilets | 39 | 42 | 50 | 21 |
| Parking | 39 | 22 | 67 | 25 |
| Café | 39 | 33 | 51 | 5 |
| Age wording | 39 | 46 | 41 | 0 |
| Terrain wording | 39 | 53 | 31 | 1 |

**B. Where a page does say it, the extractor is deliberately conservative**, because this pipeline has a history of
false positives (a café that merely appears in text, a car park down the road, a CSS class called `.baby-changing`).
That is the right default and it stays. But the café row is the clearest sign of over-caution: 51 venues' own pages
mention a café and only 5 had a café claim, because the patterns could read "The cafe is dog friendly" and little
else. I read the actual sentences for the unknown venues and found plain, first-person statements the patterns could
not see ("Take a break in our cafe and bookshop", "The Gardens Cafe is located next to the play area", "Visit the
Dragon Roasted Café for coffee"), and two other defects.

**What the stored evidence does NOT support is a quick win elsewhere.** The 68 draft rows still awaiting review hold no
valued fact at all (all unknown), and the 241 `blocked` fetches are Cloudflare or 403 walls. There is no pile of
confirmed-but-unpublished facts waiting to be approved.

## 3. What was improved automatically, and what it is worth

Three precise changes to `server/enrichment/_lib/evidence-extractor.js`, each driven by real cohort wording, each
with positive and negative tests (`evidence-extractor-cohort-phrasing.test.ts`, 29 tests):

1. **"baby-changing facilities" with a hyphen** (National Maritime Museum) is now a baby-changing statement, but only
   in prose: a CSS class, an id or a selector (`.baby-changing`, `#baby-changing-room-link`) still is not.
2. **"you will find baby changing facilities…"** (London Eye, RAF Museum) is a description, not a plan. Only genuine
   plans ("will be installed", "will open", "soon") are excluded, as before.
3. **The venue's own café, in its own voice**: "our cafe", "the museum cafe serves…", a proper-named café that "is
   open / is located next to…", "Visit the X Café for…", "cafe serving fresh sandwiches". Sentences about somebody else's
   café ("nearby", "down the road", "our sister site", "temporarily closed", a toilet location that mentions a café)
   stay unknown. Toilets gain the same kind of placed statement ("are available on site"; "There are three accessible
   toilets in the park"), and toilets belonging to somewhere else ("the nearest public toilets are at the village hall")
   are now refused.

Estimated yield, replayed on the stored sentences with equivalent patterns, **before** the pipeline's own scope guard
and approval gates: café **+19 venues** (5 to about 24, 17%), baby changing **+3**, toilets **+3**. These are
estimates. **None of it is live**: it takes effect when the enrichment worker next re-extracts, which happens only
after this branch is merged and deployed. Nothing in this PR writes a claim, approves a draft or touches a production
row.

Not done, on purpose: loosening the guard that quarantines sibling-venue pages (that guard is why Tate Modern no
longer inherits Tate Liverpool's facilities), reading amenity-list navigation as statements, or any category default.

## 4. Realistic ceilings and where parents are needed

| Field | Realistic automated ceiling (own pages) | Why the rest stays unknown | Parent confirmation |
| --- | --- | --- | --- |
| Baby changing | about 22% | parks and small venues do not publish it | **Essential**, and the highest-value question |
| Buggy access | about 15 to 20% | surface, steps and gradients are rarely stated; the rule only publishes explicit wording | **Essential**: it is first-hand by nature |
| Toilets | about 40% | amenity lists and navigation are not statements | Useful for parks |
| Parking | about 45% | "limited", Blue Badge only and off-site parking are deliberately not "yes" | Useful |
| Café | about 35% after the fix | silent pages, council-run parks | Useful (open on the day) |
| Age suitability | about 0% for a door policy (none exists in the corpus); a few recommended ranges | see section 6 | Needs a product decision |
| Terrain | about 15% | explicit surface wording only | Good future question |

## 5. The post-visit confirmation loop (built)

"FamilyPilot improves the exact fields it does not know."

**Trigger.** The strongest privacy-safe signal the product already has: the family **saved a plan containing the
venue, and its date and finish time are behind them** (`feedbackDue`, ninety minutes of grace, thirty days of reach).
Opening a venue page never starts it, there is no location tracking and no new permission. Where it appears: a small
dot on the Plans tab (Home is unchanged) and a card at the top of Plans. Explicit marking is available on any venue page
("Been here? Help check").

**Flow.**

1. *Did you go to [venue]?*  **Yes, we went** · **No, we didn't go** · Ask me tomorrow.
2. **No**: dismissed. No facility questions, **nothing is sent**, the dot goes away (`verify-post-visit.mjs`).
3. **Yes**: two or three one-tap questions, then *Share what I found*. "Didn't check" is a real answer; sharing is
   disabled until one thing is answered.
4. A thank-you says what happens next: it will be shown as **reported by parents**, beside what the venue says.

**Which questions** (`server/feedback/_lib/rules.js` ranks, `visit-questions.ts` narrows). The server ranks every field
by how much a new observation helps: 0 disputed or contradicted, 1 unknown, 2 stale source, 3 a single parent report,
4 corroborated by parents, 9 confirmed and fresh (never asked). The device then drops what this family cannot answer
(no buggy: no buggy question; no child under four: no baby-changing question) and takes at most three, breaking ties
by family relevance and then by value. **Nothing about the family is sent to choose**: the ranking comes down, the
choice is made on the device, and only the answers go back up. A fully confirmed venue asks nothing.

**What is stored.** One row per report in `venue_visit_reports`: account, venue, visit date, answers (up to three).
The request body is exactly `{venueId, visitDate, attended, answers}`; the browser test asserts no child name, date of
birth, postcode or parent name appears in it or in the stored row. Parents can delete their reports.

### The reconciliation rule (pinned by `visit-reconciliation.test.ts`, 15 tests)

* **R1** only active observations from the last 90 days count; "did not check" never counts; each account counts once
  (its latest answer stands).
* **R2** an official claim is **never rewritten** by an observation. They are shown side by side.
* **R3** a later observation that contradicts the official claim puts the field in *needs recheck*: the value shown
  becomes "unknown" until a source recheck; the claim row is untouched. A source check dated after the visit resolves
  it; an older source cannot dismiss a newer observation. A temporary closure ("unavailable") questions an official
  yes without becoming a permanent no.
* **R4** with no official claim: one account is *single*, two or more who agree are *corroborated* (stronger, still not
  official), accounts who disagree are *contested* and need a recheck. Parent evidence can **never** produce
  `source_checked` or `editor_checked`, however many agree.
* **R5** absence of reports is not "no".

Parent reports appear only on the venue page ("One family has reported this; the venue's own source is not confirmed",
"2 families have reported this…"). They do **not** raise a Family Fit verdict yet: that would make unreviewed
observations a ranking input, which is a product decision, listed under owner decisions.

## 6. Age suitability: audited, not guessed

* **Where it is meant to originate.** Two different facts. (1) A **door policy** ("under 4s are not admitted"): a
  claim `agePolicy.<source>` with a quoted rule and a human approver, which alone may hide a venue (`AGE_POLICY.md`).
  (2) A **recommended range** (`minRecommendedAge` / `maxRecommendedAge`): advice that **ranks and explains and never
  excludes**.
* **What the cohort holds: nothing, for both.** The extraction schema (`accessibility`, `familyFacilities`,
  `sendInfo`) has no age field, and the age-policy writer has no producer: P0-B3 was a zero-write audit that found 0
  door policies in 174 classified statements (one "recommended for ages 3-11"). Draft AI age ranges exist but are
  internal-only and never served.
* **How the planner and Family Fit treat absence.** The age verdict and the "Suits Sloane (recommended for ages 1 to 8)"
  line exist only when a range exists. With none, there is no age line, no cap, no exclusion and no warning: unknown
  stays unknown. Nothing infers an age from a category ("park = all ages", "soft play = toddlers", "museum =
  children") and I have not added any such rule.
* **Can official wording establish a range?** Only the rare explicit statement ("recommended for ages 3 to 11"; "aged
  18 months to 5 years") and the current data holds one. Qualitative wording (toddlers, under-fives, 6+) is represented
  as half-open month intervals, and "marketing all ages" copy (30 statements) is deliberately not a fact.
* **What would raise coverage robustly.** Targeted age-source discovery (ticket, admission and activity pages, which
  the discovery step does not sample) followed by a producer for recommended ranges. That is a pipeline slice and is
  not built here, because it needs deploy-time re-crawling and a producer with human approval.
* **The one product decision this needs** (see the report): whether a parent's "it was right for my 3-year-old" may ever
  count towards a recommended range.

## 7. Family Fit and unknown data

Pinned by `family-match-unknowns.test.ts` (8 tests, six realistic families on one production-shaped venue whose toilets
and café are confirmed and whose buggy access, baby changing and parking are not):

* a buggy toddler family is told *"Buggy access still to be checked for Theo's buggy"*; the verdict is **Possible**
  (an unknown hard requirement caps it) and **never Poor** because of an unknown;
* a family that walks, with older children, hears **nothing** about buggies or baby changing and still gets **Good**;
* a family carrying a baby is asked about baby changing, softly, and about nothing buggy;
* a child who needs step-free access: *still to be checked*, never assumed;
* a stated must-have that is unknown is a hard unknown in the family's own words; a confirmed "no" is a breach;
* no unknown ever appears among the reasons; confirming the fact removes the question and earns the line.

The Venue page's "Family essentials" now applies the same relevance: one quiet line lists what is still unconfirmed,
omitting buggy access for a family with no buggy and baby changing for a family with no child under four. Everything
remains visible under "How we know this".

## 8. Farm inventory

Eight farms, all with a provider photograph and seven with opening hours.

| Farm | Distance from central London | Notes |
| --- | ---: | --- |
| Hackney City Farm | 5.0 km | city farm, café on site (a separate business), baby changing stated |
| Kentish Town City Farm | 5.2 km | city farm |
| Mudchute Park and Farm | 8.3 km | Google's primary type is `park`, stored as farm: correct for a family |
| Crystal Palace Park Farm | 10.8 km | the farm in Crystal Palace Park |
| Belmont Children's Farm | 14.6 km | farm, soft play and café |
| Tulleys Tulip Fields | 25.8 km | seasonal flower-picking farm, no hours |
| Willows Activity Farm | 26.2 km | Hertfordshire |
| Woodside Animal Farm | 43.9 km | Bedfordshire, beyond the 40 km London radius |

Five are in Greater London and every one is genuinely family-relevant; the classification is right (Tulleys is a
farm, but a seasonal one, and says so by having no hours). I can name more inner-London city farms (Vauxhall, Surrey
Docks, Freightliners, Spitalfields, Stepping Stones, Newham, Deen) that are not stored, so the set is **thin but not
misleading**. Per your decision, **no discovery is proposed or run**. If you later want it: a handful of Google Places
Text Search queries (one per farm concept: "city farm", "children's farm", "farm park", "petting farm", each limited to
Greater London), a hard cap of 8 requests, one SKU family (Text Search), roughly 5 to 10 additional venues, and a
cost I would read from Cloud Billing rather than state from memory. It needs your approval first.

## 9. Food filters and Venue Detail against realistic data (rendered)

* `verify-home-food-filters.mjs` (Home) and `verify-explore-clearance.mjs` (Explore) run the Food nearby filters in a real browser against the realistic fixture, where four venues carry a stored food lookup and the rest carry none. A filter keeps the places **known** to match; places never looked up are listed separately as "not checked", counted, and never called "no". With every lookup stripped from the API response Home says *"No place is known to match yet. 15 places haven't been checked for food nearby, so we can't say either way. They aren't a 'no'"* and **Clear filters** brings the deck back (`docs/product-qa/home-food-empty-unchecked.jpg`). A filter-active dot sits on the filter button while any filter is on.
* Venue Detail was rendered with realistic partial data (`sloane-theo-venue-*`) and with sparse data (`sparse-venue-*`): identity and photograph, then Family Fit, then today's practical decision, then family essentials, nearby food, "How we know this", Create a plan. A venue with almost nothing confirmed shows one quiet line ("Not confirmed yet: baby changing, buggy access, toilets, parking, food, best for ages, terrain.") and "Been here? Help check", not a column of grey rows. Parent-reported facts sit under "How we know this", beside, never over, the venue's own source.

## 10. Not done, and not claimed

* The food backfill was **not run**: see `docs/FOOD_BACKFILL.md`.
* VoiceOver, TalkBack and OS larger-text were **not tested**.
* The extractor improvements are **not live** (they need merge, deploy and a worker run).
* Parent reports do not yet influence Family Fit.
