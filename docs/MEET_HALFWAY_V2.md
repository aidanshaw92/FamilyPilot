# Meet halfway v2

The approved Figma v2 (file `LNpbdnuAWcfWf9spvB7jBz`, sections "v2 · Screens", "v2 · Real-world states", "v2 · Components") built in the app. This note is what was built, what was deliberately not, and the boundaries that hold it to the product's rules.

## What the screen is

- **Map first.** The on-device basemap fills the screen under the header and a collapsible sheet. Families are approximate areas (about 1.5 km across, on the ~1 km grid a connection already shares), places are numbered pins, the selected one is filled and named. No routes, no home pins, no provider, no tile request.
- **Collapsible recommendation sheet** (`src/components/halfway/Sheet.tsx`). Collapsed: the engine's own label ("Promising option · 2 things to check"), the place, a Family Fit chip per family, the journeys, *Plan this day* and *Details*. Expanded (Details, a swipe up, or the grabber): the photo or the labelled illustration, journeys, Family Fit for each family, what to check before you go, with the actions pinned above the navigation.
- **List** (`ListCard.tsx`): the same places in the same order as the pins. Tapping a card selects it and shows it on the map.
- **Edit meeting details** (`EditSheet.tsx`): who, when (the existing quick choices, a date picker, arrival time), indoor/outdoor, read-only starting points (to the district), and rows linking to the existing profile editors. Places update as you change them.
- Nine states from the Figma board: missing starting point, nobody chosen (add by postcode), loading (areas on the map, skeleton sheet), no suitable places (the engine's own counts, "Start at HH:MM" / "Change day or time"), load failed with *Try again*, fallback to Home's places (amber banner), card states (not reviewed, needs checking, not recommended), long names and large text (list card reflows to one column from a 1.35 font scale), a journey estimate that is missing (defensive: dashed bar, "not worked out yet", no fairness claimed).

## What did not change

- **Ranking.** `meetHalfway`'s score formula, order and exclusions are untouched (`ranking-golden.test.ts`, `meet-halfway.test.ts`, `meet-halfway-catalogue.test.ts` pass unmodified). The new `fits` and `otherNotes` fields are read by nothing in the score.
- **Candidates.** Still the stored catalogue between the two homes (`useBetweenVenues`, `googleCalls: 0`), Home's list only as the labelled fallback.
- **Journeys** are still "about N min", estimated from distance. No route is requested or drawn.
- **Spend.** No new request of any kind. Photos go through the existing `VenueImage` (a real photo only where the existing provider/spend rules already allow it, otherwise the labelled category illustration). No Google photo spend, no new paid API, no migration, no production configuration.
- Six-tab navigation, Family Fit grading, the RAF Museum planning fixes, Supabase privacy controls, consent defaults and what a connection shares are untouched.

## Family Fit for both families, and the privacy boundary

`HalfwayOption.fits = { mine, other }`:

- **mine** is your own `venue.familyMatch` (your profile, your children by name, your evidence). It carries your evidence completeness ("3 of 7 details confirmed", "Not yet: …").
- **other** is computed by the engine as before, from `sharedProfile(other)`: only what their connection explicitly shared (ages, must-haves, pushchair, drive limit, budget). What leaves the engine for them is `{ verdict, label, qualified }`: a grade and a generic label. Nothing else:
  - no evidence completeness and no "not yet checked" list (it would reveal whether they have a baby or use a buggy),
  - no per-child wording, no easy-visit wording, no ages, no needs, no routines,
  - the words under the chip say only that the grade rests on what they chose to share ("Based only on what Kevin’s family chose to share. Nothing else is shown or known about them.").
- **Not assessed.** When they shared no ages, no must-haves and no pushchair, the chip says "Not assessed" and the sheet says only their journey is checked. A grade is never invented.
- **Sentences about what they shared** (their Family Fit and their routines) stay in `toCheck` for the Plan screen, but are collected in `otherNotes` and left off the Meet halfway card and sheet (`checksToShow`).
- **Starting points** are shown with `coarseArea` (the same word a connection is shown: a postcode district or a place name, never an inward code or street).

Tests: `meet-halfway-fits.test.ts` (grade-only shape, "Not assessed", forbidden words, `otherNotes`), `halfway-view.test.ts` (every verdict's words contain no age, need, routine, number or child), plus the browser check `verify-halfway-real-catalogue.mjs` (other family shares ages, toilets and a pushchair; none of it appears on the Family Fit card).

### What the viewer is allowed to read back about the other family (PR #196, third round)

The earlier "known, deliberate residue" is closed. The "needs checking" sentence used to read "Toilets isn’t confirmed at X, and Kevin’s family needs it", and the Plan screen's equivalent could say that a place was not step-free for a wheelchair or that a nap would clash with Kevin’s family’s routine. Each is a must-have, an age or a routine that the other family shared **so the engine can use it**, read back to the person it was not shared **with**.

**Root cause.** One value served two purposes. The other family's shared requirements legitimately feed the *calculation* (they rank a place, rule it out, move the start time, grade the other family's fit). But the same value was also used to *word the explanation* shown to the viewer: the label of the requirement, the child's age, the routine, the mobility need.

**The boundary now.** Two roles, kept apart in `meet-halfway.ts`:

| | May influence the result | May be shown to the viewer |
|---|---|---|
| The viewer's own requirements, children, routines | yes | yes, specifically |
| The other family's must-haves, ages, routines, pushchair, drive limit | **yes** (ranking, exclusion, the other family's grade, the start time) | **no**: only that something they need is unconfirmed, or that a time had to be planned around, and never what |

