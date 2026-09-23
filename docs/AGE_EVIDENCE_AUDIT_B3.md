# P0-B3 — zero-write age-evidence audit

**Run:** 23 September 2026, against the live London catalogue, over the **complete** candidate
corpus. **Nothing was written.** No claim created, no metadata altered, no draft approved, no age
information published.

Reproduce with:

```bash
node scripts/audit-age-evidence.js              # live, needs SUPABASE_URL + service-role key
node scripts/audit-age-evidence.js --file <tsv> # offline
```

---

## Verdict

**The B2 semantics hold. The stored evidence contains nothing B2 could act on. B4 must not publish
age policy automatically.**

Three findings carry that, in order of weight:

1. **No venue-level age prohibition exists** in the catalogue's stored evidence. Nothing is
   eligible to gate, even with a human approval.
2. **The extractor, not the model, is the danger.** Before a guard was added, one sentence about
   carer eligibility was eligible to become a door the moment anyone approved it.
3. **The evidence is thin, and B3 cannot tell thin from silent.** 29.1% of venues have no usable
   page text at all.

## 1. What was examined

Measured against production (read-only SQL):

| | Count | Share of catalogue |
|---|---|---|
| Venues in the catalogue | 134 | — |
| Venues with any stored evidence | 128 | 95.5% |
| Evidence rows stored | 738 | — |
| Rows that fetched cleanly | 458 | 62.1% |
| Rows carrying extracted text | 453 | 61.4% |

Classifier input, the complete candidate set (88 rows, 35 venues — verified equal to the SQL count,
not a sample):

| | Count |
|---|---|
| Pages examined | 49 |
| Sentence occurrences | 88 |
| Unique sentence text | 74 |
| **Classified** | **84** |
| **Explicitly skipped** | **4** |
| Ledger balances (`input = classified + skipped`) | **yes** |

Occurrences exceed unique text because several sentences appear at more than one venue — the
Wedgwood, Horniman, Warner Bros. and DLA-eligibility texts each appear two or three times. Venues
are counted by identity, so a repeated sentence never inflates a venue count.

## 2. Evidence coverage — and what this audit cannot tell you

Per venue, across the whole catalogue:

| Coverage band | Venues | Share |
|---|---|---|
| No evidence row at all | 6 | 4.5% |
| Evidence exists but no clean text | 33 | 24.6% |
| Clean text but no age wording | 45 | 33.6% |
| Age wording found | 50 | 37.3% |

**The currently stored evidence contains no age wording for roughly two thirds of venues. B3 cannot
distinguish true site silence from source-discovery and fetch coverage gaps.** Nearly a third of
venues (29.1%) have no usable text at all, and source discovery deliberately samples a handful of
homepage / family / FAQ / visitor / accessibility candidates rather than crawling every ticket,
admission or activity page — which is exactly where age rules tend to live.

This is a data-coverage finding, and it belongs to the upcoming P0 Venue Intelligence Completeness
programme. B3 did not crawl anything to close it.

## 3. What the pages actually say

84 classified statements across 35 venues:

| Category | Statements | Share | Venues |
|---|---|---|---|
| `marketing_all_ages` | 17 | 20.2% | 11 |
| `not_an_age_statement` | 11 | 13.1% | 9 |
| `mixed_statement` | 10 | 11.9% | 7 |
| `administrative_not_admission` | 8 | 9.5% | 5 |
| `insufficient_evidence` | 8 | 9.5% | 7 |
| `pricing_not_admission` | 8 | 9.5% | 7 |
| `accompaniment` | 7 | 8.3% | 5 |
| `height_not_age` | 4 | 4.8% | 3 |
| `companion_role_not_admission` | 4 | 4.8% | 4 |
| `activity_restriction` | 2 | 2.4% | 2 |
| `positive_all_ages` | 2 | 2.4% | 2 |
| `ambiguous_scope` | 2 | 2.4% | 2 |
| `qualified_positive` | 1 | 1.2% | 1 |
| **`venue_restriction`** | **0** | **0.0%** | **0** |

