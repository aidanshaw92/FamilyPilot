# What we already hold about our 151 London places, and what we are losing

2026-10-08. **Read-only.** Every number is from a query against the production database or from the code on `main`; nothing
was fetched, written or extracted, and no Google call was made. Excerpts are stored text from the venues' own pages.

## The answer in five lines

1. Of **134 destinations** (the 151 London rows include 17 restaurants and cafés from OpenStreetMap, which have no pages and
   are scored separately), **55 show a parent at least one confirmed family fact today; 79 show none.**
2. The biggest single loss is not evidence or extraction: **55 venues hold a confirmed fact the app never displays**
   (playground 30, accessible toilet 29, wheelchair access 10). For **13 of them every confirmed fact is invisible**: the Diana
   Memorial Playground's page does not say it has a playground.
3. From the pages **already stored**, with no fetching and no Google call, a review pass could make **74 venues gain at least
   one new visible fact**, and take the number showing any confirmed family fact from **55 to 82**. Prices add about 26 to 29
   venues (prepared separately), official-page opening hours 6.
4. The rest is genuinely unavailable to us today: **27 venues' sites block our fetcher** (we do not bypass that), **4 have no
   website**, about 23 returned almost no text, and about 31 to 37 have visitor pages that simply do not say.
5. Extraction is **not** the main failure. Where a page says something clearly, it is usually captured; the losses are in what
   happens after (quarantine that is too strict for a few venue websites, a promotion rule, and display).

## 1. Where the pages are (2,212 stored pages)

| Pages (all 2,212, covering 156 stored venues including some outside London) | Count | Venues |
| --- | ---: | ---: |
| The venue's own pages, fetched (`venue_own_subtree` / `venue_named_page`, ok or truncated) | 708 | 96 of the 134 London destinations |
| The venue's own pages, **blocked** by a bot challenge | 431 | 44 |
| The venue's own pages, errored, timed out, non-HTML or too large | 355 | 53 |
| Pages on the same site whose link to this venue is not established (`sibling_unverified`) | 610 | 62 |
| Other venues' pages, the operator's parent pages | 108 | 30 |

Only the first row may produce a fact (`ELIGIBLE_SCOPES` in `server/enrichment/_lib/source-identity.js`). So the 2,212 pages
are about 700 usable ones, for 96 of 134 destinations. Of those 96: **23 returned less than 3,000 characters in total** (two
"ok" pages are in fact a bot challenge, "please make sure that cookies and JavaScript are enabled"; Wimbledon's museum returned
nothing; Burgh House only navigation), and **34 have only a homepage-type page** (no visitor, accessibility, FAQ or family page
was found).

## 2. Field by field (134 destinations)

How to read it: each destination is counted once per field, in the first column that applies, left to right.

| Field | Shown today | Held, **not displayed** | Held, **quarantined** | Extracted, **not promoted** | Mentioned, **not extracted** | Own pages **silent** | **Blocked** | Errored / no page |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baby changing | 21 | 0 | 8 | 0 | 6 | 64 | 27 | 8 |
| Buggy access | 9 (+1 expired) | 0 | 4 | 4 (+2 scope) | 5 | 73 | 27 | 9 |
| Toilets | 27 | 0 | 4 | 0 (+2 scope) | 12 | 54 | 27 | 8 |
| Parking (yes, no or limited) | 28 | 0 | 13 | 1 (+1 scope) | 26 | 30 | 27 | 8 |
| Café | 31 | 0 | 0 | 0 (+1 scope) | 16 | 49 | 27 | 10 |
| **Playground** | 0 | **30** | 13 | 0 (+3 scope) | 3 | 52 | 27 | 6 |
| **Accessible toilet** | 0 | **29** | 5 | 0 (+1 scope) | 0 | 64 | 27 | 8 |
| **Wheelchair access** | 0 | **10** | 7 | 3 | 15 | 63 | 27 | 9 |

"Scope" means a fact was extracted from a page that is not the venue's own, so it is withheld, correctly in principle.

Three fields the table cannot hold:

| Field | Today | Recoverable from stored pages | Not available |
| --- | --- | --- | --- |
| Opening hours | 105 of 134 have structured hours (stored from Google earlier; no new call needed) | 6 of the 29 without have hours on their own pages | 22 of the 29 are parks, many of them open all the time or dawn to dusk |
| Prices | 0 | about 18 free-entry statements, 3 complete paid price lists, about 8 more after one decision each (`PRICING_EVIDENCE_SAMPLE.md`) | about 105 |
| Activity suitability (ages) | 0 whole-venue ranges (`AGE_SUITABILITY_YIELD.md`) | 4 part-level statements: Battersea Park playground 4 to 14, Burgess Park up to 14, Belmont Farm soft play 6 months to 10 years, and (found in this audit) London Museum Docklands "interactive play area for under-8s"; 9 more are sessions or classes | everything else |

