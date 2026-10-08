# Personalised onboarding: assessment and sequence

> **Superseded.** Drive time and budget no longer have defaults at all: a new profile has neither, and nothing is limited or
> priced until the parent states one. See `HIDDEN_DEFAULTS_AND_PROFILE_FIELDS.md`. The text below describes the earlier approach
> (silent defaults), which turned an unchosen 30 minutes into a restriction.


Written before any onboarding code changed. Everything below was traced in the repository, not assumed.
The Figma file (`LNpbdnuAWcfWf9spvB7jBz`) holds five approved frames (Home, Venue Detail, Plan, Create a
plan, Generating) and no onboarding frame, so the onboarding takes its language from those frames and from
the locked Home, not from a drawing of its own.

## 1. What the family profile is today

`FamilyProfile` lives in the device-local `familypilot-family-v1` store (AsyncStorage, no version number,
no migration hook). Nothing in it is synced. Saved Places has its own opt-in backup; the profile has none,
and this work keeps it that way.

| Field | Entered in onboarding | Consumers |
| --- | --- | --- |
| `members[].name` | yes | Profile screen, `familyTitle`; **no logic reads a child's name** |
| `members[].age` (whole years) | yes, typed as a number | ten consumers (below) |
| `members[].ageMonths` | yes, only for "Months (under 1)" | `childAgeMonths`, receipt, Profile |
| `members[].dateOfBirth` | **never entered; fabricated** | **no consumer at all** |
| `maxDriveMinutes` | yes | `buildProactiveDayRequest` (a *required* journey constraint on Home), `plan-parties` (planner), Explore default, FilterSheet |
| `budgetTier` | yes | `day-request-matcher` (`scoreTrustedBudget`, budget evaluation), `plan-parties`, Profile |
| `pushchair` (a product name) | **no** (Edit profile only) | `Boolean(profile.pushchair)` is the buggy signal in `scoreTrustedAccessibility`, the caution, `proactive-day-request`, `parse-day-request-client`, `plan-parties`, Plans tab |
| `routines[]` (nap/feed, one family-level list) | yes, one nap and one feed | `routine-fit` (leave-by line and caution, already uses `routine.label`), the planner's home-by windows, the profile receipt |
| `mustHaveFacilities` | no (Edit profile only) | `plannerRequirements`, Profile |

Findings that shape the work:

1. **`dateOfBirth` is a dead field.** `createChildMember` invents it (1 January of `year - age`, or the first of
   a month for a baby) and nothing reads it. Age is a typed number that goes stale every birthday.
2. **Ten places read `member.age` directly** (`trusted-family-score`, `restaurant-score`, `plan-parties`,
   `proactive-day-request`, `parse-day-request-client`, `trips.tsx`, `age-suitability`, receipt, Profile,
   Edit). There is no single derived-age path, which is the defect the brief names.
3. **The buggy path is dead for anyone who only did onboarding.** Every pushchair consumer keys on a free-text
   product name that onboarding never asks. A parent with a toddler in a buggy gets no buggy scoring, no
   caution and no `pushchair` planner flag until they find Edit profile.
4. **`scoreTrustedFacilitiesMatch` decides "baby changing matters" from `youngest <= 3` whole years.** Checked
   after the derived-age path existed: because `age` is now derived from the date of birth on every read, the
   existing threshold is already correct and no months-precise rewrite is needed. (An earlier draft of this
   document proposed one; it would have changed nothing a parent sees.)
5. **Drive time and budget are real inputs** (a required Home constraint, the planner's limit, the budget
   score), so removing the onboarding questions needs safe defaults and a contextual home for them. Home's
   `OutingPreferences` and Explore's `FilterSheet` ("change here for this search only") already exist.
6. **Routines are one family-level list** with no owner. `routine-fit` already prints the routine's label, so
   a label of "Mia's nap" yields "Leave by 12:15 to be home in time for Mia's nap" with no new copy logic.
7. **Venue evidence available to compare against:** age recommendation, toilets, baby changing, parking,
   `pushchairSuitability`, environment, energy level, opening status. `stepFreeEntrance` and
   `wheelchairAccessible` exist in the evidence types but are **not** in the consumer facts
   (`MatchableVenueFacts`), so nothing can honestly be scored against a mobility-aid answer yet.

## 2. Decisions

