# P0 Venue Intelligence — baseline readiness audit

What FamilyPilot could honestly tell a parent today, measured against what the production consumer
path actually serves.

**This audit writes nothing.** No claim, no draft approval, no metadata change. Enforced by a test
that fails if either audit file so much as names a writer.

```bash
node scripts/audit-venue-readiness.js                                      # live
node scripts/audit-venue-readiness.js --file <catalogue> --expect-venues 134  # offline snapshot
```

Snapshot: **2026-09-26**, 134 venues, fixture md5 `0d4ab84152d03ff476d6a2e6a195f448` (computed in
SQL, verified byte-for-byte locally). Every tier and field figure below is reproduced independently
by SQL written against the same rules.

## Three rules this audit had to be corrected on

Stated up front because the first revision got all three wrong, and each error moved the headline.

1. **Trust is not reinvented here.** `isClaimActive` from `claims-store` is imported, because it is
   the predicate `getConsumerMetadata` itself uses. It accepts a **source-evidence auto-published**
   claim, because the product deliberately trusts those for ordinary facility facts, and rejects the
   legacy `ai_auto_approved` approver that predates source proof. The strict `human:` rule belongs to
   age-policy gating alone. Production holds **223 active `source_evidence_auto_v2` claims, 4 editor
   claims and zero `human:` claims**, so the previous report's "human-approved" was simply false.
2. **Servability follows the consumer projection, not the raw status column.** `getConsumerMetadata`
   hard-stops on `ai_draft` only; a `provider_only` row with active claims is projected and returned
   as consumer-`enriched`. The previous revision treated `provider_only` as gated and so claimed the
   gate was discarding facts the server is designed to serve.
3. **A candidate is a field, not a venue.** A pending draft makes a field a candidate only if the
   draft asserts something for *that* field.

Provider availability and derived capability are kept **out** of the claim ledger. Having
coordinates means Eat Nearby can answer a question; it is not confirmed restaurant data.

## The answer to the question that was asked

> For how many of our 134 venues can FamilyPilot currently tell a parent, with trustworthy evidence,
> whether this place works for their family and their day?

**Zero.** Not one venue has the facts the day planner needs.

| tier | venues | share | what the consumer path can say |
| --- | --- | --- | --- |
| **T0** serves no family facts | **67** | **50.0%** | nothing — `ai_draft`, or no active claims |
| **T1** identity only | 0 | 0.0% | — |
| **T2** thin | 53 | 39.6% | one or two facts, no coherent story |
| **T3** explainable | 14 | 10.4% | why it suits a family, not how it fits a day |
| **T4** recommendation-ready | **0** | **0.0%** | the full answer |

**10.4% can be explained at all; 0% can be planned around.** Coverage is the binding constraint.

T0 is 67: the 66 `ai_draft` rows plus one `enriched` venue whose only claim is disputed. The four
raw `provider_only` venues are **not** T0 — they hold active claims, so the projection serves them.

## Claim-backed coverage

2,010 claim cells (134 × 15). `usable` = an active, consumer-trusted, in-lifetime claim whose value
says something. `servable` = of those, the ones the consumer path would actually project.

| field | usable | % of 134 | servable |
| --- | --- | --- | --- |
| accessible toilet | 39 | 29.1% | 39 |
| playground | 35 | 26.1% | 35 |
| parking | 29 | 21.6% | 29 |
| baby changing | 27 | 20.1% | 27 |
| toilets | 25 | 18.7% | 25 |
| free parking | 20 | 14.9% | 20 |
| wheelchair access | 19 | 14.2% | 19 |
| indoor / outdoor | 18 | 13.4% | 18 |
| pushchair suitability | 8 | 6.0% | 8 |
| sensory sessions | 2 | 1.5% | 2 |
| café on site | 1 | 0.7% | 1 |
| energy level | **0** | 0.0% | 0 |
| **visit duration** | **0** | 0.0% | 0 |
| **recommended ages** | **0** | 0.0% | 0 |
| **hard age restriction** | **0** | 0.0% | 0 |

Claim cells by state: `confirmed_fresh` **223 (11.1%)** · `unknown` **1,785 (88.8%)** ·
`conflicting` 2 (0.1%) · `refresh_due` 0 · `stale` 0 · `unsupported` **0** ·
`candidate_not_publishable` **0**.

`servable` equals `usable` for every field: **no venue that holds a usable claim is blocked**. The
previous report's "5 verified facts thrown away by the gate" was an artefact of treating
`provider_only` as gated, and is withdrawn.

`unsupported` being zero is real good news: every value in the read model has a claim behind it, so
the single-writer discipline from B0/B2 is holding.

Provider availability, reported separately: identity, location and category 134/134; photos and
website 128/134 (95.5%); opening hours 118/134 (88.1%). Derived capability: `nearby_restaurants`
available for 134/134, because every venue has coordinates — a capability, not confirmed data.

## The automation bottleneck

**The 67 "pending review" drafts are not a review backlog. Every one of them is empty.**

All 67 pending drafts assert **nothing**: zero informative leaves between them, 61 of them labelled
`evidence_backed`. There is nothing for an editor to approve, so `candidate_not_publishable` is 0,
not the 1,004 the previous revision reported. Clearing the backlog by hand would achieve literally
nothing.

Split by why each venue's draft came out empty:

