# Excellent: activity evidence, implemented (rule R4, no ranking change)

2026-10-08. This implements the principle you approved from `EXCELLENT_RULE_V2.md`. It does **not** implement the
optional score step, which is a separate PR for review.

## The rule as built

**Where the evidence comes from.** `src/data/reviewed-activity-evidence.ts` holds 14 reviewed items at 14 venues. Each
one is the venue's own words, from its own page, on a stated date. All 14 quotations were checked against the stored text
of that page on that date, and each is still present in the latest reading.

**The two kinds:**

| Kind | What it is | Items |
| --- | --- | ---: |
| Permanent provision for an age | a playground, play area, soft play, space or exhibits | 11 |
| Programme on set days | classes, a weekly run, drop-in sessions | 3 |

**What it does in Family Fit,** for each child of 12 months or more not already inside the venue's own recommended range:

| Kind | Names the child ("…, for Maya's age") | Counts as a venue fact | Can support Excellent |
| --- | --- | --- | --- |
| Permanent provision | yes | yes | yes |
| Programme | yes, saying "(on set days)" | no | **no** |
| Logistics (toilets, parking, access, café) | never | as before | never covers a child |

**The Excellent gate.** Excellent now also needs **every child of 12 months or more** to be covered by:

- the venue's own recommended range; or
- a permanent provision for their age.

**Babies.** Under 12 months the visit is the activity, as before. A household of babies only keeps its Excellent, and the
badge reads **"Excellent · easy visit"**, so it never implies an activity was judged.

**Freshness.** An item counts for 90 days from its reading, the lifetime of every non-facility claim. After that it stops
counting until a person reads the page again. It is never extended.

**Ranking.** Untouched. `family-score.ts` does not read activity evidence, and a test pins that the score and every factor
are identical with and without it.

## Measured (134 destinations, 8 homes, 7 households: 7,504 pairs; same harness as the proposal)

| | Before | After |
| --- | ---: | ---: |
| Excellent pairs | 49 | **60** |
| …for households with a child of 12 months or more | 21 | **32** |
| Good | 767 | **798** |
| Possible | 3,016 | **2,974** |
| Pairs that name a child as suited | 0 | **352** |
| Venues Excellent for a household with a child of 12 months or more | RAF Museum, SEA LIFE | **RAF Museum** |
| Family Fit scores changed | | **0 of 7,504** |
| Orderings identical to before | | **56 of 56** |

This matches the proposal's R4, except that pairs naming a child are 352, not 368. Battersea's playground now uses the
ages its page states (4 to 14) rather than the "toddlers" in its title, so it no longer names a 3-year-old.

SEA LIFE loses Excellent for older children. It had it on logistics alone: no evidence on its own pages covers them.

## What a parent reads (Islington home)

| Venue | Household | Badge | The activity line |
| --- | --- | --- | --- |
| RAF Museum London | 4 and 7 | **Excellent for Kit and Maya** | Hands-on activities and exhibits for toddlers to teens, for Kit and Maya's ages |
| RAF Museum London | 3 and a baby | **Excellent for Sloane** | headline: "Excellent for Sloane, and easy to visit with Ozzie" |
| Beckenham Place Park | 7 | Good for Maya | Junior parkrun for ages 4 to 14 (on set days), for Maya's age |
| Chiswick House | 4 and 7 | Good for Kit; check Maya | Under-7s playground, for Kit's age |
| Burgess Park | 4 and 7 | Good for Kit and Maya | Play and climbing equipment for children up to 14, for Kit and Maya's ages |
| Flip Out Watford | 3 and a baby | Good for Sloane | Toddler soft play, for Sloane's age |

## The one judgement to look at

**The RAF Museum is the only venue that becomes Excellent for older children.** Its family page is headed "Free
activities for everyone from toddlers to teens". The same page lists the permanent offer beneath that heading:

- "hands-on activities and family-friendly exhibits in every hangar";
- a free playground;
- trails.

I read the heading's age band as applying to that permanent offer. If you'd rather not, change its `kind` to `programme`.
It will then name children but never make Excellent.

## Not in this change

- **The score step** (age factor 88 or 80 from provision) is in a separate PR for review. It is the only part that moves
  rankings.
- **Venue Detail's playground row** still says "On site" or "On site, ages not stated". Showing a provision's stated ages
  there ("Playground: Under 7s") is a small follow-up.
