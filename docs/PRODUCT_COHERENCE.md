# Product coherence: one product, one question

> **Tell me what will work for my family, today, and help me build a realistic plan around everyone involved.**

This is the audit, the design and the rules behind the coherence pass that followed the first real-phone test of production.
It records what was found, what was kept because it was already the stronger approach, what changed and why, and what is
deliberately not done.

Nothing here is merged or deployed. It is on the branch `claude/familypilot-home-inspection-t2ev9t` for owner review.

## 1. What the audit found

| # | Finding | Root cause | Decision |
|---|---|---|---|
| 1 | Home and Explore read as two venue directories | Both rendered the same category rail from one taxonomy; Home's heading was the generic "Select your plan" | Give them different jobs (below) |
| 2 | "Start" offered three presets and meant "earliest you can leave" | `planDraftDefaults` had `leaveAt` and `START_QUICK_CHOICES`; the sequencer scanned for an arrival | Start is when you want to **arrive**; real time picker; leaving is worked back |
| 3 | "Our family · 1 adult" guessed | Only the app user was captured as an adult | A household step in onboarding, Profile editing, and named toggles in Who's coming |
| 4 | "How long" forced a guess | Four presets; the planner needed a number | `Not sure`, `All day`, custom; FamilyPilot decides and says what it assumed |
| 5 | A nap overlapping the day was a failure | `sequencer.tryOrder` returned `routine-conflict` for any overlap with an `atHome` routine (every onboarding routine is `atHome: true`) or a travel overlap with an out-of-home one | Overlaps are **insights**, never failures; advice and verified options instead |
| 6 | Two families' routines were two schedules | Per-family notes only | One day read across everyone, with who is affected stated |
| 7 | No way to meet another family | Plans tab "Find our best plans" searched around every family (new cache keys, paid-discovery risk) and hard-blocked on routines | A new engine over places already in hand; the old finder retired from the UI |
| 8 | Venue Detail buried the action | Description above Family Fit; Create a plan at the very bottom; a second planner ("If you leave now") with a hard routine block | Family Fit, Today, **Create a plan**, What to know; the rest one tap away |
| 9 | Family Fit spoke about "the family" | One verdict, names only where a fact named them | A lens per child; the sentence keeps children apart |
| 10 | Two planning journeys | The Plans tab had its own copy of the form; Add family sent you to Trips mid-flow | Venue → Create a plan → Plan; the Plans tab is a hub |
| 12 | Nav clearance | Per screen, ad hoc | A single verifier across every tab, seven phone sizes |
| 13 | Profile hid connections | Connected families lived inside the Plans tab | Profile has YOUR FAMILY and CONNECTED FAMILIES; one shared model |

### What was already the stronger implementation, and is kept

* **The sequencer's pure design and the matrix** (no I/O in the scheduling; injected matrix, clock). Extended, not replaced.
* **Family Match's unknown-evidence rules.** Unknown is never a fit and never a failure; parent reports keep their label.
* **`routinesForPlanner`** stripping children's names and ids before the planner/backup: names are added back at render time
  instead of being put in the planning model (the suggested "names in the planner" was rejected on privacy grounds).
* **`matchVenueToDayRequest`** as the one definition of "works for this family": Meet halfway applies it to both families.
* **The Create Plan sheet's four-row shape** and the approved visual identity: the rows are the same four, answered better.
* **`requirement-unmet` failing closed** (a must-have nobody has confirmed still stops a plan). Kept; see "Owner decisions".

## 2. Home vs Explore

* **Home** is the curated answer: *Best for your family today*, with *Picked for Sloane and Ozzie today* under the greeting.
  Its rail holds **situations** (For you, Indoor, Outdoor, Fits your day, Free, Rainy day, Under 1 hour), not kinds of place.
  *Fits your day* appears only when enough places can say "Leave by 12:00 to be home in time for Ozzie's nap" (needs routines in
  the profile and a nap or feed still ahead today), so it is usually simply absent. Each deck card's line leads with **why**:
  the family's routine first, then a fact about a particular child, then anything else confirmed.
* **Explore** is browsing: *Explore London* ("Browse, search and filter family days out across London"), the category rail
  (Parks, Museums, Farms…), search, filters. The two share one rule set (`venue-taxonomy.ts`) so a word never means two things;
  they no longer offer the same list.

## 3. The planning journey

```
VENUE  →  CREATE A PLAN (small sheet)  →  BUILDING YOUR DAY  →  THE PLAN
```

* **One entry.** A plan begins from a place. The Plans tab is a hub (start a plan, Meet halfway, your saved plans); it no longer
  contains a second form. "Change the plan" on a plan that could not be built returns to the venue with the sheet open on the
  same answers. A one-tap fix (a start, a length) rebuilds in place.
