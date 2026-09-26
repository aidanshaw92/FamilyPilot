# P0 Venue Intelligence — baseline readiness audit

What FamilyPilot could honestly tell a parent today, measured rather than estimated.

**This audit writes nothing.** No claim, no draft approval, no metadata change. Enforced by a test
that fails if either audit file so much as names a writer.

Reproduce it:

```bash
# live, against the database (needs SUPABASE_URL + service-role key)
node scripts/audit-venue-readiness.js

# offline, against a snapshot
node scripts/audit-venue-readiness.js --file <catalogue> --expect-venues 134
```

Snapshot: **2026-09-26**, 134 venues, fixture md5 `7800ca19ff0b3bc554eaf7d325366200` (computed in
SQL, verified byte-for-byte locally). 22 fields × 134 venues = 2,948 cells, every one booked in
exactly one state.

## The answer to the question that was asked

> For how many of our 134 venues can FamilyPilot currently tell a parent, with trustworthy evidence,
> whether this place works for their family and their day?

**Zero.** Not one venue has the facts the day planner needs.

| tier | venues | share | what FamilyPilot can say |
| --- | --- | --- | --- |
| **T0** status-gated | **70** | **52.2%** | nothing at all about the family fit |
| **T1** identity only | 1 | 0.7% | it exists, and where it is |
| **T2** thin | 49 | 36.6% | one or two facts, no coherent story |
| **T3** explainable | 14 | 10.4% | why it suits a family, but not how it fits a day |
| **T4** recommendation-ready | **0** | **0.0%** | the full answer |

So the honest headline is not "80% ready". It is: **10.4% of the catalogue can be explained at all,
and 0% can be planned around.** Coverage, not the data model, is now the binding constraint.

The tiers are cumulative and each names what the product can *say*, not how many columns are
non-null. T4's requirements are the planner's actual inputs: without a visit duration it cannot
place a venue in a day, and without recommended ages it cannot rank it for these children.

## Field coverage

`usable` means an active, human-approved, in-lifetime claim whose value says something.
`servable` subtracts the venues whose enrichment status makes the matcher ignore it.

| field | usable | % of 134 | servable | % | origin |
| --- | --- | --- | --- | --- | --- |
| category | 134 | 100.0% | 134 | 100.0% | provider |
| identity / name | 134 | 100.0% | 134 | 100.0% | provider |
| location | 134 | 100.0% | 134 | 100.0% | provider |
| nearby restaurants | 134 | 100.0% | 134 | 100.0% | **derived** |
| photos | 128 | 95.5% | 128 | 95.5% | provider |
| website | 128 | 95.5% | 128 | 95.5% | provider |
| opening hours | 118 | 88.1% | 118 | 88.1% | provider |
| accessible toilet | 39 | 29.1% | 37 | 27.6% | claim |
| playground | 35 | 26.1% | 35 | 26.1% | claim |
| parking | 29 | 21.6% | 29 | 21.6% | claim |
| baby changing | 27 | 20.1% | 27 | 20.1% | claim |
| toilets | 25 | 18.7% | 25 | 18.7% | claim |
| free parking | 20 | 14.9% | 20 | 14.9% | claim |
| wheelchair access | 19 | 14.2% | 17 | 12.7% | claim |
| indoor / outdoor | 18 | 13.4% | 17 | 12.7% | claim |
| pushchair suitability | 8 | 6.0% | 8 | 6.0% | claim |
| sensory sessions | 2 | 1.5% | 2 | 1.5% | claim |
| café on site | 1 | 0.7% | 1 | 0.7% | claim |
| energy level | **0** | 0.0% | 0 | 0.0% | claim |
| **visit duration** | **0** | 0.0% | 0 | 0.0% | claim |
| **recommended ages** | **0** | 0.0% | 0 | 0.0% | claim |
| **hard age restriction** | **0** | 0.0% | 0 | 0.0% | claim |

Cells by state: `confirmed_fresh` 1,133 (38.4%) · `candidate_not_publishable` 1,004 (34.1%) ·
`unknown` 809 (27.4%) · `conflicting` 2 (0.1%) · `refresh_due` 0 · `stale` 0 · **`unsupported` 0**.

Two things worth reading twice:

- **`unsupported` is zero.** Every value in the read model has a claim behind it. The single-writer
  discipline from P0-B0/B2 is holding; there is no drifted editorial data to clean up.
- **`refresh_due` and `stale` are both zero.** Nothing is near expiry, because almost everything was
  claimed inside the last few weeks. Freshness is not yet a problem. It will become one: the 30-day
  facility lifetime means today's 39-venue best case decays to zero within a month without a working
  replenisher, so coverage gained now has to be *held*.

## Five findings that decide what to build next

### 1. The status gate silently hides half the catalogue — and it is the cheapest win

70 of 134 venues (52.2%) are `ai_draft` or `provider_only`. `extractMatchableFacts` returns **every**
fact as unknown for those, whatever is stored. They cannot be recommended on any family criterion,
and no amount of extraction changes that until a human reviews them.

