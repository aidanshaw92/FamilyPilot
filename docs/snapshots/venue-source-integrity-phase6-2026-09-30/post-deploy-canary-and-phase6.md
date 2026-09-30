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

## Phase 6 repair audit, from live rows

Every **active** claim with a `source_url`, classified by its backing evidence row's `subject_scope`:

| category | scope | claims | venues |
| --- | --- | --- | --- |
| **B — eligible** | `venue_own_subtree` | 45 | 12 |
| **B — eligible** | `venue_named_page` | 1 | 1 |
| **A — ineligible** | `sibling_unverified` | 6 | 5 |
| **A — ineligible** | `organisation_ancestor` | 2 | 1 |
| **A — ineligible** | `other_catalogue_venue` | **1** | 1 |
| **D — no provenance** | NULL, not yet re-crawled | 167 | 51 |

### The repair set has collapsed from 16 to 9, and only 1 is a proven cross-venue error

| id | venue | field | value | source | scope |
| --- | --- | --- | --- | --- | --- |
| `2d142209…` | Primrose Hill | playground | yes | royalparks.org.uk `/visit/parks/regents-park-primrose-hill/primrose-hill` | **other_catalogue_venue** |
| `1001dc22…` | Hatfield Park | freeParking | yes | hatfield-house.co.uk `/your-visit/` | organisation_ancestor |
| `861006ab…` | Hatfield Park | parking | yes | hatfield-house.co.uk `/your-visit/` | organisation_ancestor |
| `7dd9ee7c…` | Hatfield Park | accessibleToilet | yes | `/your-visit/faqs/` | sibling_unverified |
| `877e4a7e…` | Hatfield Park | wheelchairAccessible | yes | `/your-visit/faqs/` | sibling_unverified |
| `adb1b85d…` | Heartwood Forest | toilets | yes | woodlandtrust.org.uk `/visiting-woods/woods/heartwood-forest/` | sibling_unverified |
| `41d3e07e…` | Stanborough Park Water Sports Centre | environment | outdoor | better.org.uk `/venue-hire` | sibling_unverified |
| `d249d9ac…` | Stockwood Park | freeParking | **no** | luton.gov.uk `/parking-streets-transport` | sibling_unverified |
| `ab9967e4…` | Young V&A | toilets | yes | vam.ac.uk `/wedgwood/visit` | sibling_unverified |

The original proposal was 16 category-A claims plus 6 known-wrong facts. **Horniman Butterfly House's
seven, and the V&A / Young V&A cross-venue claims, are no longer in the set** — they were either
re-sourced from the venue's own pages by ordinary re-crawling, or their backing rows have not yet been
re-read and so now read as D.

## Recommendation: do not run a bulk repair

The evidence now argues against one.

1. **Re-crawling heals contamination by itself** where the venue's own page carries the fact. Young V&A
   demonstrated three claims healed in a single 51-second run, with no repair and no risk.
2. **167 of 222 active claims (75%) have no provenance yet.** Their venues have not been re-crawled
   under the new code. Disputing on D would be exactly the bulk invalidation-from-unestablished that
   was ruled out from the start.
3. **The truly proven error is one claim.** Only `2d142209…` (Primrose Hill) rests on a page positively
   owned by another catalogue venue.

Proposed instead, for approval: let the natural refresh cycle re-crawl the catalogue under the new
code, re-run this audit afterwards, and consider disputes only for claims that **remain** ineligible
once their own venue has been re-read. That is fewer writes, no guessing, and it uses the mechanism
that has already proven it works.

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
