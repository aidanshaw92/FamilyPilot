# Young V&A canary — result: 7 of 8 predictions held, and the eighth found a real defect

Job `0ab7388f…` requeued 09:09:41 UTC, claimed and processed by the real every-minute worker,
`completed` at **09:10:22 UTC**, `attempts=1`, `last_error=NULL`. Read-only verification at 09:14 UTC.

## The headline

**The prevention fix worked exactly as designed.** Both other-catalogue-venue pages were rejected
before being fetched, and every page that was fetched carries a persisted scope.

**But one live claim was disputed that should not have been** — and not one of the contaminated
ones. `familyFacilities.parking`, sourced from Young V&A's **own** page, was withdrawn because a
*withheld* sibling page contradicted it.

## Prediction scorecard

| # | prediction | result |
| --- | --- | --- |
| 1 | only Young V&A processed | ✅ 0 other venues' claims, evidence or jobs touched; global job md5 unchanged |
| 2 | `/young/` and `/young/visit` refetched, `venue_own_subtree` | ✅ both, reason `under_own_website` |
| 3 | `/south-kensington/visit` and `/east/storehouse/visit` rejected before fetch | ✅ not refetched, no new rows, both still `subject_scope = NULL`, untouched |
| 4 | `/wedgwood/visit` fetched and `sibling_unverified` | ✅ refetched, scope persisted, 3 toilets facts retained and withheld |
| 5 | **no claim disputed** | ❌ **`familyFacilities.parking` disputed** |
| 6 | `babyChanging`/`parking` may be superseded and replaced | ⚠️ neither: the draft is still `pending_review`, nothing was approved |
| 7 | active claims stay 224, agePolicy 0, `venue_age_policy` 0 | ⚠️ **223** (the dispute); agePolicy 0 ✅, `venue_age_policy` 0 ✅ |
| 8 | consumer keeps all six facts | ❌ parking withdrawn from the consumer projection |

Evidence rows 875 → **878**; rows carrying a scope 0 → **5**.

## What the crawl actually fetched (5 pages, all scoped)

| page | scope | reason | facts |
| --- | --- | --- | --- |
| `/young/` | `venue_own_subtree` | `under_own_website` | 0 |
| `/young/visit` | `venue_own_subtree` | `under_own_website` | 16 |
| `/wedgwood/visit` | `sibling_unverified` | `same_host_no_established_relationship` | 3 (toilets) |
| **`/east/museum/visit`** | `sibling_unverified` | `same_host_no_established_relationship` | **23** |
| `/visit` | `sibling_unverified` | `same_host_no_established_relationship` | 0 |

Not fetched, rejected at discovery: `/south-kensington/visit` (Victoria and Albert Museum) and
`/east/storehouse/visit` (V&A East Storehouse). Both are catalogue venues, so both are hard rejects.

## The defect

Rejecting two pages freed two slots in the `MAX_PAGES = 5` budget, and the reserve filled them with
`/east/museum/visit` — **V&A East Museum, which is not a catalogue venue**, so it is
`sibling_unverified`: fetched, recorded, withheld. That page states parking **both ways**:

```
parking = yes   "Buggy park ​Buggy parking is available located on the Lower Ground floor."   (x3)
parking = no    "There is no parking provided or managed by the V&A."
```

Young V&A's own page states it once, unambiguously:

```
parking = yes   "Buggy park ​Buggy parking is available in the Welcome Area near the main entrance."
```

`bundle.facts` is the union across sources, so parking became `evidenceStatus: 'conflict'`. The new
draft `cf339d42` records the collapse verbatim: `{"field": "parking", "value": "unknown"}`.
`eligibleFact` rejects a conflicted fact, so `review.payload.familyFacilities.parking` was
`undefined`, and `reconcileSourceClaims` (`auto-approve.js:83`) disputed the claim.

