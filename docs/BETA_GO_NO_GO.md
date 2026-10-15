# 20-family beta: go / no-go checklist

15 October 2026. One page, to be ticked on the day. **Go** means every row in sections A to H is ticked; one unticked row in A, B, G or H is a no-go; an unticked row in C to F is a known limitation to state to the families, not a stop. Nothing here is ticked yet: the product owner ticks the iPhone and account rows; I tick the production rows and record the evidence beside them.

Who the families are told the product is: *London days out, parks, museums and attractions from open sources; practical fit (distance, routines, facilities we have read) rather than activity-specific; no prices yet; soft play thin until the follow-on release.*

## A. Production deployment (I tick, with evidence)

- [ ] Tranche A activated and merged with the product owner's name, from `release/tranche-a-rc` (`RELEASE_CANDIDATE.md`), after their written approval of the final batch.
- [ ] Production `/api/places/search?intent=catalogue…` returns independent places; a venue page shows "Contains OS data © Crown copyright and database right 2026"; zero Google requests in the runner check.
- [ ] Rollback target recorded (previous production deployment id and `main` commit) before each merge.
- [ ] Google retention migration applied and verified, or explicitly deferred by the product owner (`docs/GOOGLE_RETENTION_SQL_APPROVAL.md`).
- [ ] Vercel: no deployment refusal in the last 24 hours; pushes batched (#222 merged).
- [ ] Photographs: new paid photograph calls off or capped, as decided on 7 October (`GOOGLE_PHOTO_SPEND_VERIFICATION.md`); the daily ledger shows no unexplained spend.

## B. Real-iPhone test (product owner, own account, production)

- [ ] Fresh install or cleared data: onboarding to Home in under two minutes; nothing optional is invented.
- [ ] Home shows places; the first card arrives within a few seconds on Wi-Fi and within about ten on 4G (the known slow-network limit is 9 to 10 s cold).
- [ ] Explore (#203): Nearby with 2 / 5 / 10 miles; Search all; the category chips; the honest filters (a filter that hides places says how many); List and Map (independently located places only); the empty and low-coverage states read correctly.
- [ ] A venue: name, the credit line, "not yet checked" where we hold nothing, no invented hours, facilities or prices; the website link opens.
- [ ] Create a plan from a venue: leave and arrive times, routines respected, the plan reopens from Plans.
- [ ] Saved: save a place and a day; close the app; reopen; both are there.
- [ ] Larger text (Settings > Accessibility, largest non-accessibility size): nothing clipped on Home, Explore, a venue, a plan.
- [ ] Airplane mode on Explore: "Couldn't load" with Try again, never an example venue (#223); switch it off, Try again recovers.
- [ ] Rotate and background the app mid-load; nothing reverts.

## C. Two separate family accounts (product owner, on a computer, two inboxes; `docs/PRODUCTION_CANARY.md` sections 1 to 6)

- [ ] Sign up A and B with the normal flow; confirmation emails arrive within 3 minutes (if not, stop: SMTP is your decision).
- [ ] A invites B; B accepts; both see Connected, neither sees the other's children's details beyond what the privacy model allows (`docs/PRIVACY_MODEL.md`, "Connected Families").
- [ ] Meet halfway between A and B: a list between the two areas; Plan this day; the plan carries the date and arrival time.
- [ ] A shares a plan with B; B opens it; B's copy shows the same stops and times; A's edit does not silently change B's copy.
- [ ] Sign out and in on A: profile, saved places and plans intact.
- [ ] Cleanup per the canary document; the genuine users untouched.

## D. Saved places across the cutover (#220)

- [ ] Before activation: save a Google-sourced place and build a day from it on your iPhone.
- [ ] After activation: Saved shows "has a new listing" under it; the sheet proposes the real successor; declining changes nothing; confirming repoints the place and the day, the day's itinerary unchanged; a place with no successor says so and keeps its details.
- [ ] No saved data is changed without a tap (checked in `verify-saved-reconnect.mjs` and `verify-independent-reconnect.mjs`, 52 checks).

## E. Error handling

- [ ] Service down: Explore and Home show an honest error with retry, never demo venues (#223); the venue page distinguishes "not found" from "our lookup failed".
- [ ] Catalogue outage on Saved: no reconnect line, nothing said to be "gone".
- [ ] A link to a venue that does not exist: "Place not found" and a way back.

## F. Privacy

- [ ] The About screen names the sources and licences (OS, Wikidata, FSA when Tranche C ships, OSM notice ready).
- [ ] No child's date of birth, no home position and no device position leaves the device except as the privacy model states; the catalogue read sends a venue's position, never the home.
- [ ] Public read of `place_records` closed (the retention migration), or the exposure is accepted in writing for the trial.

## G. Approvals on record (written, from the product owner)

- [ ] Tranche A final batch, with any reversals, and the reviewer name to write.
- [ ] #203 Explore merge. · [ ] #220 Saved reconnect merge. · [ ] #223 Outage honesty merge. · [ ] #201 Optional Lunch merge (optional for the trial).
- [ ] Retention migration: "approve the migration", or deferred.
- [ ] Tranche C (soft play) as a follow-on, or deferred.

## H. What the families are told (so nothing is oversold)

- [ ] Coverage: parks, museums, attractions, a few zoos and farms; thin for activities and soft play until the follow-on.
- [ ] No prices; fit is practical, not activity-specific.
- [ ] How to report a wrong fact (the parent-report path on a venue page).

## Known limitations going in (state them; not stops)

Slow-network first load 9 to 10 s cold; 59 previously held venues without a successor until Tranche C; Explore outage fallback replaced only once #223 merges; photographs as decided in October; the two-account canary has never been run against production.
