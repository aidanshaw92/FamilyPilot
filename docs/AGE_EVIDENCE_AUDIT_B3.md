# P0-B3 — zero-write age-evidence audit

**Run:** 21 September 2026, against the live London catalogue. **Nothing was written.** No claim was
created, no metadata altered, no draft approved, no age information published.

**Verdict: the B2 model fits the evidence, but the evidence does not yet contain what B2 was built
to act on. B4 must not publish age policy automatically.** The reasoning is below, and the single
finding that decides it is in [§4](#4-the-finding-that-decides-b4).

Reproduce with:

```bash
node scripts/audit-age-evidence.js              # live, needs SUPABASE_URL + service-role key
node scripts/audit-age-evidence.js --file <tsv> # offline
```

---

## 1. What was examined

Measured directly against production (read-only SQL):

| | Count | Share |
|---|---|---|
| Venues in the catalogue | 134 | — |
| Venues with any stored evidence | 128 | 95.5% |
| Evidence rows stored | 738 | — |
| Rows that fetched cleanly | 458 | 62.1% |
| Rows carrying extracted text | 453 | 61.4% |
| Rows mentioning any age wording | 143 | 19.4% of all rows |
| **Unique age-related sentences** | **88** | — |
| **Venues with any age sentence** | **35** | **26.1% of catalogue** |

So roughly three quarters of the catalogue says **nothing at all** about age on the pages already
fetched. That is the first result, and it is not a failure of extraction: most venue pages simply
do not discuss age.

> **Scope note, stated rather than buried.** The classifier run below covers **76 of the 88**
> unique sentences. The twelve not included are the same sentences repeated under a second venue
> id (the Wedgwood, Horniman, Warner Bros. and DLA-eligibility texts each appear at more than one
> venue). This environment has no direct database egress, so the corpus was transferred by hand;
> the committed CLI does the whole corpus in one pass when run with credentials. The omissions are
> duplicates of sentences already classified and none of them is a venue restriction.

## 2. What the pages actually say

75 classified statements across 35 venues:

| Category | Statements | Share | Venues |
|---|---|---|---|
| `positive_all_ages` | 16 | 21.3% | 13 |
| `not_an_age_statement` | 14 | 18.7% | 11 |
| `pricing_not_admission` | 8 | 10.7% | 8 |
| `insufficient_evidence` | 7 | 9.3% | 7 |
| `mixed_statement` | 6 | 8.0% | 6 |
| `administrative_not_admission` | 6 | 8.0% | 5 |
| `accompaniment` | 6 | 8.0% | 5 |
| `height_not_age` | 4 | 5.3% | 3 |
| `companion_role_not_admission` | 4 | 5.3% | 4 |
| `ambiguous_scope` | 3 | 4.0% | 3 |
| `activity_restriction` | 1 | 1.3% | 1 |
| **`venue_restriction`** | **0** | **0.0%** | **0** |

By source type: `visitor_info` 37, `official_website` 27, `accessibility_page` 7, `family_page` 4,
`faq_page` 1.

Against the shipped B2 semantics:

| | Count | Share |
|---|---|---|
| Would become a hard gate | **0** | 0.0% |
| Require human review before they could | 0 | 0.0% |
| Expose a model gap | 22 | 29.3% |

### Not one venue-level age prohibition exists in the London catalogue

Across 134 venues, 738 evidence rows and 88 age sentences, **no page states a venue-level age
restriction.** Nothing of the form "under 4s are not admitted". The B2 hard-gate path, shipped and
applied to production today, would currently exclude exactly nothing.

That is a good result for safety and a sobering one for value: the gate is correct and idle. Every
age fact the catalogue actually holds is a recommendation, a price, an activity rule, an
accompaniment rule, or an explicit welcome.

## 3. The most common age statement is one B2 cannot represent

`positive_all_ages` is the single largest category: **16 statements across 13 venues (21.3%)**.

Real wording:

- "Children of all ages are welcome at Paradox Museum London."
- "Age requirement: Babylon Park is perfect for adults and children of all ages — **there is no
  minimum age for access**."
- "A fun-filled day out with lots to see and do for children of all ages."

B2 has no way to store this. An empty rule set means *nothing was found*, which is not the same as
*a source said there is no restriction*. Today that costs nothing, because absence and "no
restriction" both fail open. It will start to matter at B4, when a venue that has positively
declared itself open to all ages should be distinguishable from one nobody has checked — and it
matters for corroboration, because a positive statement is real evidence against a door claimed
elsewhere.

One venue states both at once: *"suitable for all ages 4+"*. A positive statement and a bound, in
four words.

**Recommendation:** add a first-class `all_ages` assertion in B4's design, not before. It is a
read-model and claim-shape change, and the audit now shows it is worth the cost.

## 4. The finding that decides B4

The first run of this audit found exactly one candidate venue restriction in the entire corpus:

> **"Children under 16 are not permitted to accompany a disabled visitor as an Essential
> Companion."** — Woodside Animal Farm, `visitor_info`

That sentence is about who may act as a **carer**. It says nothing about admission. A naive reader
sees "under 16" and "not permitted" and produces a door at 192 months.

Had that been published, Woodside Animal Farm would have been hidden from **every family with a
child under sixteen** — very nearly every family this product exists to serve — on a sentence about
disability-companion eligibility. No parent would ever have seen the venue, and no one would have
known why.

Two things follow, and they point in opposite directions:

1. **The B2 model was not wrong. The extractor was.** Every B2 semantic behaved correctly. The only
   thing standing between that sentence and a live gate was the human-approval requirement added in
   review round four. Without it, automated extraction plus automated publication would have
   shipped this.
2. **One barrier is not enough.** When the audit asked B2 why that candidate would not gate, the
   answer was a single line: *"no human approval exists."* Source type passed. Excerpt length
   passed. `normaliseAgeRules` passed. A sentence this wrong should have been stopped by more than
   one thing.

The classifier now has a `companion_role_not_admission` guard and a named regression test. But the
guard was written *after* seeing the failure, which is precisely the point: the next corpus will
contain a sentence nobody has thought of yet.

## 5. Adversarial checks, against real wording

| Challenge | Real example | Classified |
|---|---|---|
| Recommendation vs restriction | "the recommended age of the attraction is children aged 6 and over" | recommendation (never gates) |
| Accompaniment | "Children aged under 8 years old must be accompanied by an adult at all times while at the farm." | accompaniment |
| Accompaniment framed as entry | "Children under 16 must be accompanied by an adult **to be permitted entry**" | accompaniment |
| Activity-only limit | "dedicated sessions … for children aged 5 and under" | activity |
| Ticket pricing | "Children under 4 years old can enter the museum for free." | pricing |
| "Under X free" | "all children aged under 3 go free" | pricing |
| Benefit eligibility | "Disability Living Allowance for children under 16 or DLA/PIP for those aged 16-64" | administrative |
| Membership tiers | "Family membership, for two adults and two children under 18" | administrative |
| Carer role | "The carer must be 14+ years old." | companion role |
| Height/weight | "under 1.2m", "strictly under 50kg to ride" | height, not age |
| Months | "Babies under 6 months are not admitted" | months preserved, not rounded |
| Numbers that are not ages | "over 5,000 acres", "over 1 million visitors", "over 8 persons", "over 500 species", "over 3 floors" | not an age statement |
| Two facts in one sentence | "children under 2 go free **but** the recommended age … is 6 and over" | mixed, flagged |
| Positive statement | "there is no minimum age for access" | positive (model gap) |

**Accompaniment is the most common genuine age rule in the catalogue** — 6 statements across 5
venues — and some of it is explicitly an entry condition. B2 treats accompaniment as a caveat that
never excludes, and this audit **confirms that ruling**: an accompanying adult is present by
construction on a family day out, so such a rule never excludes a FamilyPilot family. Keeping it a
caveat is right, and it is now right for a reason drawn from evidence rather than from intuition.

## 6. Model gaps found

| Gap | Frequency | Recommendation |
|---|---|---|
| No way to state "all ages welcome" positively | 16 statements, 13 venues | Add a first-class `all_ages` assertion in B4 |
| One sentence carrying two age facts | 6 statements, 6 venues | Keep flagging; never attribute a bound to the wrong fact |
| Scope unreadable from the sentence alone | 3 statements | Keep failing open; sentence-level context is sometimes genuinely insufficient |

None of these is a defect in B2's semantics. Two are limits of sentence-level extraction, and one
is a genuine missing fact type.

## 7. The decision

**Does the B2 model fit the real London evidence well enough to publish safely?**

**The semantics: yes.** Every ruling B2 makes was tested against real wording and every one held.
Recommendation stays advice. Activity rules stay caveats. Accompaniment stays a caveat, and the
evidence now justifies that rather than merely permitting it. Months survive. Fail-open held
everywhere, including on the one sentence that would have done real damage.

**Automated publication: no.** Not because the model is wrong, but because:

- there is **nothing to publish** — zero venue restrictions exist in the catalogue today;
- the only candidate the extractor produced was **catastrophically wrong**, and human approval was
  the single thing that stopped it;
- the most common age statement in the corpus (21.3%) is one the model **cannot represent**.

**Recommended B4 shape:** human-reviewed publication only, with the audit's classification as a
queue for a person rather than as an input to a writer. Automated publication of age policy should
stay unavailable until a corpus exists that actually contains venue-level doors, and until more than
one barrier stands between an extractor and a gate.

## 8. Where this lives

| Concern | File |
|---|---|
| Classifier and audit | `server/enrichment/_lib/age-evidence-audit.js` |
| CLI | `scripts/audit-age-evidence.js` |
| Tests, incl. the Woodside regression | `familypilot/src/__tests__/age-evidence-audit.test.ts` |
| The B2 model this audits | `docs/AGE_POLICY.md` |