**Why the provenance rule did not protect it.** Reconciliation runs with
`{enforceSubjectScope: false}` — the deliberate exception that stops a deploy repairing production
en masse. That exception makes scope invisible *in both directions*: a `sibling_unverified` source
cannot support a claim, but nothing stops it **refuting** one.

That asymmetry is the bug. Withholding has to be symmetric: evidence that may not establish a fact
must not be able to withdraw one either. `babyChanging` survived only because the sibling page
happened to agree with the venue's own page.

This is not a pre-existing behaviour that merely surfaced. Before the fix, the crawl budget was
spent on the two catalogue-venue pages, so `/east/museum/visit` was never fetched for this venue.
Rejecting them is correct and is what freed the slot. The conflict is a real consequence of the fix,
and it will recur on any multi-venue host whose siblings phrase a facility differently.

## Claim-level before / after

| claim id | field | before | after |
| --- | --- | --- | --- |
| `e1cd19d8-c128-4672-927e-fdc872f96fb3` | familyFacilities.parking | **active**, `yes`, `/young/visit`, evidence `482ab2d3…`, `checked_at 2026-09-20`, `valid_until 2026-10-20`, `supersedes 5ee8c75e…`, `updated_at 2026-09-20 12:58:07.636+00` | **disputed**, `updated_at 2026-09-27 09:10:21.602+00`. Value, source, evidence id, dates and supersedes chain all unchanged. |

Every other Young V&A claim is byte-identical to the before-state, including all four whose sources
are now ineligible — `accessibleToilet` (`c5aabddd…`), `wheelchairAccessible` (`2b26a0aa…`),
`pushchairSuitability` (`d185a8a0…`) and `toilets` (`ab9967e4…`) are still **active**, untouched.
That half of prediction 5 held: nothing already published was withdrawn by the new rule.

## Consumer impact

`getConsumerMetadata` is claim-driven (`consumer-projection.js:59-63`: `getActiveClaims`, then
disputed field keys filtered out), so **parents no longer see parking for Young V&A**. The stored
`venue_family_metadata.family_facilities` column still reads `{parking: yes, toilets: yes,
babyChanging: yes}` with `updated_at 2026-09-20`, because `approveDraft` never ran — so the column
and the claim behind it now disagree. One venue, one facility, and the lost fact was true.

## Rollback plan — NOT executed, awaiting approval

Exact and reversible, using the captured id:

```sql
update venue_claims
set status = 'active', updated_at = now()
where id = 'e1cd19d8-c128-4672-927e-fdc872f96fb3'
  and status = 'disputed';
```

`valid_until` is `2026-10-20`, so the claim is still in date and returns to service immediately.
Nothing else needs restoring: no other claim, evidence row or metadata value changed.

**Two cautions.** The every-minute worker will not re-dispute it while the queue is empty, but any
future run over Young V&A will reach the same conflict and dispute it again — so the rollback is
cosmetic until the asymmetry is fixed. And the draft `cf339d42` is still `pending_review`; approving
it would write metadata from the current bundle.

## The fix (now written, not deployed)

Make withholding symmetric: a source whose `subject_scope` is not eligible must be excluded from
conflict detection for a venue-specific field, not merely from publication. The scope-blind
reconciliation exception then keeps its original purpose — not disputing en masse on deploy — while
losing its power to let unusable evidence veto usable evidence.

Written as a **precedence, not an exclusion**: the per-field verdict is computed from eligible-scope
candidates where any exist, and ineligible evidence still speaks where nothing eligible does. That
second half is load-bearing — a blanket exclusion would delete the field wherever every source is
ineligible, and a vanished field is what reconciliation disputes on, so it would have withdrawn
Horniman Butterfly House's seven claims on the cron's next run.

Six regression tests from this canary's own production strings; two mutants killed by 3 tests each.
1129 tests, typecheck clean, web export clean, #110 replay unchanged. **Not merged, not deployed.**
Order from here: deploy the fix, restore `e1cd19d8…`, re-run this canary, then Phase 6.
