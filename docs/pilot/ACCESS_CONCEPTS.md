# Access and getting-there: seven concepts, each answered from its own evidence

Status: 8 October 2026. Built and tested. **Nothing is switched on in production.** The Blue Badge option is hidden in Edit Profile until `EXPO_PUBLIC_FAMILY_FIT_V2` enables the conflict policy; the other concepts are inert without data or a stated need.

## Why this was needed

"Parking" was standing in for three different questions: is there a car park, are there Blue Badge bays, and can a disabled visitor get in. A patch in three places guessed which was meant, so a wheelchair family was read as needing parking and a venue with no car park was read as possibly inaccessible. Neither is true. The Natural History Museum says "no parking" and also publishes Blue Badge spaces; both are correct, and neither says anything about step-free access.

## The concepts (`src/services/access/access-concepts.ts`)

| Concept | Read from | Means | Never inferred from |
|---|---|---|---|
| General parking | `familyFacilities.parking` | A car park the venue provides or states | Blue Badge parking, step-free or wheelchair access, a mobility aid, a vehicle, a buggy |
| Blue Badge parking | `accessibility.accessibleParking`, or `disabledParkingBays` | Disabled bays or Blue Badge parking at or next to the venue | General parking, step-free or wheelchair access, a mobility aid |
| Step-free access | `accessibility.stepFreeEntrance` | The main visit can be made without steps | General parking, a buggy rating |
| Wheelchair access | `accessibility.wheelchairAccessible` | The venue says a wheelchair user can visit | General parking, Blue Badge parking, pushchair access |
| Pushchair access | `pushchairSuitability` and the venue's pushchair rules | How easily a buggy gets around | Wheelchair or step-free access, general parking |
| Step-free station | `transport.stepFreeStation` | The station the venue directs visitors to has step-free access | Parking, wheelchair or step-free access |
| Public transport | `transport.publicTransport` | The venue says it can be reached by train, tube or bus | Parking, a vehicle |

## What a household needs

Only what it said, or what its answer *is*:

| The household said | It needs |
|---|---|
| A child uses a wheelchair or mobility aid | Step-free access (met by a step-free claim or a wheelchair claim; failed by a confirmed "no" from either with no "yes"; a yes and a no together is unknown, because nobody picks a side) |
| Parking is a must-have | General parking |
| Blue Badge parking is a must-have | Blue Badge parking |
| A transport need (required or preferred) | Step-free station, or public transport |
| Pushchair access is a must-have | Pushchair access (unchanged, with the venue's pushchair rules) |

Not inferred: a mobility aid is not a parking need; a car is not a parking need; a buggy is not a step-free need; a lack of general parking is not inaccessibility. A *required* need confirmed unmet is a hard conflict; a *preferred* one never is. Unknown is never a conflict.

## One definition on every surface

The matcher builds its constraints from the household's stated needs and answers them with these functions. Home and Explore (the conflict order and the "Probably not" badge) call the matcher; Create a Plan's sequencer calls the matcher; Venue Detail's "you said you need" lines and essentials rows read the same concepts. `access-concepts.test.ts` checks this for 7 household shapes against every combination of general parking, Blue Badge, step-free and wheelchair evidence (3⁴ = 81 each, 567 in all): all four surfaces match an oracle written without the module.

## What changed for what you can see

| Area | Change |
|---|---|
| Venue Detail "Family essentials" | New rows: Step-free access, Blue Badge parking, Step-free station, Public transport. Confirmed rows always show. An unknown is mentioned only if the household said it needs it (a mobility aid is not a reason to list Blue Badge parking as unknown). |
| Family Fit, "you said you need" | "No Blue Badge parking here, and you said you need it" only when the venue's own claim says so; a general-parking "no" never produces it. |
| Planner | Blue Badge and transport needs are required or preferred constraints; unknowns are carried as "check", with their own plain sentences. |
| Edit Profile | "Blue Badge parking" appears among the must-haves **only when the conflict policy is on**. |
| Scoring (flag off) | Unchanged. |
| The earlier safeguard | The "general no is to check for a step-free party" patch is removed everywhere. It guessed what the family meant. |

## What does not exist yet

- **No venue has step-free-entrance or transport evidence in production.** Blue Badge evidence exists for four pilot venues (Gunnersbury, London Zoo, Natural History Museum, Science Museum) as proposed claims awaiting review. The Science Museum's step-free Tube note ("nearest step-free Tube is Knightsbridge, a 15 to 20 minute walk") is the first transport statement. It is one of the 20 items parked in the review reduction because nothing could hold it; with a transport field it can be reviewed like any other.
- **No way to enter a transport need.** `transportNeeds` is typed and used by the matcher, Family Fit and the planner, but there is no screen for it. That is a deliberate stop: it should be designed with a handful of invited families, not guessed.
- **The household question is one answer, "Wheelchair or mobility aid".** The venue side distinguishes wheelchair access from step-free access; the household side cannot yet, so the need is "step-free access", met by either claim. Splitting the question is a product decision.
- **Server projection.** The consumer API projects `accessibility.accessibleParking` if a claim exists but has no transport fields; transport claims need a small server change and review before they reach the app.

## Before the conflict policy is switched on

1. This regression suite passes (it does: 3,387 tests, with only the three known "after build" static-route checks failing because there is no build in the test environment).
2. The pilot claims that carry Blue Badge, step-free and rule evidence are reviewed by a person; until then a household that selects Blue Badge parking sees "still to be checked" everywhere, which is honest but unhelpful.
3. You approve activation. I have not activated anything.

## Three states for a household that needs step-free access (9 October)

A family with a wheelchair or mobility-aid user meets exactly three states, and every surface says the same thing in each (`accessibility-three-states.test.ts`, 9 combinations of the two claims on Home, Explore, Venue Detail, Create a Plan and a saved plan reopened from storage):

| State | The venue's own claims | Home / Explore | Venue Detail | Create a Plan | Saved plan |
|---|---|---|---|---|---|
| **Confirmed suitable** | either claim "yes", neither "no" | no warning; can be a verified recommendation | "Accessible" | builds clean | no access note |
| **Confirmed incompatible** | a "no" with no "yes" | a conflict (flag-gated), ordered last, never a recommendation | "Not accessible" | refused, in the venue's words | n/a |
| **Unknown, needs checking** | no claim, or yes and no together | discoverable with a prominent warning; never "good" or "excellent" | "Not confirmed" | builds, with the gap named | the plan **never calls itself accessible**; the same line is kept on reopen |

Unknown is not incompatible. Parking is never read as a mobility need, and the pushchair, Blue Badge, general parking, step-free and wheelchair evidence stay separate fields. A household with no mobility aid sees none of this. The one open decision is how `planVenue` (Meet Halfway and recommendation paths) treats an unknown wheelchair claim for a mobility-aid household: today it excludes the venue, as it does for any unknown must-have; the day planner carries it as "check". I recommend carrying it as "check" there too. Not changed.
