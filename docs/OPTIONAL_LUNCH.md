# Lunch is the parent's call

**Branch `feat/optional-lunch`, draft PR. Not merged, not deployed.** Approved design: Figma page "11 — Optional lunch (proposal)"
(`376:2`). FamilyPilot no longer puts a lunch stop into a plan on its own. The day is built around the chosen place, the journey
and the family's routines; lunch is a question the parent answers.

## What changed

- **Default: no lunch.** Before #198 every plan with a place to eat nearby got one; #198 kept that but dropped it when it would
  start outside 10:30 to 14:00. Now the plan is built without a meal unless the parent chose one. The window arithmetic
  (`meal-window.ts`) stays as advice in the picker ("Would start about 15:30, later than most families eat lunch. Your call.").
- **One question, asked once.** Under the timeline: "Add lunch to your day?", "We can suggest somewhere near your activity, or
  you can add your own place.", **Choose a place** / **No thanks**. "No thanks" is kept with the plan (`lunch=off`) and leaves a
  quiet "No lunch in this day. Add lunch" row. The routine advice option "add lunch" and the timeline's lunch edit open the same
  picker; nothing is ever inserted unseen.
- **The picker shows the evidence and confirms.** Places come from the OpenStreetMap lookup the venue page already made (no new
  request, no Google). Each place says: type and cuisine as mapped; the walk, estimated from distance unless routed; which
  family facilities are listed (high chairs, baby changing, outdoor seating, step-free), or that none are listed, which is not
  the same as none; the mapped opening-hours text, or that none is mapped; and when lunch would start. Order: places listing the
  facilities this family needs (a child under three, or a baby-changing must-have) first, then the shortest walk. A place is
  selected, then confirmed with **Add lunch to my day**; only then does it enter the day (`lunch=on`, `lunchPlace=…`). No rating,
  availability, "open now" or Family Fit is shown for a restaurant, because none exists.
- **Their own place.** Name and an optional time (`lunchOwn`, `lunchOwnAt`). It is shown in the timeline at that time (or straight
  after the visit), with "You added this place", "45 min at the table, assumed", and "We don't know where it is, so the journey
  there and your time home aren't adjusted." It is never sequenced: the planner would have to invent where it is, and it does
  not. The caveat is on the plan too.
- **Kept through everything.** The answer travels on the route (`lunch`, `lunchPlace`, `lunchOwn`, `lunchOwnAt`), through Change,
  Edit and the saved day's `draft.params`, so saving, reopening, editing and rebuilding keep it. **A day saved before this change**
  has `lunchPlace` with no `lunch` decision: it is read as a chosen lunch and kept; nothing is removed from a saved day.
- **Not built:** an opening-hours parser, booking, availability, a restaurant provider, Family Fit for restaurants. The
  `lunch-outside-window` caveat and the `auto` meal mode remain in `create-plan.ts` for older callers but the plan screen no
  longer uses them.

## Where it lives

`app/plan.tsx` (decision, picker, own place), `src/components/planning/PlanScreenView.tsx` (the question),
`src/services/planning/lunch-evidence.ts` (what can honestly be said about a place; ordering), `create-plan.ts` /
`plan-view-model.ts` / `plan-timeline.ts` (`ownLunch`, the `own-lunch` caveat and row).

## Evidence (final code)

- Unit: `optional-lunch.test.ts` (16): evidence lines and provenance; no invented claims; ordering; the plan builds without a
  meal; a chosen lunch stays whatever the hour; the own place is a row at the given time with no coordinates and the caveat; the
  saved source reads back; the screen's pins. `iphone-journey-corrections.test.ts` updated: the window is advice, not a rule.
- Browser (`verify-optional-lunch.mjs`): built without lunch; the question with the approved wording; No thanks remembered
  through save, reopen and edit; the picker's evidence and confirm; chosen lunch saved and reopened; own place saved, reopened
  and on the saved plan; a legacy saved day keeps its lunch; no request to Google. `verify-halfway-handoff.mjs` (late start is
  advice; morning lunch chosen, kept, taken out) and `verify-timeline-persistence.mjs` (lunch chosen and confirmed before the
  edits) updated.

## Not verified

A real iPhone (the sheet, the time picker, VoiceOver on the radio rows); production (the OpenStreetMap lookup behaves the same,
but the canary is still outstanding).
