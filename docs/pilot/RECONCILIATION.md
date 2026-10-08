# From 194 profile items to what can be published

*Generated figures come from `scripts/pilot/accounting.cjs` (output: `docs/pilot/accounting.json`). Re-run it after any profile change.*

The pilot report quoted six numbers that looked like they should line up and did not. They count different things. This page says which, and whether each gap is a deliberate safety gate, a limit of today's data model, or something the pipeline could do better.

## What each number counts

| Number | What it counts | Unit |
|---|---|---|
| **194** | Everything the ten profiles hold: one item per statement a source page makes (or does not make) | profile items |
| **84** | Items the mechanical gate accepted with no person: a plain, current, unconditional, non-negative statement of a fact type on the allow-list | profile items |
| **85** | Items the gate held for a person, each with the reason(s) it was held | profile items |
| **25** | Items that are not findings: 21 *unknown* (the pages read do not say) and 4 *hypothesis* ("probably", an inference, never shown as fact) | profile items |
| **46** | **Claims** the pilot would write from the 84 without a person | production claim rows |
| **73** | **Claims** the pilot would write if a person approved the 85 as well (the 46 included) | production claim rows |

84 + 85 + 25 = 194. One of the 85 is also marked *held* (Discover's under-1 admission, where two pages disagree); it is never counted as a claim.

So **46 and 73 are not subsets of 84 and 85.** They are a different unit. An item is not a claim: a claim is one value in one field of the production `venue_claims` table. Two things follow.

- One item can make two claims (a parking statement that also states a fee makes `parking = yes` and `freeParking = no`).
- Many items make none, because the table has no field for them.

## Why fewer can be published than were accepted

Where the 84 accepted items go:

| Where it goes | Items | Is the limit a safety gate? |
|---|---|---|
| A claim in a field production already has (toilets, baby changing, café, playground, parking, wheelchair, sensory sessions, accessible parking) | 43 (becoming 46 claims) | No. They are publishable. |
| A venue rule, a new claim type added in this work (dated closures such as Christmas Day) | 2 | Needs a person: a rule can refuse a date, so it is only ever published from a person-approved claim. |
| **No home at all.** A plain activity description (13), stations/buses/entrances/fees (10), official opening hours (4), practical rules (5), facility detail beyond the mapped fields (4), pushchair storage (1) | 37 | **No. This is the data model.** The item is accepted and true, and the product has nowhere to put it. |
| A note only | 2 | No. |

Where the 85 held items go if a person approves them:

| Where it goes | Items | Note |
|---|---|---|
| A claim in an existing field | 21 | Becomes 27 claims after parking's second field and the like. |
| A venue rule (new) | 23 | Pushchair restrictions, step-free gaps, partial closures, cautions, booking notes. |
| Reviewed activity data (age-specific provision) | 10 | Ships as code through a pull request, not as a claim, by the existing convention. |
| Reviewed admission data | 6 + 7 held | Ships as code; seven are held for a person to decide (a price carried from an earlier reading, an under-1 conflict). |
| No home | 13 | Same data-model limit as above. |
| A note only | 5 | |

## Is this safety, or a pipeline limit?

It is both, and they are separable:

1. **Safety gates (deliberate).** Why the 85 were held, counting the reasons (an item can have several): not a fact type that may be accepted without a person 26; an accessibility claim 20; conditional, temporary or dated wording 16; a price or free-entry claim 12; a negative claim 11; says who a place is for 10; conflicts with another reading 9; applies to part of the venue 6; carried from an earlier reading 1. None of these is a defect. Each is a case where an automatic yes would have been wrong at least once in the pilot (see `docs/PILOT_10_PROFILES.md`).
2. **Data-model limits (avoidable).** Before this work 39 of the 84 and 19 of the 85 (plus 22 more that survived only as a free-text note) had no field to land in. That is what made the product ignore information it had paid to collect. The venue-rules claim type added in this work gives 25 of them a structured home (23 held + 2 accepted); the tables above are the position after it, with 37 and 13 still homeless. What remains without a home is stations and buses, entrance details, and a plain activity description: Venue Detail needs a *transport* field before those can be shown.
3. **Pipeline limits (avoidable).** Production's own automatic publisher only writes 11 field types. Of the 46 claims, **37** are in those 11; the other 9 (picnic area, changing places, accessible parking, and similar) would be published by the pilot's path but not by production's.
4. **Independent check.** Running production's own extractor over the same stored pages: it agrees with the profile on 44 facts, disagrees on 2 (two parking statements it would also hold for conflict) and **misses 11** the profile found (toilets, café, and others that the extractor's patterns do not recognise). So the profile is a superset of what production publishes today, and the 11 are the evidence for improving the extractor, not for trusting the profile less.

## So what is "publishable"?

| | Claims | Condition |
|---|---|---|
| Written by the pilot with no person | 46 | None, but see 3: production's own publisher would write 37 |
| Written by the pilot if a person approves the held items | 73 | A person approves 27 more claims |
| Venue rules, new in this work | 28 | A person approves each one; nothing automatic can create a rule |
| Reviewed activity and admission data | 16 + 7 held | A pull request, by the existing convention |

**Nothing in this branch writes any of these to production.** The fixture builds them locally to show the product.
