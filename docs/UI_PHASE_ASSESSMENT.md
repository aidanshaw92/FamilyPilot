# FamilyPilot UI phase: initial assessment and implementation sequence

**3 October 2026.** Evidence from rendering every route at 390×844 and 360×844 from the current build,
seeded with a complete family profile and two saved places, plus a read of every token, primitive and
the approved Home implementation. Figma frames not yet inspected: the file link has not reached this
session (connection verified working on the owner's account). Where Figma would change a call below it
is marked **[Figma]** and will be re-checked the moment the link arrives.

Home is the benchmark and is not touched except for the two genuine defects listed in §4.

---

## 1. The design language Home actually establishes

Read from `app/(tabs)/index.tsx`, `home-header-layout.ts`, `home-deck-geometry.ts`,
`PlaceShowcaseCard.tsx`, `PillSelector.tsx` and the render.

| Element | Home (approved) | Token system / rest of app |
| --- | --- | --- |
| Ink | `#141416` near-black, used for selected pill, avatar, CTA, nav | `colors.text.primary` `#0A0A0D`; **accent is purple `primary[500]` `#5B4FE8`** |
| Heading weight | Inter **SemiBold** 25.5 (greeting), SemiBold 22 (section) — Home's own comment: token heading1 "read heavier than the design" | `heading1` **ExtraBold** 26, `display` ExtraBold 32 |
| Secondary text | `#6E6E73` | `text.secondary` `#5C586E` |
| Gutter | 24 (20 below 393) | `spacing.screenPadding` 20 |
| Selection control | `PillSelector`: white idle / **near-black** active, full radius | `Chip`: white idle / **purple** active, full radius |
| Primary CTA | Near-black pill with white arrow disc ("See more") | `Button primary`: **purple** pill |
| Card | 28 radius photo card, scrim, caption eyebrow, one meta row | `radius.lg` 16 cards with 1px border |
| Family Match | **"★ 4.0 Family Fit"** (out of 5) pill on photo | `FamilyMatch`: **"76 Good match / 76% Family Match"**, plus "Great"/"Good" pills, plus "Worth considering" |
| Travel | "about 18 min" | same helper — consistent ✓ |
| Navigation | floating near-black pill, white active disc | consistent everywhere ✓ |

**Conclusion:** the token system predates the approved direction. Every other screen is built on the
heavier, purple system; Home was hand-tuned to the frame with local literals. The app currently has
**two inks, two accents, two heading weights and two selection controls.** This is the root cause of
"feels like two products", and it is fixed at the token/primitive layer, not screen by screen.

## 2. Same concept, different implementations (consolidation targets)

| Concept | Implementations found | Canonical going forward |
| --- | --- | --- |
| Selection pills | `PillSelector` (Home), `Chip` (Explore, Saved, Trips, sheet, filters) | One `Chip` with Home's near-black active state; `PillSelector` becomes its rail layout |
| Primary button | `Button primary` purple; Home CTA near-black + arrow disc; sheet "Create plan" purple | `Button` primary = near-black; purple retired from chrome, kept only where it carries meaning |
| Family Match | `FamilyFitBadge` (★/5), `FamilyMatch` (%, classification, 3 variants), `FamilyScoreBadge` (deprecated), `FamilyMatchPanel`, Explore's bare "Great" pill | **One scale and one vocabulary** (see §3), one component with `onImage` / `inline` / `detail` variants |
| Plan builder | Create a Plan sheet (venue) **and** Trips tab form (`trips.tsx`) — different copy ("1h 30m" vs "90 min"), different gating | Trips tab reuses the sheet's form component; one source of truth for date/time/duration |
| Date & time input | `DateTimeField` renders **native browser `<input type=date/time>`**: US-format `10/03/2026`, system font | A styled field consistent with the system; UK/locale-aware display **[Figma]** |
| Horizontal venue card | Explore's `DecisionCard`, `FocusedRecommendationCard` (carousel), `SavedPlaceRow`, `RecommendationPattern` | One `VenueRow` family derived from the showcase card's eyebrow/title/meta rhythm |

## 3. Family Match must be coherent — the decision

Three scales are live: ★ out of 5 (Home), 0–100 with word (Venue), word only (Explore, Saved).
`FamilyFitBadge` divides the 0–100 score by 20, so the same 76 is "3.8 Family Fit" on Home and
"76 Good match" one tap later. A parent cannot tell they are the same thing.

**Canonical:** the word leads everywhere ("Great match" / "Good match" / "Worth considering" /
"Limited match" / "Not yet reviewed"); the number is secondary and **one** scale. The approved Home
frame shows a star pill **[Figma]** — if the frame is the star, the whole app moves to the star scale
and the word; if the star was a placeholder from the reference, the whole app moves to the word plus
0–100. Either way it is one scale. Until the frame is read, the implementation work is structural
(one component, one label helper) and the scale is a single constant to flip.

Provenance is preserved: `provider_only` renders "Not yet reviewed" with no number, as now.

## 4. Genuine defects found by rendering (fixed with tests, not polish)

1. **Unknown travel reported as "too long."** `sequencer.ts` emits `travel-infeasible` for a leg with no
   estimate, so the Plan screen says *"The journey is too long"* with the body *"No travel time is
   known"* and advises *"Raise your travel limit."* Unknown is mislabelled infeasible — the exact
   provenance rule this product holds. Fix: a distinct `travel-unknown` reason with honest copy.
2. **A caution rendered as a positive.** `family-score.ts` pushes *"Further than your usual 30 min
   drive"* into `reasons`, so Venue Detail shows it under "Why it suits your family" with a green tick.
   Fix: it belongs with the cautions.
3. **Profile empty state:** *"The  Family"* (double space from an empty name) and an **empty white card**
   under "Your children".
4. **Trips planner gate ignores the profile:** gated on `planning-store` families, so a parent with a
   complete profile and routines is told to "Set up your family & routines."
5. **Plan validation page** has a centred back chevron over an empty page (layout, low).
6. Home: none found. Two things to check against the frame **[Figma]**: the Family Fit star scale (§3)
   and whether the deck's rear cards should show at 360 (they clip slightly at the left edge).

## 5. States not yet rendered (will be, per section)

Loading skeletons per screen, provider-unavailable on Explore, empty Explore results, long venue names
in the deck and rows, missing photo on Venue hero (gradient fallback seen ✓), Saved panel signed-in
state (needs production), keyboard-open on the sheet, 430-wide.

## 6. Implementation sequence

Each slice: inspect Figma (when available) → render before → implement → tests → render after at
390/360/430 → adversarial pass → PR.

| # | Slice | Why this order |
| --- | --- | --- |
| 1 | **Two provenance defects** (§4.1, §4.2) with tests | Genuine defects a parent can hit today; independent of any visual decision |
| 2 | **Design-system foundation**: tokens aligned to Home (ink, secondary, heading weights), `Button` primary → near-black, `Chip` ← `PillSelector` state, one `FamilyMatch` component + label helper, retire `FamilyScoreBadge`/`FamilyFitBadge` as separate concepts | Fixes the two-products feeling everywhere at once; every later slice builds on it |
| 3 | **Venue Detail** (hero → Family Match → facts → restaurants → CTA bar) | First screen after Home in the main journey; largest visible divergence |
| 4 | **Create a Plan sheet + Plan screen + Generating state**, styled date/time fields | The hinge; the sheet becomes the single plan form |
| 5 | **Trips tab** adopts the sheet's form component; fix the profile gate (§4.4) | Removes the duplicate builder |
| 6 | **Explore** (header, search, chips, rows), **Saved** (chips, rows, panel), **Profile** (§4.3) | Secondary surfaces, mostly inherit slice 2 |
| 7 | **Onboarding + settings + empty/error/loading states sweep**, accessibility and touch-target audit | Consistency pass across every state in §5 |
| 8 | **Saved production check** (#145 observation) during slice 6 | Needs production, no profile upload |

Slice 2 is the one that must not be rushed: it changes the look of every screen simultaneously, so it
ships with before/after captures of all routes at three widths, and Home is diffed against its own
capture to prove it did not move.
