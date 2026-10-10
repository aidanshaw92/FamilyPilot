# Ten-venue pilot: evidence-backed family profiles, shown in the real app

> **Figures superseded.** The counts in this document (194 items, 84 accepted without a person, 85 proposed, 46 and 73 claims) are the first report's. Independent evidence checks run afterwards corrected them to 195 / 71 / 99 / 38 / 73. See `docs/pilot/RECONCILIATION.md` and `docs/pilot/REVIEW_PROCESS.md`. The method described below is otherwise unchanged.

Date: 2026-10-08. Branch `pilot/profiles-demo`, draft PR #189. Nothing here has been written to production, no Google call was made, and no model ran in the app or the pipeline. Method, gate rules, review queue and the parent-confirmation design are in `docs/pilot/METHOD_AND_REVIEW.md`. The ten profiles, with every sentence and source, are in `docs/pilot/PROFILES.md`.

## 1. The ten venues, and why

Chosen for family demand, London coverage, category mix, age spread and a mix of evidence situations. Not chosen for easy websites: three had been marked blocked and are readable, two have thin or third-party sources.

| Venue | Area | Kind | Why it is in the pilot |
|---|---|---|---|
| Science Museum | South Kensington | museum | Top family demand; marked blocked; no stored facts; strong age-specific galleries |
| Natural History Museum | South Kensington | museum | Same demand; marked blocked; no age named for any permanent gallery; a closure tomorrow |
| London Zoo | Regent's Park | zoo | Marked blocked; paid; four-tier day pricing the price model cannot hold |
| Royal Air Force Museum | Colindale | museum | Outer London; 8 stored facts; earlier evidence review; free |
| Horniman | Forest Hill | museum and gardens | South-east; free museum plus paid attractions; steep gardens |
| Mudchute Park and Farm | Isle of Dogs | city farm | East; free; provider hours disagree with the farm's own |
| Discover Children's Story Centre | Stratford | indoor play | East; the strongest age evidence (0 to 2); a no-pushchair rule; price hidden |
| Babylon Park | Camden | soft play and rides | One-page site; ticket price held by a third party |
| Gunnersbury Park | Acton | park and museum | West; free; no playground or baby changing stated; a dead nav link |
| Battersea Park | Battersea | park | South-west; thin council pages; the operator's site refuses automated reads |

## 2. Before and after, from the real data

Reading, all from the venues' own sites on a GitHub runner: 88 requests, 78 pages read (the first pass 73 pages, a second pass 5), one refusal (Battersea's operator, HTTP 403, not retried), one dead link (Gunnersbury, 404). Science Museum, Natural History Museum and London Zoo all read cleanly.

| | Before (production today) | After |
|---|---|---|
| Facts recorded for the ten | 24 stored claims (3 venues had none) | 194 profile facts: 84 verified with no person, 85 proposed for a person, 21 unknown, 4 hypotheses |
| Facts as claims the app would read | 24 | 46 with no person, 73 if every proposal were approved |
| Facts that quote the venue's own sentence | n/a | 172 of 194; 171 found verbatim on today's page, 1 carried from an earlier reading and marked (the other 22 are unknowns and hypotheses, which state nothing) |

Three profiles, in brief (all ten are in `docs/pilot/PROFILES.md`):

- **Science Museum.** Before: no stored fact; "Family suitability not yet reviewed"; "Price not confirmed". After: free with a pre-booked ticket; The Garden for 3 to 6 and Bubble Explorers for 7 and under, each with the page's own sentence; baby changing on every floor; buggy parking and the buggy rule; no car parking, nearest station five minutes; two things it cannot say (it names no age for Pattern Pod, so that stays a hypothesis).
- **Discover.** Before: one stored fact (café). After: a space for 0 to 2 only, baby storytelling, storytelling for 0 to 5 and an exhibition for 0 to 8; no pushchairs in any play area (bring a sling; twins and sleeping children by arrangement); baby changing on every floor; a station notice that is more than a year out of date, flagged for a person. The entry price is not in today's page text.
- **Battersea Park.** Before: one stored fact. After: opening times (with two statements that need reconciling), a 4 to 14 playground, and six honest unknowns. The council page says almost nothing else, and the park operator's site refused. This is the case where an open-data layer, not another page, is the next step.

