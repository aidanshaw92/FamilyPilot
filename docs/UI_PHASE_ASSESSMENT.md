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

## 11. Found while rendering slice 7

- **"Error on an untouched onboarding form" was a misreading.** The slice 2 capture clicked Continue
  on the empty form; the red copy appears only after that, which is correct. The harness now records
  that state deliberately (`setup-step1-errors`, `setup-step2-errors`) and walks steps 2 to 4 with the
  form filled, through the fixture's stubbed location endpoint.
- **Closed-day plan failure printed ISO.** "not open at that time on 2026-10-03" is now "on Saturday
  3 October 2026", pinned by a sequencer test; every other date in the app was already spelled out.
- **Explore on a places outage shows the bundled curated list with no notice** (captured as
  `explore-error`: four places, no banner). The repository's fallback is deliberate, but a parent cannot
  tell that live search failed and the list narrowed. Owned by slice 12 (states): say so in one line
  above the list when the fallback is in use.
- **Onboarding step 4 and Edit profile budget options** are full-width rows with a grey selected fill,
  a third selected treatment beside the Chip and the Button. Owned by slice 10 together with the
  Create a plan chips, since the approved frame 04 settles how a row of exclusive options looks.
- Eighteen em dashes remained in parent-facing copy after #40; all rewritten. Feedback's placeholder
  named a pilot-gated feature; its header now top-aligns like About and Edit profile.

## 12. Found while rendering slices 9 and 10

- **Frame 02's compact badge carried an info glyph** in the first render because the badge grows one
  whenever it is pressable; beside a "Why this score" link that is a second affordance for the same
  thing. The compact size now shows star and number only, as the frame draws it.
- **The restaurant card had dropped the hours line** the list rows used to carry. The phase-2 audit
  caught the sibling omission ("Nobody has recorded facilities for children here" must be said, not
  left blank); both lines are back on the card, said either way.