Source types, pages / statements: `visitor_info` 25/44 · `official_website` 14/29 ·
`accessibility_page` 6/6 · `family_page` 3/4 · `faq_page` 1/1.

Against the shipped B2 semantics:

| | Count |
|---|---|
| Would gate **now** | 0 — and always 0, because B3 writes nothing |
| **Eligible to gate if a human approved it** | **0** |
| Would need human review | 0 |
| Expose a model gap | 13 (15.5%) |

Those first two rows are different questions. "Would gate now" is trivially zero for any corpus; the
one worth asking is whether a person clicking approve tomorrow would produce a door. It is answered
by building a synthetic claim in memory — nothing stored — and running the **real** `claimMayGate`
and `normaliseAgeRules`, so it cannot drift from the shipped code.

**No sentence in the catalogue is eligible to become a door.** The B2 gate is correct and idle.

## 4. The finding that decides B4

The first run of this audit found exactly one candidate venue restriction:

> **"Children under 16 are not permitted to accompany a disabled visitor as an Essential
> Companion."** — Woodside Animal Farm, `visitor_info`

That is about who may act as a **carer**. It says nothing about admission. A naive reader sees
"under 16" and "not permitted" and produces a door at 192 months.

Published, Woodside Animal Farm would have been hidden from **every family with a child under
sixteen** — very nearly every family this product serves — and nobody would have known why.

It was **eligible to gate**: official-type source, long excerpt, readable interval, and
`claimMayGate` satisfied. One human click stood between it and production.

Two things follow:

1. **The B2 model was not wrong. The extractor was.** Every B2 semantic behaved correctly.
2. **A single barrier is too thin.** Human approval was the only thing in the way.

The classifier now has a `companion_role_not_admission` guard and a named regression. But it was
written *after* seeing the failure — which is the point. The next corpus holds a sentence nobody has
thought of yet.

## 5. Extraction defects this audit found in itself

Running against real pages, rather than crafted examples, is what surfaced these. All are fixed and
pinned by tests.

| Defect | Real wording | Was | Now |
|---|---|---|---|
| **Inverted door** | "Children aged 12 and over are not admitted" | `min = 144` — admitted exactly the excluded ages | `max = 144` |
| Carer rule read as admission | "under 16 … not permitted to accompany" | venue restriction | companion role |
| Counted things read as ages | "over 25 rides", "50+ exhibits", "over 100 animals" | ages 25 / 50 / 100 | not an age |
| Duration read as age | "over 260 years of Wedgwood" | age 260 | not an age |
| Qualified positive | "suitable for all ages 4+" | unconditional all-ages | qualified, fails open |
| Height and weight | "under 1.2m", "under 50kg" | ages | not ages |

The inversion is the serious one. A lexical parser cannot produce an admission interval before the
sentence's polarity is known, so it no longer tries: stage one reads the age set a sentence
*mentions*, stage two turns it into an *admitted* interval only once the sentence is known to
exclude, to admit, or merely to describe. Where English is ambiguous ("over 12s" may mean 12+ or
13+), the bound that admits **more** children is chosen — a wrong guess should show a venue that
turns a family away, never hide one that would have let them in.

## 6. Adversarial checks, against real wording