## 3. How many are genuinely recommendation-ready

Under the revised levels (`scripts/pilot/readiness.cjs`; 24 unit tests):

| | Before | After, no new person | After, if every proposal is approved |
|---|---|---|---|
| Recommendation-ready or better | 1 | 4 | 8 |
| Highly personalised | 0 | 0 | 2 (Science Museum, London Zoo) |
| Still discoverable | 9 | 6 | 2 (Babylon Park, Battersea Park) |

- **Before:** only the RAF Museum, because a person had already approved its free entry.
- **No new person:** RAF, Horniman, Mudchute and Gunnersbury, where an earlier person-approved price already exists and the new facts pass the gate. Every other venue is held back by a price or an age claim, which always need a person.
- **If approved:** the two that stay discoverable are named by cause. Babylon Park: ticket price on a third-party site. Battersea Park: no price, no toilets or baby changing in any source read.
- **Held, never counted:** Discover's under-1 ticket terms, where its own pages disagree. It is recommendation-ready, not highly personalised, because of that.

## 4. The working demonstration

The real exported app (five-tab navigation and the Figma styling untouched) ran against a local server serving the ten venues in two states, for four households: a 4-year-old and an 8-month-old; a 4-month-old alone; a 7- and a 10-year-old; a 2-year-old using a mobility aid. Photographs are off, so the illustrated fallback shows.

**Discover → Decide → Plan → Do worked end to end in both states for all four households:** Home, Explore (all ten cards), Venue Detail for all ten venues, Create a plan from Venue Detail to the Plan screen (4 of 4 each state), plus five targeted plan runs (5 of 5 each state).

Checks against the facts behind the screen:

| Check | Result |
|---|---|
| Facility rows (baby changing, toilets, parking, playground, accessible toilet) match the facts behind them | 400 of 400, before and after |
| Age-specific reasons that name a child, checked against the stated age range and the child's age | 20 of 20 supported, none unsupported |
| A venue with no stated age (NHM, RAF, Horniman, Mudchute, Gunnersbury) names a child as suited | never; it says "we haven't yet confirmed whether this activity suits Mia" |
| "Excellent" shown anywhere | 0 |
| Baby-only household at the RAF Museum | "Easy visit", before and after |

What changed for a family:

- Three "Not yet reviewed" venues (Science, NHM, London Zoo) became reviewable for every household. For the preschooler-and-baby household: Science Museum "Possible for Mia, and easy to visit with Leo", with two reasons that cite Mia's age.
- The mobility-aid household gained two "Good fit" venues (RAF, Gunnersbury) from accessible-toilet and access statements, and London Zoo reads "Good for Ivy" (ZooTown, up to 8).
- More knowledge can lower a verdict. Horniman went from "Good fit" to "Possible fit" for the school-age household because its lack of on-site parking is now known.
- **Home still leads with the RAF Museum for all four households.** Rankings are unchanged by design (no score change). Explore's order moves: Science Museum rises from eighth to second for the preschooler household.
- "How we know this" shows each fact's source and the day it was checked, read through the real feedback rules.

## 5. What the pilot found in the app (not fixed here)

