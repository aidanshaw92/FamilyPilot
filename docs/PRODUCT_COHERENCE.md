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

* **Home** is the curated answer: *Best for your family*, with *Picked for Sloane and Ozzie* under the greeting (no "today": Home is about the family, not about leaving now; see STABLE_FAMILY_PERSONALISATION.md).
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

| State | What it is | What happens |
|---|---|---|
| **Hard conflict** | Cannot be built: closed, closes during the visit, journey beyond a stated limit, a start that is in the past, a must-have the venue is **confirmed to lack**, a return-by that cannot be met | A sequencer **failure**, with the exact fix where one exists |
| **Unresolved must-have** | A must-have the family stated that **nobody has confirmed** at the venue (unknown, not missing) | The plan **is built**. A prominent *Needs checking before you go* block, first on the Day plan, says exactly what to check |
| **Soft clash** | A routine kept at home overlaps the outing; a feed falls on a drive | The plan is built. Advice plus verified options |
| **Informational** | A routine the family says happens out; a nap on a drive (some children nap in the car); a feed that lines up with the lunch stop; an assumed visit length | One line, nothing more |

**Must-haves (decided).** *Confirmed missing* is a hard conflict. *Unknown or unconfirmed* is a prominent warning and never a
blocker: the parent can still create the plan, and it says plainly *"Baby changing isn't confirmed at Kentish Town City Farm,
and you said you need it. Check before you go."* Unknown never becomes a yes and never becomes a no. This is one rule applied
in three places: the sequencer (`DayItinerary.unresolvedMustHaves`, only `outcome: 'unsuitable'` is a `requirement-unmet`
failure), the plan screen (`PlanViewModel.needsChecking`, `plan-needs-checking`), and Meet halfway (below).

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
nap it may not be. That older value is left exactly as it was until its owner updates it (section 10); it is never turned into a
nap or a feed on someone's behalf.

## 7. Meet halfway

**Not the midpoint, and not Home's list.** The geometric middle can be a motorway junction. Home is personalised to *one* family,
so ranking only the places Home loaded biases the answer toward the first family's neighbourhood and can miss the genuinely best
compromise. Candidates are now chosen **by geography from the stored venue catalogue**, before either family's preferences apply.

### Candidate architecture

```
two homes ──► GET /api/places/search?intent=between&aLat&aLng&bLat&bLng[&aMaxKm&bMaxKm&limit]
               │  (an early return in search.js, before primePlacesBudget / provider choice / search chain)
               ▼
   readBetween  ── place_records (provider google, explore categories, ≤ 30 days old)
               │      database box round the two homes, ≤ 800 rows
               ▼
   firstPass    ── straight-line km from each home; keep a CORRIDOR (an ellipse with the homes as its foci:
               │      dA + dB ≤ dAB + max(6 km, 0.6·dAB)); fairness = max(dA,dB) + 0.5·|dA−dB|; ≤ 60 (cap 80)
               ▼
   canonical + consumer-metadata overlay (stored reads, same as every search)
               ▼
   app: venueService.getBetween ─► meetHalfway (both families' journeys, limits, must-haves, age policy,
                                  Family Fit, routines, opening hours) ─► ranked, explained top five
```

* **Zero spend, structurally.** `intent=between` is a database read that returns before `primePlacesBudget`, before the provider is
  chosen and before the search chain exists; `between.js` and `between-endpoint.js` import no API key, no budget gate and no
  Google client. `between-contract.test.ts` asserts the ordering on the source, the import graph, the untouched billable counters
  and that the provider chain is never called (with `PLACES_PROVIDER=google`). No new function file: the 12-function deploy budget holds.
