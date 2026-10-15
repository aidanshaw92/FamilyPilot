# 20-family beta: go / no-go checklist

15 October 2026. One page, to be ticked on the day. **Go** means every row in sections A to G is ticked. **Any unticked row in A to G is a NO-GO**: in particular an unsuccessful sign-up, invitation, plan-sharing, account-isolation or privacy test stops the release until it is fixed and re-run. Section H lists the limitations that are disclosed to the families; they are not release gates. Nothing here is ticked yet: the product owner ticks the iPhone and account rows; I tick the production rows and record the evidence beside them.

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

## C. Two separate family accounts: a release gate (product owner, on a computer, two inboxes; `docs/PRODUCTION_CANARY.md` sections 1 to 6)

- [ ] Sign up A and B with the normal flow; confirmation emails arrive within 3 minutes (if not, stop: SMTP is your decision).
- [ ] A invites B; B accepts; both see Connected.
- [ ] **Account isolation:** signed in as B, nothing of A's is reachable except what the connection carries (area, ages, pushchair, routines; never names of children, dates of birth, home position or saved places), per `docs/PRIVACY_MODEL.md` "Connected Families"; A's plans and saved places do not appear on B.
- [ ] Signed out, no screen shows either family's data; a stale deep link to a plan asks for sign-in rather than showing the plan.
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

## F. Privacy: a release gate

- [ ] The About screen names the sources and licences (OS, Wikidata, FSA when Tranche C ships, OSM notice ready).
- [ ] No child's date of birth, no home position and no device position leaves the device except as the privacy model states; the catalogue read sends a venue's position, never the home.
- [ ] Public read of `place_records` closed (the retention migration), or the exposure is accepted in writing for the trial.
- [ ] The privacy wording shown to the parent (profile and invitation screens) matches what the app does.

## G. Approvals on record (written, from the product owner)

- [ ] Tranche A final batch, with any reversals, and the reviewer name to write.
- [ ] #203 Explore merge. · [ ] #220 Saved reconnect merge. · [ ] #223 Outage honesty merge. · [ ] #201 Optional Lunch merge (optional for the trial).
- [ ] Retention migration: "approve the migration", or deferred.
- [ ] Tranche C (soft play) as a follow-on, or deferred.

## H. Disclosed limitations: what the families are told (not gates)

- Coverage: parks, museums, attractions, a few zoos and farms; **soft play and activities thin** until the follow-on release (59 previously held venues have no Tranche A successor).
- **Venue facilities are unverified unless the venue page says they were read**: toilets, baby changing, parking and step-free access show as "not recorded" otherwise; no prices; fit is practical, not activity-specific.
- **The first load on a slow connection takes 9 to 10 seconds**; repeat visits are fast.
- How to report a wrong fact (the parent-report path on a venue page).
