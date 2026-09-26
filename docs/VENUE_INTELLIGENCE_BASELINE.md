# P0 Venue Intelligence — baseline readiness audit

What FamilyPilot could honestly tell a parent today, measured twice: once as **what the consumer
path actually serves**, and once restricted to **facts whose source this audit can tie to the venue
they are attached to**. The gap between those two readings is the finding this revision exists for.

**This audit writes nothing.** No claim, no draft approval, no metadata change. Enforced by a test
that fails if either audit file so much as names a writer.

```bash
node scripts/audit-venue-readiness.js                                              # live
node scripts/audit-venue-readiness.js --corpus <dir> --today 2026-09-26 --expect-venues 134
```

Snapshot: **2026-09-26**, 134 venues. The offline corpus is four files, each transferred from
production with an md5 computed in SQL and verified byte-for-byte locally:

| file | rows | md5 |
| --- | --- | --- |
| `places.txt` | 134 | `77a02bd82d101697a69a3c7b3b26b638` |
| `meta.txt` | 134 | `f8ab1d7c46eafe93baddb25d6eaf5b2e` |
| `claims.txt` | 345 | `9ead99b7c1ec41f6bb21d0060e235e14` |
| `drafts.txt` | 67 | `eccd695c2f7de00bd28454be24248682` |

The corpus is committed at `docs/snapshots/venue-intelligence-2026-09-26/`, and a test replays it
and asserts every figure in this report, so the two cannot drift apart.

The corpus carries **inputs, not verdicts**: every classification below is produced by the same
module the live run uses, over real claim statuses, approvers, dates, source URLs and draft JSON.
Only values the audit never reads are stood in for. Every headline figure is then reproduced by SQL
written separately against the same rules — see *Reconciliation*.

The snapshot date is explicit and threaded all the way down to `isClaimActive`, which was made
date-injectable for exactly this reason: a dated baseline nobody can replay is not evidence.

## Four rules this audit had to be corrected on

Stated up front because the first revisions got each of them wrong, and each error moved a headline.

1. **Trust is not reinvented here.** `isClaimActive` from `claims-store` is imported, because it is
   the predicate `getConsumerMetadata` itself uses. It accepts a **source-evidence auto-published**
   claim, because the product deliberately trusts those for ordinary facility facts, and rejects the
   legacy `ai_auto_approved` approver that predates source proof. The strict `human:` rule belongs to
   age-policy gating alone. Production holds **223 active `source_evidence_auto_v2` claims, 4 editor
   claims and zero `human:` claims**, so an earlier report's "human-approved" was simply false.
2. **Servability follows the consumer projection, not the raw status column.** `getConsumerMetadata`
   hard-stops on `ai_draft` only; a `provider_only` row with active claims is projected and returned
   as consumer-`enriched`. An earlier revision treated `provider_only` as gated and so claimed the
   gate was discarding facts the server is designed to serve.
3. **A candidate is a field, not a venue.** A pending draft makes a field a candidate only if the
   draft asserts something for *that* field, read through the real `VenueEnrichmentDraftJson` shape.
4. **What the consumer serves is not the same as what is established.** Production contains active
   claims whose source page describes a **different venue**. A claim being served says nothing about
   whether its evidence belongs to that venue, so coverage is reported twice and never merged.

Provider availability and derived capability are kept **out** of the claim ledger. Having
coordinates means Eat Nearby can answer a question; it is not confirmed restaurant data.

## The answer to the question that was asked

> For how many of our 134 venues can FamilyPilot currently tell a parent, with trustworthy evidence,
> whether this place works for their family and their day?

**Zero.** Not one venue has the full picture. And on the stricter reading, only **two** venues can
be explained at all from evidence this audit can tie to them.