* **Privacy of the request.** Where two families live is in the request, so the app rounds both homes to about a kilometre first (the same
  rounding a connection's snapshot uses; the corridor needs no more) and the response is `Cache-Control: private`, so no shared cache keeps it.
  `between-client.test.ts` asserts no coordinate in the URL has more than two decimals.
* **Unavailable is not empty.** If the catalogue cannot be reached the endpoint answers 503, and the screen falls back to Home's
  places **and says so** ("There may be better ones in between").
* **First pass is cheap and wrong on purpose** (straight line, no routing). It only decides *which* places are worth asking the
  expensive questions of. The Home set is never consulted for candidates.

### What each candidate is asked

1. **Journey**: each family's own time from where they set off (an estimate from distance, said to be one). The longer journey
   matters more than the average and a lopsided split is penalised in the ranking; the split is described as fairness, never as who travels less.
2. **Suitability**, per family, by the planner's own `matchVenueToDayRequest`. A **confirmed** miss (a must-have the venue lacks, an
   age policy, a closure, the setting) rules a place out. An **unconfirmed** must-have does **not**: the place stays, ranked lower
   (−8 per open must-have), with a *Needs checking before you go* block ("Baby changing isn't confirmed at X, and Hannah's family
   needs it").
3. **Family Fit for both families, only from consented data.** Yours from your profile; theirs from what they shared (ages, must-haves,
   pushchair), with no names and no routines in that profile. A claim "for" a family is made only when no child in it is left
   uncovered; otherwise it is a *to check* line.
4. **Routines** against the outing, only where routines are known. A routine shared as only "Home time" is called *home time*, never a nap.
5. **Reasons** are confirmed facts only; **to check** is stated and never counted as a fit.

### What a card says (copy and semantics)

* **Fairness, not who travels less.** *Almost equal journeys* (within 3 minutes), *Journeys are within 7 minutes of each other* (up to 10),
  *Journeys differ by 24 minutes* beyond that. It never says whose journey is shorter. Each family's own time stays visible as an estimate
  ("about 28 min").
* **Reading order on every card:** journey fairness → fit for both families → routine compatibility → useful confirmed facilities (and
  opening) → anything that needs checking, last, with a *Needs checking before you go* block for unconfirmed must-haves.
* **The top card only claims what is supported.** *Best for both* needs nothing to check, something known about both families, and
  journeys within 10 minutes. With something to check it is *Promising option · 1 thing to check* (counted, one underlying issue is one
  thing). With nothing to check but an uneven split, or only a postcode known for the other family, it is *Best compromise*. A Family Fit
  that is only *possible*, or a place not yet reviewed for families, is something to check, never a fit. Other cards carry their category,
  not a claim.

### Better routing of a small final shortlist (proposal; **not enabled**)

The plan already builds its journey matrix at plan time through the existing journey probe, and Google's `journeys` scope refuses in
production, so today every Halfway leg is an estimate. If you want measured times for the final top five (≈ 10 legs) it fits the
existing routing architecture and cost controls, but it **is** new paid behaviour (Routes calls), so it needs your approval and a
daily cap before it is switched on. Until then nothing in Halfway is routed, and the screen says journeys are estimated.

### Example, two families who live apart

Bushey (51.643, −0.360) and Walthamstow (51.590, −0.020), about 24 km. Home's set (Family A's neighbourhood) holds Bushey Heath
Farm, Stanmore Country Park and Watford Fields; the genuinely fair place, **Barnet Common Farm** (51.625, −0.190), is *not* in it.

| Candidate set | Best | Journeys (A / B) | Longer leg | Gap |
|---|---|---|---|---|
| Home's set only | Stanmore Country Park | 8 / 38 min | 38 min | 30 min |
| Stored catalogue, corridor first pass | **Barnet Common Farm** | **22 / 23 min** | **23 min** | **1 min** |

Croydon and a farm behind Bushey are dropped by the corridor; Walthamstow Marshes is kept but ranks well behind (44 / 2 min).
(Pinned by `meet-halfway-catalogue.test.ts`, including the reverse family order, a must-have confirmed missing, an unconfirmed
one, and a legacy "Home time" share.)

**Journey**: `/halfway`: choose a connected family or add one by postcode → date and start → ranked options → **Plan this day** builds
the normal plan for both.

## 8. Venue Detail

