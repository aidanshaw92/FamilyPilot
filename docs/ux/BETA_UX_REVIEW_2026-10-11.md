# FamilyPilot beta UX review — 11 October 2026

Branch: `ux/beta-polish` (from `main` bc19ba5). Nothing here is merged or deployed. Sections 1 to 7 are the review and
the proposals as they were put to the founder; section 8 records the decisions taken and what the branch now holds.
Screenshots: `docs/ux/screens/before/` (production bundle at bc19ba5) and `docs/ux/screens/after/` (this branch).

## 1. What was inspected

- Production bundle at bc19ba5, run against the pilot fixture (the ten live venues and their 28 published claims),
  signed in, iPhone viewport 390×844 @2x. Screens: Home, Explore, Halfway, Plans, Profile, Families, Saved, Venue Detail
  (RAF Museum, Horniman), Create a plan sheet, Plan (Day plan / Who's coming / Travel).
- Approved Figma file `LNpbdnuAWcfWf9spvB7jBz`, page "00 Approved frames (Sep 2026)": 01 Home (7:2), 02 Venue Detail
  (48:2), 03 Plan (70:2), 04 Create a plan (76:2), 04b Generating (76:71); page "03 Screens v2": Home, Explore, Welcome.
  There is **no approved frame** for Halfway, Plans, Profile, Families or Saved. Those screens were built without a
  design, which is the single biggest reason the app reads as several apps.
- Code: `app/(tabs)/_layout.tsx`, `FloatingTabBar`, `app/families.tsx`, `PlanScreenView`, `plan-view-model`,
  `sequencer`, `routine-advice`, `day-plan`, `family-match`, `meet-halfway`, `halfway-map`, `HalfwayMap`.

## 2. Production versus the approved frames

| Screen | Against the approved frame | Class | Necessary now? |
|---|---|---|---|
| Home | Matches 01 Home: greeting, avatar, search, pills, deck, floating nav. Differences: the "Families" pill beside the section heading (not in the frame, added for Families reach); placeholder art instead of photographs (photos are switched off by decision); badge words ("Good fit · check Sloane") instead of "★ 4.3 Family Fit" (decided in UI_PHASE_ASSESSMENT: words, not a number). | Visual, by decision | No |
| Explore | Matches the Explore v2 frame: heading, subtitle, search, pills, list, nav. Difference: the Families pill in the heading row. | Visual, by decision | No |
| Venue Detail | Matches 02: hero, grabber sheet, name, badge, "Why this fit", Family essentials rows, Create a plan CTA. Differences: the Family Fit panel sits above "Restaurants close by" (the frame has restaurants first); the frame's "Restaurants close by" rail is present only where lunch candidates exist. | UX, by decision | No |
| Create a plan | Matches 04: sheet over the hero, When / Start / Who's coming / How long chips, profile receipt, Build my plan. | — | — |
| Plan | Matches 03 in structure: back, title, dates, three tabs, "Your Saturday plan", stop cards with arrive / time there / leave rows, "Head home" terminus, fixed CTA. **Missing from the frame and from production:** the frame's "Edit timings" link and "Stop time (tap to edit)" are drawn but not built; the day has no "Leave home" row and no routine rows (a feed or nap is a sentence in a box above the stops, not an event in the sequence); the "Home around 14:45, before the usual nap" line was shown as a tick regardless of margin. | Functional | **Yes** (see §4 and Decision B) |
| Meet halfway | No approved frame. Form of four uppercase-labelled rows, results list with a drawn map above it. The map's two dashed circles and pin were unexplained on the screen; "Show on map" was a small ghost button; nothing said what the ranking is. | UX + functional | **Yes** (§5, implemented) |
| Plans | No approved frame. Three chips inside the tab ("Plans", "Saved plans", "Families & routines"); "Families & routines" is a second, older families model (planning-store families) that duplicates the Families screen with different wording. "Start a plan" sends the parent back to Home or Explore. | UX | Decision A |
| Profile | No approved frame. Heading + subtitle, family card, Your family, Connected families. Reasonable, but the subtitle says "and the families you plan with", which is also what Families says. | UX | Decision A |
| Families | No approved frame. Stack screen with a centred back chevron, no floating nav, one card. Reached only from a pill on Home/Explore. | Visual + UX | **Yes** (header implemented; placement is Decision A) |
| Saved | No approved frame. Stack screen, heading row with back, search, three filter rows. | Visual | Header implemented |

**Why it felt like different applications.** Five of the ten screens were built without an approved frame, each with
its own header (centred chevron on Families; heading + body subtitle on Halfway; heading + small subtitle on Profile;
heading + chips on Plans), and two of them (Plans' "Families & routines" chip and the Families screen) present the same
concept twice with different models. The locked frames (Home, Explore, Venue Detail, Plan) are consistent with each
other; the unlocked screens are not consistent with them or with one another. The fix is one header for every section
page and one place for Families, not a new design system (the existing tokens, type scale and components are fine).

## 3. Reproduced findings

**Nap margin (Horniman).** `sequencer.ts` records a routine the family is "home before" whenever
`home ≤ routine.start`, where `home = leave + journey + 15 min settling`. `routine-advice.ts` turned every such routine
into "You're home around HH:MM, before Ozzie's nap at HH:MM." and `PlanScreenView` drew it with a green tick. With the
founder's profile (Camden → Horniman, 23 min estimated) the day leaves at 12:00 and is home at 12:38; a 12:42 nap leaves
four minutes and still earned the tick. Reproduced on the released bundle (`docs/ux/screens/before/plan-day-full.png`
shows the tick at 12:38 for a 13:00 nap; the four-minute case is the unit test in `beta-ux-polish.test.ts`).

**Family Fit (RAF Museum).** `matchBadgeText` wrote "Good fit · check Sloane" for a `good` verdict with a gap child.
The verdict was `good` because Ozzie (7 months) has confirmed practical facts (baby changing, pushchair access) and the
score was high; nothing about the activity was confirmed for anyone, and nothing at all for Sloane. The headline on the
same screen already said "Easy to visit with Ozzie, but we haven't yet confirmed whether this activity suits Sloane";
the badge contradicted it.

**Meet halfway "points".** They are not scores. The map draws exactly three things: two dashed circles (each family's
set-off area, cut to a 1 km grid and drawn 1.5 km across so it can never be read as a house) and one pin (the venue, where
it really is). The ranking number (`score` in `meet-halfway.ts`) is never displayed; it is `100 − longest journey −
0.8 × gap − 0.15 × (both journeys) + small bonuses for confirmed facilities`, so it rewards fair, short journeys, not the
midpoint. Journeys are distance estimates (no routing, no Google). Nothing on the screen said any of this.

## 4. Implemented on `ux/beta-polish`

1. **Tight-margin nap logic** (`home-margin.ts`, `day-plan.ts`, `routine-advice.ts`, `plan-view-model.ts`,
   `PlanScreenView.tsx`). The margin between getting home (settling included) and the next routine at home is measured.
   Below 15 minutes on an estimated journey (10 on a measured one) the routine is **tight**: the plan still builds, the
   good-news tick is replaced by a warning in the same place: "Tight for Ozzie's nap: you're home around 12:38, and the
   nap is at 12:42. That journey time is an estimate, so the gap may not hold. Consider leaving 15 minutes earlier." The
   headline becomes "This plan works, but one timing is tight". One chip is offered, only when the planner re-ran the
   day and proved the change builds, adds no new routine overlap and leaves the nap with room: **Arrive at 09:45** where
   the place is open earlier, otherwise **Leave at 11:45** (the visit 15 or 30 minutes shorter). Horniman opens at
   10:00, so there the sentence ends "Consider leaving 15 minutes earlier" and the chip is "Leave at 11:45". The "Head
   home" terminus now says how the journey was timed ("journey estimated from distance").
2. **Family Fit badge honesty** (`family-match.ts`, `FamilyMatch.tsx`). The result now carries `suitedNames` (children
   the venue's own recommended ages cover) and `easyNames` (children for whom only practical facts are confirmed). The
   badge says what is confirmed and for whom, and never "Good fit" with a child unconfirmed: "Easy with Ozzie · check
   Sloane", or "Good for Ozzie · check Sloane" where the activity evidence covers Ozzie. The spoken label no longer
   appends "Good fit" after it. Scores, rankings and verdicts are unchanged.
3. **One header for the section pages** (`PageHeader.tsx`): the approved brand mark beside a small "FamilyPilot"
   wordmark, optional back control, optional right-hand action, then the title and one line of purpose at the Explore
   frame's sizes. Applied to Halfway, Plans, Profile, Families and Saved. Home and Explore are locked frames and keep
   their own headers (Decision D).
4. **Meet halfway** (`halfway.tsx`, `HalfwayMap.tsx`, `halfway-map.ts`): a sentence under the heading says the ranking
   is by fair journeys and each family's needs, "not by the midpoint between your homes"; the venue's name is drawn
   beside its pin; a legend explains the two circles and the pin in plain words; tapping a card's head puts that place
   on the map and scrolls the map back into view ("On the map" on the chosen card); each card's journeys are labelled
   "Each family's journey, estimated from distance".
5. **Tests**: `beta-ux-polish.test.ts` (9) drives the real planner through the four-minute case, the verified earlier
   option, the measured-versus-estimated threshold, the terminus note, the map label and the header rule;
   `family-match.test.ts` updated for the new badge words. Full suite green (see §7).

## 5. Decisions needed

### A. Families in the bottom navigation (recommendation: Plans absorbs Halfway, Families takes the slot)

Today: Home · Explore · Halfway · Plans · Profile. Approved frame: home · compass · calendar · heart · person (Halfway
replaced Saved in September). Three honest options:

| Option | Tabs | What moves | For | Against |
|---|---|---|---|---|
| **A1 (recommended)** | Home · Explore · Plans · Families · Profile | Meet halfway becomes the second way to start a plan inside Plans ("Start a plan: from a place / halfway with another family") and an action on every family in Families. Plans' "Families & routines" chip is removed (the Families tab is the one model). | Plans finally has content for a new parent (two ways to start, saved plans, saved places). Halfway is a plan type, not a destination, and is empty until a family exists. Families is the prerequisite for Halfway, so Families → Halfway is one tap. Icon set stays close to the approved frame (people glyph replaces the heart). | Halfway loses a tab; its URL `/halfway` stays and is linked from Plans and Families. |
| A2 | Home · Explore · Halfway · Plans · Families | Profile moves behind the Home avatar (as the approved Home frame intends) and a gear on Families. Families absorbs "Your family". | People-centric tab; keeps Halfway prominent. | Account, backups and sign-out become two taps from everywhere except Home; Profile's "person" glyph leaves the nav. |
| A3 | Home · Explore · Families · Plans · Profile | Halfway lives only on each family's row in Families and in Plans. | Smallest change. | Same as A1 but Halfway less discoverable (no "Start a plan" entry). |

Not recommended: a sixth tab (the approved pill is sized for five and the narrowest iPhone cannot fit six at 44 pt).

### B. Editable chronological timeline for a plan (recommendation: build in two steps)

Proposed Day plan (replaces the stop cards and the routine box, keeps the approved header, tabs and CTA):

```
09:22  Leave home                                   journey 23 min · estimated      [edit]
10:00  Arrive · Horniman Museum and Gardens         hours confirmed to 17:30
       Explore until Ozzie's feed · 1 hr 15 min
11:15  Ozzie's feed · 30 min · at the venue         baby changing confirmed
11:45  Explore · 15 min
12:00  Lunch · PizzaExpress Forest Hill · 45 min    5 min walk · estimated   [change restaurant]
12:45  Leave for home                               journey 23 min · estimated
13:23  Home                                          ⚠ tight for Ozzie's nap at 13:30 · leave 15 min earlier?
13:30  Ozzie's nap · at home
```

Every row carries its provenance word: **confirmed** (venue hours, facility, routine the parent entered), **estimated**
(distance-based journey), **inferred** (a visit length FamilyPilot chose) or **unknown** (hours not on record).
Nothing is invented: a row exists only where the planner has a value.

Editing, in two steps:

- **Step 1 (beta):** tap a time to change arrival or leaving time; extend/shorten the visit; add or remove lunch;
  change the restaurant from the lunch candidates already fetched; "leave 15 min earlier". Each edit re-runs the real
  sequencer with the same journey matrix (no new Google calls) so every downstream time updates. A saved plan stores
  the draft and the edits, not only the snapshot, so reopening a plan shows the same timeline and allows further edits.
  This is what `plan.tsx` already does for start, visit and lunch via URL params; the work is a stop-override model
  (`StopRequest` overrides per stop), a time editor sheet and persisting the draft with the saved day.
- **Step 2 (after beta):** add a second activity, remove a stop, reorder stops by drag, adjust a routine for the day.
  Reordering needs journey legs the matrix does not yet hold (a second venue to the restaurant), so it costs either a
  distance estimate (free) or a measured leg (paid); the proposal is the free estimate, labelled estimated.

Approval needed on: the row vocabulary above (confirmed / estimated / inferred / unknown), the two-step split, and
that the Plan screen's approved stop cards become rows (the frame's "Edit timings" and "tap to edit" are honoured).

### C. Meet halfway map experience (recommendation: map-first with a pinned list)

Implemented now: the plain-English legend, the labelled pin, tap-to-focus, the ranking sentence. Proposed next: the map
becomes the first thing under the form once a family is chosen, with all top options pinned (numbered), the selected
one highlighted, and the list underneath; each card shows the two journeys as two rows with "estimated" and the
fairness line first (as now). The map stays the drawn basemap (no tiles, no provider, no cost); areas stay 1.5 km
circles (privacy). Approval needed on numbered pins for every option (versus one pin, as now).

### D. Brand lockup on Home and Explore

The new header puts the mark + wordmark on the five section pages. Home and Explore are approved, locked frames whose
headers are the greeting and "Explore London"; adding a 30 pt lockup row moves everything below it and breaks the
frame's art positions. Options: (D1) keep Home and Explore as approved (the greeting and the Explore title are their
headers; the lockup appears on every other page); (D2) add the lockup to both and re-approve the two frames. The
branch ships D1; D2 is a one-line change in each screen plus the art offsets.

## 6. Prioritised plan

**Essential for beta (this branch + one follow-up):**
1. Tight-margin nap logic, Family Fit badge honesty, Meet halfway explanation, one header — implemented here.
2. Decision A applied (one afternoon of work once decided): tab layout, Plans content, remove the duplicate families chip.
3. Editable timeline step 1 (about three to four days): timeline rows with provenance, time edits, restaurant change,
   draft persisted with the saved plan.

**After beta:**
4. Timeline step 2 (add/remove/reorder stops, routine adjustments for the day).
5. Map-first Halfway with numbered pins.
6. Photographs (separate decision, already parked).

## 7. Verification

- `tsc --noEmit`: clean.
- `vitest run`: full suite, see the final report in the session for counts.
- Screenshots at 390×844 @2x in `docs/ux/screens/before/` (production bundle) and `docs/ux/screens/after/` (this branch,
  same profile, same fixture): home, explore, plans, profile, families, saved, venue-raf, halfway, halfway-results,
  halfway-second-on-map, plan-tight, plan-earlier.
- Interactions claimed to work were driven in the browser: tapping a Halfway card puts it on the map and scrolls it into
  view; the "Leave at 11:45" chip rebuilds the plan and the warning gives way to the tick.

## 8. Decisions taken and what the branch holds

The founder approved: five tabs **Home · Explore · Families · Plans · Profile** with Families as a dedicated hub (not
the Halfway screen); the editable timeline, step 1; Meet halfway map-first with numbered pins; the brand lockup on Home
and Explore (D2); and the four corrections in §4. All of it is on this branch.

### Navigation and branding

- Tabs are Home · Explore · Families · Plans · Profile (`app/(tabs)/_layout.tsx`); the pill keeps the approved geometry
  and a Families glyph is drawn in both approved stroke languages (`icons.tsx`). No sixth tab.
- Meet halfway is a stack screen at the same `/halfway` URL (`app/halfway.tsx`), reached from every family's card on
  Families, from the hub's own "Meet halfway" action, and from a shortcut on Plans. Plans keeps plans and saved plans
  only; its "Families & routines" chip (the duplicate families model) is gone.
- The brand row (`BrandLockup`, 44 pt) sits above the approved Home and Explore headers. Home's greeting and the marks
  drawn beside it move up together (`ART_LIFT`), Explore's header marks move down by the row, so the approved geometry
  holds beneath the lockup. The same row heads every section page through `PageHeader`.

### Families hub (`app/(tabs)/families.tsx`)

Top to bottom: **Plan a day out together** (Plan together keeps the chosen family's id, `planningWith`, so the next plan
sheet opens with them under Who's coming and Explore shows "Planning with Hannah's family · Done"; Meet halfway one tap
away); **Your family** (people and ages, Edit); **Naps, feeds and must-haves** (the routines the planner uses, Edit, and
the line that they stay private: a connected family sees the times only if sharing is turned on, never a name);
**Connected families** as cards with a status caption ("Connected", "Connected · planning together", "On this phone only
· not connected"), the shared summary, and Plan together / Meet halfway / What I share / Edit / Disconnect.

What is genuinely functional: connections are the existing Supabase invitation system (create a link, accept, what I
share, disconnect) with the same consent defaults (routine sharing starts off), exercised end to end by
`scripts/verify-account-journey.mjs` (72 checks). A family added by postcode is on this phone only and its card says so.
Nothing new is read from or written to a connection: the hub stores one id. Deferred: a shared plan that both families
edit (plan invites remain the existing one-way "invite a family to this plan").

### Editable timeline (`plan-timeline.ts`, `PlanTimeline.tsx`, `app/plan.tsx`, `app/saved-plan.tsx`)

Rows: leave home, arrive (hours, parking, pushchair, baby changing for under-threes, recommended ages against the
children), explore until the next feed or nap, the routine itself with the facility that matters, carry on, leave for
lunch, lunch (the walk, what the mappers listed and why it matters, how long, hours), leave for home, home (the margin
before the next routine at home), the routine at home. Every line carries **confirmed / estimated / suggested / reported
/ unknown**. A routine that falls during a drive is a row where it falls; one that starts in the visit and carries on into
the move is one row, extended.

Edits: Change arrival (half-hour chips or any time), Change how long (the plan sheet's lengths), Change lunch (the
OpenStreetMap candidates already fetched for the venue, nearest first, with what the mappers listed; or take lunch out),
Leave earlier (the tight-margin advice's verified option). Each edit changes the plan's URL parameters, so the real
scheduler re-runs with the same journey matrix: no new journey request, no Google call. Saving keeps the answers the day
was built from (`SavedDay.draft`); a saved day shows the same timeline with "Edit this plan", which reopens the Plan
screen from those answers, and saving again replaces that day (same id, same place in Plans). Saving is confirmed by
reading the day back from storage by id and content; a refused edit restores the old day. Stops cannot be added, removed
or reordered (after beta, as agreed).

### Meet halfway, map first

The Map / List control and the map stay at the top of the screen (`stickyHeaderIndices`) while the cards scroll under
it. Every recommended place is a numbered pin matching its card; the place in focus is the filled green pin and badge,
the others outlined; tapping a card selects its pin, tapping a pin scrolls to its card; the selected name is shown beside
the control. Each family's journey is its own line, labelled estimated; the ranking note says the numbers are the cards'
order and the midpoint is not the method; no score is printed. The map is still the device-drawn basemap: no tiles, no
provider, no request.

### Verification

- `tsc --noEmit` clean. `vitest run`: 205 files, 3478 passed (the `remediation` web static-route tests need a web build first and
  pass under `npm run test:routes`). New tests: `navigation-tabs` (16), `families-hub` (13), `plan-timeline`
  (12, driven through the real planner), `save-plan-flow` (+3 for replacing an edited day).
- Browser, fixture build, iPhone 390×844 and 360×780: five tabs reachable; the hub, Plan together → Explore banner →
  plan sheet with the family preselected → Done; Meet halfway with two families and four numbered pins, card → pin and
  pin → card, the map still on screen after scrolling, List mode; the timeline built, arrival changed to 10:30, visit
  to 1 hour (the nap margin went from 6 min, tight, to 36 min), lunch changed to a second real candidate, saved, reopened
  from Plans with the same rows, edited again from the saved day and saved again as the same day (one row in Plans).
  Zero requests to Google in every run.
- `scripts/verify-account-journey.mjs`: 72/72 (sign-up, verification, invitation link, acceptance, what each side sees,
  the Families tab, sharing update, disconnect). `scripts/verify-nav-clearance.mjs`: every tab at seven sizes.
- Private data: the hub reads no connection data beyond the existing section; the bundle carries no profile data (the
  one fixture name in it is the long-standing mock venue copy); routines are shown only to their own household.

### Known limitations

- "Find activities for both families" is Plan together (the next plan is built for both households by the multi-family
  planner) rather than a separate filtered list; Explore's ranking itself is unchanged.
- The journey legs the timeline reports are the planner's own (driving, measured or estimated from distance); the walk
  to lunch from the discovery is offered on the lunch row as an alternative, not used for timing.
- Restaurant alternatives exist only where the venue's nearby-food discovery found candidates; where it found none the
  sheet says so and offers nothing invented.
- Demonstrated against the fixture build (synthetic venues, in-memory accounts); nothing here was run against production.
