# Excellent: activity evidence, implemented (rule R4, no ranking change)

2026-10-08. This implements the principle you approved from `EXCELLENT_RULE_V2.md`. It does **not** implement the
optional score step, which is a separate PR for review.

## The rule as built

**Where the evidence comes from.** `src/data/reviewed-activity-evidence.ts` holds 11 reviewed items at 11 venues. Each
one is the venue's own words, from its own page, on a stated date. Every quotation was checked against the stored text
of that page on that date, and each is still present in the latest reading.

**Final review, 8 October: three items removed.** They were in the first draft of this file and are not evidence of a
permanent activity for an age:

| Venue | The words | Why it is out |
| --- | --- | --- |
| RAF Museum London | "Free activities for everyone from toddlers to teens" | The heading of the family page. The permanent offer beneath it ("hands-on activities and family-friendly exhibits in every hangar", the free playground, trails) states no age of its own. A heading markets the page; it is not a statement that the exhibits suit a 2-year-old or a 15-year-old. |
| Hobbledown Heath | "From toddlers taking their first steps into adventure to older children ready to climb, jump and explore, there's something here for every age" | Copy about the whole venue, which is the general claim the rule exists to exclude. |
| Swanley Park | "Older children can use up their energy nearby at the large, well equipped play area" | A real play area, but "older children" carries no age. The page gives none. |

The file's header now states the standard: a stated age, or a standard age term naming the provision itself ("toddler
soft play"). Headings, taglines, whole-venue copy and ageless audiences are not evidence, and a test pins each of the three
rejections.

**The two kinds:**

| Kind | What it is | Items |
| --- | --- | ---: |
| Permanent provision for an age | a playground, play area, soft play or space, with a stated age | 8 |
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

**Babies.** Under 12 months the visit is the activity, as before. For a household of babies only, what is confirmed is
how easy the visit is, so the badge, the screen-reader label and the card classification all read **"Easy visit"**
(and the headline "Easy to visit with Ozzie"). The word Excellent (or Good) is never used for it, because that would claim an
activity was judged. Nothing about ranking changes: the verdict underneath is the one Meet Halfway and the score already
used, and only its wording differs. A baby the place is not confirmed for reads "Easy visit · check Ozzie". A household
with a toddler, or a child of exactly twelve months, is not a babies-only household and gets the ordinary labels.

**Freshness.** An item counts for 90 days from its reading, the lifetime of every non-facility claim. After that it stops
counting until a person reads the page again. It is never extended.

**Ranking.** Untouched. `family-score.ts` does not read activity evidence, and a test pins that the score and every factor
are identical with and without it.

## Measured (134 destinations, 8 homes, 7 households: 7,504 pairs; same harness as the proposal)

| | Before | After (as first pushed) | **After (final)** |
| --- | ---: | ---: | ---: |
| Excellent pairs | 49 | 60 | **28** |
| …for households with a child of 12 months or more | 21 | 32 | **0** |
| Good | 767 | 798 | **820** |
| Possible | 3,016 | 2,974 | **2,984** |
| Pairs that name a child as suited | 0 | 352 | **264** |
| Venues Excellent for a household with a child of 12 months or more | RAF Museum, SEA LIFE | RAF Museum | **none** |
| Family Fit scores changed | | 0 of 7,504 | **0 of 7,504** |
| Orderings identical to before | | 56 of 56 | **56 of 56** |

**The honest result: today no venue is Excellent for a household with a child of a year or more.** The 21 pairs that had
it before held it on logistics alone (SEA LIFE and the RAF Museum: toilets, baby changing, parking, pushchair access,
café). Neither venue's own pages state an age for anything permanent, so the rule cannot say the visit suits a named
child, and it no longer does. The 28 pairs that remain at the top verdict are babies-only households, and they
read "Easy visit", not "Excellent": no Excellent candidate has been created to fill the badge.

**What stops the eight provision venues at Good.** Each covers the child's age, so the parent reads the activity line
and "Good for Maya". Excellent also needs the venue's logistics confirmed (toilets, baby changing where a baby comes,
pushchair access where a buggy comes), and none of the eight has all of them in served claims yet. Those are facility
facts the recovery work can supply; nothing here needs reinterpreting.

| Venue | Household | Verdict |
| --- | --- | --- |
| Burgess Park | 7 · 4 and 7 · 13 | Good for the named children |
| Belmont Children's Farm | 7 · 4 and 7 | Good for the named children |
| Flip Out Watford | 3 · 3 and a baby | Good for Sloane; "easy to visit with Ozzie" |
| Chiswick House | 4 and 7 | Good for Kit; Maya not yet confirmed |
| London Museum Docklands, Battersea Park, Babylon Park, Discover | various | Possible: activity line shown, logistics unknown |

## What a parent reads (Islington home)

| Venue | Household | Badge | The activity line |
| --- | --- | --- | --- |
| Beckenham Place Park | 7 | Good for Maya | Junior parkrun for ages 4 to 14 (on set days), for Maya's age |
| Chiswick House | 4 and 7 | Good for Kit; check Maya | Under-7s playground, for Kit's age |
| Burgess Park | 4 and 7 | Good for Kit and Maya | Play and climbing equipment for children up to 14, for Kit and Maya's ages |
| Flip Out Watford | 3 and a baby | Good for Sloane | Toddler soft play, for Sloane's age |

## The judgement that was reversed

The first draft read the RAF Museum's page heading as applying to the permanent offer beneath it, and so made the museum
Excellent for children from 1 to 17. On the final review that is a stretch: the heading is the page's marketing line,
and nothing beneath it names an age. The museum now reads "Good" on its confirmed logistics, with no child named, until
its own pages say more. Hobbledown Heath and Swanley Park came out on the same test.

## Not in this change

- **The score step** (age factor 88 or 80 from provision) is in a separate PR for review. It is the only part that moves
  rankings.
- **Venue Detail's playground row** still says "On site" or "On site, ages not stated". Showing a provision's stated ages
  there ("Playground: Under 7s") is a small follow-up.