- `viewerSafe` rewrites everything unresolved about the other family before it leaves the engine: the requirement's label becomes "a requirement". The sentence is "Something Kevin’s family needs isn’t confirmed at X. Check before you go".
- Ages, routines and the other family's fit sentences are neutral for the viewer, and the specific sentences are collected in `otherNotes` (never rendered).
- The other family's grade is `{ verdict, label, qualified }`; a "qualified" grade ("Likely good · check Ozzie") is shown to the viewer as the plain "Possible fit", since the qualifier would name a child.
- When what they shared is not enough to grade, the chip says "Not assessed".
- Plan (`plan-view-model.ts`, `create-plan.ts`): one neutral line per other family ("Some of what Kevin’s family needs isn’t confirmed…"), no label, no wheelchair or mobility sentence; a place that fails one of their needs says "{place} doesn’t meet something Kevin’s family needs".
- The legacy-routines note on the Meet halfway page is gone; the page no longer says whether they shared routines.
- **No consent change.** What a connection shares, and the consent text, are unchanged. Scoring, ranking and the Family Fit grading rules are unchanged (`ranking-golden.test.ts` passes unmodified).

**Surfaces covered.** Card and expanded sheet text, the chip, accessibility labels (`accessibilityLabel` of the chip, the journey rows, the needs block), the list card, the edit sheet, the Plan handoff and the Plan screen's checks. `src/__tests__/meet-halfway-privacy.test.ts` renders two households against the same five places, each seeing the other under three different sharing permissions (nothing shared; ages only; ages, must-haves, pushchair and routines), asserts that for the same place the viewer sees the same neutral words whichever the sharing, that none of the shared terms (the requirement names, ages, "wheelchair", "nap", the routine) appear in any string the engine hands the UI or the Plan view model, and that the UI sources never read `otherNotes`, the other family's `required` or `ages` for display.

## The map

- **Stable frame.** Previously the map re-fitted to the selected place on every selection (the visible jump). It now fits every place and both areas once, to the part of the drawing left visible between the header and the sheet (`inset`), so selecting only moves a highlight. Tested (`halfway-map.test.ts`) and checked in the browser (pin and area positions identical before and after a tap).
- **Crowded pins.** Stored places in one neighbourhood are often a few hundred metres apart, which is a few pixels on a map that holds both families. Pins closer than 26 px are nudged apart, never more than 24 px from where the place is, and every tap target stays at least 16 px and never overlaps another (the cards give the exact place).
- **Labels.** The selected place is named above its pin; two close area labels hang to either side instead of overprinting.
- **Areas only.** The loading, error and empty states draw the map with the two areas and no venue.
- **Attribution.** "Map: Natural Earth (public domain)" is drawn on the map, above the sheet. Place and photo credits are unchanged (`PlaceCredits`).
- **Static place-name and green-space layers: not added.** The design proposed about 30 place names and the major green spaces. The only licence-compliant source on hand is Natural Earth's populated places and parks layers (public domain), which are not in the repository, and the basemap build script (`build-london-basemap.mjs`) needs network access to fetch them that was not part of this change. They would not change what a parent can decide here, so the map stays as it was and the layers remain a candidate for later with a documented source.

## Honest limits

- **Large text.** React Native Web does not model the system font scale (`Dimensions.fontScale` is always 1), so the one-column reflow for large text (from 1.35) is verified by code and types, not by a rendered web screenshot. It needs a pass on a device with larger text on.
- **Map pins on a small phone** share a short band between the header and the sheet; below 820 pt tall the card is dense (smaller photo, journeys on a line) so the map keeps room, and tight clusters are nudged but still close.
- **Quick dates.** The edit sheet offers the existing quick choices (Today, the coming weekend day, Other date); the design's "Tomorrow" chip is not offered because the shared quick-choice model does not have it.
- **The edit sheet sits above the navigation** (its *Done* is pinned above the tab bar) rather than replacing it as in the frame, so nothing is hidden behind the tab bar.
- **The header** follows the approved v2 frame (title under the status bar, then the who/when selector) and so omits the brand row the other section pages draw.

