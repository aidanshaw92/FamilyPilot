# Family Fit grading: suitability, kept apart from evidence completeness

**Status:** implemented in PR #195 (post-launch fixes), 2026-10-12. Supersedes the "logistics never cover a child, Excellent
needs a score of 85" rule in [EXCELLENT_ELIGIBILITY.md](./EXCELLENT_ELIGIBILITY.md) and [EXCELLENT_RULE_V2.md](./EXCELLENT_RULE_V2.md)
where they disagree; everything in those about what counts as *venue-specific* activity evidence still holds.

Code: `src/services/matching/suitability-signals.ts` (the reading), `src/services/matching/family-match.ts` (the grade and the
words), `src/services/scoring/family-score.ts` (the ranking's age factor). Tests: `src/__tests__/family-fit-grading.test.ts`
(the founder's regression cases, against stored rows), `grades-report.test.ts` (this report), `ranking-golden.test.ts`.

## The principle

FamilyPilot should think like an experienced parent who knows what makes a good family day out, and stay honest about what is
and is not verified. Those are two different questions, and the grade answers only the first:

| Question | Answered by | Shown as |
|---|---|---|
| Is this likely a good place for *this* family? | **Family Fit grade** (Excellent / Good / Possible / Not recommended) | the badge and headline |
| How much of what matters to this family has been checked? | **Evidence completeness** (`evidenceCompleteness`) | "We've confirmed 4 of 7 details that matter for your family · not yet: parking, buggy access" |

Missing evidence is never evidence of unsuitability. A well-evidenced museum can be a Possible fit; a little-evidenced farm
can be a Good one. Nothing below turns an unknown facility into a confirmed one.

## What the grade reads, per child of a year or more

Three strengths of signal, each said for what it is (the line on the venue page carries a tick for a checked fact and a
bulb for an inference, and an inference always says "usually"):

| Signal | What it is | Strength |
|---|---|---|
| **confirmed** | the venue's own recommended ages include the child, or a reviewed permanent provision on its own pages names the child's age | strong (supports Excellent) |
| **provision** | a children's playground is confirmed at this venue, read against a common-sense band (1 to under 12); strong where a playground is what the place is for (park, farm, zoo, beach, attraction) and the child is under 8; otherwise supports Good | venue-specific fact + an inference about the age |
| **likely** | a category-level inference: a farm or zoo for a child of 1 to 12, soft play for 1 to 9, a park (room to run around) for 1 to 11, a beach | supports Good, never Excellent |
| **uncertain** | nothing above applies: a museum with no child-specific evidence, an attraction or activity venue with nothing for the child's age, a park nobody has checked anything about | Possible, with what is unknown said in the venue's terms ("whether the exhibits suit Sloane") |
| **excluded** | the venue's own recommended ages put the child outside | a caution; every child outside is Not recommended |

A baby under a year is led by logistics (buggy access, changing), exactly as before: the visit is the activity, and a household
of babies reads "Easy visit". The venue's own words always outrank an inference: where it has stated the ages its provisions
are for and none covers the child (Battersea Park's playground, 4 to 14), the generic playground band does not apply.
Nothing is ever inferred for a place nobody has reviewed.

Category rules, as the founder set them out:

* **Parks and playgrounds.** A confirmed playground is strong evidence for a child of playground age. A park with no playground
  on record is *likely* good (Good), with "nothing child-specific is confirmed here yet" in the sentence. A park with nothing
  confirmed at all is Possible. No park is Excellent on being a park.
* **Farms and zoos.** The kind of place is *likely* right for a toddler (Good); a confirmed playground or venue-stated ages
  make it strong. Genuine age or access restrictions still apply.
* **Museums.** No inference from the category. Verified age-appropriate activities (the reviewed-evidence file: the Science
  Museum's Garden, Docklands' Mudlarks) or published ages make it strong; a confirmed playground makes it *likely* good with
  the exhibits still named as unconfirmed; nothing child-specific makes it Possible.
* **Soft play and indoor attractions.** Soft play is *likely* right for 1 to 9, and the sentence says to check age and height
  limits on the day; a door policy that does not admit a child is Not recommended; venue-stated ages that exclude a child are
  a caution (or Not recommended when every child is outside).
* **Other attractions and activity venues.** No inference: Possible without venue-specific evidence.

## The four grades

| Grade | Rule |
|---|---|
| **Not recommended** | a known, significant incompatibility: a stated must-have confirmed absent, a door policy that does not admit a child, every child outside the venue's own ages, buggy access confirmed difficult for a child who has no other way round, the venue not wheelchair accessible for a child who needs it, far beyond the stated drive limit, never open |
| **Possible** | a relevant practical concern (mixed buggy access for a buggy, a child outside the recommended ages, a few minutes over the drive limit, no baby changing for an under-three), something the household *said* it needs that nobody has checked, real uncertainty about whether the activity suits one of the children, or nothing at all confirmed about the place |
| **Good** | likely to be enjoyable and practical: every child who can take part is at least *likely* covered, nothing against, at least one confirmed fact about the place; secondary details may be unknown and are listed as such |
| **Excellent** | a strong signal for every child who can take part, nothing against, nothing the household would want to know still open (buggy access for a buggy, baby changing for an under-three, toilets), and at least three confirmed venue facts |

What changed from before: unknown buggy access is a *secondary* detail (it holds a place below Excellent and is listed as a
check) unless the household stated pushchair access as a must-have; a confirmed "no parking" is a note, not a mark against,
for a household that never said it drives; the blended ranking score takes **no part** in the grade (it used to gate Good at 70
and Excellent at 85, which was evidence completeness in disguise); and a confirmed playground, a farm, a zoo, soft play or a
park now say what they usually mean for a child of that age.

What did not change: no fact is inferred about facilities; marketing copy is not evidence; programmes on set days never make
Excellent; the venue's own restrictions and ages always win; routines and the day are the planner's business (a venue keeps
its grade when one proposed arrival time runs into a nap, and the plan says so instead).

## Golders Hill Park: the regression case

Stored row (official source, 2026-10-07): toilets, baby changing, café, children's playground and an accessible toilet
confirmed; no recommended ages, no buggy rating, no parking claim. (The zoo is a separate, unreviewed record.)

| Household | Before | After | Why |
|---|---|---|---|
| 3-year-old and a baby in a buggy | **Possible** (buggy access unknown was a hard unknown; the playground counted for nothing) | **Good** · "Likely good for Sloane, but check buggy access for Ozzie" | the playground is strong for a 3-year-old; buggy access is the one secondary unknown |
| 3-year-old and a baby who is carried | Good, headlined "we haven't yet confirmed whether this activity suits Sloane" | **Excellent** · "Excellent for Sloane, and easy to visit with Ozzie" | strong signal, nothing against, nothing open; evidence line says 4 of 6 details confirmed, not yet parking or ages |

Nothing is special-cased: `family-fit-grading.test.ts` grades the same stored facts under another id and name identically.

## Before and after, every stored venue in the fixture

Grades as the code at `0f94b58` (before) and this branch (after) produce them from the hosted rows read on 2026-10-12, with the
blended ranking score in brackets. **→** marks a changed grade. Household home: Camden; drive limit 60 min.

### 3-year-old and a baby in a buggy

| Venue (stored) | Before | After | After: what the parent reads |
|---|---|---|---|
| Golders Hill Park | Possible (83) | Good (85) **→** | Likely good for Sloane, but check buggy access for Ozzie |
| Hampstead Heath | Possible (81) | Good (83) **→** | Likely good for Sloane, but check buggy access for Ozzie |
| Primrose Hill | Possible (66) | Possible (68) | Could work for Sloane, but check a couple of things for Ozzie |
| Battersea Park | Possible (68) | Possible (70) | Could work for Sloane, but check a couple of things for Ozzie |
| Hackney City Farm | Possible (81) | Good (83) **→** | Likely good for Sloane, but check buggy access for Ozzie |
| Kentish Town City Farm | Possible (80) | Good (82) **→** | Likely good for Sloane, but check baby changing for Ozzie |
| Woodside Animal Farm | Possible (70) | Possible (72) | Possible for your family |
| Hobbledown Heath | Possible (75) | Good (78) **→** | Likely good for Sloane, but check a couple of things for Ozzie |
| Royal Air Force Museum London | Good (87) | Good (90) | Likely good for Sloane, and easy to visit with Ozzie |
| Horniman Museum and Gardens | Possible (83) | Good (85) **→** | Likely good for Sloane, but check buggy access for Ozzie |
| Young V&A | Possible (83) | Possible (83) | Looks practical, but check buggy access for Ozzie, and we haven’t yet confirmed whether the exhibits suit Sloane |
| Discover Children's Story Centre | Possible (68) | Possible (68) | Looks practical, but check a couple of things for Ozzie, and we haven’t yet confirmed whether the exhibits suit Sloane |
| Flip Out Watford | Good (79) | Good (83) | Good for Sloane, and easy to visit with Ozzie |
| Babylon Park London | Possible (74) | Good (78) **→** | Good for Sloane, but check a couple of things for Ozzie |
| Thorpe Park | Possible (73) | Possible (73) | Looks practical, but check a couple of things for Ozzie, and we haven’t yet confirmed whether this activity suits Sloane |

### 3-year-old and a baby who is carried

| Venue (stored) | Before | After | After: what the parent reads |
|---|---|---|---|
| Golders Hill Park | Good (83) | Excellent (85) **→** | Excellent for Sloane, and easy to visit with Ozzie |
| Hampstead Heath | Good (81) | Good (83) | Likely good for Sloane, and easy to visit with Ozzie |
| Primrose Hill | Possible (66) | Possible (68) | Could work for Sloane, but check baby changing for Ozzie |
| Battersea Park | Possible (68) | Possible (70) | Could work for Sloane, but check baby changing for Ozzie |
| Hackney City Farm | Possible (81) | Good (83) **→** | Likely good for Sloane, and easy to visit with Ozzie |
| Kentish Town City Farm | Possible (80) | Good (82) **→** | Likely good for Sloane, but check baby changing for Ozzie |
| Woodside Animal Farm | Possible (71) | Possible (73) | Could work for Sloane, and easy to visit with Ozzie |
| Hobbledown Heath | Good (75) | Good (78) | Likely good for Sloane, but check baby changing for Ozzie |
| Royal Air Force Museum London | Good (87) | Good (90) | Likely good for Sloane, and easy to visit with Ozzie |
| Horniman Museum and Gardens | Good (83) | Good (85) | Likely good for Sloane, and easy to visit with Ozzie |
| Young V&A | Good (83) | Possible (83) **→** | Easy to visit with Ozzie, but we haven’t yet confirmed whether the exhibits suit Sloane |
| Discover Children's Story Centre | Possible (68) | Possible (68) | Looks practical, but check baby changing for Ozzie, and we haven’t yet confirmed whether the exhibits suit Sloane |
| Flip Out Watford | Good (79) | Good (83) | Good for Sloane, and easy to visit with Ozzie |
| Babylon Park London | Possible (74) | Good (78) **→** | Good for Sloane, but check baby changing for Ozzie |
| Thorpe Park | Good (73) | Possible (73) **→** | Looks practical, but check baby changing for Ozzie, and we haven’t yet confirmed whether this activity suits Sloane |

### one 5-year-old

| Venue (stored) | Before | After | After: what the parent reads |
|---|---|---|---|
| Golders Hill Park | Good (82) | Excellent (84) **→** | Excellent for Sloane |
| Hampstead Heath | Good (79) | Good (81) | Likely good for Sloane |
| Primrose Hill | Possible (66) | Possible (68) | Could work for Sloane |
| Battersea Park | Possible (68) | Good (72) **→** | Good for Sloane |
| Hackney City Farm | Possible (80) | Good (81) **→** | Likely good for Sloane |
| Kentish Town City Farm | Possible (81) | Good (83) **→** | Likely good for Sloane |
| Woodside Animal Farm | Possible (70) | Possible (72) | Could work for Sloane |
| Hobbledown Heath | Good (76) | Good (78) | Likely good for Sloane |
| Royal Air Force Museum London | Good (87) | Good (90) | Likely good for Sloane |
| Horniman Museum and Gardens | Good (82) | Good (84) | Likely good for Sloane |
| Young V&A | Good (82) | Possible (82) **→** | Looks practical, but we haven’t yet confirmed whether the exhibits suit Sloane |
| Discover Children's Story Centre | Possible (68) | Possible (68) | Looks practical, but we haven’t yet confirmed whether the exhibits suit Sloane |
| Flip Out Watford | Possible (76) | Possible (78) | Could work for Sloane |
| Babylon Park London | Possible (73) | Possible (75) | Could work for Sloane |
| Thorpe Park | Good (74) | Possible (74) **→** | Looks practical, but we haven’t yet confirmed whether this activity suits Sloane |

### 8- and 10-year-old

| Venue (stored) | Before | After | After: what the parent reads |
|---|---|---|---|
| Golders Hill Park | Good (82) | Good (84) | Likely good for Alfie and Bea |
| Hampstead Heath | Good (79) | Good (81) | Likely good for Alfie and Bea |
| Primrose Hill | Possible (66) | Possible (68) | Could work for Alfie and Bea |
| Battersea Park | Possible (68) | Good (72) **→** | Good for Alfie and Bea |
| Hackney City Farm | Possible (80) | Good (81) **→** | Likely good for Alfie and Bea |
| Kentish Town City Farm | Possible (81) | Good (83) **→** | Likely good for Alfie and Bea |
| Woodside Animal Farm | Possible (70) | Possible (72) | Could work for Alfie and Bea |
| Hobbledown Heath | Good (76) | Good (78) | Likely good for Alfie and Bea |
| Royal Air Force Museum London | Good (87) | Good (90) | Likely good for Alfie and Bea |
| Horniman Museum and Gardens | Good (82) | Good (84) | Likely good for Alfie and Bea |
| Young V&A | Good (82) | Possible (82) **→** | Looks practical, but we haven’t yet confirmed whether the exhibits suit Alfie and Bea |
| Discover Children's Story Centre | Possible (68) | Possible (68) | Looks practical, but we haven’t yet confirmed whether the exhibits suit Alfie and Bea |
| Flip Out Watford | Possible (76) | Possible (77) | Could work for Alfie, but we haven’t yet confirmed whether this activity suits Bea |
| Babylon Park London | Possible (73) | Possible (74) | Possible for your family |
| Thorpe Park | Good (74) | Possible (74) **→** | Looks practical, but we haven’t yet confirmed whether this activity suits Alfie and Bea |

Cases the stored rows cannot show (no stored row carries the fact), covered with clearly synthetic facts in the test:

| Case | Before (`0f94b58`) | After |
|---|---|---|
| A park with difficult buggy access, baby in a buggy | Not recommended | Not recommended ("Buggy access is difficult here, and Ozzie's buggy is how you get around") |
| The same park, mixed buggy access, baby in a buggy | Possible | Possible, with the caution ("Buggy access is mixed here, so Ozzie's buggy may be awkward in places") |
| The same park, difficult buggy access, baby carried | Good ("we haven't yet confirmed whether this activity suits Sloane") | Excellent: the limitation is about buggies, the playground is about Sloane |
| An indoor attraction whose door policy does not admit under-4s, with a 3-year-old | Not recommended | Not recommended ("Its age policy doesn't admit Sloane and Ozzie") |
| An attraction recommended for 5 to 12, with a 3-year-old and a 7-year-old | Possible | Possible ("Could work for Max, but check age range for Sloane") |
| The same attraction with only a 3-year-old | Not recommended | Not recommended (every child outside the venue's own ages) |
| Soft play, 3-year-old, buggy access good | Good ("Looks practical, but …") | Good ("Soft play usually suits a 3-year-old like Sloane; check any age or height limits on the day") |
| A museum with verified activities for the child's age (Science Museum's Garden, 3 to 6), 4-year-old, everything practical confirmed | Good | Excellent |
| The same museum for a 2-year-old the evidence does not cover | Good ("Easy to visit with Pip") | Possible ("we haven't yet confirmed whether the exhibits suit Pip") |
| Golders Hill Park, Excellent for the family, with a day plan arriving at 12:00 into a 13:00 nap | Good; plan conflict | Excellent; the plan says "This plan doesn't fit a routine yet" |

(Before values were produced by running the same cases on `0f94b58`.)

## Ranking

The ranking score is unchanged except for its **age factor**: where the venue publishes no range, it now reads the same
suitability signal the grade does (reviewed provision 88, confirmed playground 84, kind of place 80) instead of the neutral 75.
Against the #194 release's golden set (`ranking-golden.test.ts`): no list order changed; the only score moves are upward
(a playground-confirmed museum 88 → 91, a farm 88 → 89; Meet halfway credits those two as a fit, +4 each); no venue scores
lower (asserted). The demonstrated problem it fixes: a park with a confirmed playground ranked level with, or below, a museum
with nothing child-specific, on facilities alone (Golders Hill Park and Young V&A both scored 83 for a 3-year-old; now 85 and
83). Weights, distance, budget, facilities and accessibility factors are untouched, and the evidence-aware policy flag
(`EXPO_PUBLIC_FAMILY_FIT_V2`) is neither read nor changed.
