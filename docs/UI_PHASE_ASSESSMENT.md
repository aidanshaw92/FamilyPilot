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
| Date & time input | `DateTimeField` rendered **native browser `<input type=date/time>`**: US-format `10/03/2026`, system font | Done in slice 4: a drawn field showing "Friday 2 October 2026" / "09:00", native picker kept underneath |
| Horizontal venue card | Explore's `DecisionCard`, `FocusedRecommendationCard` (carousel), `SavedPlaceRow`, `RecommendationPattern` | One `VenueRow` family derived from the showcase card's eyebrow/title/meta rhythm |

## 3. Family Match must be coherent — the decision (taken in slice 2)

Three scales were live: ★ out of 5 (Home), 0–100 with word (Venue), word only (Explore, Saved).
`FamilyFitBadge` divided the 0–100 score by 20, so the same 76 was "3.8 Family Fit" on Home and
"76 Good match" one tap later. A parent could not tell they were the same thing.

**Decided and implemented:** the approved Home badge is the one badge. Every surface renders the same
`FamilyMatch` component — `★ 3.8 Family Match`, 32pt, frame node 8:13 — and the classification word
("Good match", "Worth considering" …) leads wherever there is room (Venue Detail's band, Explore's
reason line, the explanation panel). The number is never printed as a percentage or a bare integer.
The scale is one constant (`FAMILY_MATCH_SCALE` in `src/utils/family-match-scale.ts`) in case the
frame, once read, says otherwise.

Provenance is preserved and made uniform: `provider_only` and `ai_draft` places read **"Not yet
reviewed"** with no number — in the badge, in the classification (previously "Potential match") and in
the secondary line. A non-finite score renders no badge at all.

