# Does nearby or off-site parking count as the venue having parking?

**Date:** 2026-10-01 · **Classification: A** — the product says so in its own words.

## What FamilyPilot has already committed to

Not an inference. `match-explanations.formatTriStateReason` renders the value to a parent as:

> **"Parking confirmed on site"**

So `familyFacilities.parking = yes` means on-site parking. And the nuance already has a home:
**`parkingInfo`** is a free-text field whose own examples are *"Small car park behind the building"*,
*"Street parking only"* and *"Free parking on site"*.

That is the same structural argument as the other two questions, and the three together form a pattern
worth naming: **where the competing concept already has its own representation, the boolean means the
strict thing.** `soft_play` beside `playground`; `mixed` beside `outdoor`; `parkingInfo` beside
`parking`. In each case the extractor was the only component that disagreed.

## The defect

Four served claims said "confirmed on site" about somebody else's car park. All excerpts verbatim from
live `venue_claims`:

| Venue | Field | Evidence |
|---|---|---|
| Flip Out Watford | `parking=yes` | "Parking is available at the **Harlequin Shopping Centre** car parks" |
| Nando's | `parking=yes` | "**Nearby** … free parking at **Finchley Lido Leisure Centre** and we're a **one-minute walk** away" |
| Nando's | `freeParking=yes` | the same sentence |
| Whitechapel Gallery | `parking=yes` | "Buckle Street **Multistorey Car Park**, Buckle Street, London, E1 8EH" |

**The defect was asymmetric, and that is the telling part.** The extractor already read a *negative*
on-site statement correctly — Flip Out Brent Cross is `parking = no` from *"We do not have on-site
parking, however, there is a small retail park opposite"* — but accepted a *positive* off-site one.

## The fix

`hasOffSiteParking(sentence)` suppresses a positive when the sentence locates the parking elsewhere.
Two signal families, both taken from the corpus rather than imagined:

- **Adjacency**: `nearby`, `N-minute walk`, `across the road`, `opposite`, `in the local area`, `a
  short walk`, `down the road`, `around the corner`. A venue describing a *walk* to the car park is
  describing someone else's.
- **Named third-party facility**: shopping centre, leisure centre, retail park, NCP, multi-storey.

Deliberately **not** a general "at &lt;place name&gt;" rule. *"Free parking at the farm"* and
*"parking at the visitor centre"* are the venue's own, and no reliable signal separates a venue's own
named building from a neighbour's. Guessing past what the contract settles is how these got in.

## Blast radius

Four served claims lose their value; nothing else moves. Verified against the production wording, with
controls held:

| Case | Before | After |
|---|---|---|
| the four above | `yes` | **no fact** |
| "a large free car park **on site**" | `parking=yes` | `parking=yes` |
| "Free parking is available in **our main** car park" | both `yes` | both `yes` |
| Thorpe Park's shape (£12 ticket, on site) | `parking=yes`, no `freeParking` | unchanged |
| Woodside "All car parking is free." | `freeParking=yes` | `freeParking=yes` |
| Brent Cross negative | `parking=no` | **`parking=no`** |

## Two things recorded rather than changed

**1. `freeParking=yes` with no `parking` fact.** Woodside's *"All car parking is free"* yields
`freeParking=yes` and no `parking` fact, because that wording is not in the `parking` field's
explicit-availability vocabulary. Verified **identical with and without** this guard, so it is
pre-existing, not a regression — my own test expectation was wrong, not the code. Whether
`freeParking=yes` ought to imply `parking=yes` is a separate question and arguably an incoherence,
but fixing it is a different change with a different blast radius.

**2. A surviving mutant, kept deliberately.** Moving the guard *before* `patterns.no` — so it
suppresses negatives too — breaks no test. That is not a gap I papered over; it is a defensible
alternative. The guard currently sits after both negative paths, so an explicit negative survives,
which is what preserves Brent Cross's useful `no`. The one case that distinguishes them is *"There is
no parking at the shopping centre"*: today that yields `parking=no`, and under the mutant it would
yield no fact. **The mutant's answer is arguably the better one** — by the governing invariant,
evidence about somewhere else establishes nothing either way. There is no production instance of that
shape, so rather than contrive a test to kill a mutant whose behaviour may be preferable, it is
recorded here. The principled rule would be "suppress unless the sentence makes an on-site statement
about *this* venue", and Brent Cross already satisfies that by hitting `hasParkingNegation` first.
