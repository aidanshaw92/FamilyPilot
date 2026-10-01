# Does `familyFacilities.playground` include soft play?

**Date:** 2026-10-01 · **Classification: A** — the product contract already settles it.

## The question

The extractor's `playground` rule matched `play\s+area`, which matches "our **Soft Play area**", and
published `familyFacilities.playground = yes` at `high` confidence. That value is served to parents.

## What FamilyPilot has already committed to

Not an opinion about what a playground *could* mean. Every place in the product where the distinction
surfaces already treats soft play and a playground as different, non-substitutable things:

| Where | What it says |
|---|---|
| `src/types/index.ts` | `FacilityType` carries **both** `'playground'` and `'soft_play'`; `VenueCategory` carries `'soft_play'` separately |
| `src/types/enrichment.ts` | `FamilyFacilitiesMap` has `playground?` and `fencedPlayground?` and **no** `softPlay` |
| `components/venue/FacilityGrid.tsx` | two chips, two labels: "Playground" and "Soft play" |
| `utils/format-category.ts` | `soft_play: 'Soft play'` — named in its own right |
| `utils/plan-categories.ts` | `case 'soft_play'` filters by `venue.category === 'soft_play'` |
| `utils/facility-match.ts` | `buildFacilityMissingCaution` matches must-haves by **exact membership** |

The last row decides it. A parent who sets `playground` as a must-have is **not** satisfied by a venue
offering soft play — the product already refuses to substitute them. The extractor was the only
component that disagreed, so this is a defect in the extractor, not a question for the owner.

## The fix

`isSoftPlayOnlyPlayground` removes soft-play wording from the sentence and re-tests the playground
patterns. If nothing matches without it, the evidence was soft play alone and no fact is published.

Two deliberate choices:

- The soft-play phrase lists its nouns explicitly (`area|zone|centre|room|session|…`) rather than
  matching loosely, so "soft play area **and a large play area outside**" keeps its playground.
- `EVIDENCE_ANCHORS` is **not** touched. That map is used both before and after matching, and changing
  it in the #115 work shifted the pre-match window, dropped wording out of range and republished a
  false `freeParking = yes`. The guard runs at match time instead.

## Production replay

Ten eligible evidence rows mention soft play, across six venues. Each row's text was pulled from
`venue_source_evidence` and **md5-verified** against the database before use, so a transcription error
could not pass unnoticed. `replay.cjs` runs the committed extractor and the fixed one over all ten.

Scope argument for why ten rows is the whole blast radius: with no soft-play wording in a sentence,
`replace(SOFT_PLAY_PHRASE, ' ')` is a no-op, so the re-test is the original test and the guard can
never suppress anything. Rows without soft play are provably unaffected.

**Result: one venue changes. No non-playground fact moves anywhere.**

| Venue | Before | After | Why |
|---|---|---|---|
| **Belmont Children's Farm** | `yes/high` | **no fact** | Both rows rested on soft-play wording alone. **Repaired.** |
| Babylon Park London | `yes/high` | `yes/high` | "an epic arcade **playground**" |
| Flip Out Canary Wharf | `yes/high` | `yes/high` | branded "Ninja Playground" |
| Flip Out Watford | `yes/high` | `yes/high` | branded "Ninja Playground" |
| Flip Out Brent Cross | no fact | no fact | unchanged |
| Woodside Animal Farm | `yes/high` | `yes/high` | a quoted Google review, and "the upstairs play area" |

## Corrections to the original diagnosis

**Babylon Park was flagged as a soft-play case. It is not.** Its page does say "soft play areas for
toddlers and kids", but the sentence that actually publishes the claim is marketing copy about arcade
games: *"test your skills and rack up high scores in an epic arcade playground!"* The fix leaves it
untouched. This is the same lesson as the Paradox Museum FAQ heading: the sentence that produced a
claim has to be established by running the classifier, not inferred from the page.

**The blast radius was wider than the excerpts suggested.** Querying `evidence_excerpt` for soft-play
mentions found three claims. Replaying the stored text found **six** venues, because an excerpt is a
400-character window and the triggering sentence need not be inside it.

## Open questions, recorded not answered

Each keeps `playground = yes` today, and each is a different cause. They are pinned in
`playground-soft-play.test.ts` under "what this deliberately does NOT change", so altering any of them
later is a visible decision rather than a side effect.

1. **A branded "Ninja Playground"** at an indoor trampoline park (3 Flip Out venues). The literal word
   is on the page, describing a real attraction. Whether an indoor ninja obstacle course is a
   `playground` in FamilyPilot's sense is narrower than Q1 and not settled by the contract above.
2. **A metaphorical "arcade playground"** (Babylon Park). Almost certainly a false positive, but the
   fix for it is a figurative-use rule, which is a different piece of work with a different blast
   radius.
3. **"the upstairs play area" inside a wheelchair-access sentence** (Woodside). A genuine false
   positive: the sentence exists to say the area is *not* accessible, and the negation vocabulary does
   not include "exception".
4. **A Google review quoted on the venue's own page** (Woodside: *"Great place for kids, soft play,
   animals, playground…"*). Review text reaching official-page evidence is explicitly out of scope for
   this workstream, and is the larger of the four.

None of these is fixed by guessing. Widening a guess past what the product contract settles is how the
original false positive got in.