## Review corrections (PR #196, second round)

1. **Edit meeting details is a focused modal.** The floating navigation is not drawn while the sheet is open (`chrome-store`, read by `FloatingTabBar`, set only by the edit sheet's open state, always cleared on close or unmount) and returns unchanged. The sheet is a column: a fixed header (grabber, title, 44 pt close), a content area that scrolls on its own, and *Done* with its helper text as a normal child beneath it, anchored above the home indicator. Nothing overlaps; the Longest journey row is reachable by scrolling. It lifts above the keyboard (`KeyboardAvoidingView`, iOS) so the postcode fields and *Done* are never under it.
2. **Map and sheet proportions.** The collapsed card is shorter: the Family Fit chips sit beside the photo (80 pt, as in the frame) when they fit, and under it, side by side, when their words are long; the photo, spacing and bottom padding are tightened. Everything stays: label, place, a chip per family, journeys, fairness, *Plan this day*, *Details*. The map gets the room.
3. **Pins.** Selecting never refits the map (unchanged). The selected place is a 40 pt filled pin, the others 30 pt outlined. Where several places sit on top of each other, the pins are spread apart (never by more than 40 px) and the place's real position is marked by a small dot joined to its pin by a hairline: the pin moves, never the place. Area labels and the selected place's name move to the side of their circle or pin that covers least; on a band too short to hold the name pill without hiding the map, the pill is left off and the sheet names the place.
4. **Card.** Chip words come from the engine; for your own family a grade that leaves a child to check says so in the engine's own short badge words ("Likely good · check Ozzie"); the other family's is never more than a generic word.
5. **Comparison method.** `scripts/capture-halfway-figma-match.mjs` renders the app with the inputs the approved frames were drawn from: 393x852, Saturday 17 Oct 10:00, you at NW3 with Sloane (3) and Ozzie (a baby in a buggy), Kevin's family at E8 (a child aged 2, toilets, a pushchair), and the five stored catalogue rows behind the frames (`scripts/fixtures/halfway-figma-places.json`, answered to the `between` lookup). The engine, grades and wording are the app's own. Before-and-after pairs with the Figma frame are in `docs/meet-halfway-v2/matched-fixtures/`, including 375x667 and 360x780 and the scrolled edit sheet showing the Longest journey row with no navigation.

Remaining data-driven differences from the frames (not layout): the engine grades the first place "Likely good · check Ozzie" for you where the frame says "Good fit" (it is honest about the baby); the fixture photo is a stock image where the frame has a grey placeholder; the clock fixture makes "Today" Saturday 17 Oct.

## Verification

Run locally against the fixture server (stored catalogue rows, no Google, no accounts) and the in-memory account fixture:

| Check | Result |
|---|---|
| `vitest run` (214 files) | 3588 passed |
| `tsc --noEmit` (both configs) | clean |
| Ranking golden, engine and catalogue suites, unmodified | pass |
| `verify-halfway-real-catalogue.mjs` (real stored rows, two guest families, Monday and Saturday) | all passed: pins match cards; selecting a pin or card does not move the map; sheet opens, scrolls, closes; indoor/outdoor and the other family change the answer; no child, age, need or pushchair on the other family's card; zero requests to Google or off the fixture origin |
| `verify-account-journey.mjs` (two accounts, connection, legacy share) | all passed |
| `audit-accessibility.mjs`, now including the four Meet halfway screens at 320/360/393/430 | clean (axe, 44 pt targets, names, focus, reading order, dialog containment, no sideways scroll at 320) |
| `audit-journey-phase2.mjs`, `verify-nav-clearance.mjs`, Home/Plan/onboarding/place-credit batteries | pass |
| `verify-product-coherence.mjs` | its Meet halfway checks pass; nine other checks fail identically on `main` (Profile no longer lists connected families; a Create a plan scroll-length check at 360x800), so they are not from this change |

Screenshots, taken at iPhone sizes with real safe-area insets and compared to the Figma frames, are in `docs/meet-halfway-v2/matched-fixtures/` (see the review corrections above). `scripts/capture-halfway-figma-match.mjs` regenerates them; `scripts/capture-halfway-v2.mjs` (`STATES=1`) renders the state boards.

Known visible differences from the frames, all deliberate and listed above: no status bar in a browser capture; the other family's card is a grade and one generic sentence; no "Tomorrow" chip; place names and green spaces are not drawn; the edit sheet's *Done* sits above the navigation; the stored real data gives "Not yet reviewed" where the frame shows "Good fit".

**The real two-account production canary for PR #195 is still outstanding and must pass before this is released. A fixture run is not a substitute for it.**