| Challenge | Real example | Classified |
|---|---|---|
| Recommendation vs restriction | "the recommended age of the attraction is children aged 6 and over" | recommendation |
| Accompaniment | "Children aged under 8 years old must be accompanied by an adult" | accompaniment |
| Accompaniment framed as entry | "Children under 16 must be accompanied by an adult **to be permitted entry**" | accompaniment |
| Activity-only limit | "dedicated sessions … for children aged 5 and under" | activity |
| Ticket pricing | "Children under 4 years old can enter the museum for free" | pricing |
| Benefit eligibility | "Disability Living Allowance for children under 16 … aged 16-64" | administrative |
| Membership tiers | "Family membership, for two adults and two children under 18" | administrative |
| Carer role | "The carer must be 14+ years old" | companion role |
| Height / weight | "under 1.2m", "strictly under 50kg to ride" | not an age |
| Months | "Babies under 6 months are not admitted" | months preserved |
| Two facts in one sentence | "children under 2 go free **but** the recommended age … is 6 and over" | mixed, flagged |
| Positive statement | "there is no minimum age for access" | positive |
| Qualified positive | "suitable for all ages 4+" | qualified, not all-ages |

**Accompaniment is the most common genuine age rule** — 7 statements across 5 venues — and some of
it is phrased as an entry condition. B2 treats it as a caveat that never excludes. On this evidence
that is right: **none of the seven is a venue-level prohibition**, and an accompanying adult is
present by construction on a family day out.

Stated narrowly on purpose: this says these seven rules are not doors. It does not say accompaniment
can never affect feasibility. Adult-to-child ratios ("maximum 4 children per adult"), minimum adult
ages ("an adult aged 18 years or over") and party composition are all present in the corpus and
could matter to a real plan later.

## 7. Model gaps found

| Gap | Frequency | Recommendation |
|---|---|---|
| One sentence carrying two age facts | 10 statements, 7 venues | Keep flagging; never attribute a bound to the wrong fact |
| No way to state "all ages welcome" positively | **2 statements, 2 venues** | **Not yet justified. Re-measure after coverage improves.** |
| Positive wording contradicted by its own bound | 1 statement | Keep failing open |

**A correction to the previous revision of this report.** It claimed positive all-ages statements
were the single largest category — 16 statements across 13 venues, 21.3% — and recommended a
first-class `all_ages` fact on that basis. That figure was an artefact of an over-eager classifier
that matched "all ages" anywhere, including marketing copy like "fun for all ages" and "over 260
years of Wedgwood to life for all ages". With admission wording separated from marketing copy, the
real figure is **2 statements across 2 venues (2.4%)**:

- "Age requirement: Babylon Park is perfect for adults and children of all ages — **there is no
  minimum age for access**"
- "Children of all ages are welcome at Paradox Museum London."

Two venues is not a basis for extending the canonical model. **The recommendation is withdrawn**:
do not add an `all_ages` fact for B4. Keep classifying and counting it, and revisit once evidence
coverage improves — at which point this audit re-run gives the number directly.

## 8. The decision

**Does the B2 model fit the real London evidence well enough to publish safely?**

**The semantics: yes.** Every ruling was tested against real wording and held. Recommendation stays
advice, activity rules stay caveats, accompaniment stays a caveat, months survive, and fail-open
held everywhere — including on the one sentence that would have done real damage.

**Automated publication: no.** Because:

- there is **nothing to publish** — zero venue restrictions, zero eligible candidates;
- the only candidate ever produced was **catastrophically wrong**, and one human click was the only
  thing stopping it;
- the corpus is **too thin to conclude from** — 29.1% of venues have no usable text.

**Recommended B4 shape:** human-reviewed publication only, with this audit's classification serving
as a queue for a person rather than an input to a writer. Automated publication should stay
unavailable until a corpus exists that actually contains venue-level doors, and until more than one
barrier stands between an extractor and a gate.

**Before B4 writes anything**, close the `function_search_path_mutable` advisory on
`venue_age_bounds_are_valid` and `venue_age_policy_is_valid` in a small separate migration.

## 9. Where this lives

| Concern | File |
|---|---|
| Classifier and audit | `server/enrichment/_lib/age-evidence-audit.js` |
| CLI | `scripts/audit-age-evidence.js` |
| Tests, incl. the Woodside and polarity regressions | `familypilot/src/__tests__/age-evidence-audit.test.ts` |
| The B2 model this audits | `docs/AGE_POLICY.md` |
