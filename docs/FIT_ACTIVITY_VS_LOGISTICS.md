# Family Fit: activity fit versus visit logistics

Two different questions about a child, kept apart in `familypilot/src/services/matching/family-match.ts`.

| | What it asks | Evidence that can answer it today | How it is said |
| --- | --- | --- | --- |
| **Activity fit** | Is this place itself suitable for this child? | The venue's own recommended ages including the child | "Good for Sloane", "Suits Sloane (recommended for ages 2–6)" |
| **Visit logistics** | Is it practical to bring this child? | Buggy access, baby changing (and, for the family, toilets, parking, a café) | "Easy to visit with Ozzie", "Good buggy access for Ozzie’s buggy" |

## The rules

1. **Logistics never says "Good for".** No combination of practical facts can put a child in `forNames`, make a
   headline "Good for <child>", or put a child's name on a badge. A test covers every combination across six household
   shapes (`fit-activity-vs-logistics.test.ts`).
2. **No evidence, no claim.** A child with no activity evidence gets: *We haven’t yet confirmed whether this activity suits
   Sloane*, on the venue page, and in the headline's gap clause for a household of several children. Nothing is inferred
   from the child's age or the kind of place. The sentence says nothing about the venue, and does not suggest a venue
   should publish an age range.
3. **Closed today is a fact, not a fit.** It is stated on cards and the venue page; the verdict, score, ranking and
   per-child lines are identical open or shut. This was not true before this PR at the edges: "open today" counted as
   one of the positives that lift a place to *excellent*, so a place shut today could land one step lower than the same
   place open (18 of 1,152 evidence combinations tested). A place whose hours say it is shut today is now counted as the
   open place it is on its other days; open places and places with no hours are counted exactly as before.
   *(Superseded: the follow-up decision was made in `STABLE_FAMILY_FIT.md`. Nothing about today moves a verdict, a score or
   a line any more: not closed, not closing soon, not open, not weather.)*
4. **Nothing here changes a score, a verdict threshold or the ranking.** Only the words, and one added to-check line.

## The under-12-months convention (v1, a product convention)

A child younger than 12 months is treated as **logistics-led**: they are carried, fed and changed, so whether the *place*
suits them is not a question the venue's evidence usefully answers, and the "we haven't yet confirmed whether this
activity suits Ozzie" line is not raised for them. Their practical facts still read "Easy to visit with Ozzie", and a
venue that publishes an age range still produces a caution for them if they are younger than it.

One edge: a baby for whom *nothing at all* is known (no practical fact either) is still named in the headline's gap
clause, because saying nothing would claim a fit that has no evidence.

This is a product convention for v1, **not a universal rule** and not a statement about any child's development. It is
one constant, `LOGISTICS_LED_BELOW_MONTHS`. It can change without touching the contract above.