67 drafts sit in `pending_review`, across 67 venues — a near 1:1 backlog. The pipeline generates
faster than anyone approves, and an unreviewed draft contributes exactly nothing.

Concretely wasteful right now: **4 gated venues already hold 5 usable, human-approved, in-date
claims** that the status gate discards. That is verified work thrown away.

### 2. Four fields have no automatic extraction path at all

`FIELD_MAP` in `trusted-evidence.js` supports eleven field keys: toilets, babyChanging, parking,
freeParking, cafe, playground, wheelchairAccessible, accessibleToilet, sensoryFriendlySessions,
pushchairSuitability, environment.

**visit duration, recommended ages, energy level and hard age restrictions are not in it.** Their 0%
coverage is not a crawling shortfall — there is no pipeline that could ever populate them. Two of
those four are exactly what T4 requires, which is why T4 is empty and would stay empty however much
source discovery improved.

### 3. Extraction can confirm a facility but almost never its absence

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

Six of nine covered tri-state fields have **never once** recorded a `no`. The three that do are the
three whose absence a page tends to state outright ("no parking on site", "parking charges apply"). A page that says nothing about baby
changing is indistinguishable from a page that says there is none, so FamilyPilot can tell a parent
"there is baby changing" but essentially never "there isn't". For a parent with a baby that is the
more decision-changing answer, and the facility score treats `no` as 25% credit rather than
excluding — so absence evidence is safe to publish and currently unobtainable.

### 4. A third of all fetches fail, and blocking is the main cause

835 evidence rows, 280 of them failures (33.5%):

| status | rows |
| --- | --- |
| ok | 527 |
| blocked | **162** |
| error | 106 |
| fetched_truncated | 28 |
| timeout | 7 |
| non_html | 4 |
| too_large | 1 |

Venue coverage behind that: 95 venues have at least one page with usable text (4.4 clean pages each
on average, 5 venues on a single page), **33 have evidence rows but no clean text at all**, and **6
have no evidence row whatsoever**. Blocking is the single biggest lever on source coverage and is an
infrastructure problem, not an extraction one.

### 5. One field should never be stored

`nearby_restaurants` is at 100% because Eat Nearby resolves it per request from the venue's
coordinates. Storing it per venue would create a second copy to keep fresh for no gain. It is listed
in the inventory so the picture is complete, and flagged `derived` so nobody targets it.

## Recommended implementation order

Ordered by product impact per unit of work, not by how empty the column is.

1. **Clear the review backlog, and reconsider the gate.** 67 drafts across 67 venues; approving them
   is the only change that can move 52% of the catalogue off T0. Worth asking separately whether a
   venue with human-approved claims should be gated by `ai_draft` at all — the 4 venues losing 5
   verified facts suggest the status and the claims are answering different questions.
2. **Add visit duration and recommended ages to the extraction path.** Two fields, and T4 is
   unreachable without them. Highest ceiling of anything on this list: they convert T3 venues into
   recommendable ones directly.
3. **Fix blocked fetches.** 162 blocked rows and 33 venues with no usable text. Until this moves,
   extraction improvements have nothing to read.
4. **Teach the extractor to record absence.** Makes `no` expressible for the six fields that have
   never recorded one, which roughly doubles the decision value of existing coverage without any new
   crawling.
5. **Then targeted source discovery, age included as one field among many.** Per the B3 finding,
   age-source discovery belongs here rather than as its own crawler. Once source coverage materially
   improves, re-run P0-B3 and only then reconsider B4.
6. **Then the replenisher.** Nothing is stale today, but the 30-day facility lifetime means coverage
   won gains nothing if it cannot be held.

## What this audit does not establish

- **Grace is an upper bound, not exact.** `stale` requires the claim's own source to have failed
  *transiently*, which cannot be seen from claim rows alone. It is 0 in this snapshot either way.
- **It measures stored evidence, not the venues' websites.** As in P0-B3, an absent fact may be site
  silence or a discovery gap; this audit cannot tell them apart.
- **Tier thresholds are a product judgement.** The states and freshness rules are taken from the
  shipped code; which combination counts as "explainable" is a choice, stated here so it can be
  argued with rather than buried in a percentage.
- **The catalogue is live.** Claims, drafts and evidence all move. The fixture checksum and snapshot
  date are recorded so any number here can be re-derived exactly.

## Where this lives

| File | Role |
| --- | --- |
| `server/enrichment/_lib/venue-readiness-audit.js` | field inventory, state classification, readiness tiers |
| `scripts/audit-venue-readiness.js` | the CLI, live or `--file`, with `--expect-venues` reconciliation |
| `familypilot/src/__tests__/venue-readiness-audit.test.ts` | 30 tests, including the structural zero-write assertion |
| `docs/AGE_EVIDENCE_AUDIT_B3.md` | the age-specific audit this generalises |
