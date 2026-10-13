# iPhone review: journey corrections

Evidence: a real-iPhone review of Meet halfway → Create a plan. The recording itself was not available to me, so each report was reproduced in the running app from the description and traced through the code. Every defect below fails on `main` (e3920be) and passes with the fix: `scripts/verify-halfway-handoff.mjs` (7 failures before, none after) and `src/__tests__/iphone-journey-corrections.test.ts` (17 tests).

## 1. "Tuesday 13 October, arrive 14:30 on Meet halfway; the plan says Saturday 17 October"

**Root cause: the day was lost on one of the two ways on from a place.** "Plan this day" sent the date, the arrival and who is coming to the plan. "See the place" (Details) did not, so Venue Detail's Create a plan sheet opened on its own default: a day remembered from an earlier plan (a Saturday the parent had once chosen, kept as "your usual day" while it is still in the future), at the usual 10:00, with the other family not selected. Meet halfway, the sheet and the plan each held their own date, arrival and family.

**Fix:** Meet halfway builds one set of route parameters and both ways on from a place carry it. Venue Detail opens the sheet on them, says "Tue 13 Oct · arrive 14:35 · with Emma's family" above the pinned button, and never remembers an outing's day as the next default. The same screen reached any other way is unchanged.

## 2. "Lunch after 4pm"

**Root cause:** a lunch was added to every day that had a place to eat nearby, whatever the hour. Arrival 14:35 and a 90 minute visit put lunch at 16:21 (it is the sequencer's job to order the day, not to decide whether a meal belongs in it).

**Fix:** `meal-window.ts`: a default lunch must start between 10:30 and 14:00, counted from the arrival, the visit length and a 10 minute hop. A day it cannot fit is built without one and the plan says so ("Lunch isn't added: with this arrival and visit it would start around 16:15, which is late for lunch. You can add one below."). "Add a 45-minute lunch" is still one tap, and a lunch the parent adds is kept whatever the hour and survives editing the saved day. All-day visits are unchanged. No venue, time or food suggestion is invented.

## 3. "Families shows no connected families, Meet halfway plans with Emma's family"

**Traced to two causes, both real:**
1. *Intentional distinction, poorly said.* A family added by postcode is on this phone only. Meet halfway offers it; Families listed it under "Connected families" with a small "not connected" line and, on an account, no sentence at all saying nobody is connected.
2. *A genuine inconsistency.* Meet halfway also offered a stored copy of a connection (`connected-…`) that the account no longer lists (the other family disconnected, or a different account); Families never showed it.

**Fix:** one rule (`family-visibility.ts`) for who exists, used by both screens. A stored connection copy the account no longer lists is hidden from both (kept on the phone, not deleted); where the account cannot be asked it is shown as "From a connection · can't be checked right now". With no connected family Families says: "No families are connected yet. The families below are on this phone only: you entered where they set off from, so they can't see or receive anything. Invite a family to connect with them."

## Checks

Unit suite, both `tsc` configs, and the browser journeys (release journeys A and B, timeline persistence, create-a-plan 157/157, product coherence, navigation clearance, accessibility audit, Halfway on real catalogue rows, the two-account shared outing and account journey) all pass on the final code. No Google call is made or added; ranking, scoring, privacy and Family Fit are untouched.

Figma proposals for the broader journey: page "08 — iPhone journey corrections (proposals)" in the design file.

## Approved refinements (after the iPhone review)

- **"Not yet reviewed" once.** Where the *place* has not been reviewed for families, neither family can be graded, so the collapsed card and the list show one chip ("You & Emma's · Not yet reviewed") and Details shows one card ("We haven't reviewed this place for families yet … neither family is graded"), still listing your own family's confirmed facts and what is not checked yet. Nothing about the other family is shown as confirmed or checked. Reviewed places keep a grade per family, as before.
- **Invite to connect** on a family stored only on this phone: the existing single-use invitation link and consent (routines are not shared; nothing is shared until they accept), shown under that family's card. Needs an account. Connected families do not have it. "On this phone only · not connected" is now amber.
- **Change** on the outing line above the venue's action (opens the Create a plan sheet in place, this place kept) and on the plan ("Change the day, arrival or who's coming": back to the sheet at the same place with the same answers, and the chosen lunch kept). Changing the outing is not remembered as the next default; only what the parent changes is.
- **"Plan this day"** is the venue's action when you arrive from an active Meet halfway outing; ordinary browsing keeps "Create a plan".
- **Lunch-first planning:** deferred, as decided.

Checks: `approved-refinements.test.ts` (12 tests); `verify-halfway-handoff.mjs` (CTA label, Change, plan Change, one "not yet reviewed", ordinary browsing); `verify-shared-outing.mjs` (Invite to connect on the real invitation handler); `verify-halfway-real-catalogue.mjs` updated for the combined chip and card.