* **Routes.** `/venue/[id]` (+ `plan=open` prefill) → `/plan` (`venue, date, start, visit, parties, who, home, buffer,
  setting, lunch`) → `/saved-plan?id=` for a saved day. `/halfway` hands a place and both families to `/plan`.
* **State.** The plan screen stores what the planner answered (`PlanViewModelInput`), not the rendered view; names are added
  at draw time from the local profile. Params are narrowed to primitives before anything memoises on them (the earlier
  3,094-request loop), and generation is bounded to three attempts per set of answers.

### The sheet

* **When**: Today / the coming weekend day / Other date (unchanged).
* **Start**: a real time picker (`<input type=time>` behind the drawn field on web). *When you want to arrive. We'll work out
  when to leave.* A start in the past is not an error: see "too soon".
* **Who's coming**: `SHAW FAMILY — Aidan, Ellie, Sloane, Ozzie`, everyone selected; toggle someone out ("Planning without
  Ozzie"). A child left out contributes no age, buggy, nap or feed. Other families: connected, or added by first name +
  postcode inline.
* **How long**: Not sure · 1 hour · 2 hours · 3 hours · Half day · All day · Custom (15–480 min).
* **More options**: Home by, extra time each way, setting: the old planner's limits, kept but out of the way.

## 4. Duration

| Choice | Behaviour |
|---|---|
| A number | Used as given. Never shortened. |
| **Not sure** | The venue's own typical visit length if its record has one (*venue-typical*); otherwise a typical length for the kind of place (*category-typical*), **worded as an assumption** ("typical for a farm. It is a planning assumption, not something we know about this place"). Then, if a routine that has to happen at home would be missed, shortened (to a quarter hour, never below an hour) so everyone is home before it (*routine-limited*: "…which gets you home before Ozzie's nap at 12:15"). |
| **All day** | Until the place closes (*until-closing*) or, with no known closing, a stated 6-hour cap (*day-cap*, again an assumption). No lunch is bolted onto the end of an all-day visit. |
| Custom | 15–480 minutes. |

## 5. Routine clashes are not errors

| Tier | What it is | What happens |
|---|---|---|
| **Hard conflict** | Cannot be built: closed, closes during the visit, journey beyond a stated limit, a start that is in the past, a must-have ruled out (or unconfirmed: fails closed), a return-by that cannot be met | A sequencer **failure**, with the exact fix where one exists |
| **Soft clash** | A routine kept at home overlaps the outing; a feed falls on a drive | The plan is built. Advice plus verified options |
| **Informational** | A routine the family says happens out; a nap on a drive (some children nap in the car); a feed that lines up with the lunch stop | One line, nothing more |

* The sequencer reports each overlap as a `RoutineInsight` (which routine, when, during which part of the outing). It never
  produces `routine-conflict`. `routine-advice.ts` turns insights into words; it states only what is known.
* **Options are verified**, not guessed: `day-plan` re-sequences the same day with the same matrix for an earlier start, a later
  start and a shorter visit, and offers one only if it removes an overlap without adding another and still passes opening hours
  and every limit. ("Earlier" is simply not offered if leaving would be before now.)
* Pushchair advice appears only for a family that uses a buggy and only from the venue record; an unknown rating is said to
  be unknown. Feeds say "Allow about 30 minutes"; if lunch is already in the day and lines up, it can double as the feed;
  if a place to eat is known and lunch is not in the day, **Add a 45-minute lunch and recheck the timings** is an option.
* Nothing claims a child will sleep, or that a venue has somewhere to feed a baby.

### Examples (real planner output, from the tests)

* Nap 12:30, home 12:35: *"Ozzie's nap · 12:30–14:00. It falls on the drive home. If they usually nap on the move this could
  suit them. If not, the options below move the day around it."* → *Stay an hour and a half instead.*
* Nap 10:30 during the visit, buggy family, pushchair "good": *"…falls while you're at Kentish Town City Farm. Pushchair access
  is recorded as good here, so a nap in the buggy could work."*
* Feed 11:00 during the visit: *"Allow about 30 minutes for it while you're out."* + *Add a 45-minute lunch and recheck the timings.*
* Not sure + nap at 12:15: *"You weren't sure how long, so we kept it to about an hour and a half, which gets you home before
  your nap at 12:15."*

## 6. Two families

One day, read across everyone: the same advice, per routine, with whose it is ("the nap for Hannah's family…"), then lines that
only exist because there are two: who is affected ("Only your family has a routine that overlaps the day"), whether the
routines line up ("Both families' naps fall between 12:30 and 13:50, so planning around one covers the other"), and when each
family is home. A connected family's routines are used **only if they chose to share them**, and then only their time, length
and kind (nap or feed): never a name. With only a postcode, nothing is claimed about their children or routines, and the
plan says so. A connection made before routines carried a kind shares only "Home time": it is called a *home routine*, never a
nap it may not be.

