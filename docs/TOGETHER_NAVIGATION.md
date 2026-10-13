# Five tabs: Together

**Not merged, not deployed.** This is the navigation change approved after the review in `docs/NAVIGATION_REVIEW.md`, drawn on Figma
page "09 — Navigation & App Flow Review" (`366:2`). It sits on its own branch (`feat/five-tab-together`), after #198. No data, API,
privacy, ranking, scoring, Family Fit or Google-call change; nothing under `api/`, `server/`, migrations or env files.

## What changed

- **Five tabs: Home · Explore · Together · Plans · Profile.** Together is one tab with two views behind a switch at its top:
  **Meet halfway** (the screen that was the Halfway tab) and **Your families** (the screen that was the Families tab). Both are the
  same code as before, moved into `src/components/together/` and drawn under one title and one switch. No extra menu screen.
- **Which view opens.** A link that names a view opens it. Otherwise **Meet halfway** when there is a family to meet (connected, or
  added by postcode on this phone), because that is the job parents come back for, and **Your families** when there is nobody.
  Decided once, when the account's connections are known; it never moves under a parent afterwards. Meet halfway is one tap from
  anywhere when a family exists.
- **Old links keep working.** `/halfway` (and `/halfway?family=…`) lands on Meet halfway with that family chosen; `/families`
  lands on Your families. They are redirect routes outside the tab group, so no tab is drawn for them.
- **Back and tab selection.** Changing view (by the switch, or by "Meet halfway" on a family's card) updates the address in place
  and adds no history entry: one Back leaves Together to where the parent came from, however many times they switched, and the
  highlighted tab never moves (it used to jump from Families to Halfway). The tab keeps its place: leaving and returning finds the
  view that was left. A reload or a shared link opens the same view (`?view=`, `&family=`).
- **Local versus connected.** On this phone only is said in four places: the family's card ("On this phone only · not connected"),
  the line beside the day on Meet halfway ("· this phone only"), a note in the edit sheet ("can't see or receive a plan until you
  connect, under Your families"), and the invitation caption on the card ("Until they accept … plans stay on your phone"). A
  family on this phone is never listed under Connected, and Save & send is only offered for a connected family (unchanged).
- **A first visit to Your families** (nobody connected, nothing on this phone, nothing waiting) follows the approved frame: "Plan
  days out with friends", **Invite a family** (only with an account) and **Add a family by postcode** side by side, and a line that
  says inviting needs an account and a postcode family stays on the phone.
- **The bar.** 62 × 66 pt tabs in the same 314 pt pill, 11 pt labels (they were 51 × 66 and 10 pt). The Together glyph is the
  two-people glyph Families had, in both approved frame styles; the Halfway glyph is gone.
- **Touch targets.** The audit now covers Your families, and found the family cards' small buttons drawing 40 to 42 pt. They are
  44 pt (this view only; the shared Button component is untouched).

Screenshots are in `docs/together-navigation/`. `04-first-visit.png` is the build **without accounts** (the plain fixture), so it shows
only Add a family by postcode; the two-button form with **Invite a family** needs a signed-in account and was not captured, though
the two-account scripts exercise the Invite path from the same section.

## Deviations from the Figma frames (said, not hidden)

- Your families keeps the existing single card with "Connected" and "On this phone only" headings, not one card per group, and
  "Invite to connect" is the existing outlined button under a local family, not the filled one in the frame. The content, the
  actions and the order within a card are the existing ones; I did not redesign them.
- The first-visit card also says a family you invite sees only what they agree to share (the consent line the old intro carried).
- At larger text the "Together" title steps down one size, so the pinned title and switch leave more of a small phone to the view.

## Evidence (fixture data, a real browser, the exported bundle; final code)

Results are in the pull request description. Each of these was run on the final code, and each is a script in `familypilot/scripts/`:

| Check | Script |
|---|---|
| Five tabs 62 × 66, 11 pt labels whole, bar on screen at 320, 360, 375, 393, 430 pt; which view opens; switch; no history entry; family card stays in Together; old links; Back; tab selection; local note | `verify-together-tabs.mjs` |
| Title, switch, Your families (two families on the phone), first visit and Meet halfway at 1.35, 1.9, 2.35 on 393 × 852 and 375 × 667 | `verify-together-large-text.mjs` |
| Meet halfway at larger text (CI) | `verify-halfway-large-text.mjs` |
| The #197 screens at 1.9, compared with `main` | `verify-release-large-text.mjs` |
| Accessibility audit, 320 to 430 pt, now including Together's Your families and first visit | `audit-accessibility.mjs` |
| Navigation clearance | `verify-nav-clearance.mjs` |
| Two real handlers, two accounts: connect, Meet halfway inside Together, Plan this day, Save & send, accept, Invite to connect | `verify-shared-outing.mjs`, `verify-account-journey.mjs` |
| Plan, journey and persistence regressions | `verify-halfway-handoff`, `verify-release-journeys`, `verify-timeline-persistence`, `verify-create-plan-journey`, `verify-product-coherence`, `verify-halfway-real-catalogue` |
| The checks CI runs against the locked Home frame and plan screens | `verify-home-against-figma` (pill now 314 × 66 with five 62 pt tabs), `compare-home-to-figma`, `verify-deck-gesture`, `verify-plan-screens-against-design`, `audit-journey-phase2`, `verify-onboarding-flow` |

The privacy test (`meet-halfway-privacy.test.ts`) reads the moved Meet halfway view, so the rule that the other family's data is
used but never read back still holds on the same file contents.

## Not verified

- **A real device.** Nothing here is a device test: the larger-text runs scale text in a browser (`scripts/lib/large-text.mjs`), not
  Dynamic Type; VoiceOver is not tested; the switch and the tab bar need a thumb on a real iPhone, including a small one.
- **Two real production accounts.** The two-account runs use the in-memory fixture with the real handlers; production Supabase,
  the real email flow and row-level policies are still the canary's job (`docs/PRODUCTION_CANARY.md`, which also lists section 10
  for after this ships). The canary on the deployed build is still outstanding.
- **Parents.** The label "Together" is the approved name, not a tested one. `docs/TOGETHER_LABEL_TEST.md` is a ready-to-run test of
  Together against Friends and Meet up; it has not been run and there are no results.
