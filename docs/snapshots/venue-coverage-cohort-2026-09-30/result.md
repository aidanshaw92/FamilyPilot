# Cohort run result: more pages, no more answers for parents

Run 2026-09-30 15:53:12 → 16:10:08 UTC on `ea84329`, production deployment verified READY on that
commit before the requeue. 18 venues, 18 jobs completed, **0 failures, max 1 attempt, no worker
timeouts**. Baseline in `baseline.md`, captured and re-verified byte-identical immediately before.

## The headline

**Served-to-parent coverage did not move. 12 core fields before, 12 after, on every single venue.**

Not one of the 18 venues gained a field. Not one lost a field.

| | Before | After |
| --- | --- | --- |
| Cohort core fields served (of 180 possible) | 12 | **12** |
| Venues serving nothing | 11 | **11** |
| Cohort active claims | 12 | 12 |
| Cohort disputed | 1 | 1 |

Per field, all ten: baby changing 1→1, toilets 0→0, parking 3→3, free parking 1→1, accessible toilet
0→0, wheelchair access 2→2, pushchair 1→1, environment 2→2, café 0→0, playground 2→2.

## The funnel, where it actually breaks

| Stage | Count | Note |
| --- | --- | --- |
| Generated candidates | 456 | discovery produced plenty |
| Initially selected | 108 | 57 real links, 51 speculative |
| **Attempted** | **155** | 8.6 per venue, up from 4.07 — the budget works |
| **Usable** | **60** | 38.7%; 41 blocked, 54 error |
| **Eligible scope** | **145 of 155 rows** | 0 null scope — provenance now recorded on every page |
| **Pages yielding any fact** | **13 of 60** | **47 usable pages produced nothing** |
| Facts extracted | 52 raw / 16 distinct venue-field | |
| **New served claims** | **0** | 12 claims created, all refreshes of the same 12 fields |

The crawl change did exactly what it was built to do. Everything after it did not.

### Break 1 — extraction: 47 of 60 usable pages produced zero facts

78% of the pages we now successfully fetch, on the venue's own site, in eligible scope, yield nothing.
This is the dominant loss and it is not a discovery problem. The two venues flagged in the baseline as
the test of this — Crossrail Place Roof Garden and Hanwell Zoo, each with 5 usable pages and zero served
fields — went to 6 usable pages each and **still serve zero**. That was the pre-registered prediction and
it came out on the "extraction is the bottleneck" side.

### Break 2 — publication: 2 new facts extracted and never published

Of 16 distinct venue-field facts from eligible, usable pages:

- **12 merely refreshed fields already served** (same venue, same field, same value);
- **1 was correctly withheld**: Paradox Museum's own pages state `wheelchairAccessible` both **yes** and
  **no**. A genuine eligible-source conflict, withheld exactly as rounds 3–5 intended. This is the system
  working, not a loss;
- **2 were extracted, eligible, in scope — and produced no claim row at all, in any status**:
  - Babylon Park London — `pushchairSuitability = good`
  - Flip Out Brent Cross — `environment = indoor`

Those two are the publication gap and the concrete next thing to diagnose.

### Claims lost to conflict

**None.** No claim was withdrawn. The predicted risk — that reading more of a venue's own pages would
surface self-contradictions and cost coverage — materialised once (Paradox) and cost nothing, because
that field was never served in the first place.

## The budgets, measured in production

| Stop reason | Venues | Avg attempts | Avg usable | Avg gather | Max gather | Max head |
| --- | --- | --- | --- | --- | --- | --- |
| `attempt_ceiling` | 11 | 10.00 | 1.82 | 6.71 s | 25.05 s | 2.36 s |
| `usable_page_target` | 7 | 6.71 | 6.00 | 5.29 s | 10.05 s | 1.71 s |

**No venue hit the wall clock.** Max gather 25.05 s against a 33 s budget; max head 2.36 s, so the
original 5 s head assumption was generous in the ordinary case — but it was still the right fix, because
15 s was reachable and the bound is now enforced rather than assumed.

Real links behaved as designed: in the healthy group, selections were 35 real links to 7 speculative.
The 11 venues that exhausted the attempt ceiling averaged 1.82 usable pages — for them the sites are
mostly unreachable (blocked or 404), and more attempts cannot fix that.

## Controls

Churchill War Rooms and National Portrait Gallery: 10 attempts each, **0 usable**, all blocked. Unchanged
at zero served fields. The controls behaved as controls — not a failure of the discovery change.

## Blast radius

`claims_touched_outside_cohort = 0`. `evidence_outside_cohort = 0`. Global active 227 and disputed 7,
both unchanged. `last_refresh` untouched at 2026-09-30. Nothing beyond the 18 venues was affected.

## The evidence-led verdict

This is the middle branch, cleanly: **pages increased substantially and served facts did not move at
all.** So the decision is not to roll the discovery change outward and not to increase crawl volume
again. The next work is extraction and publication, in that order of size:

1. **Extraction.** 47 usable, in-scope pages yielding zero facts is where the coverage is. Worth starting
   from the actual stored `extracted_text` of those 47 pages rather than from theory.
2. **Publication.** Two extracted, eligible facts that produced no claim row is a small, sharp,
   reproducible bug with two named cases to test against.

The discovery change is not wasted: provenance is now recorded on every page of these 18 venues (109
null-scope rows before, 0 after), and the pages that carry facility information are now being reached.
It simply turns out that reaching them was never the binding constraint.
