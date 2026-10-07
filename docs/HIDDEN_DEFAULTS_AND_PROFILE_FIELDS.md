# Hidden defaults, profile fields and onboarding

The rule: **an untouched system default must never become a user restriction.** This note audits every default the app
filled in, classifies every profile and onboarding field, records what changed, and explains how existing profiles are
handled.

## The bug that started this

Every profile was created with a 30 minute journey limit and a "moderate" budget that nobody chose. A place 34 minutes
away (Whitechapel Gallery, from the real-device recording) was cautioned as "4 min over the 30 min drive we're using" and
ranked down. Beyond 45 minutes it was a confirmed breach, i.e. **Poor**.

## Measured impact of the correction

Harness: `familypilot/scripts/measure-defaults-impact.test.ts.txt`. Catalogue: 151 stored destinations; eight London homes
(N1, E17, SW4, W5, SE10, NW7, BR1, HA1) × five household shapes = 40 households, 6,040 household/venue pairs, comparing the
old unchosen 30 minutes + "moderate" with none. Hours open every day, so nothing here is about opening state.

| | with the old default | no limit stated |
| --- | ---: | ---: |
| pairs more than 30 minutes away | 2,280 of 6,040 (37.7%) | |
| pairs carrying a "drive-over" caution or breach | **2,280** | **0** |
| Excellent | 25 | 59 |
| Good | 399 | 731 |
| Possible | 2,187 | 2,386 |
| **Poor** | **864** | **24** |
| Not yet reviewed | 2,565 | 2,840 |

1,058 pairs (17.5%) change verdict, all in the direction of removing a distance penalty: Poor to Possible 396, Poor to
Not yet reviewed 275 (an unreviewed place had been called Poor for distance alone), Poor to Good 169, Possible to Good 184,
Good to Excellent 21, Possible to Excellent 13. Top-ten overlap with the old ordering is 0.72 on average (minimum 0.60):
about three of every ten places at the top of a household's list are different places, almost all of them further away and
no worse for the family. This is the **intended** change and is the production ranking change the brief called a
correctness bug; it is reported here because it is large.

Those numbers describe the **synthetic homes and stored catalogue**, not production traffic, and not real households.

## What now happens with no stated limit

- Travel time is still shown ("34 min away", labelled as an estimate). It is a fact, not a verdict.
- **Family Fit**: no caution, no breach, no "over the limit". The verdict is the same at 5 and 110 minutes (tested).
- **Ranking**: distance still orders places, gently. Without a limit the proximity score slopes from 98 (15 min) down to a
  floor of 55 (about 100 min): 34 minutes scores 89 where the old default scored 43 (75 at 30 minutes). It is the only
  place distance enters, it is a few points of the number, and it is the "transparently inform proximity ordering" the brief
  allowed.
- **Budget**: with no budget stated, price is not a factor at all. It is left out of the blend (`blend.ts`) rather than scored
  as neutral, and no "fits a moderate spend" line is produced.
- **Requests** (proactive, parsed, planning): no journey constraint and no budget constraint exist unless the family stated
  one. Server (`day-request-schema.js`) and client behave the same.
- **Plans and Halfway**: a family with no limit has nothing rejected for distance. Searches are sized by a reach constant
  (`NO_LIMIT_SEARCH_MINUTES = 45`, `PLAN_SEARCH_REACH_MINUTES = 50`) that is never shown or applied as a limit. A family
  added by postcode is no longer stored with a 120 minute placeholder.
- **Explore**: "Any" means any for places (already true) and now for restaurants (it used to mean the profile limit plus ten
  minutes, so with the unchosen default it hid every restaurant beyond 40 minutes while the chip said "Any"). The filter
  sheet no longer says "Your profile default is 30 minutes".

## Audit of every implicit, persisted or suggested default

Classes: **explicit** (the parent chose it), **fact** (about the family), **filter** (temporary, this search), **suggestion**
(offered, editable, re-worked each time), **planning default** (the sheet opens on it), **legacy** (the app wrote it).

