# Approved canonical Figma frames

Figma file `LNpbdnuAWcfWf9spvB7jBz`, page `117:2` ("Screens"). These three frames are the owner-approved
visual specification for Welcome, Home and Explore. They specify **presentation** (geometry, hierarchy,
type, colour, imagery treatment, component appearance, iconography, decoration), **not content**: every
name, score, time, venue, photograph, count and avatar in them is an example and stays dynamic in the app.

| Screen | Canonical frame | Reference-vs-Figma board | Approved |
| --- | --- | --- | --- |
| Welcome | `166:128` APPROVED — Welcome (852 × 1846) | `176:138` | locked |
| Home | `229:133` APPROVED — Home (852 × 1846) | `269:133` | locked, after the mask-stacking comparison defect was corrected and re-reviewed |
| Explore | `294:133` APPROVED — Explore (853 × 1844) | `300:133` | locked |

Variation and robustness sheet (approved components with long names, no photograph, Family Fit
unavailable, unknown travel time, saved state): section `306:133`. It exists to show the approved design
degrades gracefully; it does not introduce any product state. The Family Fit and travel states in it are
the ones the product already has (see below).

## Reading the frames

* A frame is a 393 pt phone drawn at 2.168x, so **pt = Figma px ÷ 2.168**. Reference-hidden renders of the
  three frames are committed in `docs/figma-approved/*-393.png`, 852 px wide, and
  `familypilot/scripts/compare-canonical-screens.mjs` renders the app at 393 × 852 / 2.168x and diffs it
  against them.
* Each frame has a locked `REF` rectangle at the bottom (the owner's original reference image, used only
  for tracing and the 50% / difference review panels). The frames stand without it.
* The photographs inside the frames are **REFERENCE PHOTO — REVIEW ONLY** crops of the reference. They are
  not assets. The app takes Home and Explore photographs from the real venue photo pipeline and Welcome
  photographs from licensed production assets only (`src/assets/welcome-photos.ts`).
* Typography is normal Inter with no tracking, per the decision made for Welcome and Home (the references
  are tighter than Inter at the same width; that difference is accepted).
* Accepted differences: the photo-patch seam on Home's lower card, minor decorative-vector shapes, the third
  Explore card's fade and shadow. They are not to be pixel-tuned further.

## What the app must keep (never taken from a frame)

* Greeting by time of day and the user's name; avatar or its fallback.
* Search, filters, category chips, the recommendation deck and its gestures, save state, navigation.
* Family Fit comes from the existing Family Fit contract only: a calculated score is `★ n.n Family Fit`;
  an unreviewed place is the neutral "Not yet reviewed" status with no number; an unknown score renders
  nothing. There is no provisional, starred, dashed or partial score state.
* Travel time is worded by provenance (`about 12 min` estimated, `12 min` measured, `Travel time not
  worked out yet` when unknown).
* Required Google / OpenStreetMap / provider attribution stays wherever the reference omitted it.
* Privacy, provenance, routing and API-cost protections are untouched. Visual regression runs against the
  synthetic places fixture (`scripts/serve-places-fixture.mjs`) and spends nothing.

## Implementation record

Welcome, Home and Explore are implemented from these frames (not from the original screenshots).
`familypilot/scripts/compare-canonical-screens.mjs` renders the real app at 393 x 852 / 2.168x against the
frames; `docs/figma-approved/` holds the reference-hidden renders it compares to. Supported widths are 360,
393 and 430 (all three screens are captured at each).

How each screen reuses the frames: the decorative artwork is the frames' own vectors (`ScreenArt`); the Welcome
cut-outs are the frame's mask vectors (`PhotoSlot` + `WELCOME_CUTOUTS`); the benefit icons are its sprout,
people and sparkle vectors (`BenefitIcon`); the nav, chips, search, cards, Family Fit badge and type sizes take
their geometry from the frame measurements (pt = px / 2.168).

Boards (approved Figma | running app | 50% overlay | difference) for each screen, against both fixture scenarios,
are in `docs/figma-compare/` (`<screen>-<scenario>-board.jpg`), with the 360 and 430 renders beside them.
Regenerate with `scripts/compare-canonical-screens.mjs <baseUrl> <outDir> 360,393,430 <label>`; it also fails the
run if the page tried to reach Google, Overpass or any other live provider (it aborts those requests).

Two fixture scenarios exist, both synthetic and zero-spend (`scripts/serve-places-fixture.mjs`):

* `sparse` (default): fifteen unreviewed venues with flat-colour photographs. The locked Home composition and one
  honest robustness state. Every Family Fit reads "Not yet reviewed".
* `realistic` (`FIXTURE_SCENARIO=realistic`): the same ids with reviewed venues (confirmed facts, photographs,
  Family Fit), partial facts, a missing photograph, an unreviewed venue, an over-long name and a reviewed
  negative. Photographs are generated scene images, not photographs of anything.

Differences between the real app and the frames, classified:

1. **Dynamic content** — names, scores, Family Fit states, journey times, photographs, facts, the avatar (an
   initial; the frame shows a photograph), counts, and the number and height of Explore cards. Every one of these is
   exercised by `scripts/verify-dynamic-content.mjs`.
2. **Legal / provider requirement** — the "Photo: <photographer>" chip on Explore thumbnails (Google requires the
   photographer to be named; the Google Maps mark is shown once under the list and under Home's deck) and the
   OpenStreetMap credit. They are small chips, not strips, and are not in the frames.
3. **Platform rendering limitation** — Inter renders about 3-4% narrower than the frames' text at the same size
   (no tracking is applied); the frames' icons are custom outlines where the app uses Ionicons; accepted
   decorative-vector, third-card fade and seam differences; a greeting longer than the frame's can run behind its
   strokes (they are part of the artwork).
4. **Accessibility-driven, small** — the placeholder, footnote and link grey (`text.tertiary`) is `#6B7384`, not the
   frame's lighter grey, to reach 4.5:1; a keyboard focus ring on the search field; the Explore category rail and the
   Plan tabs expose their selected state to assistive technology.
5. **Welcome photography** — installed: all seven images (generated brand imagery, credited in
   `assets/images/welcome/CREDITS.md`) are drawn inside the exact cut-outs (see `docs/WELCOME_PHOTOGRAPHY.md`).
6. **Genuine fidelity defects** — none open at 393.

Decisions that used to be deviations and are now the frames' own: the nav is two variants (290 on Home, 310 on
Explore), not one averaged width; Explore's rail is the category chips alone, and filtering is reached through the
quiet "Filters" link on the count line (it carries the active count, and stays when nothing matches).
