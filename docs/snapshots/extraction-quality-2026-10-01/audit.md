# Page content extraction: CSS, JSON and script residue

2026-10-01. The fenced-off `extractPageContent` / `extractRelevantParagraphs` workstream. Scope is the
three contamination classes the cohort corpus identified, and nothing else.

## What was wrong

`extractRegion` built the main/article/footer text with `stripTags`, which removes tags but keeps the
**text between them**. A `<style>` or `<script>` inside `<main>` therefore contributed its entire
stylesheet or payload as page content. `stripHtml` already dropped those elements, but only for the
whole-body fallback, so the named-region path carried everything straight through.

Measured across all 688 fetched evidence rows:

| Class | Rows | Share |
| --- | --- | --- |
| CSS declarations or custom properties | 54 | 7.8% |
| JSON-LD or escaped JSON | 80 | 11.6% |
| Inline JavaScript | 103 | 15.0% |
| **Any of the three** | **197** | **28.6%** |
| Clean, non-empty | 473 | 68.8% |
| Sitting at the full 8000-character cap | 78 | 11.3% |

Contaminated rows average 5,658 characters against 3,798 for clean ones. Every one of the worst rows
is at the cap, so this is not cosmetic: real prose was being crowded out of the budget before the
field extractors ever saw it. Belmont Children's Farm's stored text opens with
`.fe-65b40341bcdc4b1fc633a8a6 { --grid-gutter: calc(var(--sqs-mobile-site-gutter, 6vw) - 0.0px); ...`
and runs the full 8,000 characters.

A second, independent defect: `extractPageContent` concatenated `main`, `article`, `footer` **and** a
whole-body fallback, so anything inside `<main>` was paid for at least twice. Golders Hill Park's
stored text is its own breadcrumb repeated to the cap.

### Served claims affected

Three live claims cite visibly contaminated evidence:

| Venue | Claim | Excerpt it cites |
| --- | --- | --- |
| Belmont Children's Farm | `environment = mixed` | `ment-wrapper } Indoor & Outdoor Visitors Farm { --stroke-style` |
| Gladstone Park | `playground = yes` | `... Report a problem in this park window ('DOMContentLoaded', (e) => { const map = L ('map', {` |
| Nando's | `environment = outdoor` | `:"LocationFeatureSpecification","name":"Outdoor seating","value":true}` |

Belmont's and Gladstone's values are right and their provenance is junk. Nando's is a false fact.

## What changed

Three narrow changes in `html-text-extractor.js`.

1. **`removeNonContentElements`** strips `<script>`, `<style>`, `<noscript>`, `<template>`, `<svg>` and
   HTML comments once, up front, so every downstream path sees the same cleaned HTML. For `script` and
   `style` only, an unclosed element is consumed to end of input, which is both what the HTML parsing
   spec says and what a truncated page (`fetch_status = fetched_truncated`) actually delivers. `svg`
   deliberately does not get that rule: it is not a raw-text element, so an unclosed `<svg>` must not
   swallow the document. The title is read from the **original** HTML, because `<title>` sits in
   `<head>` beside the removed elements and an unclosed `<style>` earlier in head would take it.
2. **The fallback is now a partition, not an overlap.** `bodyFallback` covers only what the named
   regions did not, so the union of text is identical and the duplication is gone. Dropping a region
   instead would have risked losing a page whose `<main>` is a thin shell.
3. **`stripCodeResidue` + `looksLikeCodeOrMarkup`**, a second line of defence for residue that reaches
   the text by other routes. Residue is **excised** and the surrounding prose kept; a chunk is only
   discarded when nothing usable survives. Chunk-level dedupe handles a site's own repetition, which
   still removes 3,449 duplicate chunks across 490 of 670 rows after the partition fix.

Deliberately **not** changed: `CONTENT_KEYWORDS` matches as substrings, so `'access'` scores
"accessories" and `'send'` scores anything containing it, which inflates chrome scores. Real, but
rescoring changes chunk selection on every page — a far wider blast radius than the proven defect. Now
that the budget is no longer exhausted by junk, crowding-out should largely disappear on its own; if it
does not, that is its own workstream with its own replay.

## What the self-review rejected

Five designs were tried and thrown out. Each was caught by replaying against production text, not by
reasoning.

**Whole-chunk rejection lost correct facts and flipped values.** The first guard discarded any chunk
containing residue. Replayed over 670 stored texts it lost five correct facts and flipped two values,
because sites glue residue onto real sentences: `.cls-1{fill:#fff;}` onto Horniman's navigation,
`.st0{fill-rule:evenodd;...}` onto the chunk carrying **Sydenham Hill Wood's own Access statement**.
Dropping that chunk removed the evidence saying `wheelchairAccessible = yes`, and a sentence about the
nearby railway station — "The station is not wheelchair accessible" — won instead. A guard that turns a
correct yes into a confident no is worse than the contamination it removes. Replaced by excision.