- **A reviewed parking detail ran past two lines** ("Free on-site car park, about 120 spaces, busiest
  before 11am at…"); the essentials value may take three.
- **Deliberate departures from frames 04/04b:** the row labels keep the app's one `eyebrow` variant
  rather than the frame's 10.5pt, and HOW LONG keeps its lengths ("1h 30m") rather than "Half a
  day", because the length is the planner's real input and the Plans tab shows the same number. The
  venue's own button still says Create a plan; the sheet it opens says Plan your day.
- **Generating measured zero tall inside the sheet.** The first slice 10 build passed every screenshot
  and failed both verifiers' "generating was reached", because `flex: 0` on web becomes a zero flex
  basis: the box measured 353×0 with its children overflowing, which Playwright (and a screen reader's
  bounds) read as not visible. A probe polling the element's rectangle every 400 ms found it. Fixed
  with an explicit auto basis; the verifiers are the regression test.
- **"See all" is not drawn** on Restaurants close by because there is nothing for it to open yet.
- **A very long venue name** wraps to eight lines beside the compact badge at 360. Not truncated, by
  choice: a name is a fact. Noted for the end-to-end review if a real venue does this.

## 13. Found while rendering slice 11

- **The phase-2 audit's lunch contract named a period.** "The day contains a lunch stop" was
  `LUNCH` followed by a time, which frame 03's "Stop 1 / Stop 2" cards no longer print. The contract is
  now a second stop card with its time, with the restaurant's name asserted beside it as before.
- **The third tab clips at 360** ("Travel & par…") exactly as it did before this slice; the tab row
  is a horizontal scroller by design. Owned by slice 12, which looks at every width again.
- **The Generating sheet reads as the frame** once the zero-height basis was fixed: title, four lines
  with tick, dot and ring, the receipt beneath ("Using ages 6 and 3, pushchair and max 90 min
  drive"). The hero behind it is the venue's own photograph or its category placeholder.

## 10. The Figma file, inspected (2026-10-03)

File `LNpbdnuAWcfWf9spvB7jBz`, one page, five approved frames, each read through the Figma connection
(metadata, design context for the badge and restaurant card, and a render of every frame):

| Frame | Node | What it fixes |
| --- | --- | --- |
| 01 — Home ✓ APPROVED | 7:2 (deck symbol 38:43, active card 8:4) | The benchmark. Badge 8:13 reads **"★ 4.3 Family Fit"** (Inter Medium 14 on a 45% ink pill, 32 tall). |
| 02 — Venue Detail ✓ APPROVED | 48:2 | Hero 300 with white circle back/heart; a sheet overlaps the hero from y 256 with a grabber; venue name (26) with a compact **"★ 4.3"** badge beside it (white, hairline, 30 tall); "Museum · 9 min away" with pin and a **"Why this score"** link; two-line description + "Read more"; **Restaurants close by** + "See all", 262-wide cards (200 photo, name 17 SemiBold, meta "5 min walk · Highchairs" 13.5, **"★ 4.6 · Family friendly"**, 40 arrow circle); **Create a plan** as the Home CTA pill (58 tall, arrow circle); **Family essentials** label/value rows with hairlines, unknowns as "Not confirmed" in tertiary. |
| 03 — Plan ✓ APPROVED | 70:2 | Centred header (title + "Sat 20 Sep · 10:00 – 14:45") between circle back and heart; three 40-tall tabs; "Your Saturday plan" + "Edit timings" link; a timing-insight pill ("✓ Home around 14:45, before the usual nap"); stop cards with 62 thumbnail, "Stop 1" eyebrow, underlined editable time, title; expanded rows with small uppercase labels (ARRIVAL, ACTIVITY, RECOMMENDED TIME, LEAVE, TRAVEL TO NEXT STOP); collapsed stops; "Head home" terminus; CTA bar "Invite family & friends". |
| 04 — Create a plan ✓ APPROVED | 76:2 | Sheet over the hero: "Plan your day" / "Around Science Museum"; WHEN as chips (Today, Sat 20 Sep, Other date); START as chips (09:30, 10:00, 10:30, Other) + "Suggested after the morning nap"; WHO'S COMING with "Add another family" link on the row and one chip "Our family · 2 adults, 2 children"; HOW LONG chips (A couple of hours, Half a day, Full day); a profile receipt pill ("✓ Using ages 2 and 4, pushchair, 15:30 nap and max 30 min drive · Edit"); CTA "Build my plan" with arrow. |
| 04b — Generating ✓ APPROVED | 76:71 | The same sheet, with a four-line progress list (✓ done, ● current, ○ pending) and the receipt pill. |

### What this settles

- **Terminology: Family Fit.** Both the approved Home frame and the locked implementation's source frame
  say "Family Fit" (8:16 "4.3 Family Fit", 49:5 "Family Fit badge", 51:9 "Family Fit"). "Family Match"
  entered the app in slice 2 as my rename and was flagged, never approved. The owner's instruction is to
  resolve the inconsistency with Home/Figma as the authority, so the app says **Family Fit** everywhere:
  the badge label, the Venue Detail eyebrow, the classification words ("Excellent fit", "Great fit",
  "Good fit", "Worth considering", "Limited fit"), About, Edit profile and onboarding copy, and the two
  verifier probes that look for the eyebrow text. One constant drives the label.
- **Badge presentation.** One component, two sizes: the Home pill with the word (cards, rows, hero) and
  Figma's compact "★ 4.3" beside a venue name where the "Why this score" link carries the word.
- **Figma is not blindly reproduced** where the product has gained real function: the Family Fit
  explanation panel (reasons, cautions, notes, trust badges), travel sources, facilities with provenance
  and restaurant discovery all stay, placed inside the approved structure.

### Sequence from here

| # | Slice | Frame |
| --- | --- | --- |
| 7 | Onboarding, About, Feedback copy; closed-day date voice; touch targets; state captures (in flight) | none |
| 8 | **Family Fit** (done): one label constant drives the badge, the classification words are "Excellent fit · Great fit · Good fit · Worth considering · Limited fit", the Venue eyebrow, About, Edit profile, onboarding, the Saved sort chip and the Explore editorial subtitle all say Family Fit, both verifier probes updated, the design-system guard fails on any parent-facing "Family Match"; `size="compact"` added to the badge from node 49:5; budget options in onboarding and Edit profile are Chips like the drive-time row | 01, 02 |
| 9 | **Venue Detail** (done): frame 02's structure, a 300 hero with white circle back, share and heart, the sheet riding 44 over it with the grabber, the name beside the compact badge, category · "about N min" with a pin and a "Why this score" link that scrolls to the Family Fit panel, two lines of description with Read more, Restaurants close by as the frame's card rail (hours and tagged facilities said either way, no invented score), Create a plan as the frame's arrow CTA (one `ArrowCta` for every approved arrow pill), Family essentials rows built only from reviewed facts; the panel, Check today, Getting there, gallery, attributions, feedback and tips kept after the frame's content; the fixed footer gone as in the frame | 02 |
| 10 | **Create a plan + Generating** (done): WHEN and START as the frame's quick chips with slice 4's pickers behind "Other" and any custom answer shown as its own chip; one chip per household with its counts and "Add another family" on the label row; the profile receipt ("Using ages 2 and 4, pushchair, 15:30 nap and max 30 min drive · Edit", only what the profile holds, never a name); "Plan your day / Around <venue>" and the arrow CTA "Build my plan"; Generating as the same sheet over the venue photograph with tick, dot and ring markers; `Chip size="small"` for the frame's 40pt option chip; eight parent-facing em dashes left in service strings rewritten | 04, 04b |
| 11 | **Plan** (done): the frame's centred header between the back circle and the save control, 40-tall tabs, "Your Saturday plan", the timing insight drawn only when the planner recorded a routine the day is home before, stop cards with a 62 thumbnail, "Stop N", arrival time and name, two-column rows (ARRIVE, TIME THERE, LEAVE, OPENING, TRAVEL TO NEXT STOP), a "Head home" terminus, Save this plan as the arrow CTA; the anchor's photograph through the plan input, a placeholder for an OpenStreetMap lunch stop; the stop time not underlined because "tap to edit" is not yet a thing | 03 |
| 12 | End-to-end review of both journeys plus Saved, Trips, Profile and the loading/error/empty/unknown states | all |