| tier | served | identity-safe | what the consumer path can say |
| --- | --- | --- | --- |
| **T0** serves no family facts | **67** (50.0%) | **67** | nothing — `ai_draft`, or no active claims |
| **T1** identity only | 0 | **42** | servable, but nothing this audit can vouch for |
| **T2** thin | 53 (39.6%) | 23 | one or two facts, no coherent story |
| **T3** explainable | 14 (10.4%) | **2** | why it suits a family, not how it fits a day |
| **T4** full Venue Intelligence readiness | **0** | **0** | the complete picture |

**10.4% can be explained today; 1.5% can be explained from evidence whose source this audit can tie
to the venue; 0% can be planned around.** The identity-safe column is the same tier logic over the
same rows, restricted to `confirmed` affinity — a second reading, never a replacement.

T0 is 67: the 66 `ai_draft` rows plus Swanley Park, which is `enriched` but whose only playground
claim is disputed. The four raw `provider_only` venues are **not** T0 — they hold active claims, so
the projection serves them.

### T4 is a product target, not the planner's minimum

T4 requires facility + environment + pushchair + duration + ages. The planner does not: it takes
dwell minutes from the request, treats recommended ages as advice under P0-B1 rather than a gate,
and only needs pushchair suitability when the family actually has a pushchair. **T4 = 0 means no
venue yet has the complete picture the product wants to show a parent unprompted. It does not mean
the planner cannot schedule a venue today.** Whether a plan is executable is a question about one
family's request, not a property of a venue.

## Source-to-venue affinity

Of **223 usable claim-backed facts**, all 223 are served to parents. Classifying each by whether its
source page can be tied to the venue it is attached to:

| affinity | facts | share | meaning |
| --- | --- | --- | --- |
| `confirmed` | **55** | 24.7% | the source path carries the venue's own discriminating slug |
| `contested` | **20** | 9.0% | the source names a different catalogue venue, or is a sibling page |
| `unestablished` | **148** | 66.4% | nothing structural ties the page to this venue either way |

`unestablished` is **not** an accusation — most of those are a venue's own homepage or a generic
`/plan-your-visit` page whose URL simply carries no venue token. It means the audit cannot tell.

### The confirmed cross-venue attributions

Verified directly against production on 2026-09-26, on the two domains that host several catalogue
venues:

| venue | source page attached to its claims | facts | verdict |
| --- | --- | --- | --- |
| Tate Britain | `tate.org.uk/visit/tate-liverpool` | 3 | `contested` ✓ caught |
| Tate Modern | `tate.org.uk/visit/tate-liverpool` | 3 | `contested` ✓ caught |
| Victoria and Albert Museum | `vam.ac.uk/young/visit` | 3 | `contested` ✓ caught |
| Young V&A | `vam.ac.uk/south-kensington/visit` | 1 | `contested` ✓ caught |
| V&A East Storehouse | `vam.ac.uk/east/museum/visit` | 5 | `unestablished` ✗ **missed** |
| Victoria and Albert Museum | `vam.ac.uk/east/storehouse/visit` | 2 | `unestablished` ✗ **missed** |
| Victoria and Albert Museum | `vam.ac.uk/wedgwood/visit` | 1 | `unestablished` ✗ **missed** |
| Young V&A | `vam.ac.uk/east/storehouse/visit` | 2 | `unestablished` ✗ **missed** |
| Young V&A | `vam.ac.uk/wedgwood/visit` | 1 | `unestablished` ✗ **missed** |
| Young V&A | `vam.ac.uk/young/visit` | 2 | `confirmed` ✓ correct — its own page |

Tate Britain and Tate Modern are each serving accessible-toilet, baby-changing and toilet facts read
off the **Tate Liverpool** page. The South Kensington V&A is serving a toilets fact read off the
**Wedgwood Collection in Stoke-on-Trent**, roughly 150 miles away. These are facts a parent is being
shown right now.

### What the heuristic gets wrong, in both directions

The classifier compares URL structure only. It has no venue-name matching and no page content, and
its limits are measurable rather than hypothetical:

- **It misses wrong-venue sources whose discriminating segment is not the last one.**
  `/wedgwood/visit`, `/east/storehouse/visit` and `/east/museum/visit` all end in the generic
  segment `visit`, and none of `wedgwood`, `storehouse` or `museum` is another catalogue venue's
  slug. Ten of the eighteen wrong-venue facts above fall through for this reason. A venue whose own
  website ends in `visit` (V&A East Storehouse) has no usable slug at all.
- **It raises false alarms on legitimate sibling pages.** Of the 20 `contested` cells, **10 are
  genuine** (the Tate and V&A rows above) and **10 are a venue's own site**: Dulwich Park's own
  location page (3), Madame Tussauds' own FAQ and directions pages (3), Hatfield Park's own FAQ (2),
  and Northala Fields' own page (2), whose URL ends in a numeric segment so the venue has no slug of
  its own to match. Precision on this snapshot is **50%**.
- **Substring matching is loose.** `primrose-hill` is a substring of `regents-park-primrose-hill`,
  so nesting is detected by accident rather than by design.
- **An own-slug match wins outright.** Five cells sit inside a parent venue's path — Diana Memorial
  Playground under Kensington Gardens, Golders Hill Park under Hampstead Heath — where the source
  *is* the venue's own page. Reversing that precedence turned all five into false alarms, so the
  order is deliberate and pinned by a test.

**`sourceAffinity` is therefore a screening signal for a dedicated workstream, never a verdict this
audit acts on.** Nothing here should be used to mass-invalidate shared URLs: a shared page can be a
duplicate record, an alias, or a legitimately shared campus or venue page.

### Shared source URLs

Nine source URLs are attached to more than one venue, covering **12 venues and 49 active claims**
(70 claim rows once superseded and disputed rows are counted). This figure is stable across three
readings — active-and-informative, any active claim, and any row of any status all give 9 URLs and
12 venues — so **the review's 10 URLs / 50 claims / 12 venues does not reproduce on this snapshot**.
The venue count agrees; I could not find a reading that yields 10/50, and I am flagging the
difference rather than quietly restating my own number.

## Claim-backed coverage

2,010 claim cells (134 × 15). `usable` = an active, consumer-trusted, in-lifetime claim whose value
says something. `served` = of those, the ones the consumer path projects. `identity-safe` = of the
served ones, those with `confirmed` affinity.

| field | usable | % of 134 | served | identity-safe |
| --- | --- | --- | --- | --- |
| accessible toilet | 39 | 29.1% | 39 | 10 |
| playground | 35 | 26.1% | 35 | 16 |
| parking | 29 | 21.6% | 29 | 7 |
| baby changing | 27 | 20.1% | 27 | 3 |
| toilets | 25 | 18.7% | 25 | 3 |
| free parking | 20 | 14.9% | 20 | 2 |
| wheelchair access | 19 | 14.2% | 19 | 6 |
| indoor / outdoor | 18 | 13.4% | 18 | 7 |
| pushchair suitability | 8 | 6.0% | 8 | **0** |
| sensory sessions | 2 | 1.5% | 2 | **0** |
| café on site | 1 | 0.7% | 1 | 1 |
| energy level | **0** | 0.0% | 0 | 0 |
| **visit duration** | **0** | 0.0% | 0 | 0 |
| **recommended ages** | **0** | 0.0% | 0 | 0 |
| **hard age restriction** | **0** | 0.0% | 0 | 0 |

Claim cells by state: `confirmed_fresh` **223 (11.1%)** · `unknown` **1,785 (88.8%)** ·
`conflicting` 2 (0.1%) · `refresh_due` 0 · `stale` 0 · `unsupported` **0** ·
`candidate_not_publishable` **0**.

`served` equals `usable` for every field: **no venue that holds a usable claim is blocked**. An
earlier report's "5 verified facts thrown away by the gate" was an artefact of treating
`provider_only` as gated, and is withdrawn.

