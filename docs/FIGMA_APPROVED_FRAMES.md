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

Differences, classified:

* **Dynamic content** — names, scores, Family Fit states, travel times, photographs, the avatar (initial, no
  photo), counts and the number of Explore cards; the fixture venues have no photograph or review, so their
  cards are shorter than the frame's; Welcome's slots show the category gradient until licensed photographs exist.
* **Intentional** — one nav width on every tab (300; the frames draw 290 on Home and 310 on Explore); the
  active nav icon stays an outline, as drawn; Explore chips are 42 tall with a 44 touch target; Explore's
  scrollable rail keeps its "Filter" control; narrower phones shorten Explore's CTA label rather than ellipsise
  ("View details", "Details to check", "Check details") and scale Welcome's lockup and subtitle with the stickers.
* **Implementation limitation** — Inter renders about 3-4% narrower than the frames' text at the same size
  (no tracking is applied, per the Welcome and Home decision); the accepted decorative-vector, third-card fade and
  seam differences; greeting strokes are part of the artwork, so a very long greeting can run behind them.
* **Actual fidelity defects** — none open at 393.