**One Home copy change, flagged for the owner:** Home's badge said "Family Fit"; every brief, every
other screen and the product's own documentation say "Family Match". The badge now reads "★ 4.0
Family Match". Geometry, weight, colour and position are unchanged (88/88 frame checks pass).

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
| 2 | **Design-system foundation** (done): tokens aligned to Home (`ink` #141416, secondary #6E6E73, Semi Bold headings, `link` variant), `Button` primary → ink, one `Chip` (Home's rail pill) behind `PillSelector`, one `FamilyMatch` badge, `FamilyScoreBadge`/`FamilyFitBadge`/`family-match-label` retired, purple retired from consumer chrome, guard test | Fixes the two-products feeling everywhere at once; every later slice builds on it |
| 3 | **Venue Detail** (done): hero carries the Home card's eyebrow, title and Family Match badge; one Family Match panel (word leads, cautions amber, venue notes neutral, fact-backed trust badges); "Getting there", "Practical details", "About" as heading2 sections; four provenance defects fixed with tests (see §8) | First screen after Home in the main journey; largest visible divergence |
| 4 | **Create a Plan sheet + Plan screen + Generating state** (done): drawn date/time fields over the native pickers ("Friday 2 October 2026", "09:00"), one `eyebrow` variant replacing six ad-hoc letter-spacings, 24-hour clock app-wide, the plan header may take two lines, the framed states' back chevron sits left, "Add another family" is a link | The hinge; the sheet becomes the single plan form (the Trips tab adopts it in slice 5) |
| 5 | **Plans tab** (done): renders the same `PlanDraftForm` as the Create a Plan sheet (when, start, who, how long) with its own extra rows underneath in the same row language; parties come from `planDraftDefaults` and resolve through `resolvePlanParties`, so a parent with a finished profile is never told to "Set up your family & routines" (§4.4) | Removes the duplicate builder |
| 6 | **Explore, Saved, Profile** (done): Explore's title is heading1 like Home's and the search row no longer overflows at 360 (`minWidth: 0` on the web input); Saved's sort row keeps one spacing rhythm; Profile's sections are heading2 like Venue Detail's, the family title is "Aidan’s family" / "Your family" (§4.3, never "The  Family"), an empty children card says so; drive-time chips offer 90 min and always include the stored value; a provider-only row no longer repeats "Not yet reviewed" under its own badge | Secondary surfaces, mostly inherit slice 2 |
| 7 | **Onboarding + settings + empty/error/loading states sweep**, accessibility and touch-target audit | Consistency pass across every state in §5 |
| 8 | **Saved production check** (#145 observation, done in slice 6 as a workflow step): `verify_client_config` in `live-canaries.yml` fetches the deployed page and every bundle it references and runs `scripts/verify-client-config.mjs`, which asserts the Supabase project URL and a client key are inlined in the same bundle (the exact precondition for Back up / Restore) and that no `sb_secret_`, `service_role` JWT or Google API key is. GET only, no account, no profile; see §9 for the production result | Needs production, no profile upload |

Slice 2 is the one that must not be rushed: it changes the look of every screen simultaneously, so it
ships with before/after captures of all routes at three widths, and Home is diffed against its own
capture to prove it did not move.

## 7. Found while rendering slice 2 (not fixed there; owned by the slice named)

- Explore at 360: the "Search" button overflows the right edge of the row. Fixed in slice 6: the web
  text input had an intrinsic width, so the flex row could not shrink it; `minWidth: 0` is the fix.
- Onboarding step 1 shows "Please enter your first name" in red on an untouched form (slice 7).
  Pre-existing.
- `/restaurant/[id]` is behind the pilot flag and renders "Restaurants coming later" in this build, so
  its Family Match band could only be verified by type-check, not by render (slice 3/6 when the flag
  decision is made).
- The Saved row's travel line wrapped three deep beside the wider badge; fixed in slice 2 by stacking
  badge and travel line.
- Explore's row pill forced long names to truncate at 360; fixed in slice 2 by moving the badge under
  the title.

## 8. Found while rendering slice 3 (fixed there, with tests)

1. **Negative reviewed facts ticked green.** `trusted-family-score.ts` filed "Pushchair access reviewed
   as difficult", "Parking reviewed as not available on site" and "Age range may not suit your
   children" as reasons, and still carried the "Further than your usual drive" line slice 1 removed
   from the heuristic path. They are now `familyScore.cautions`, rendered amber under "Worth
   checking". Seven mutants killed.
2. **Venue notes drawn as warnings.** The venue's own `goodToKnow` ("The cafe has highchairs") was
   merged into the caution list and drawn amber with an alert icon. Notes and cautions are now two
   lists, two treatments.
3. **A disclaimer ticked as a reason.** Provider-only places led their reasons with "Based on
   location and category only. Family suitability has not yet been reviewed." under a green tick.
   Unreviewed places now have no ticked reasons; the status line says what they are.
4. **Invented confidence.** The explanation panel printed "Last checked 2 days ago" and "Opening
   hours from provider" for every venue. Badges are now built from data (`trust-badges.ts`): a
   review date only for a reviewed place and only from the metadata's own date (the provider fetch
   date no longer stands in for it), an hours badge only when hours exist, named after the provider.
5. Two numbers for one fact: the hero said "~3h visit" while the reasons said "Typically a 2.5-hour
   visit" (150 minutes, rounded two ways). The hero chip is gone; the panel keeps the precise line.
6. **An outage reported as "Place not found".** The places repository answered every detail failure
   with the mock fallback, which for a real id is null, so a timeout, a 500 or no connection rendered
   "This venue may have been removed". `PlacesApiError` now carries the status: a 404 is not found,
   anything else is rethrown and the screen says "Could not load this place" with a retry.

## 9. Found while rendering slice 6

- **Profile empty state (§4.3) rendered, not read:** with an empty parent name and no children the title
  is "Your family" and the children card reads "None yet / Add in Edit" (probe
  `profile-empty-probe.mjs`, 360 wide). `familyTitle` has three unit tests, including "James’ family".
- **A stored drive limit the chips did not offer.** The seeded profile's 90-minute limit rendered as no
  chip selected in Edit profile and onboarding step 4, because both lists stopped at 60. The lists now
  offer 90 and always include the stored value, so a limit set elsewhere is never shown as nothing chosen.
- **Explore rows said "Not yet reviewed" twice** once the badge moved under the title (slice 2) and the
  provider-only reason line said the same thing in words. The reason line is now empty for provider-only
  rows; the badge carries the status and the meta line carries the distance.
- **Saved's sort row** had `paddingVertical: lg` on top of the search field's own bottom margin; it now
  has `md` above and `lg` below, which is the rhythm the "Want to go" heading needs.
- **Pre-existing, not fixed here (slice 7):** Edit profile's budget options are full-width rows with a
  grey selected fill and a 1px ink border, a third selected treatment beside the Chip and the Button.
  Onboarding step 4 shares the control, so it moves with the onboarding pass.
- **Saved production check, run against production on 2026-10-03 16:03 UTC** (live-canaries run
  37135427455, dispatched from this branch with only `verify_client_config` on). Predicted calls: zero
  Google, zero Overpass, three GETs (status endpoint, page, one bundle). Actual: the same three GETs,
  nothing else. All nine checks passed: the page references one bundle and it was fetched whole; exactly
  one Supabase project URL is inlined and it is `uuolfuebwimrsjfgffsm`; one publishable key sits in the
  same bundle, so `isSupabaseConfigured` is true in the client production ships; no `sb_secret_` key, no
  `service_role` JWT, no Google API key. So a signed-in parent on production is offered Back up / Restore.
  What this does not prove: that a sign-in succeeds end to end, which needs an account and was not
  attempted (no profile was created or uploaded, per the owner's instruction).

