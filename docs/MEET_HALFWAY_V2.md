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

### Known, deliberate residue (needs a decision, not changed)

The existing "needs checking" sentence ("Toilets isn’t confirmed at X, and Kevin’s family needs it. Check before you go") names a must-have that the other family chose to share. It is the pre-existing, shipped wording, built from a field the connection already receives, and it is what makes the warning actionable, so it was kept. If a must-have such as Blue Badge parking is judged too sensitive to name, the engine's `needsChecking` sentence is the one place to change.

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

Screenshots, taken at iPhone sizes with real safe-area insets and compared to the Figma frames, are in `docs/meet-halfway-v2/` (`figma-vs-implementation/` side by side; `iphone-sizes/` at 360, 375, 393 and 430). `scripts/capture-halfway-v2.mjs` regenerates them (`STATES=1` for the state boards).

Known visible differences from the frames, all deliberate and listed above: no status bar in a browser capture; the other family's card is a grade and one generic sentence; no "Tomorrow" chip; place names and green spaces are not drawn; the edit sheet's *Done* sits above the navigation; the stored real data gives "Not yet reviewed" where the frame shows "Good fit".

**The real two-account production canary for PR #195 is still outstanding and must pass before this is released. A fixture run is not a substitute for it.**
