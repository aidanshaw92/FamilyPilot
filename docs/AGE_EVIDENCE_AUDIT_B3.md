# P0-B3 — zero-write age-evidence audit

What the venue pages FamilyPilot has already fetched actually say about age, and whether the
P0-B2 venue-age-prohibition model can act on any of it.

**This audit writes nothing.** It creates no claim, approves no draft, touches no
`venue_family_metadata` row and publishes no age information. That is enforced by a test that fails
if either audit file so much as names a writer, not by a promise in this document.

Reproduce it:

```bash
# live, against the database (needs SUPABASE_URL + service-role key)
node scripts/audit-age-evidence.js

# offline, against a snapshot of the corpus
node scripts/audit-age-evidence.js --file <corpus> \
  --discovery pages=109,venues=59,unquotable=24,unquotableVenues=10
```

Snapshot behind the figures below: **2026-09-26**, corpus md5 `a6f968c842299e2bf8a24629ebbf0ad2`,
184 rows / 49 venues / 85 pages. `venue_source_evidence` is re-crawled continuously, so both the
checksum and the counts move; every number here was measured against that one snapshot, and the
checksum is what makes the snapshot verifiable rather than asserted.

## Verdict

**The B2 model fits what the evidence actually contains, because the evidence contains no venue-level
age prohibition at all.** Across 184 age-related statements from 49 venues, **zero** are a venue-level
age door. Nothing in the stored corpus would become a restriction under B2 even with a human
approval.

That is a finding about the model's *safety*, not proof of its usefulness. B2 is built to publish a
prohibition; the corpus offers none to publish. What the corpus does contain — accompaniment rules,
activity and session audiences, price bands, companion-role rules — B2 correctly declines to treat
as doors.

Two independent implementations agree on the headline. The classifier in this PR returns
`venue_restriction: 0`. A SQL scan over the whole clean corpus for any sentence combining
gate wording (`not admitted`, `only`, `strictly`, `minimum age`, `must be aged`, `no one … is
admitted`, …) with a parseable age set returns **4 sentences**, and none of them is an age door:

| Sentence | What it is |
| --- | --- |
| "Babylon Park is suitable for everyone - there is no minimum age." | a positive |
| "… there is no minimum age for access however the rollercoaster and drop tower have a minimum heigh…" | a positive, plus a height rule |
| "Children must be strictly under 50kg to ride." (KT City Farm) | a weight limit on one ride |
| "Children under 16 are not permitted to accompany a disabled visitor as an Essential Companion." (Woodside) | a companion-role rule |

## 1. What was examined

| | |
| --- | --- |
| venues in `venue_family_metadata` | 134 |
| venues with at least one cleanly fetched page | 96 |
| cleanly fetched pages | 427 |
| pages whose text mentions age at all | 109 |
| venues whose pages mention age at all | 59 |
| pages that yielded a quotable sentence | 85 |
| venues in the classified corpus | 49 |
| age-related statements classified | 174 |
| statements explicitly skipped, with a reason | 10 |
| statement occurrences in | 184 |

Candidate discovery is deliberately **broader** than classification. The front door matches any
`under/over/above/below N`, `aged N`, `N+`, `N or older`, `N years/months`, `under the age of N`,
`minimum/maximum age`, `N years of age`, plus every form of accompaniment and supervision wording
and the positive phrasings. Precision lives in `classifyAgeSentence`, not in the detector, because a
form the detector misses is invisible to a negative conclusion, while one it over-admits is merely
noise the classifier discards. The corpus consequently includes cookie tables (`_fbp 3 months`) and
marketing spans (`over 260 years of Wedgwood`); they classify as `not_an_age_statement`.

### The discovery ledger

Two ledgers, at two layers. The inner one balances the corpus: `184 occurrences = 174 classified + 10
explicitly skipped`. On its own that proves nothing — it balances against itself.

The outer one compares this module's page count against a discovery total measured by the SQL scan,
which is a different implementation:

| | pages | venues |
| --- | --- | --- |
| production says the text mentions age | 109 | 59 |
| yielded a quotable sentence (this audit's corpus) | 85 | 49 |
| age wording present, nothing quotable | 24 | 10 |
| **unexplained** | **0** | **0** |

`--discovery` feeds the expected totals in and the audit reports `unexplainedPages`. A page
production says mentions age that this audit never received surfaces there; it cannot be absorbed
into a derived figure.

**The 24 unquotable pages were checked directly, not waved past.** They are pages whose extracted
text carries age wording inside one long block with no sentence punctuation — up to 7,954 characters
— so no quotation can be cut from them. A SQL scan of those 24 pages for prohibition wording
(`not admitted`, `no entry`, `adults only`, `minimum age`, `must be aged N`, `no one … is admitted`)
returns **0**. The closest wording any of them carries is
`Guests under the age of 5 require a paying adult to accompany them on our equipment` (Flip Out
Brent Cross, an accompaniment rule) and `Strictly for ages 5 & under` (Flip Out Watford, describing
one priced session). The negative conclusion does not rest on unexamined pages.

## 2. Evidence coverage — and what this audit cannot tell you

This audit establishes what the **currently stored evidence** says. It cannot distinguish a venue
whose website is genuinely silent about age from a venue whose age page was never discovered or
fetched.

| Venue coverage | count | share of 134 |
| --- | --- | --- |
| age signal found and classified | 49 | 36.6% |
| clean page fetched, no age wording in it | 47 | 35.1% |
| no cleanly fetched page at all | 38 | 28.4% |

Source discovery samples a small number of homepage / family / FAQ / visitor-info / accessibility
candidates per venue. It does not exhaustively crawl ticket, admission or activity pages, which is
where an age rule most often lives. So:

> The currently stored evidence does not contain age wording for roughly two thirds of venues. B3
> cannot distinguish true site silence from source-discovery and fetch coverage gaps without targeted
> age-source discovery.

That is a data-coverage finding and it feeds directly into P0 Venue Intelligence Completeness. It is
**not** evidence that London venues do not restrict by age.

## 3. What the pages actually say

174 classified statements, 49 venues:

| category | statements | share | venues | what it means |
| --- | --- | --- | --- | --- |
| `marketing_all_ages` | 30 | 17.2% | 11 | "fun for all ages" as copy, not an admission position |
| `not_an_age_statement` | 29 | 16.7% | 18 | a number with a non-age unit, or site furniture |
| `insufficient_evidence` | 28 | 16.1% | 22 | age wording with no bound this model can read |
| `pricing_not_admission` | 18 | 10.3% | 11 | free/discounted under N, which is not a door |
| `mixed_statement` | 13 | 7.5% | 9 | two facts in one sentence |
| `ambiguous_scope` | 12 | 6.9% | 9 | a real bound, but venue or activity is unclear |
| `administrative_not_admission` | 11 | 6.3% | 8 | DLA/PIP eligibility, membership tiers, waivers |
| `activity_restriction` | 10 | 5.7% | 6 | a session or ride audience, not the venue |
| `accompaniment` | 8 | 4.6% | 6 | under-Ns need an adult, which is a caveat |
| `companion_role_not_admission` | 5 | 2.9% | 4 | who may act as a carer, not who may enter |
| `height_not_age` | 4 | 2.3% | 3 | 1.2m, 50kg |
| `positive_all_ages` | 2 | 1.1% | 2 | an explicit positive admission position |
| `temporary_restriction` | 2 | 1.1% | 1 | a dated event's age guide |
| `recommendation` | 1 | 0.6% | 1 | "recommended for ages 3-11" |
| `qualified_positive` | 1 | 0.6% | 1 | "all ages 4+", which contradicts itself |
| **`venue_restriction`** | **0** | **0.0%** | **0** | **a venue-level age door** |

By source type (pages / statements): `visitor_info` 49/95, `official_website` 21/55,
`family_page` 7/16, `accessibility_page` 7/7, `faq_page` 1/1.

## 4. The finding that decides B4

**B2 is safe to keep and premature to publish from.**

- 0 of 174 statements are a venue-level prohibition.
- 0 are eligible to gate even if a human approved them (`eligibleToGateIfHumanApproved`).
- So B4 would publish nothing from the current corpus.

The two gate questions are kept apart, because conflating them produced a metric that could not
fail:

- `wouldGateNow` — always 0 in B3, by definition: no claim, no approval, no write.
- `eligibleToGateIfHumanApproved` — does this candidate pass every *non-human* B2 gate? Measured by
  building a synthetic in-memory claim (real source URL and type, synthetic evidence id,
  `confidence: high`, the real derived field key, a valid lifetime, `human:b3-audit`) and running the
  **real** `claimMayGate()` and `normaliseAgeRules()`. Nothing is written.

A genuine door is pinned in the tests: `Under 4s are not admitted.` from an official page returns
`eligibleToGateIfHumanApproved: true`. The metric can therefore be positive, and is 0 here because
the corpus is empty of doors, not because the code says so.

## 5. The accompaniment conclusion, stated narrowly

Eight accompaniment statements across six venues (Woodside "all visitors under 16 must be
accompanied", Paradox "under the age of 14", RAF Museum "under 11", KT City Farm "under 8 years
old", SEA LIFE "15 and under … by an adult aged 18 years or over", Flip Out "aged 5-12 … someone
supervising them").

None of these is a venue-level prohibition: a FamilyPilot family arrives with an adult, so none of
them turns a family away. That is the only claim made here. Party composition, adult-to-child ratios
and minimum carer ages (SEA LIFE's "18 years or over", Madame Tussauds' "carer must be 14+") can
still affect feasibility for a specific family, and this audit does not model that.

## 6. Extraction and classification defects this audit found in itself

Each was found by running against the real corpus or by mutating the code, not by reading it. Each
has a regression.

| Defect | What it produced | Fix |
| --- | --- | --- |
| `wouldGateUnderB2` never called `claimMayGate` | the headline metric was 0 for every possible corpus | split into `wouldGateNow` / `eligibleToGateIfHumanApproved`, both from the real gate |
| polarity ignored | "over 12s are not admitted" became a MINIMUM of 144, admitting exactly the excluded ages | two-stage parse: read the mentioned age set, then transform by polarity |
| fail-open resolved upwards on both sides | "Only over 12s are admitted" became 13+, hiding every 12-year-old's family | the safe direction flips with polarity; an admitted set resolves to the SMALLER minimum |
| `positive_all_ages` matched before qualifiers | "suitable for all ages 4+" became an unconditional all-ages assertion | `qualified_positive`; the all-ages count fell from 16/13 venues to 2/2 |
| non-age units read as ages | "over 25 rides" → age 25, "50+ exhibits" → 50, "over 260 years" → 260 | a unit list, plus a 21-year ceiling on any admission bound |
| blanket `N years` stripping | erased real bounds: "aged 18 months to 5 years", "aged 18 years or over", "children under 4 years" | strip only `N years of <not age>` and `for/valid N years` |
| month units read as years | "over 18 months" → eighteen years, a fifteen-fold error that hides families | month-unit rules read before the year rules |
| no generic `aged N` / supervision form | Flip Out's "Children aged 5--12 must have someone … supervising them" was classified `insufficient_evidence` | `supervis(e\|es\|ed\|ing\|ion\|ory)`, and a broader front door |
| no bound form without a directional word | "the minimum age is 5", "must be aged 8" parsed to nothing | `minimum/maximum age is N`, `must be (aged\|at least) N`, `N years and over` |
| prohibition written as a negated admission | "No one under the age of 14 is admitted" fell to `ambiguous_scope` | `NO_ONE_ADMITTED`, in both the excludes and restriction patterns |
| source-type counts changed meaning with input mode | "pages by source type" live, "statements by source type" offline | separate `pageSourceTypeCounts` / `candidateSourceTypeCounts`, counted by page identity |
| the ledger balanced only against itself | a page production found and the audit never saw would vanish | `--discovery` reconciles against an independently measured total |

Nine mutations were applied to the guards above; all nine were killed by the suite.

## 7. Model gaps found

16 statements (9.2%) expose something B2 cannot represent. None is a reason to change B2 now.

1. **Sentence-level evidence cannot attribute one interval to the right fact when a sentence states
   two** (13). "children under the age of 2* go free but the recommended age of the attraction is
   children aged 6 and over" carries a price bound and a recommendation. B2's field key is derived
   per source URL, so both would land on one key. Handled by classifying as `mixed_statement` and
   failing open.
2. **B2 cannot represent an explicit positive** (2). An empty rule set means "no evidence", not "no
   restriction", so "Children of all ages are welcome" cannot be published as a positive fact.
   **The earlier recommendation to add an `all_ages` fact is withdrawn**: only 2 statements across 2
   venues (Babylon Park, Paradox Museum) state a positive admission position. That is not enough
   evidence to extend the model.
3. **Positive wording contradicted by its own bound** (1). "suitable for all ages 4+" is neither an
   all-ages fact nor a door. Failing open is right.

An excluded *band* ("ages 5 to 10 are not admitted") would admit two disjoint ranges, which B2
cannot express; it fails open. No such sentence exists in the corpus.

## 8. The decision

- **Keep B2 as shipped.** It is correct on this evidence and publishes nothing wrong.
- **Do not start B4 on this corpus.** There is nothing to publish.
- **B4 needs age-source discovery first.** Two thirds of venues have no stored age wording, and that
  is a coverage gap, not silence. This is P0 Venue Intelligence Completeness.
- **Do not extend B2 with an `all_ages` fact yet.** 2 statements is not a mandate.
- Separately, and not in this PR: Supabase's security advisor reports `function_search_path_mutable`
  for `venue_age_bounds_are_valid` and `venue_age_policy_is_valid`. Fix that in its own small
  migration **before** B4 is allowed to write age policy.

## 9. Where this lives

| File | Role |
| --- | --- |
| `server/enrichment/_lib/age-evidence-audit.js` | the classifier, the two-stage age parser, the ledger |
| `scripts/audit-age-evidence.js` | the CLI, live or `--file`, with `--discovery` reconciliation |
| `familypilot/src/__tests__/age-evidence-audit.test.ts` | 79 tests, including the structural zero-write assertion |
| `docs/AGE_POLICY.md` | the P0-B2 model this audit measures |
