# Post-deploy verification and the Phase 6 repair audit — 2026-09-30

`ac0f897` (PR #112, source integrity rounds 3–5) merged and deployed to production; Vercel
`dpl_utoRZqLDW877M2z8Z4nUfQU3iP8d` reached READY before any data was touched. Two controlled
single-venue runs through the **normal** every-minute worker, then a read-only audit.

Globals re-verified immediately before the first write at 09:31:11 UTC and byte-identical to the
09:21:32 snapshot: claim id:status md5 `24ca11210537925647b391c380197c45`, evidence id md5
`03902c98aadbb691e2c72f0a99b4e76b`, 225 active / 7 disputed / 427 total, 950 evidence rows, 154 scoped.

## Young V&A canary — all eight checks pass

Job `0ab7388f…` requeued 09:31:20, completed **09:32:11** (51s), attempts 1, no error.

| # | check | result |
| --- | --- | --- |
| 1 | job completed cleanly | ✅ |
| 2 | only Young V&A processed | ✅ 0 other venues' claims, evidence or jobs moved |
| 3 | own pages refetched, `venue_own_subtree` | ✅ `/young/` 7942 chars `ok`; `/young/visit` 7317 chars `ok`, 16 facts |
| 4 | other-catalogue-venue pages not refetched | ✅ `/south-kensington/visit` and `/east/storehouse/visit` untouched, still `subject_scope` NULL, retrieved 2026-09-20 |
| 5 | siblings recorded and withheld | ✅ `/wedgwood/visit`, `/east/museum/visit`, `/visit` all `sibling_unverified` |
| 6 | no claim disputed | ✅ **0** |
| 7 | parking re-established from its own page | ✅ new claim `6bbf0660…` |
| 8 | agePolicy still 0 | ✅ |

**The decisive detail.** `/east/museum/visit` — the non-catalogue sibling whose self-contradictory
parking wording caused the original false withdrawal — was fetched again, with all **23** of its facts
present in the bundle. Parking was still established from `/young/visit` alone. The round-3 defect is
gone, proven against the exact page that produced it.

### Three contaminated claims healed themselves

Unexpected and the most useful result here. The run did not merely avoid harm; it **replaced**
contaminated claims with the venue's own evidence:

| field | was sourced from | now sourced from | new claim |
| --- | --- | --- | --- |
| accessibleToilet | `/south-kensington/visit` (V&A South Kensington) | `/young/visit` | `677628d2…` supersedes `c5aabddd…` |
| wheelchairAccessible | `/east/storehouse/visit` (V&A East Storehouse) | `/young/visit` | `12caefcd…` supersedes `2b26a0aa…` |
| pushchairSuitability | `/east/storehouse/visit` | `/young/visit` | `cb66cedc…` supersedes `d185a8a0…` |

Because the crawl now reads the venue's own `/young/visit` properly, that page supplies the same
facts with correct provenance and supersedes the contaminated rows through the ordinary lifecycle. No
repair was needed for any of them.

`toilets` (`ab9967e4…`) remains active on `/wedgwood/visit`, now recorded `sibling_unverified`. Not
disputed — correct: rule 3 skips an ineligible backing scope, which is what keeps Phase 6 gated.

## Belmont Children's Farm — resolved, and it proves the round-5 rule in both directions

The 770-character read looked transient rather than systemic: the same homepage returned 8000
characters on 14 Sep, and the 29 Sep run got 8000 on two other Belmont URLs. Job `82f273a5…` requeued
09:37:46, completed **09:38:08**.

The homepage came back `fetched_truncated` again — but at **8000 characters with the
indoor/outdoor fact present**. A new active claim `b152a782…` `environment=mixed` was created from it,
backed by a `venue_own_subtree` row.

So on one page, in one run, both halves of round 5 held:

- **truncation cannot deny** — 0 claims disputed, even though the backing read was truncated;
- **truncation can assert** — the fact present in the captured text re-established the claim.

## Both false withdrawals resolved from current evidence, not by flipping rows

| claim | resolution |
| --- | --- |
| `e1cd19d8…` Young V&A parking | superseded in practice by new active `6bbf0660…` from `/young/visit`, `ok`, `venue_own_subtree`, checked 2026-09-30 |
| `7a37949d…` Belmont environment | superseded in practice by new active `b152a782…` from the homepage, `venue_own_subtree`, checked 2026-09-30 |

Both original rows are left `disputed` as history. Nothing was flipped back.

## Phase 6 repair audit — corrected 2026-09-30

**The first version of this section was wrong, and the error was in the wording as much as the
numbers.** It said the split was "by the claim's backing evidence row". It was not: the query joined
each claim to the NEWEST evidence row for the same `source_url`, which is a different thing. Several
claims still point at an older NULL-provenance row while a newer row for that URL has since been
classified, so the two readings disagree. Corrected by the product owner and re-verified here.

### Two readings, never to be conflated again

| reading | definition | use |
| --- | --- | --- |
| **claim provenance** | the row `venue_claims.source_evidence_id` actually references | what a claim rests on; the only basis for judging a claim |
| **latest URL classification** | the newest `venue_source_evidence` row for the same `source_url` | what the crawler currently thinks of that page; useful for coverage and for what may be published next |

### Claim provenance — the authoritative reading

Active claims with a `source_url`, joined on `source_evidence_id`:

| scope | claims |
| --- | --- |
| `venue_own_subtree` | 45 |
| `venue_named_page` | 1 |
| `sibling_unverified` | **3** |
| NULL, not yet re-crawled | **174** |

**46 eligible / 3 ineligible / 174 no provenance.** The earlier "9 ineligible / 167 NULL" was the
latest-URL reading mislabelled as claim provenance.

This makes the case against repair stronger, not weaker: only **three** active claims rest on
provenance that is recorded and ineligible, and 174 rest on rows written before the column existed.

## Primrose Hill is NOT a proven cross-venue error, and that matters more than the counts

The earlier version called `2d142209…` (Primrose Hill playground) "the one proven cross-venue error".
That was wrong. The page reads:

```
page_title:  Primrose Hill | The Royal Parks
extracted:   "Primrose Hill playground  Primrose Hill Playground improvement works are now
              complete, but the new shrubs and young trees need time to establish."
fact:        playground=yes
```

The page is **about Primrose Hill**, and its own text says so. It classifies as
`other_catalogue_venue` with reason `under_another_catalogue_venue` solely because its URL sits beneath
The Regent's Park's catalogue path (`/visit/parks/regents-park-primrose-hill/...`).

### The general lesson

`other_catalogue_venue` was described in #110 and #111 as the hard reject that "rests on nothing else"
— exact and ID-based rather than similarity. That is true, and it is still the right rule for
**withholding new publication**: a URL owned by another catalogue venue is a page we cannot safely
attribute, so we decline to publish from it.

But it is a statement about **URL ownership, not about subject matter.** Primrose Hill is the concrete
proof: the strongest verdict in the vocabulary was structurally correct and substantively wrong about
what the page describes.

**So the classifier must never be used on its own to delete or dispute an existing fact.** Withholding
on unproven identity is conservative; withdrawing on it is not. Nothing in the nine, and nothing in the
three, may be disputed from the classifier alone.

## Recommendation: do not run a bulk repair

1. **Re-crawling heals contamination by itself** where the venue's own page carries the fact. Young V&A
   demonstrated three claims healed in a single 51-second run, with no repair and no risk.
2. **174 of 223 active sourced claims have no provenance yet.** Disputing on that would be exactly the
   bulk invalidation-from-unestablished ruled out from the start.
3. **There is no proven cross-venue error left to repair.** The one candidate is evidenced as correct.
4. **The classifier is not a content verdict.** Per Primrose Hill, a structural reject can be right
   about ownership and wrong about subject.

Proposed and agreed: let the natural refresh cycle re-crawl the catalogue under the new code, re-run
this audit on the **claim-provenance** reading, and consider disputes only for claims that remain
ineligible after their own venue has been re-read — and then only with content evidence, never on the
classifier alone.

**Source integrity closes here as a workstream.** No further reconciliation or integrity PR without a
real production failure, a direct safety dependency, or a material coverage gain.

## Known limitation, measured and deliberately not chased

`extractRelevantParagraphs` caps stored text at `maxChars = 8000`
(`server/enrichment/_lib/html-text-extractor.js:137`). So an `ok` row sitting exactly at 8000 is also a
partial view, and `isCompleteRead` treats it as complete.

Measured: **4 `ok` rows across 2 venues** sit at exactly 8000, against 537 under 7900. No claim has
been falsely withdrawn through this path — Belmont's withdrawal came from the explicitly
`fetched_truncated` row, which round 5 now handles.

Recorded rather than fixed, per the standing instruction that further integrity work needs a
demonstrated production failure, a safety dependency, or a material coverage gain. If an at-cap `ok`
row ever withdraws a true fact, this note is the head start.