**A punctuation-density heuristic threw away plain English.** Rejecting chunks whose ratio of
`{}();=<>` passed a threshold discarded "From Waterloo Station (5-minute walk): Exit the station via
Exit 6 (York Road) or follow signs for Leake Street.", "2) Accessibility Regulations 2018 (the
'accessibility regulations').", and "Visit our passholder pre-book page to book your visit(s) here."
Travel directions and numbered lists are full of brackets. A punctuation count cannot prove that text
is code, so it is gone; every remaining rule proves the thing it tests.

**A generic `word: value;` rule ate a facilities list.** It removed Mayow Park's "Facilities include:
play area cafe outdoor gym nature reserve" and with it a correct playground fact. Narrowed to real CSS
property names.

**"Scripts trail content" was false.** The JS rule cut from the marker to the end of the chunk, which
is right for Gladstone Park's truncated tail but wrong for a WordPress theme that emits
`UNCODE.initRow(document.getElementById("row-unique-4")); From an annual dog show to family-friendly
Open Days ...` — code first, prose after. Now bounded call expressions are removed first, and only
then does the unbalanced-remainder rule apply.

**The zero-score fallback bypassed the whole fix.** When no chunk matched a content keyword,
`extractRelevantParagraphs` returned `text.slice(0, maxChars)` — the raw contaminated input. A JSON-LD
payload sailed straight through on any page with no keyword hit. Found by one of the new tests, not by
inspection. It now returns the cleaned chunks, and nothing when none survive, which
`isEvidenceBearingSource` correctly reads as a page carrying no evidence.

Three of my own tests were also rejected and rewritten, each because it passed for the wrong reason:

- the title test used a **closed** `<style>`, so the title survived either way and a mutant that read
  the title from the cleaned copy passed it;
- a control row yielded **no facts at all** (Flip Out Brent Cross's fact lives in the page title, which
  stored text does not contain), so it proved nothing and was replaced;
- the control check only compared before against after, so replacing a control's text with filler
  produced no facts on either side, "moved" nothing, and passed. Each control's expected fact is now
  pinned.

## Evidence

- **1,272 tests across 67 files**, `tsc --noEmit` clean. 30 tests are new, every residue string taken
  from stored production text.
- **19 mutants, 19 killed, no survivors.** Four survived the first round — the title source, the
  dedupe, the JSON-key strip and the escaped-unicode strip — and all four were genuine test gaps, not
  redundant code: the dedupe alone still removes 3,449 chunks, and without the escaped-unicode strip a
  real sentence is rejected wholesale.
- **Full-corpus replay, 670 stored texts, 10,815 chunks:** **0 facts lost**, 2 changed, 2 gained. 29.0%
  of corpus characters removed as contamination. Only **17 chunks of 10,815 (0.16%)** are discarded
  entirely, and every one is a JSON-LD payload or an escaped-HTML blob.
- **Pinned replay, reproducible from the repo:** `node scripts/audit-extraction-replay.mjs` over 14
  pinned rows — one per contamination class, the four whose facts move, and four controls. Exits
  non-zero on any lost fact, any unexpected change or gain, a moved control, a control that no longer
  yields its pinned fact, a duplicate id, or a row count other than 14. Each of those was verified by
  deliberately violating it.

### The four facts that move, reviewed individually

| Row | Change | Verdict |
| --- | --- | --- |
| Swanley Park, two rows | gain `freeParking = no` | **Correct.** The page is titled "Parking Charges at Swanley Park"; charges mean parking is not free. |
| Sydenham Hill Wood | `wheelchairAccessible` yes → no | **Neither value is safe**, and no served claim changes. |
| Saatchi Gallery | `parking` yes → no | **Neither value is safe**, and no served claim changes. |

The two flips are not caused by losing evidence: both pages contain both readings before and after.
Sydenham's own page says its entrances "are wheelchair accessible", that "Gates prohibit access by
wheelchair users", and that "The station is not wheelchair accessible". Deduplication changed which
copy wins a tie on text that genuinely contradicts itself about three different subjects — the wood's
entrances, its gates, and a railway station. Saatchi is the same shape: an off-site car park against
street parking restrictions.

**Neither reaches a parent.** Sydenham Hill Wood serves no `wheelchairAccessible` claim, and Saatchi
Gallery and Swanley Park serve no claims at all in these fields. So the served-claim blast radius of
both flips is zero. What they expose is a pre-existing weakness — a page that contradicts itself should
produce a conflict and be withheld, rather than a confident value decided by ordering — which is a
separate change with its own wide blast radius.

## Limitation

The replay fixture holds extracted **text**, not original HTML, because raw HTML is not retained. So it
exercises the chunk cleaning, residue stripping and dedupe, but not `removeNonContentElements`, which
needs HTML and is covered by unit tests instead. Element removal only ever deletes contamination, so
real post-deploy text is at least as clean as the replay assumes. The production check after the
targeted re-crawl is what confirms it.