**One derived-age path.** A new `child-age` module is the only place that turns a date of birth into years and
months, in whole calendar months so a baby's age is exact. `FamilyMember` gains `dobKnown`; the existing
`age` and `ageMonths` stay as *derived* fields refreshed from the DOB on every profile read (the api's
`getProfile`, which feeds `useFamilyProfile`) and on store rehydrate. That keeps the ten consumers correct
without ten edits and without a second source of truth. Members with `dobKnown` unset keep their stored age:
their DOB was invented, so it is never used.

**Mobility is a set, per child.** A child can use more than one mode (a baby in a carrier and a buggy), so
the answer is multi-select over `walks`, `buggy`, `carrier`, `mobility-aid`. What the product derives from
it: a family *brings a buggy* when any child uses one (replacing `Boolean(profile.pushchair)` everywhere
through one `familyUsesBuggy(profile)` that still honours the legacy pushchair name), and a family *needs
step-free access* when any child uses a mobility aid. Because step-free is not in the consumer facts, a
mobility-aid answer changes copy only, as an honest unknown ("Step-free access isn't confirmed here"), never
a score. The first derivation is verified against the existing rule that wheelchair evidence does not
establish buggy suitability.

**Routines gain an owner.** `FamilyRoutine` gets an optional `childId`. Naps are several per child, each an
"around" time; feeds are either fixed times or an interval ("every 4 hours", expanded to the day's times from
a first feed). The planner still receives the flat list it always did, so nothing downstream changes shape;
labels become "Mia's nap" and "Theo's feed", which `routine-fit` already prints.

**Drive time and budget leave onboarding** and keep their defaults (30 minutes, moderate) on the profile, so
every existing consumer keeps working. Home's outing preferences and Explore's filter sheet remain where a
parent changes them for today. Edit profile keeps them as defaults a parent can change; they are not asked
at the start.

**Candidate extra questions, and the verdict** (can we use it, is there reliable venue evidence, would it
change output, is it persistent, is it worth the friction):

