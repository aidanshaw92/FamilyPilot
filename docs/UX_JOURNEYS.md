# UX journeys: audit, what changed, evidence

Branch `feat/ux-journeys-p0` (stacked on `feat/meet-halfway-v2`, PR #196). Nothing here is merged or deployed. Everything below was
checked in the running app (a real browser against the exported bundle and the in-memory account fixture, which runs the real
`plan-invites` handler), not only in unit tests. What the fixture cannot show is listed under *Not yet proven*.

## 1. The five journeys, audited

| # | Journey | Before | Verdict |
|---|---------|--------|---------|
| 1 | Open, find somewhere, create a plan | Home card, Venue, scroll to *Create a plan* (y 730–862 on the test phones: on screen only on tall viewports, below the fold with browser chrome), sheet with four rows, Build | Works. The action was easy to miss and *How long* asked a question most parents cannot answer |
| 2 | Return and resume | Home → Plans tab → *Saved plans* chip → plan. Home never mentioned a plan or an invitation | Weak: three steps, and Home ignored what was in motion |
| 3 | Find a place to meet another family, plan it, send it | Meet halfway → *Plan this day* → Plan screen → **no way to send it** | **Dead end (verified live and in code)**: the invitation path only carried the older saved-plan shape |
| 4 | Receive, review, accept | Only invitations for older-format plans existed, in a second list | Broken for any new plan |
| 5 | Why is this place (un)suitable | Badge, *Family Fit* panel, *Today*, essentials | Good. One duplication left (see 5) |

## 2. P0: sending a Meet Halfway plan (fixed and verified)

**Root cause.** `plan-invites` stores an opaque `plan_snapshot`, but the app only ever wrote the legacy `SavedPlan`/`PlanMatch`
shape into it, and the Plan screen had no send action for the new `SavedDay`. A plan made with a connected family could be saved,
never sent.

**Fix, with no migration and no API change.** `src/services/planning/shared-day.ts` builds a *shared day*: the saved day with the
sender's private detail removed (notes, routines and routine reasons, return-home times, images, alternatives, non-venue unknowns;
the other family's unmet must-haves become a neutral "something their family needs isn't confirmed") plus the legacy `PlanMatch`
fields, so an older client still reads it. The recipient re-reads it from their own side (`reframeForRecipient`: they are "Our
family", the sender is the connected family). Accepting saves it on the recipient's phone as their own plan.

- Plan screen: one primary action, **Save & send to Alex's family**, with **Save only** beneath it; after sending it says
  *Sent to Alex's family · waiting for a reply* and never offers a second send. A failed send keeps the plan saved, says to whom
  it did not go, and offers *Try again*.
- **Plans** is one list: Invitations (waiting on you, with Accept / Decline on the card), Coming up, Past, and the older plans
  kept as *Earlier plans*. Statuses are plain: *Sent to X · waiting for a reply*, *X accepted*, *X declined*, *From X · you're going*.
- The privacy rule from PR #196 holds: nothing is added to what a connection reveals, and the sender's detail is stripped before
  it is sent. The test below greps the recipient's screen and the server row for the sender's child's name, postcode, email, naps
  and needs.

**Evidence** (`scripts/verify-shared-outing.mjs`, 73 checks, all passing): two real accounts connect → Sam meets Alex halfway →
*Plan this day* → *Save & send* → Sam's Plans shows *waiting* → Alex's Plans and Home show the invitation → Alex reads the whole day
→ accepts → it is in Alex's Plans and survives a reload → Sam sees *accepted* → a second plan whose send fails is retried, then
declined → the server row holds no private detail and fits the 8000-character limit. Screenshots: `docs/ux-journeys/`.

## 3. P1

**Home leads with what is in motion.** One quiet row between the search and the recommendations: an invitation waiting for an
answer (it is the only thing blocked on the parent), otherwise the next plan, with its status. With neither, Home is exactly what
it was. It reads only what the phone already holds and the account's own invitation list: no place provider call, none at all
without an account. On a short phone (Home's compact mode) it is one line, and the recommendation sits one scroll lower, still
clear of the navigation (checked at 360×640).

**Create a plan, pinned on Venue.** *Create a plan* is pinned under the page: on the first screen at every height, never scrolled
past. Same pill, same sheet.

**Create a plan sheet, simpler.** *How long* opens as one line, "We'll work it out from the place and your routines, and tell you
what we assumed", with *Change*; every choice (Not sure, 1 hour … All day, Custom) is still there behind it. A length already
chosen opens showing the choices. Six chips and the custom field are gone from the first view.

### Interaction counts (taps from Home, measured in the app)

| Journey | Before | After |
|---------|--------|-------|
| Resume a plan | 3 (Plans → *Saved plans* → plan) | 1 (Home card), or 2 (Plans → plan) |
| Plan and send a day with another family | impossible | 3 from the Halfway tab (tab → *Plan this day* → *Save & send*) |
| Answer an invitation | impossible for new plans | 2 (Home card → *Accept*) or 1 (*Accept* on the Plans card) |
| Create a plan from a place | 3 + a scroll on short screens | 3, no scroll; one fewer decision shown |

## 4. P2: Together (five tabs) or an improved six?

I tried to prove the merge and could not. Evidence from the app:

- With one connected family, the **Halfway tab is one tap from anywhere to a result with *Plan this day* on screen**
  (`docs/ux-journeys/halfway-tab-one-tap.png`), so *plan and send* is 3 taps. A merged *Together* tab needs a segment switch
  first, so 4, unless it defaults to the map, in which case it is the Halfway tab with a different name.
- Families (who I plan with, what I share, invitations) and Halfway (where do we meet) are two jobs: one is managed rarely, the
  other is used for every outing. Joining them puts the rare job in front of the frequent one.
- Six labelled tabs fit without clipping from 320 to 430pt including the larger-text checks (126 in PR #196, the navigation
  clearance script at 360×640, the accessibility audit). Space is not the constraint a merge would solve.
- The cross-links already exist: *Meet halfway* on a family in Families opens the same screen with that family chosen.

**Decision: keep six tabs and improve them** (Plans now one list, Home resumes, the Plans tab no longer hides plans behind a
chip). The broader navigation redesign is not started. Hypothesis for real parents: *do they find Halfway without a label that
explains it?* A five-parent test with the task "arrange an outing with your friend" would settle it.

## 5. Challenge to my own 14 recommendations (what changed my mind)

- **Done as proposed:** sending a plan (P0), Plans consolidation, Home resume, pinned Venue action.
- **Done smaller:** Create a plan. I proposed When/Arrive/Who only; I collapsed *How long* only. The assumption line already
  exists and is honest, and removing the question outright would remove a control parents of toddlers use.
- **Not done, and why:**
  - *Standardise Family Fit wording* — the audit found the scale, labels and verdicts already come from one module
    (`family-match-scale.ts`, `family-match-classification.ts`) and read the same on Home, Explore and Venue ("Excellent for Mia
    and Leo"). The one real duplication is on Venue: the badge and the *Family Fit* panel heading say the same words. Merging them
    touches the approved Family Fit card and the scoring display, so it needs your call.
  - *Fewer duplicate search controls* — Home's search is a button that opens Explore (no second input); I found no duplicate to
    remove without a design decision.
- **Downgraded:** Together tab (see 4).

## 6. Regression checks (all against the built app)

Unit: 219 files, 3,655 tests. `tsc` clean on both configs. Browser: shared outing (all), account journey (all), timeline
persistence (all), navigation clearance (42/42), accessibility audit (clean, 320–430), Halfway real-catalogue (all),
create-a-plan journey (149/157; the 8 failures are the same stale text expectations on the unmodified base: "Stop 1 … Head home" and
"Not confirmed" for parking; the new *How long* check fails on the base and passes here), product coherence (8 failures, all the old
Profile *Connected families* expectations, which moved to Families earlier; the venue-order check was updated to say the action is
pinned in view).

## 7. Not yet proven

- The **real two-account production canary** for plan invitations (accounts are refused on preview deployments): the whole
  journey is proven against the real handler on an in-memory database, not on production Supabase.
- **Real parents.** All wording is mine. Hypotheses: parents understand *waiting for a reply*; they find Halfway unaided; the
  one-line *How long* is trusted rather than ignored.
- A **real-device** large-text pass, and a real calendar hand-off from the invitation.