## 3. Causes, with the evidence

### A. Display failure: facts we hold and never show (55 venues)

The consumer API serves `familyFacilities.playground`, `accessibility.accessibleToilet` and
`accessibility.wheelchairAccessible` from approved claims. Nothing on Venue Detail renders them:

- "Family essentials" (`utils/family-essentials.ts`) has rows for baby changing, buggy access, toilets, parking, food, ages,
  terrain and hours only.
- `FacilityGrid` (which has a Playground tile) is imported nowhere.
- The evidence panel covers the five fields parents can report.
- Family Fit (`family-match.ts`) reads none of the three.

Examples of what a parent cannot see: Diana Princess of Wales Memorial Playground (playground), Brockwell Park ("a large
children's playground and wet play area"), Hillside Gardens Park ("a children's playground and open games space"), Cutty Sark
(accessible toilet), Hyde Park Corner (*not* wheelchair accessible: "Hyde Park Corner is not wheelchair accessible").
**13 venues** have only these facts, so their page reads "Not confirmed yet" for everything.

### B. Quarantine (55 venue-fields): mostly right, 17 true facts lost

These claims were approved from a page on the same website but outside what the system recognises as the venue's own section,
so the source-identity guard withholds them. Read one by one:

| Outcome | Venue-fields | Examples |
| --- | ---: | --- |
| **Correctly withheld** (the fact is about something else) | 26 | "Buggy parking is available in Gallery Square" read as car parking (Horniman, V&A, Young V&A); "Bicycle parking" (William Morris); an arcade "playground" (Babylon Park); Greenwich Park's playgrounds for the Cutty Sark and Queen's House; the Wildlife Trust's site-wide filter list ("Baby changing facilities Bird hides Cafe/refreshments") for two reserves; "the nearest Changing Places toilet can be found in Dulwich Park" for Sydenham Hill Wood; the V&A East Museum's toilets for the V&A East Storehouse |
| **True facts withheld** | 17 | Madame Tussauds: "There is no parking onsite" and "You are unable to bring a buggy into the attraction"; Mudchute: "visitor parking is not available on site"; Crystal Palace Park: the Dinosaur playground page ("Main public toilets, Changing Places toilet"); Primrose Hill: "Primrose Hill playground"; London Museum Docklands: "interactive play area for under-8s"; Mayow Park: "Toilets, including disabled facilities"; Young V&A, V&A and V&A East Storehouse: "Our entrance is step-free" |
| Ambiguous (needs a person) | 12 | "Please ask a member of staff for the nearest baby changing facilities" (Madame Tussauds); cafés described as wheelchair accessible (Victoria Park, National Maritime Museum) |

Root cause of most true losses: **the stored website is a deep or decorated URL**, so the venue's "own section" is too narrow.
Madame Tussauds' website is stored as `madametussauds.com/london/en/`, so `/london/plan-your-visit/...` counts as someone else's
page; Crystal Palace Park's website is the trust's domain while its visitor pages live on `crystalpalacepark.org.uk`. Several
others carry `?utm_source=...` or point at one display (`horniman.ac.uk/visit/displays/butterfly-house`).

### C. Promotion: extracted cleanly, never approved (5)

| Venue | Extracted | Stored text |
| --- | --- | --- |
| The National Gallery | buggy access good | "You are welcome to bring baby buggies into the Gallery." |
| Tate Britain | buggy access good | "Yes, we welcome visitors with young children and buggies to come and enjoy the galleries." |
| William Morris Gallery | buggy access good | "You are most welcome to bring your buggy and wheel it around the exhibition spaces (there is a lift to the first and second floors)." |
| Babylon Park | buggy access good | "Yes, prams are allowed and there is a dedicated pram/buggy section on the second floor." |
| RAF Museum London | wheelchair access yes | "We have step free access around our site and lifts to upper levels." |

Correctly not promoted, for comparison: Paradox Museum (wheelchair "yes, the majority" and "the Zero Gravity Room is not"),
Saatchi Gallery (public car park nearby, bike parking, street restrictions: none is on-site parking), Sydenham Hill Wood (the
nearest *station*). "Buggies welcome" is not the same as step-free access, so these need a value such as "buggies welcome,
access not described" rather than "good"; that is a rule decision, not an extraction error.

### D. Extraction misses: the page says it, nothing was extracted (about 40 true of 83 mentions)

A loose pattern finds the word; a person reads the sentence. Results:

| Field | Mentions | True facts | Typical true miss | Typical false alarm |
| --- | ---: | ---: | --- | --- |
| Café | 16 | 13 (12 yes, 1 no) | South Norwood: "The Kiosk Community Café: every Saturday 9am to 2pm"; V&A: "Main Café 10.00 to 17.00"; Sherlock Holmes Museum: "we do not have a designated area for food and drink" (a no) | Golders Hill Zoo: a link to a "Memory Cafe" service |
| Toilets | 12 | about 10 | Chiswick House: "Baby changing is available in the toilets by the Café"; William Morris Gallery: "accessible toilets and lift access to all floors" | Hackney City Farm: the FAQ question "Are there toilets?" with no answer |
| Parking | 26 | about 8 | Hampstead Heath: "each of our four car parks"; Walpole Park: "no dedicated car parking"; Fryent Country Park's car park (already confirmed) | council navigation ("Buy a parking permit") on most park pages |
| Wheelchair | 15 | about 7 | Queen's House: "All floors of the Queen's House have lifts"; Gunnersbury: "a self-operated lift serves all the galleries" | Tate's accessibility menu |
| Playground | 3 | 2 | Victoria Park: "children's play areas"; Walpole Park: "café playground" | |
| Buggy access | 5 | 0 to 1 | | "Buggy parking is available in the Dry Dock" |
| Baby changing | 6 | 0 | | sports "changing rooms" at Burgess Park, Hackney Marshes, Highgate Wood |

Walpole Park is the clearest single case: its page lists "Facilities: Pitzhanger Manor House and Gallery café, playground" and
"parking: no dedicated car parking", and nothing at all was extracted from it.

### E. Contradictions are rare

Genuinely contradictory evidence, as opposed to quarantined misreads: Paradox Museum (wheelchair yes/no, both true of
different parts), Saatchi Gallery (parking), Streatham Common ("double yellow lines mean no parking" about surrounding roads).
No parent report exists yet (`venue_visit_reports`: 0 active rows), so nothing is disputed by parents.

### F. What we show is mostly right, not entirely

A random sample of 24 served facts: **22 correct, 2 wrong**. Colne Valley Regional Park shows "parking: none on site" from
"Parking is not permitted on Denham Court Drive" (a street rule); Queen Elizabeth Olympic Park shows parking from "Lee Valley
VeloPark venue car parking is available ... for facility users". Negative parking facts deserve a second look in any review pass.

### G. Unavailable: what no amount of re-reading will fix

| Cause | Destinations | Note |
| --- | ---: | --- |
| Website blocks our fetcher (Cloudflare and similar) | 27 | the fetcher correctly does not try to defeat a challenge |
| No website stored | 4 | |
| Fetch errors, timeouts | 4 to 9 per field | |
| Fetched, but almost no text (JavaScript sites, challenge pages saved as "ok") | 23 | a different fetch strategy might help; it is a new fetch, not a re-read |
| Only a homepage was found | 34 | the visitor pages exist on most such sites but were not discovered |
| Visitor pages fetched and silent on the field | 11 to 37 per field | parks run by councils often do not say whether there is baby changing |

## 4. Realistic recovery without any Google call

| Route | Work | Fetching | Venues improved | New visible venue-facts |
| --- | --- | --- | ---: | ---: |
| 1. Show what we hold (playground, accessible toilet, wheelchair rows on Venue Detail; read playground into Family Fit only as provision, never as an age claim) | code change, no data | none | **55** | 69 |
| 2. Fix the "own section" for venues whose stored website is a deep or decorated URL, then re-run the scope check | data fix per venue plus `reextract` (no network) | none | 13 | 17 |
| 3. A promotion rule for "buggies welcome" and clear step-free statements | rule change, review | none | 5 | 5 |
| 4. Extraction fixes and a reviewed pass over the 83 mentions | extractor change plus review | none | about 33 | about 40 |
| 5. Prices (prepared separately) | review | none | about 26 to 29 | |
| 6. Opening hours from official pages | review | none | 6 | 6 |
| **Routes 1 to 4 together** | | **none** | **74** | **about 130** |
| 7. Re-fetch the 23 thin and 34 homepage-only venues' visitor pages (`refetch_official`, no Google) | controlled fetch | yes | perhaps 10 to 20 (an estimate) | |

After routes 1 to 4, **82 of 134 destinations would show at least one confirmed family fact (from 55)**, and the 13 venues whose
pages read "Not confirmed yet" for everything would each show something. The remaining 52 are mostly the blocked, empty and
homepage-only sites in section G.

## 5. Recommended order

1. Route 1 (display): a small code PR. It is the largest gain for the least risk, and it uses only approved facts.
2. Route 2 (website roots) and route 3 (promotion rule): data and rule fixes, each fact reviewed.
3. Route 4 (extraction): improve the patterns that miss facility lists and café hours, re-run `reextract` on stored pages, review.
4. Correct the two wrong served facts (Colne Valley, Olympic Park) in the same review.
5. Only then consider route 7 and the expansion pilot.

Nothing here has been started; every route except 1 changes production data and goes through review.