## 7. Meet halfway

**Not the midpoint.** The geometric middle can be a motorway junction and ignores everything that matters. Nothing computes a
midpoint. Each place already in hand (Home's London set) is asked the same questions of **both** families:

1. **Journey**: each family's own time from where they set off, an estimate from distance and said to be one. The longer journey
   matters more than the average; a lopsided split is penalised and the fairer shorter-for-whom sentence is stated.
2. **Suitability**: the planner's own `matchVenueToDayRequest` per family (their limit, must-haves, age policy; unknown fails
   closed), so every option can actually become a plan.
3. **Reasons**, confirmed only: your own Family Fit; ages for both where both are known; both families' routines against the
   outing; open at the time they would be there; baby changing, café, parking where confirmed.
4. **To check**, stated and never counted as a fit: unconfirmed hours; a routine that falls in the outing ("the plan will suggest
   options"); that only the journey could be checked for a postcode-only family.

*Journey*: *about 28 min for your family · about 31 min for Hannah's family*. **Journey**: `/halfway`: choose a connected family or add one by
postcode inline → date and start → ranked options → **Plan this day** builds the normal plan for both. It reuses
`useConnectedFamilies`, `AddFamilyByPostcode`, the shared plan route and the existing estimate; it makes **no** search, no paid
route request and no new cache key.

## 8. Venue Detail

Order: name and journey → **Family Fit** (is it good for us?) → **Today** (will it work?) → **Create a plan** → **What to know**
→ food nearby → getting there → *More about this place* (description, photographs, parents' tips; collapsed) → **How we know
this** (evidence and provenance, one tap, unchanged). The legacy "If you leave now" block (a second, hard-blocking planner)
is removed: Create a plan does that job with the family's routines as advice.

## 9. Family Fit across children

`evaluateFamilyMatch` now produces a lens per child (`works` / `check` / `concern` / `unknown`) from the lines that name them, and
the headline is built from the lenses:

* *Good for Sloane and Ozzie today*
* *Could work for Sloane, but check buggy access for Ozzie*
* *Probably not for Ozzie today* (a confirmed breach about one child)
* *Good for your family today* when no confirmed fact is about a particular child. Never a guess.

The score still ranks; the sentence is what is told. Parent-reported evidence keeps its label and is never a reason.

## 10. Profile and Connected Families

Profile → **Your family** (adults then children: you, partner, co-parent; children with age and how they get around; edit) →
**Connected families** (accepted connections with what they share in one line; families added by postcode; pending invitations;
**+ Invite another family**; *Meet halfway*; **Disconnect** with the honest note that what was shared cannot be recalled). One
hook (`useConnectedFamilies`) feeds Profile, Who's coming and Meet halfway.

## 11. Privacy and the data model

* New on-device fields: `FamilyProfile.familyName`, `FamilyMember.relationship` (adults). Adults' dates of birth are never asked
  for. Nothing here leaves the phone.
* The planner/planning backup still receives no child's name or id. Saved days store `visit`, `alternatives`, the venue's
  pushchair suitability, family **ids** that use a pushchair, and a `hasRoutines` flag: facts about the day and the venue.
  Names appear only at draw time, from the profile.
* Connections share what they always did (first-name label, area rounded to ~1 km, children's ages, drive limit, preferences).
  Routines remain **opt-in** (default off) and now carry their **kind** (nap/feed) so advice can be accurate; never a name or an
  id (the server rewrites ids to `busy-n`). The consent copy says so.
* Add-by-postcode stores a first name, a postcode area and coordinates on this phone only.

## 12. Cost and providers

* **New paid or provider calls: none.** Meet halfway and the alternatives reuse the places Home already loaded and the existing
  free distance estimate. The postcode lookup is the existing free `/api/planning/location`. No Google Places/Routes behaviour
  changed; cost controls untouched.
* The retired Plans-tab finder (`recommendPlans`) was the one path that could open new place-search cache keys; it is no
  longer reachable from the UI.

## 13. Not done, and why

* VoiceOver/TalkBack and OS larger text: **not tested** (manual).
* Real-device safe-area inset: cannot be injected into desktop Chromium; covered by `safe-area-footer.test.ts` and a manual pass.
* Native (iOS/Android) time picker: web uses the platform's own `<input type=time>`; native keeps the HH:MM text field.
* Restaurant photographs are never fabricated; the placeholder stays.

## 14. Owner decisions still open

1. **Unknown must-haves still block a plan** (fail closed), while Family Fit says *Possible*. Kept as the documented principle;
   say if you want a plan to proceed with a "check this" line instead.
2. **Home rail**: the category chips moved to Explore. Say if you want any back on Home.
3. **Connections made before this release** share routines as "Home time" (no kind). They read as a *home routine* until the
   family re-connects with the updated consent.