`unsupported` is zero: every value in the read model has a claim behind it, so the single-writer
discipline from B0/B2 is holding. One cell comes close — Swanley Park's metadata says it has a
playground while its only claim on that field is disputed — and the audit books it as `conflicting`,
which is the more informative verdict.

Every one of the eight pushchair-suitability facts and both sensory-session facts is
`unestablished` or `contested`. The two fields the planner leans on hardest are the two with no
identity-safe coverage at all.

Provider availability, reported separately: identity, location and category 134/134; photos and
website 128/134 (95.5%); opening hours 118/134 (88.1%). Derived capability: `nearby_restaurants`
available for 134/134, because every venue has coordinates — a capability, not confirmed data.

## The automation bottleneck

**The 67 "pending review" drafts are not a review backlog. Every one of them is empty.**

All 67 hold byte-identical JSON: `{"accessibility": {}, "familyFacilities": {}, "sendInfo": {}}`.
Three empty containers, no fact slots at all — not even a `recommendedAge` or
`suggestedVisitDuration` key. There is nothing for an editor to approve, which is why
`candidate_not_publishable` is 0. Clearing this queue by hand would achieve literally nothing.

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
today's coverage decays to nothing within a month unless the replenisher works.

## Reconciliation

Every headline figure was recomputed in SQL written separately from the JavaScript, against the same
stated rules, directly on production. All agree:

| figure | audit module | independent SQL |
| --- | --- | --- |
| venues | 134 | 134 |
| usable claim-backed facts | 223 | 223 |
| affinity `confirmed` / `contested` / `unestablished` | 55 / 20 / 148 | 55 / 20 / 148 |
| served tiers T0/T1/T2/T3/T4 | 67 / 0 / 53 / 14 / 0 | 67 / 0 / 53 / 14 / 0 |
| identity-safe tiers T0/T1/T2/T3/T4 | 67 / 42 / 23 / 2 / 0 | 67 / 42 / 23 / 2 / 0 |
| per-field usable counts | 11 non-zero fields | identical |
| `conflicting` cells | 2 | 2 disputed cells |

The reconciliation was capable of failing and did: a first SQL pass demoted a source that names both
the venue and its parent venue to `contested`, giving 50 identity-safe cells against the module's
55. Inspecting the five rows showed all five are the venue's **own** page nested under a parent
venue's path, so the module's precedence is right and the SQL was wrong. That precedence is now
pinned by a test.

A second deliberate difference: SQL counts one `unsupported` candidate where the module reports
zero, because the module books that cell as `conflicting` — a disputed claim exists, and the state
ledger is exclusive. Checked by hand on the single row.

**A mutation pass** over the new logic killed 16 of 16 real mutants (a no-op control survived, as it
should): dropping the sibling rule, swapping the affinity precedence, emptying the generic-slug set,
reading a tri-state draft field as a wrapper instead of through `.value`, accepting any object as an
age range, accepting any scalar as a duration, ignoring `identitySafeOnly`, counting first-verdict
instead of worst-verdict, letting served totals ignore the consumer block, removing each corpus
decoder guard, and making `isClaimActive` ignore its injected date. It also proved one guard dead —
a `slug !== ownLeaf` test that the `confirmed` branch makes unreachable — which was removed rather
than papered over with a test that could not exist.

## Recommended implementation order

Every step is an automation fix. None asks an editor to work through venues by hand.

1. **P0 Venue Source Integrity — first, and before any further enrichment.** Publishing more facts
   on top of a source-attribution defect multiplies the defect. This audit's heuristic finds 10 real
   cross-venue attributions at 50% precision and misses 10 more; a dedicated pass should audit every
   active claim and evidence row for source-to-venue affinity, compare **all** discriminating path
   segments rather than the leaf alone, keep an explicit registry of the **16 domains that host more
   than one catalogue venue** (royalparks.org.uk 10, historicengland.org.uk 6, cityoflondon.gov.uk /
   rmg.co.uk / vam.ac.uk 3 each, then 11 more with 2), refuse to publish a new claim whose page
   cannot be shown to describe that venue, and prepare a **controlled** repair or quarantine plan
   for the existing misattributions. Shared URLs must not be mass-invalidated: several are
   duplicates, aliases or legitimately shared campus pages — `wbstudiotour.co.uk` carries two
   catalogue rows, "Harry Potter Studio" and "Warner Bros. Studio Tour London", with the identical
   website, which is a duplicate-record question rather than a misattribution.