1. **Create a plan uses opening hours and parking, and little else.** The pilot's practical rules (no pushchairs in play areas, steep slopes, a toilet courtyard closed on Mondays) and the Natural History Museum's closure tomorrow do not reach the plan. Date-specific closures are text only.
2. **"Good to know" notes appear on Home deck cards, not on Venue Detail.** The most decision-relevant practical fact in the pilot (Discover's pushchair rule) has no place on Venue Detail. The pushchair rating's wording ("Mixed, some steps") would misdescribe it, so the rule is stored as a note and the rating left unknown.
3. **Provider hours can be wrong where the venue's own page is right**: London Zoo (closes at 4pm from 24 October, provider says 5pm), Mudchute (provider says Monday closed, the farm says every day), Gunnersbury (provider says the park is open 24 hours). There is no claim type for official hours.
4. **The price model cannot hold day-type tiers**, so London Zoo's price is held rather than shown wrongly.
5. **Extraction fidelity.** Discover's ticket amounts were in the production pipeline's 26 September reading but not in today's text from the pilot reader. The cause is not established; the old figure is carried and flagged.
6. **Fixture faults found and fixed during the work** (test infrastructure only): a built-in test venue shared the Horniman's id and hid it, and a generic trust panel was seeded for every venue. Both would have shown invented facts for real venues.

## 6. Human review

85 items need a person across the ten venues (1.2 to 5.2 minutes each, modelled as 26 minutes in all). Every item shows the sentence, URL, reading date, proposed meaning and reasons, and records approve, reject or unknown to an audit trail. The review page is published (private) with a timer per card. **The time is estimated, not measured**: only a person using the page produces a real figure. The largest reason bucket (26 items) is gate tuning, not a finding, and could shrink once wording is pinned by tests.

## 7. Scaling to 50

Per venue, measured in this pilot: about 7 to 9 pages read (no cost beyond runner minutes), 19 facts, 8.5 items for a person, one reading pass and one small gap pass. Authoring and correcting cost roughly 40 to 60 thousand model tokens a venue including re-reads.

| For 40 more venues | Estimate |
|---|---|
| Reading on the runner | about 400 requests, under an hour of runner time; no Google call |
| Facts and review items | about 780 facts, about 340 items for a person |
| Human review | about 2 to 5 hours in total (modelled at about 19 seconds an item, two to three times that if every source is opened); not measured |
| Authoring effort | about 2 to 2.5 million model tokens, plus one session to calibrate the gate |
| Refresh | facility facts expire in 30 days; a re-read shows by page hash which sentences changed, so only changed sentences go to a person |
| Thin, refused or price-hiding sources | 3 of the 10 here (one refusal, two hidden prices); expect a similar share. The answer is another official source or an open-data layer, not a workaround |

Not done in the pilot and cheap to add: downloadable maps and PDFs (listed, not read, by the bounded rule); an open-data layer (OpenStreetMap) for park facilities where official pages are thin.

## 8. Status of recovery and Google controls

- Merged to main: #181 (detector), #185, #186 (pricing), #183 (Excellent evidence, now with "Easy visit"). Main is `b74a4c8`. #184 stays unmerged. #187 (Step 1 gate, docs only) is open.
- **Step 1 has not been run.** It still waits for your explicit approval (21 venues, stored text only, no crawler, model or Google).
- **Google photos are not yet switched off.** I cannot change Vercel from here. Set `GOOGLE_PLACES_PHOTOS_ENABLED=false` for Production and Preview, redeploy, then run the live-canaries workflow on main with fail-closed assertion, the production posture, client-config verification and photos expected off. Photos will not be called off until that run passes.

## 9. Actions that need your explicit approval

1. Step 1 re-extraction of the 21 stored venues (the command is in #187).
2. The Google photos switch in Vercel and the redeploy.
3. Publishing any pilot fact as a production claim (46 would pass the gate with no person; 73 if all proposals are approved). Nothing is scripted to run; it needs a decision on the review queue first.
4. Merging #189, which adds reviewed activity and admission entries to shipped data. They are marked "proposed, awaiting a person" and the PR stays draft until the queue is decided.
5. Whether to tune the gate (section 6) and whether to widen two test wordings (see the PR).

## Reproduce

```
node familypilot/scripts/pilot/build-profiles.cjs --pages <pages.json>[,<gap.json>]   # stops if any sentence is not on its page
node familypilot/scripts/pilot/readiness-report.cjs --json docs/pilot/readiness.json
node familypilot/scripts/pilot/review-queue.cjs --out docs/pilot/review-queue.json
node familypilot/scripts/pilot/build-pilot-fixture.cjs --layer-a <local provider file> --out <dir>
FIXTURE_SCENARIO=pilot PILOT_FIXTURE=<dir>/pilot-after.json node familypilot/scripts/serve-places-fixture.mjs <port> <dist>
node familypilot/scripts/verify-pilot-journey.mjs http://127.0.0.1:<port> <out> after
```

The provider file (names, coordinates, hours) is provider content and is never committed.
