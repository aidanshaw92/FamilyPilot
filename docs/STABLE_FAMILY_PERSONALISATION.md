# Step 1: browse first, plan second

Base: `main` at `a7c6d81` (#163). The first of four approved steps (Discover → Decide → Plan → Do → Learn). Steps 2–4
(Halfway list/map and filters, food and the plan map, learning) are not in this change.

**The rule.** Before a plan exists, Home, Explore and Venue Detail answer *"what looks good for our family?"* from what is
stable about the family. Naps, feeds, leave-by times and the time of day never rank a place, recommend it or caution
against it. Once the parent presses **Create a plan** and picks a date and a time, the planner works the day out around
naps and feeds, and leads with what to do.

---

## What was happening (reproduced on `main`)

The family from the real-device recording: Sloane (3) and Ozzie (8 months, buggy and sling), Ozzie's feed at 11:00, his
nap at 13:00, Sloane's nap at 13:30. Fifteen fixture venues, Home's real ranking (`rankForFamily`), three clock times.

Routine timing entered browsing in five places:

| Where | What it did |
| --- | --- |
| `family-score.ts` (the ranking) | A **routine factor**, a tenth of every score: 92 if the family could still leave and be home before the next nap or feed, 45 if not, 75 with no routines. |
| `family-match.ts` (Family Fit, cards, Venue Detail) | "Leave by 10:47 to be home in time for Ozzie's feed" as a **reason** (and it counted towards a Good/Excellent verdict); "A visit today may run into Ozzie's nap time" as a caution. The card line deliberately led with it. |
| `personalise-venues.ts`, `match-explanations.ts` | The same caution and reason on the score's lists and focused recommendations. |
| `venue-taxonomy.ts` | Home's **"Fits your day"** chip: places with a leave-by line. |
| `restaurant-score.ts` | A routine factor (1/20) in restaurant ranking. |

### Same family, same venues: Home's top cards, before and after

| Time | # | Before (`main`) | After |
| --- | --- | --- | --- |
| 09:30 | 1 | Kettleford Play House **85** · *Leave by 10:47 to be home in time for Ozzie's feed* · Recommended from age 1, so Ozzie is younger than that | Kettleford Play House **84** · *Good for Sloane's age (recommended for ages 1–8)* · Recommended from age 1, so Ozzie is younger than that |
| 09:30 | 2 | Marlow End Farm **83** · *Leave by 10:36…* | Marlow End Farm **82** · *Good for Sloane's age…* |
| 10:45 | 1 | Kettleford Play House **85** · *Leave by 10:47…* | Kettleford Play House **84** · *Good for Sloane's age…* |
| 10:45 | 2 | Marlow End Farm **78** (routine factor 92 → 45) · Good for Sloane's age… | Marlow End Farm **82** · Good for Sloane's age… |
| 12:30 | 1 | Kettleford Play House **85** · *Leave by 12:47 to be home in time for Ozzie's nap* | Kettleford Play House **84** · *Good for Sloane's age…* |
| 12:30 | 5 | Nettlefold Tower **77** (the four places above it were back at 92) | Nettlefold Tower **81** |

- **Before:** between 09:30 and 10:45, 12 of the 15 places saw their routine factor fall from 92 to 45 purely because the
  feed got nearer. 11 of them lost 4–5 points; the twelfth is unreviewed and capped. At 12:30 the nearest places went
  back to 92 for the nap and the rest stayed at 45. On this deliberately uniform fixture that moved the bottom three places
  between clock times; on a real catalogue, where scores sit closer together, the same ±5 moves more of the list.
- **After:** order, scores and words are identical at 08:30, 09:30, 10:45, 12:30, 15:00 and 16:30, and identical to the same
  family with no routines at all. Only "Opens at 9am today" / "Open until 5pm" follows the clock: a fact about the place.

### Venue Detail, Family Fit for Kettleford Play House (09:30)

- Before: ✓ Good for Sloane's age · ✓ Good buggy access for Ozzie's buggy · ✓ Baby changing confirmed, handy for Ozzie ·
  **✓ Leave by 10:47 to be home in time for Ozzie's feed** · ✓ Toilets confirmed on site · ✓ Free parking confirmed
- After: the same, without the leave-by line. The headline is unchanged ("Could work for Sloane, but check age range for
  Ozzie"); headlines no longer end in "today" ("Good for Sloane", not "Good for Sloane today"). *(Superseded by `STABLE_FAMILY_FIT.md`: the headline
  no longer says "…, but not today"; "Closed today" is shown as its own fact on the card and on the Today card.)*

Screens (same family, 09:30): `docs/stable-personalisation/before/` and `…/after/`, at 360 and 393:
`home`, `explore`, `venue`, `plan` (10:00, "not sure" how long), `plan-routines`, `plan-clash` (11:00 for two hours).

---

## What changed

**Before a plan (Home, Explore, Venue Detail, Halfway's candidates, restaurants):**
- The routine factor is removed from both scorers. The remaining weights are unchanged and the blend is divided by their
  total, so scores stay on the same scale (a family with no routines sees about +0.5 on a typical place). No threshold
  changed; the Excellent verdict (score ≥ 85 plus confirmed facts) no longer depends on the clock either.
- Family Match no longer reads routines at all. The card line leads with a confirmed fact about a particular child
  ("Good for Sloane's age…", "Good buggy access for Ozzie's buggy"), then anything else confirmed.
- "Fits your day" is gone from Home's rail. A remembered selection falls back to "For you".
- `evaluateRoutineFit` (the leave-by generator) is deleted, so it cannot be reused on a browsing surface by accident.

**Stable personalisation that remains (unchanged, evidence-backed):** ages against a published range (named per child);
buggy or sling against reviewed buggy access and terrain; baby changing for an under-three; must-haves; confirmed
facilities; travel against the family's limit; weather only where it matters (rain and an outdoor place). Nothing about
a child is inferred from a category: an unreviewed park says nothing about Sloane or Ozzie.

**After Create a plan:**
- Duration copy: "You weren't sure how long, so we allowed about 2 hours, which is typical for a farm. It is a planning
  assumption, not something we know about this place." → **"We've allowed 2 hr — you can change this."**
  - The provenance (`VisitResolution.basis`: venue's figure, typical for the kind of place, cut for a routine, closing
    time, day cap) stays in the plan's data.
  - The parent sees only what changes what they do: "…, which gets you home before Ozzie's nap at 13:00", and "We don't
    know when it closes, so check the hours".
  - "you can change this" is a link: it reopens Create a plan on the current answers. A saved plan, which cannot be
    changed there, ends with a full stop instead.
- Routines lead with the answer:
  - **A clash that a verified change clears:** "**Best option: arrive around 10:00**". Then what it clears ("That keeps
    the day clear of Sloane's nap."), what it leaves ("Ozzie's feed still falls during the day."), a one-tap **Arrive at
    10:00**, "Or · Stay 1 hour instead", then the details.
  - **How the best change is chosen:** it clears the most clashes the family keeps at home; then moving the time beats
    cutting the visit; then the smallest move; then earlier over later.
  - **What a sentence may claim:** each alternative was already re-run by the sequencer and clears the routines it lists
    without adding one, so no sentence claims more than that. Where a remaining routine would fall at the new times is
    not known, so it is not said.
  - **A clash nothing clears:** "This plan works, with one routine to plan around", then the details.
  - **Nothing to act on:** "This plan should work well".

## Deliberately unchanged

- **Halfway's routine check.** There the parent chooses a day and an arrival time first, so it is a check against
  stated intent, not the clock. Its candidates are now ranked without routines like everywhere else.

## Owner decisions on review

- **Home's header loses "today" (done in this PR).** "Best for your family today" → **"Best for your family"**, and "Picked
  for Sloane and Ozzie today" → **"Picked for Sloane and Ozzie"**. Typography, geometry and spacing are unchanged; only
  the words are shorter. The Figma verifiers now look for the new heading, `compare-home-to-figma.mjs`'s reference widths
  for the two text nodes are re-measured from the amended copy, and `verify-product-coherence.mjs` fails if either line
  says "today". The Figma file itself still shows the old words and should be updated there to match.
- **Approved follow-up contract (not in this PR): places closed today stay discoverable.** A venue that is a strong family
  match but closed today should remain on Home and Explore, clearly labelled "Closed today" with its next opening time
  ("Opens tomorrow 10am"), rather than being removed. Home's list currently drops it (`isVisitableVenue` in
  `home-list.ts`). Changing that is a ranking and discovery change for a later pass: decide where such a place ranks
  against open ones, keep Family Fit's verdict unaffected (as #163 already does), and keep Create a plan defaulting to the
  next open day.

## Tests

- `stable-personalisation.test.ts` (10 tests, Home's real ranking, the recording family):
  - the same order and scores at six clock times, and the same as a family with no routines;
  - no card, headline, reason, caution or explanation mentions a nap, a feed or a time to leave;
  - child-specific evidence still leads and still ranks;
  - a reviewed problem is still said;
  - no child suitability comes from a category;
  - no browsing module computes a routine.
- `routine-clashes.test.ts`: six new tests for the recommendation:
  - leads with it, and a re-run of the recommended change clears the clash;
  - prefers moving the time, with the other options offered once;
  - says what it leaves without claiming where;
  - names the children on this device;
  - with no clearing change, says "works, with one routine";
  - with nothing to act on, says "should work well".
  - Two visit-note tests now pin the new copy and check the provenance is kept.
- Changed to the new contract: `family-score`, `family-match`, `closed-today`, `venue-taxonomy`, `family-specific-fit`,
  `onboarding-draft`, `onboarding-field-consumers`, `null-coordinates-journey`. `routine-fit.test.ts` is deleted with its
  module.
- `verify-product-coherence.mjs` now fails if Home, Explore or Venue Detail says "Leave by", "in time for", "nap time",
  "feed time" or "Fits your day" for a family with routines. Its plan check accepts "We've allowed" and rejects
  "planning assumption". `verify-dynamic-content.mjs` no longer tries the removed chip.

## Verification (local web build, fixture servers, zero provider requests)

| Check | Result |
| --- | --- |
| Typecheck | clean |
| Unit tests (Vitest) | 167 files, 2,636 tests passed |
| Product coherence (realistic fixture, a family with naps and a feed): Home, Explore and Venue Detail never say when to leave; the plan says "We've allowed…" | all passed, 360/390/393/430 |
| Create a Plan journey | 153/153 |
| Journey audit, phase 2 | 301/301 |
| Plan screens against design | 56/56 |
| Home against Figma / compare to Figma (header text nodes re-based on the amended copy: subtitle 106.9 vs 107, heading 189.4 vs 189) | 89/89 / pass |
| Deck gesture | 11/11 |
| Dynamic content (realistic fixture) | 43/43 |
| Home loading, navigation clearance, onboarding flow | all passed |
| Place credits | 13/13 |
| Account journey, account QA, post-visit (auth build) | all passed |

Not verified here: production and real devices; native iOS/Android; VoiceOver/TalkBack on the new recommendation block and
the "you can change this" link.