| Default | Where | Class | Problem | Now |
| --- | --- | --- | --- | --- |
| `maxDriveMinutes: 30` | `createEmptyProfile`, `buildOnboardingProfile`, migration fallback, Edit Profile `useState(30)`, Explore `?? 30` | legacy | Became a hard restriction (caution, breach, plan rejection, request constraint) | Removed everywhere. Optional; only a stated value applies |
| `budgetTier: 'moderate'` | same | legacy | Nudged scores, built "fits a moderate spend" lines, sent a budget constraint | Removed. Optional; no budget means no budget factor |
| Restaurant "Any" distance | `filter-restaurants.ts` | legacy | Meant profile limit + 10 | Means any |
| Guest family `maxDriveMinutes: 30`, `'moderate'` | `trips.tsx` blank family | legacy | Another family's limit assumed | Unset |
| Postcode family `120`, `'moderate'` | `AddFamilyByPostcode` | legacy | A placeholder stored as a limit | Unset |
| Remembered plan start/date | plan sheet `setPlanningOptions` on every submit | suggestion stored as a choice | A start worked out from 14:10 came back as "your usual start" | Only a value the parent changed is remembered (`optionsToRemember`) |
| Plan start `10:00` / next half hour, `Not sure` length, 15 min buffer, `either` environment | `plan-draft.ts` | planning default | Fine: shown on the sheet, editable, re-worked each time | Unchanged. Not persisted unless changed |
| Parent member `age: 30` | `createParentMember`, `createAdultMember`, migration | legacy | An invented adult age. Never shown, never read by a recommendation or a price (verified by search) | Left; see "Not changed" |
| `completionPercent` | `computeCompletionPercent` | system | Counted drive, budget, car and memberships; a new profile started at 25% for values the app made up; the number is not displayed anywhere | Essentials only (name, home, a child, real birthdays) |
| Profile suggestions | `getProfileSuggestion` | suggestion | Nudged toward car (hidden feature), pushchair make "for packing tips" and memberships "to surface savings" (neither exists) | Only the birthday nudge remains |
| Must-have facilities | Edit Profile | explicit, optional | Works: an unconfirmed one is a caution, not a blocker | Kept |
| Explore drive/budget filters | `filters-store.ts` | filter | Default `any` already; the sheet copy contradicted it | Copy fixed |
| Planner "Must-have facilities (unknown details exclude a place)" | `FamilyEditor` | explicit | The parent chose it | Kept |
| Focused recommendations radius | `focused-recommendations.ts` | system | Sized by the limit | Reach constant when none |
| `focused-recommendations` provider open-now flag | filter | system | A today-dependent hidden filter | Dormant (no screen calls it); recorded in `STABLE_FAMILY_FIT.md` |

## Field-by-field: classification and treatment