| Candidate | Verdict |
| --- | --- |
| Baby changing | **No question.** Derived from age: the existing threshold (youngest child 3 or under; Home's request uses 2 or under) switches the baby-changing check on, and age is now always current. Asking adds nothing. |
| Toilet training | **Deferred.** Toilets evidence exists but the answer would change one weight; progressive profiling later. |
| Highchair | **Deferred.** A restaurant-only fact on the OSM path; not enough Venue Detail evidence. |
| Step-free / mobility aid | **Asked, as part of mobility.** Changes copy only, honestly, until evidence exists. |
| Quiet / sensory | **No.** No venue evidence field to compare against; asking would collect an answer nothing can use. |
| Interests | **No.** Progressive profiling after the core product, as the brief says. |

## 3. Sequence

1. **This document.** (done)
2. **Data model and the derived-age path**, with the legacy migration: `child-age`, `dobKnown`, rehydrate
   migration, malformed and partial legacy profiles. Tests first. Nothing visible changes.
3. **Consumers**: route every age read through the derived path; `familyUsesBuggy` replaces the pushchair
   boolean; per-child routines with owners; facilities match by months; step-free honest-unknown copy.
   Semantic tests per consumer, a mutation pass on each new contract, multi-child cases (one baby, one
   toddler, one older child, baby + toddler, toddler + older child, mixed needs).
4. **Explanations**: the Family Fit panel states, from the profile and only with evidence, why a place
   works or not for these children, by name; caution wording for age and buggy; the routine line by name.
5. **The onboarding itself**: parent; children with name and DOB (existing date field, month-precise babies);
   then per-child mobility, naps and feeds, adaptive by derived age and by name. Built from the Home/Figma
   language, rendered at 360/390/430, keyboard and small-screen checked, verifiers extended.
6. **Existing users**: a lightweight "add Mia's birthday" prompt in Profile for legacy children, never an
   invented DOB.
7. **Edit profile** gets the same per-child model so onboarding and settings cannot drift.
8. **Adversarial pass**: dead fields (every collected field traced to a consumer by a test), fabricated
   personalisation, privacy (no profile field reaches any network call or the Saved backup projection).
9. **PR, CI, merge, deploy verification** per the established workflow, one PR per coherent stage.

## 4. Constraints kept

- The family profile stays device-local. No new network path, no cloud table, and a test pins that the Saved
  backup projection never includes a profile field.
- Unknown stays unknown. No personalised sentence is produced without both a profile fact and a venue fact.
- Home is not redesigned. Any change to Home output is a consequence of better profile data, and is checked
  against the locked captures.

## 5. What stage 3 built (the onboarding screens)

Four steps, three when no child is young enough to be asked about naps and feeds. Each is a thin editor
over `onboarding-draft.ts`, where the rules live and are tested.

| Step | What a parent sees | What it becomes |
| --- | --- | --- |
| Parent | First name, home town or postcode. Privacy is one quiet hint under the town. | `parentName`, resolved home centroid |
| Children | Per child: name, then date of birth as three number boxes. The exact age appears the moment the date lands ("Theo is 2 years 3 months"). | `dateOfBirth` + `dobKnown: true`; `age`/`ageMonths` derived |
| Mobility | "How does Mia usually get around on a day out?" Choose all that apply. | `mobility[]`, one set per child |
| Naps and feeds | Only for children under 4 (naps) and under 3 (feeds). Several naps, each a time and a rough length; feeds at set times or every N hours from a first one. | `FamilyRoutine` entries owned by the child |

Adaptive rules (`questionsFor`, in months): under 12 months are offered carrier, buggy and wheelchair or
mobility aid, never "walks"; 12 to 47 months get walks, buggy, carrier and aid; 4 and over lose the
carrier. Naps are asked under 48 months, feeds under 36. A feed under a year is a "feed", later a "meal".
Answers the child's age no longer allows (the date was edited after choosing) are dropped when the profile
is built.

Drive time and budget are no longer asked. They keep the defaults (30 minutes, moderate) every consumer
already expects. Home's "Maximum drive each way" and Explore's filter sheet are where drive time is changed
for a day. **Open item for the owner:** budget has no contextual control anywhere yet, so the default
`moderate` is applied silently until a parent edits it in Profile. A heuristic line, "Within your usual
budget", and the drive caution "Further than your usual 30 min drive" both say "usual" about a default the
parent never chose. Stage 4's adversarial pass deals with that wording.

`verify-onboarding-flow.mjs` drives the real screens for six family shapes at two widths and asserts the
stored profile and the Venue Detail sentences that follow, and it runs in CI beside the other verifiers.

## 6. What stage 4 built, and what the adversarial pass found

**Edit profile now shares the onboarding's child model** (`profile-edit-draft.ts`). The old editor rebuilt
every child with a new id on every save, which would have detached each routine from its child and dropped
their mobility and date of birth the first time a parent changed anything. Now a child keeps their id, an
existing child with no real date of birth keeps the age they were saved with until a parent enters one
(`dobKnown` stays false, nothing is invented), and routines saved before routines had an owner are kept
exactly as they were under "Other naps and feeds" instead of being handed to a child on a guess. The
Profile screen says "add birthday" against a legacy child and its suggestion box opens Edit.

**Adversarial pass, in the order the brief lists it:**

| Risk | Finding | Outcome |
| --- | --- | --- |
| Dead fields | Every answer traced to an output by `onboarding-field-consumers.test.ts` (name, date of birth, buggy, mobility aid, nap, feeds, parent, home). | None found. |
| Fabricated personalisation | "Within your usual budget" and "Further than your usual 30 min drive" claimed a habit about defaults the parent never chose. | Reworded to what is true: "Fits a moderate spend", "Further than the 30 min drive we're using". |
| Fabricated personalisation | A wheelchair caution said only "step-free isn't confirmed" beside the pushchair-based "Mostly step-free". | Now about wheelchair and mobility-aid access. |
| Fabricated personalisation | "Add your nap and feed routine in Plans" shown to a parent who had just entered them. | Says they are saved and where to run the check. |
| **Privacy: a regression of mine** | Child names written into planner routine labels would have travelled with the opt-in planning-workspace backup. | Planner routines carry no name and no child id (`routinesForPlanner`); pinned by test. |
| **Privacy: pre-existing, dormant** | `parseDayRequest` posted the whole profile (names, dates of birth, mobility, routines) to `/api/recommendations/parse-request`, which can forward to a language model. Nothing in the UI calls it today. | Now posts a projection: each child's age, the limits and a buggy flag. Pinned by test. |
| Privacy | No network-touching module may reference the new child fields. | A source scan in `family-profile-privacy.test.ts` fails if one does. |

**For the owner, not changed here because it is a privacy-architecture question.** The opt-in "Back up this
device's plans and routines" and the friend-connection feature send the planning family: each child's age,
the home town and its coordinates, whether a buggy comes, and routine times. That predates this work, and the
profile decision (device-only, no children's data, nothing home- or routine-derived) reads as broader than
what that feature does. It carries no name and no date of birth, but it does carry ages, home coordinates and
routine times. Whether that is acceptable, or the planner should work from less, is a product decision.
