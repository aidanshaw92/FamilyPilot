# Field trace: where each collected fact goes in the product

*Traced in code on 2026-10-08, from `docs/pilot/profiles` through to the planner. "Used" means a path exists in code that a parent can see or that changes what a plan does. The last column says what changed in this branch.*

The route a fact takes: **source page → evidence quote → profile item → production claim → venue API (`consumer-projection`) → Family Fit (`family-match`) and ranking (`family-score`) → Home / Explore cards → Venue Detail → Create a Plan (`sequencer`) → saved plan.**

## Facilities

| Fact | Claim field | Family Fit | Home / Explore | Venue Detail | Planner | Verdict |
|---|---|---|---|---|---|---|
| Toilets, baby changing | `familyFacilities.*` | Reason or breach; scored | Card line | Essentials row | **Hard** if listed as a must-have; "check" if unconfirmed | Used end to end |
| Parking, free parking | `familyFacilities.parking/freeParking` | Reason or breach; scored | Card line | Essentials row + parking text | Hard if a must-have; Travel & parking block | Used end to end |
| Café | `familyFacilities.cafe` | Reason; scored | Card line | Essentials row | Not read (lunch is chosen separately) | Used |
| Playground, nature play | `familyFacilities.playground` | Provision only, never an age | — | Row: "On site, ages not stated" | Not read | Used, correctly limited |
| Picnic area | `familyFacilities.picnicArea` | — | — | Folded into the café row | — | Partly used |
| Accessible toilet | `accessibility.accessibleToilet` | For a mobility-aid household | — | Essentials row | — | Used for the household it matters to |
| Wheelchair / step-free | `accessibility.wheelchairAccessible` | For a mobility-aid household (breach if "no") | — | Essentials row | **New:** refused on a confirmed "no", "check before you go" when unconfirmed | Now used by the planner |
| Changing Places toilet | `accessibility.changingPlaces` | — | — | — | — | **Collected, unused** (editor screen only) |
| Blue Badge / accessible parking | `accessibility.accessibleParking` | — | — | — | — | **Collected, unused** |
| Sensory / relaxed sessions | `sendInfo.sensoryFriendlySessions` | — | — | — | — | **Collected, unused** |

## Pushchairs and getting around

| Fact | Where it lives | Family Fit | Detail | Planner | Verdict |
|---|---|---|---|---|---|
| Ground rating (good / mixed / difficult) | `pushchairSuitability` claim | Reason, caution or breach; scored | Essentials row | Hard if "buggy access" is a must-have | Used end to end |
| **Pushchair restrictions** ("not allowed in play areas", "bulky ones parked") | **`rules.*` claim (new)** | **New:** breach for a buggy-only child, caution otherwise | **New:** "Before you go" | **New:** refuses a household that requires buggy access when the rule covers the core visit; prominent warning for a family that brings one | Was dropped; now used |
| Steep slopes, uneven paths | `rules.*` caution (new) | — | "Before you go" | "Worth knowing" | Was dropped; now shown |
| Buggy storage, hire, cloakroom | none | — | — | — | **Collected, no home** (a transport/storage field is needed) |
| Stations, buses, entrances, step-free station notes | none | — | — | — | **Collected, no home** |

## Opening and closures

| Fact | Where it lives | Home / Explore | Detail | Planner | Verdict |
|---|---|---|---|---|---|
| Weekly hours | Provider (Layer A), not a claim | "Closed today" from the schedule | Today card | `isOpenOn` | Used |
| Official-page hours | Profile item, no claim type | — | — | — | **Collected, unused**; when they disagree with the provider the app never knows (see HOURS_AND_PRICING.md) |
| Dated closure of the whole venue | **`rules.*` (new)** | **New:** "Closed today" even when the weekly hours say open | "Before you go" | **New:** the date is refused, in the venue's own words | Was dropped; now used |
| Closed gallery, theatre, courtyard | `rules.*` (new) | — | "Before you go" | "Worth knowing"; prominent if it takes away a must-have (toilets on Mondays at Mudchute) | Was dropped; now shown |
| Seasonal hours ("closes 4pm from 24 October") | none | — | — | — | **Collected, no home** |

## Children, ages and price

| Fact | Where it lives | Family Fit | Home | Detail | Planner | Verdict |
|---|---|---|---|---|---|---|
| Recommended ages | `minRecommendedAge`, `maxRecommendedAge` claims | Reason; scored (the only age evidence the score sees) | Card | Essentials | Advice only, by design | Used; **no pilot venue carries one** |
| Age-specific provision (ZooTown up to 8, a baby space 0 to 2, a playground 4 to 14) | Code (`reviewed-activity-evidence.ts`) | Reason per child; can earn Excellent | Card reason | **New:** "For children" list, matched to each child | Not read, by design | Used for labels, **not for the score** (proposal P1 in RANKING_INVESTIGATION.md) |
| Door age policy | `agePolicy.*` claim | Breach | — | — | **Hard**: a child turned away refuses the plan | Used; none published for the pilot |
| "Under 11 must be with an adult" | none in the pilot path | — | — | — | — | **Collected, unused** (the accompaniment rule exists in the model but no claim is written for it) |
| Admission prices | Code (`reviewed-admission-claims.ts`) | Budget factor (needs a spend tier) | — | Admission card | Soft preference | Used where reviewed; London Zoo's day-types unsupported (see HOURS_AND_PRICING.md) |
| Visit length | Editorial field, not claim-driven | — | — | Visit-length hint | Visit length for the plan | Used where an editor set it; **pilot durations (6 venues) are not wired** |
| Booking, queue, busy times, height limits, noise | `rules.*` (new) | — | — | "Before you go" | "Worth knowing" | Was dropped; now shown |

## What remains collected but unused

1. Changing Places, Blue Badge bays, sensory and relaxed sessions: consumer-visible fields do not exist. Small to add (a row each on Venue Detail), but each is a product decision about how prominent a niche need should be.
2. Stations, buses, entrances, buggy storage and hire: need a *Getting there* field on Venue Detail and in the plan.
3. Official-page hours and seasonal hours: need the source hierarchy in HOURS_AND_PRICING.md.
4. Accompaniment rules ("under 11 with an adult"): the model exists, the claim writer does not.
5. Pilot visit durations: six venues have one; the field is editor-only.

## Where the old path dropped information

The reason these were unused is mechanical, not editorial: `venue_claims` accepts any key, but the projection that builds what the app reads (`projectActiveClaimsToPayload`) only knew about a fixed list of keys, and `setNestedValue` silently ignored the rest. Anything not on the list was stored and never shown. The venue-rules projection is read-only and sits beside it (`server/enrichment/_lib/venue-rules.js`), so it adds no database column, no write path and no change to anything already published.