| cause | venues | share of 67 | what it is |
| --- | --- | --- | --- |
| no usable evidence at all | **39** | 58% | discovery / fetch gap (205 failed pages between them) |
| evidence, but none fresh *and* official | 5 | 7% | source recency / quality gap |
| fresh official pages **and still zero claims** | **23** | 34% | the automation had what it needed and published nothing |
| genuinely needs human judgement | **0** | 0% | nothing is waiting on a person |

For the 23, the cause is specific and measurable: of their **89 fresh official pages, 76 mention no
extractable facility wording at all**. Only 1 mentions baby changing, 8 parking, 4 access, 1
toilets, 2 a playground. By page type, 59 are `visitor_info` (8 with facility wording, averaging
2,817 characters — landing pages, not facilities pages) and only **5 are accessibility pages and 2
FAQ pages across all 23 venues**.

So the bottleneck is **source-discovery targeting**: the crawler fetches the wrong pages. Not the
extractor, which works on text that carries the wording, and not the reviewer, who has nothing to
review.

## Other findings that survive the corrected accounting

**Four fields have no automatic extraction path.** `FIELD_MAP` in `trusted-evidence.js` supports
eleven keys. Visit duration, recommended ages, energy level and hard age restrictions are not among
them, so no pipeline could populate them. Two of the four are exactly what T4 requires — **T4 would
stay empty however much source discovery improved**.

**Extraction can confirm a facility but almost never its absence.**

| field | `yes` | `no` |
| --- | --- | --- |
| accessible toilet | 39 | **0** |
| playground | 35 | **0** |
| baby changing | 27 | **0** |
| toilets | 25 | **0** |
| sensory sessions | 2 | **0** |
| café on site | 1 | **0** |
| parking | 21 | 8 |
| free parking | 6 | 14 |
| wheelchair access | 18 | 1 |

Six of nine covered tri-state fields have never once recorded a `no`. The three that do are the ones
a page tends to state outright ("no parking on site", "parking charges apply"). So FamilyPilot can
say "there is baby changing" and essentially never "there isn't" — the more decision-changing answer
for a parent with a baby, and safe to publish, since the facility score treats `no` as partial
credit rather than exclusion.

**A third of all fetches fail, mostly blocked.** 835 evidence rows, 280 failures (33.5%): blocked
**162**, error 106, truncated 28, timeout 7, non-html 4, too-large 1. 95 venues have at least one
page with usable text; 33 have evidence rows but no clean text; 6 have no evidence row at all.

**Freshness is not yet a problem, and will become one.** `refresh_due` and `stale` are both 0,
because almost every claim was made in the last few weeks. The 30-day facility lifetime means
today's 39-venue best case decays to nothing within a month unless the replenisher works.

## Recommended implementation order

Every step is an automation fix. None asks an editor to work through venues by hand.

1. **Fix source-discovery targeting.** The single highest-leverage change: 23 venues have fresh
   official pages that do not contain facility statements, and only 7 accessibility/FAQ pages were
   found across them. Discovering and fetching the pages that actually carry facilities — accessibility,
   plan-your-visit, FAQ — converts existing crawl budget into publishable facts with no new fields
   and no human step.
2. **Fix blocked fetches.** 162 blocked rows and 39 of the 67 empty-draft venues have no usable
   evidence at all. Until this moves, better targeting has less to aim at.
3. **Add visit duration and recommended ages to the extraction path.** Two fields, and T4 is
   unreachable without them. Highest ceiling once 1 and 2 land.
4. **Teach the extractor to record absence.** Makes `no` expressible for the six fields that have
   never recorded one, roughly doubling the decision value of existing coverage with no new crawling.
5. **Stop generating empty drafts, or stop calling them pending review.** 67 rows that assert nothing
   sit in a queue implying human work. Either the generator should not emit them or they should be
   marked so they never look like a backlog.
6. **Then the replenisher**, before the 30-day lifetimes start expiring.

Age-source discovery is one field inside step 1, not a separate crawler. Once source coverage
materially improves, re-run P0-B3 and only then reconsider B4.

## What this audit does not establish

- **`stale` is an upper bound.** Real grace requires the claim's own source to have failed
  *transiently*, which cannot be seen from claim rows alone. It is 0 in this snapshot either way.
- **It measures stored evidence, not venues' websites.** As in P0-B3, an absent fact may be site
  silence or a discovery gap.
- **Consumer-path parity is modelled, not executed.** `consumerServesFacts` mirrors
  `getConsumerMetadata`'s two stopping conditions and is tested against them, but this audit does not
  call the projection itself, so a future divergence would need a test to catch it. One further
  condition is not modelled: the projection also drops fields a parent report has put in
  `needs_recheck`. `venue_visit_reports` is empty, so that path suppresses nothing today.
- **Tier thresholds are a product judgement**, stated so they can be argued with.
- **The catalogue is live.** The checksum and date are recorded so any number can be re-derived.

## Where this lives

| File | Role |
| --- | --- |
| `server/enrichment/_lib/venue-readiness-audit.js` | field inventory, state classification, readiness tiers |
| `scripts/audit-venue-readiness.js` | the CLI, live or `--file`, with `--expect-venues` reconciliation |
| `familypilot/src/__tests__/venue-readiness-audit.test.ts` | 39 tests, including the structural zero-write assertion |
| `server/enrichment/_lib/consumer-projection.js` | the semantics this audit mirrors |
| `docs/AGE_EVIDENCE_AUDIT_B3.md` | the age-specific audit this generalises |