**A** Essential (recommendations don't work without it) · **B** Optional (works, improves things for some families) ·
**C** Future (nothing uses it yet) · **D** Redundant / invented.

### Onboarding

| Field | Class | Used by | Treatment |
| --- | --- | --- | --- |
| Your first name | A | greeting, household title, connection label | Kept |
| Home town or postcode (+ resolved centroid) | A | every distance, the plan's start point, Halfway | Kept. The precise point stays on the device |
| Other adults (name, relationship) | B | "Who's coming", plan party size | Kept as step 2, now says **Skip for now** when empty; also in Edit Profile |
| Household name | B | the household heading ("Shaw family") | Kept (optional) |
| Child name | A | every personalised sentence | Kept |
| Child date of birth | A | age in months on the visit date, every age rule | Kept |
| How each child gets around (mobility) | A | buggy access, step-free cautions | Kept |
| Naps and feeds | B | the planner only, once there is a plan. Never a pre-plan input | Kept, only for families with a child young enough; copy says **Optional**, button says **Skip for now** when nothing is entered; editable any time in Profile |
| Journey limit | B | none until stated | **Not asked at onboarding; none stored** |
| Budget | B | none until stated | **Not asked at onboarding; none stored** |

Steps now: 4 (name and area, household, children, how they get around), plus the optional day-routine step for babies and
toddlers. Nothing that was collected is lost; nothing that was optional blocks.

### Edit Profile

| Field | Class | Used by | Treatment |
| --- | --- | --- | --- |
| Name, home area, household name, other adults, children (name, date of birth, mobility, naps/feeds) | A/B | as above | Kept |
| Longest journey you'd make | B | Family Fit cautions, plan journey limits, Halfway | Kept, now **optional with a "No limit" chip, selected by default**. Copy: "Leave these alone and nothing is limited" |
| Budget | B | scoring and requests | Kept, now **optional with a "No preference" chip** |
| Must-have facilities | B | caution when unconfirmed | Kept |
| Car | C | Car Fit (feature deferred) | **Hidden** until `car_fit` ships; saved value kept; profile tab row hidden |
| Pushchair make and model | C/D | nothing reads it | **Hidden** (gated on `packing`); saved value kept |
| Travel cot | C/D | nothing reads it | **Hidden** with equipment; saved value kept |
| Memberships and passes | C | nothing reads it | **Hidden** (new deferred feature `memberships`); saved value kept |
| Parent age | D | nothing | Not shown; invented value left in place (see below) |

While a section is hidden, Save does not include its keys, so a stored car, pushchair, cot or membership list is never
overwritten (tested).

### Privacy and capability check

Child names and dates of birth stay on the device and are not in any snapshot or request. The connection snapshot gains no
field; it now **omits** a limit or budget that was never stated instead of sharing a default as if it were the family's
preference. The server stores `null` rather than inventing `moderate`. Nothing in this change widens what is shared.

## Existing profiles (there are no server-side profiles)

There is no profile table (read-only schema listing, 2026-10-07), and the tables that could hold a snapshot of one (`planning_connections`, `planning_workspaces`, `plan_invites`, `saved_places_backups`) have 0 rows. Profiles live in the device's storage. So legacy handling is a
client-side, one-time storage migration, not a database change:

| Stored | Cannot tell choice from default? | Migration (family store v1 to v2) |
| --- | --- | --- |
| `maxDriveMinutes: 30` | yes, it was the default and also a chip | cleared (read as unset) |
| `maxDriveMinutes` 15, 20, 45, 60, 90 or any other | no, only a parent could have set it | **kept** |
| `budgetTier: 'moderate'` | yes | cleared |
| `budgetTier: 'budget'` or `'premium'` | no | **kept** |
| anything else on the profile | | untouched (children, routines, must-haves, car, equipment, memberships, household) |

The cost of being wrong is one tap: a parent who did choose 30 minutes can choose it again, and from then on it is kept as a
choice (version 2 profiles are never cleared). The cost of keeping an ambiguous value is a restriction nobody asked for.

Planning state (saved families, remembered start) has its own version (0 to 1): the same 30 / "moderate" are cleared on
saved families, the 120 minute postcode placeholder is cleared, and the remembered start is reset because the plan sheet
used to store the start it opened on. Typed limits and budgets, saved plans and saved days are kept. Account backups
restored with `replace` get the same cleaning.

## Not changed, deliberately

- Parent `age: 30`: invented but unused, shown nowhere. Replacing it with "unknown" touches the household model and every
  fixture, for no visible effect. Revisit with the pricing work (adult admission needs an adult count, not an age).
- The planner's "unknown required facts fail closed" rule: it applies to must-haves the parent chose.
- Plan start/duration suggestions: still suggestions, editable, re-worked each time.

## Tests

`true-defaults.test.ts` (new, 24 tests): the Whitechapel case end to end (no caution, no breach, no drive wording, same
verdict at 5 and 110 minutes, gentle ordering, still flagged under a stated limit); no budget means no budget factor and a
stated one still matters; proactive, parsed, planning and server requests carry journey/budget constraints only when
stated; an 80 minute place is eligible with no limit and excluded with one; restaurants "Any"; the migrations (30 /
"moderate" cleared, 45 / "budget" / "premium" kept, an explicit 30 in a v2 profile kept, planning families and remembered
start); completion and the receipt; what the plan sheet remembers; the server request schema. Existing tests for the
affected contracts were rewritten to the new behaviour.