## Fenced off, not decided

**Nando's `environment = outdoor` is not repaired by this change, and it would have been wrong to
claim otherwise.** The fix closes the JSON-LD route, but the same claim also comes from the page's
*rendered* amenity list — "At this restaurant Baby changing Wheelchair access **Outdoor space** Wi-fi
Delivery Collection" — which is legitimate page text and is correctly kept. Whether "Outdoor space" on
a restaurant means the venue *is* outdoors, or merely that it has a patio, is a question about what the
`environment` field promises a parent. That is the same shape as Babylon Park's playground / soft-play
question, and it is an owner decision, not an engineering one.

Still open from earlier work, untouched here: Hatfield Park and Sydenham Hill Wood's area-scoped
`freeParking = yes`, Nando's conditional `freeParking = yes`, and Babylon Park's `playground = yes`.

## Production repair, 02:48 to 02:51 UTC

Merge `c4ddc07`, deployment `dpl_3pYkqiXq39UYhfKHnjgqJNmeNKAM` confirmed READY on that commit before
the queue was touched. Three venues re-crawled through the normal pipeline; no claim edited by hand.

### Scope, and why it is three rather than thirty-four

47 venues carry contaminated rows and 34 of those serve 111 claims. Re-crawling all 34 would put 111
served claims in motion, and the pre-merge replay could not predict served-claim outcomes: it works on
stored text, so it exercises the chunk cleaning but not `removeNonContentElements`, which needs HTML
that is not retained. So the repair took the three venues with **demonstrated junk provenance** —
Belmont (CSS), Gladstone Park (inline JS), Nando's (JSON-LD) — and the wider rollout becomes a separate
step decided from real post-fix evidence. Same frozen-cohort-then-roll-outward pattern as the coverage
workstream.

### Result

All three jobs completed on one attempt, no errors.

| Venue | Field | Before | After | Provenance |
| --- | --- | --- | --- | --- |
| Belmont Children's Farm | `environment` | mixed/high, excerpt was `ment-wrapper } Indoor & Outdoor Visitors Farm { --stroke-style` | **mixed/high**, excerpt `Indoor & Outdoor Visitors Farm Soft Play Café The Farm ...` | **repaired** |
| Belmont Children's Farm | `familyFacilities.playground` | not served | **yes/high** (new) | clean, but see below |
| Gladstone Park | `environment` | outdoor/high, JS in the row | **outdoor/high** | **repaired** |
| Gladstone Park | `familyFacilities.playground` | yes/high, JS in the row | **yes/high** | **repaired** |
| Nando's | `environment` | outdoor/high from JSON-LD | **outdoor/high** from the rendered amenity list | route closed, claim persists |
| Nando's | `babyChanging`, `freeParking`, `parking` | yes/high | **yes/high** | unchanged |

**Zero served claims now carry junk provenance**, down from three.

Of the 12 rows refreshed across the three venues, **0 are still contaminated**. Average stored length
fell from 4,246 characters to 2,524, a 41% reduction, with inline JS eliminated. Same URL, re-crawled:
Gladstone's `brent.gov.uk/parks-leisure-and-healthy-l...` went 4,787 → 1,647 characters and from
`has_js = true` to false.

24 rows at these venues were **not** refreshed and 8 of those are still contaminated. They are URLs the
current candidate ordering no longer visits, so they clear only if the crawl returns to them. They back
no served claim.

### Blast radius

| Check | Value |
| --- | --- |
| Claims touched outside the three venues | **0** |
| Evidence rows touched outside the three | **0** |
| Jobs run outside the three | **0** |
| `last_refresh` | `2026-10-01`, unchanged by this operation |
| Queue | drained to 0 |

Claim counts reconcile from an independent arithmetic check:

```
  242 served before
+   8 new active (7 recreations + 1 genuinely new)
-   7 superseded
-   0 disputed          <- nothing was withdrawn
= 243 predicted   ... 243 actual
```

### What the repair surfaced, fenced rather than decided

**Belmont's new `playground = yes` comes from soft play**: "...review our Rules & Regulations before
visiting our Soft Play area". The crowding-out fix worked exactly as intended — real prose now fits in
the budget where Squarespace CSS used to sit — but the fact it surfaced is a **new instance of the open
Babylon Park question**, whether `familyFacilities.playground` covers soft play. It is a coverage gain
only if the answer is yes. Recorded, not decided.

**Nando's `parking` and `freeParking` both rest on "Nearby"**: the refreshed excerpt reads "Sunday 12pm
- 10pm Nearby If you're driving, there's free parking a[t]...". That is parking *near* the restaurant,
not at it, which belongs to the subject-scope question already open on Hatfield Park and Sydenham Hill
Wood rather than to this workstream.

Both are owner decisions about what a field promises a parent. Neither was touched.