Order: name and journey → **Family Fit** (is it good for us?) → **Today** (will it work?) → **Create a plan** → **What to know**
→ food nearby → getting there → *More about this place* (description, photographs, parents' tips; collapsed) → **How we know
this** (evidence and provenance, one tap, unchanged). The legacy "If you leave now" block (a second, hard-blocking planner)
is removed: Create a plan does that job with the family's routines as advice.

## 9. Family Fit across children

`evaluateFamilyMatch` produces a lens per child (`works` / `check` / `concern` / `unknown`) from the lines that name them, and the
headline is built from the lenses. **The rule: a sentence "for" someone is a claim about the family only when it covers every
child.** A child the place is not confirmed for (a check still open, or nothing known) is never silently dropped:

| Household | Evidence | Headline |
|---|---|---|
| Sloane 7, Ozzie baby | Age range and baby changing confirmed for both | *Good for Sloane and Ozzie today* |
| Sloane 7, Ozzie baby | Baby changing confirmed (about Ozzie); nothing about Sloane | *Good for Ozzie, but we’re less certain about Sloane: no age range is recorded for this place yet* (badge: *Good fit · check Sloane*) |
| Sloane 2, Ozzie baby | Both inside the age range; baby changing unconfirmed | *Good for Sloane, but check baby changing for Ozzie* |
| Sloane 7, Maya 9 | Toilets and parking confirmed; nothing about either child | *Looks practical, but we’re less certain about Sloane and Maya: no age range is recorded for this place yet* |
| Sloane, Ozzie | Buggy access unknown | *Could work for Sloane, but check buggy access for Ozzie* |
| Sloane, Ozzie | Buggy access difficult | *Probably not for Ozzie today* |

* `FamilyMatchResult.gapNames` names the children left uncovered while another is covered; the badge says the gap
  (`matchBadgeText`), never "Good for Ozzie" alone; the child with nothing known is listed under *to check*.
* Excellent means nothing is left to check, so a household with an uncovered child cannot be *Excellent*.
* One child: unchanged. Meet halfway applies the same rule to **both** families (theirs from shared data only, without names).

The score still ranks; the sentence is what is told. Parent-reported evidence keeps its label and is never a reason.

## 10. Profile and Connected Families

Profile → **Your family** (adults then children: you, partner, co-parent; children with age and how they get around; edit) →
**Connected families** (accepted connections with what they share in one line; families added by postcode; pending invitations;
**+ Invite another family**; *Meet halfway*; **Disconnect** with the honest note that what was shared cannot be recalled). One
hook (`useConnectedFamilies`) feeds Profile, Who's coming and Meet halfway.

### Older connections: update what I share, in place (no reconnecting)

A connection made before routines carried a kind shares only "Home time". It keeps working and is **never** asked to reconnect.

* Each accepted row says what *you* share ("You share when you're home, but not what for (an older connection)") and, for an older
  share, that plans treat it cautiously until you update it, and that you stay connected.
* **What I share** opens an explicit consent panel: what the other family sees (a first name, a rough area, ages, drive limit, must-haves;
  never names or an address), a switch for naps and feeds (opening on what is shared today), and **Update what I share**. *Nothing
  changes until that tap.*
* Server: `POST /api/planning/connections { action: 'update', id, family }` rewrites **only the caller's own side** of the existing row
  through the same `safeSnapshot` allow-list, keeps the row, its id, the other family's snapshot and the relationship, and returns
  `mySharing`. `GET` now returns `mySharing` per connection (`none` / `legacy` / `current`), the caller's own data only.
* **Until updated, the old value is treated conservatively**: advice and Meet halfway call it *home time*, never a nap or a feed, and Meet
  halfway says "Hannah's family shared when they're home but not what for".
* A stored copy of a connection on this phone is replaced when what they share has changed, and Meet halfway prefers the live
  connection over a stored copy, so a plan never works from a stale picture of the other family.

## 11. Privacy and the data model

* New on-device fields: `FamilyProfile.familyName`, `FamilyMember.relationship` (adults). Adults' dates of birth are never asked
  for. Nothing here leaves the phone.
* The planner/planning backup still receives no child's name or id. Saved days store `visit`, `alternatives`, the venue's
  pushchair suitability, family **ids** that use a pushchair, and a `hasRoutines` flag: facts about the day and the venue.
  Names appear only at draw time, from the profile.
* Connections share what they always did (first-name label, area rounded to ~1 km, children's ages, drive limit, preferences).
  Routines remain **opt-in** (default off) and now carry their **kind** (nap/feed) so advice can be accurate; never a name or an
  id (the server rewrites ids to `busy-n`). The consent copy says so.
* An update to what you share is an explicit action, rewrites only your own side, and uses the same allow-list (ages, must-haves, drive limit;
  routines only if you opt in, with their kind and never a name or an id).
* Add-by-postcode stores a first name, a postcode area and coordinates on this phone only.

## 12. Cost and providers

* **New paid or provider calls: none.** Meet halfway's candidates are a **database read** of the stored catalogue (`intent=between`), which
  returns before the budget, the provider choice and the search chain; the alternatives reuse the free distance estimate; the postcode
  lookup is the existing free `/api/planning/location`. No Google Places/Routes behaviour changed; cost controls untouched. No new
  serverless function (the 12-function budget holds).
* Better routing of the final shortlist is a **proposal that needs your approval** (section 7); it is not enabled.
* The retired Plans-tab finder (`recommendPlans`) was the one path that could open new place-search cache keys; it is no longer reachable.

## 13. Verification

Run on this branch, against the synthetic places fixture (no Google, no accounts, zero provider requests), in real Chromium:

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | 156 files, **2,483 tests pass** (this round adds `must-have-states` 13, `meet-halfway-catalogue` 21, `between-contract` 15, `between-client` 3, `connection-sharing-update` 9, multi-child copy cases in `family-match`, Halfway fairness-wording, top-card-label, card-order and de-duplication cases in `meet-halfway`, and reworked `meet-halfway` / `day-plan` expectations for the new must-have semantics) |
| `verify-product-coherence` (360, 390, 393, 430) | **200 / 200**: now also proves fairness wording (never who travels less), that "Best for both" never sits over something to check, and the card reading order; and proves Home never lists the catalogue-only farm yet Meet halfway offers it as *Best for both*; the Home fallback is labelled; an unconfirmed must-have keeps a place with a *Needs checking* block and a plan still builds; a place confirmed to lack it is ruled out; a confirmed miss is a hard conflict at plan time |
| `verify-create-plan-journey` | **133 / 133**: an unconfirmed must-have now builds the plan with *Needs checking before you go* (it used to be a dead end) |
| `verify-account-journey` (auth build, in-memory fixture) | **53 / 53**: an older connection reads as home time only, nothing changes until *Update what I share*, the same connection id and relationship are kept, "Home time" is replaced by kinds, and the other family reads the older share conservatively in Meet halfway |
| `verify-account-qa`, `verify-post-visit` | pass in full (30 checks in `verify-post-visit`) |
| `verify-nav-clearance` | every tab and the filter sheet at 360×800, 390×844, 393×852, 430×932 and the shorter 360×640, 390×700, 393×740, plus Plans > Families and Saved: pass |
| `verify-explore-clearance` | pass |
| `verify-home-against-figma` | 89 / 89 (the approved Home frame) |
| `verify-plan-screens-against-design` | 56 / 56 |
| `verify-onboarding-flow` | every check |
| `verify-deck-gesture`, `verify-deck-images`, `verify-home-fit`, `verify-home-greeting`, `verify-home-food-filters`, `verify-dynamic-content` | 11/11, 2/2, 36/36, 15/15, all, 43/43 |

Two notes on the run. `remediation.test.ts` reads the exported `dist`, so the suite must not run while `expo export` is rewriting it (it
failed three assertions exactly once, for that reason, and passed on every clean run). And `verify-account-qa`'s invite helper raced:
it waited for *a* link card rather than for the *new* one, so two invitations could read as one; it now waits for the card count to grow.

Renders: `docs/product-coherence/<width>x<height>/` (Home, Explore, Venue Detail, the sheet, a too-soon start, the plan, Profile, Meet
halfway, a joint plan). The Home verifier's subtitle and heading lookups were updated to the new words; the geometry they assert did not move.

A build note worth keeping: Metro caches inlined `EXPO_PUBLIC_*` values, so an auth-enabled export followed by a plain export
silently produced a build with accounts switched on. The plain build must be made with `--clear` and without the Supabase variables.

## 14. Not done, and why

* VoiceOver/TalkBack and OS larger text: **not tested** (manual).
* Real-device safe-area inset: cannot be injected into desktop Chromium; covered by `safe-area-footer.test.ts` and a manual pass.
* Native (iOS/Android) time picker: web uses the platform's own `<input type=time>`; native keeps the HH:MM text field.
* Restaurant photographs are never fabricated; the placeholder stays.

## 15. Owner decisions

Decided in this round (and implemented):

1. **Unconfirmed must-haves are a warning, not a blocker.** Confirmed missing = hard conflict; unknown = prominent *Needs checking*; routine
   clash = advice; informational timing = a note.
2. **Meet halfway never ranks only Home's places**: it queries the stored catalogue between the homes (no Google, no spend).
3. **Older connections never have to reconnect**: an explicit *Update what I share* flow, conservative until then.

Still open:

1. **Measured journeys for Meet halfway's final top five** (≈ 10 Routes legs per search): new paid behaviour, needs your approval and a daily cap.
2. **Home rail**: the category chips moved to Explore. Say if you want any back on Home.