2. **Fix source-discovery targeting.** The highest-leverage coverage change: 23 venues have fresh
   official pages that do not contain facility statements, and only 7 accessibility/FAQ pages were
   found across them. Discovering and fetching the pages that actually carry facilities converts
   existing crawl budget into publishable facts with no new fields and no human step.
3. **Fix blocked fetches.** 162 blocked rows, and 39 of the 67 empty-draft venues have no usable
   evidence at all. Until this moves, better targeting has less to aim at.
4. **Add visit duration and recommended ages to the extraction path.** Two fields, and T4 is
   unreachable without them. Highest ceiling once 2 and 3 land.
5. **Teach the extractor to record absence.** Makes `no` expressible for the six fields that have
   never recorded one, roughly doubling the decision value of existing coverage with no new crawling.
6. **Stop generating empty drafts, or stop calling them pending review.** 67 rows that assert nothing
   sit in a queue implying human work.
7. **Then the replenisher**, before the 30-day lifetimes start expiring.

Age-source discovery is one field inside step 2, not a separate crawler. Once source coverage
materially improves, re-run P0-B3 and only then reconsider B4.

## What this audit does not establish

- **Affinity is structural, not semantic.** It reads URLs, never page content or venue names. Its
  measured precision on this snapshot is 50% and it misses at least 10 known-wrong attributions. It
  is a screening signal for step 1, and no claim should be invalidated on its verdict alone.
- **`stale` is an upper bound.** Real grace requires the claim's own source to have failed
  *transiently*, which cannot be seen from claim rows alone. It is 0 in this snapshot either way.
- **Worst-verdict-wins is untested by production.** Every usable fact in this snapshot has exactly
  one claim behind it (223 facts, 223 cells), so the rule that a contested source taints a field
  never fires here. It is covered by a test instead.
- **It measures stored evidence, not venues' websites.** As in P0-B3, an absent fact may be site
  silence or a discovery gap.
- **Consumer-path parity is modelled, not executed.** `consumerServesFacts` mirrors
  `getConsumerMetadata`'s two stopping conditions and is tested against them, but this audit does not
  call the projection itself, so a future divergence would need a test to catch it. One further
  condition is not modelled: the projection also drops fields a parent report has put in
  `needs_recheck`. `venue_visit_reports` is empty, so that path suppresses nothing today.
- **Tier thresholds are a product judgement**, stated so they can be argued with.
- **The catalogue is live.** The four checksums and the snapshot date are recorded so any number here
  can be re-derived from the same rows.

## Where this lives

| File | Role |
| --- | --- |
| `server/enrichment/_lib/venue-readiness-audit.js` | field inventory, state classification, source affinity, readiness tiers, corpus decoder |
| `scripts/audit-venue-readiness.js` | the CLI, live or `--corpus`, with `--today` and `--expect-venues` |
| `docs/snapshots/venue-intelligence-2026-09-26/` | the checksummed inputs every figure here is derived from |
| `familypilot/src/__tests__/venue-readiness-audit.test.ts` | 75 tests, including the published-figure replay and the structural zero-write assertion |
| `server/enrichment/_lib/claims-store.js` | `isClaimActive`, the canonical trust predicate, now date-injectable |
| `server/enrichment/_lib/consumer-projection.js` | the semantics this audit mirrors |
| `docs/AGE_EVIDENCE_AUDIT_B3.md` | the age-specific audit this generalises |
