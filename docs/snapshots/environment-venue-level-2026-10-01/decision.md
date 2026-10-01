# Does `environment = outdoor` mean an outdoor venue, or any venue with outdoor space?

**Date:** 2026-10-01 · **Classification: A** — the product contract already settles it.

## What FamilyPilot has already committed to

`VenueEnvironment` is `'indoor' | 'outdoor' | 'mixed' | 'unknown'`. **`mixed` already exists for "has
both"**, so `outdoor` can only mean the venue *is* outdoors. Four independent confirmations:

| Where | Evidence |
|---|---|
| `types/enrichment.ts` | the competing concept has its own value, `mixed` |
| `matching/match-explanations.ts` | `outdoor` → "Mostly outdoor"; `mixed` → "Mix of indoor and outdoor areas" |
| `scoring/trusted-family-score.ts` | reason line reads "**Outdoor venue** — today's forecast is rain" |
| same, `scoreTrustedWeatherFit` | in rain: `outdoor` **45**, `mixed` **82**, `indoor` **97** |
| `matching/day-request-matcher.ts` | `mixed` already satisfies an indoor request *and* an outdoor one |

The 45-against-82 split decides it. If `outdoor` meant "has outdoor space", a museum with a courtyard
would score 45 in the wet — which is exactly what was happening.

## Two defects, each confirmed by running the classifier

### 1. A facilities list made the whole venue outdoor

Of **15** active served `environment = outdoor` claims, **five are indoor venues**, and every one comes
from a facilities list or a passing mention (all verbatim from `venue_claims.evidence_excerpt`):

| Venue | Evidence | Reality |
|---|---|---|
| ASK Italian | "…BABY CHANGING OUTDOOR SEATING…" | indoor restaurant |
| Nando's | "…Wheelchair access Outdoor space Wi-fi…" | indoor restaurant |
| The Wallace Collection | "…directed to the outdoor seating area on the front entrance forecourt" | indoor museum |
| Queen's House | "…Open-air skating… Museum entry not included" | about a *separate* ice rink |
| Chiswick House | "…Archie's brings its outdoor kids' camp to the grounds…" | a third party's event |

Because `outdoor` scores 45 in the wet, **a parent looking for a rainy-day option was being steered
away from indoor restaurants and an indoor museum by the word "seating".** That is user-visible harm,
not a data blemish.

### 2. `mixed` was nearly unreachable

Resolution was per sentence, and the indoor-only tier was scanned before the outdoor-only tier, so:

```
mixed    "Our indoor galleries and outdoor courtyard are both open today."
indoor   "Our indoor galleries are open daily. The outdoor courtyard is open in summer."
indoor   "The outdoor courtyard is open in summer. Our indoor galleries are open daily."
```

Reversing the sentences changed nothing. A page documenting both in separate sentences could never
reach the value the product defines for it. Production bears it out: **15 `outdoor`, 6 `indoor`, 2
`mixed`** for a catalogue of London parks, museums and farms.

## The fix

**`venueLevelSetting(sentence)`** removes `(indoor|outdoor|open-air) [modifier]{0,2} <feature noun>`
before testing, so a feature mention says nothing about the setting. Three deliberate bounds:

- The feature-noun list is **closed and corpus-derived**, not open-ended, and matches only as a noun
  after the prefix — so "the venue is outdoors", "an open-air museum" and "play outdoors" still
  establish the venue. `museum` is not a feature noun; `seating`, `gym`, `court` are.
- `open-air` is in the prefix because of Queen's House, whose evidence is "Open-air skating".
- Up to **two** modifiers may sit between prefix and noun, because production puts them there
  ("outdoor **basketball** court", "outdoor **kids'** camp"). The run is capped at two words rather
  than "anything up to the next feature noun": a mutant that widened it read "the whole venue is
  outdoor and there is a cafe" as a cafe mention and masked the only venue-level statement.

**Document-level resolution.** Venue-level indoor anywhere plus venue-level outdoor anywhere is now
`mixed`, and the excerpt names both halves so a reviewer sees the whole verdict. A single sentence
carrying both still wins outright, being the clearest statement available. An indoor venue with outdoor
*seating* stays `indoor` — the outdoor half has to be venue-level too.

## The judgement call, stated plainly

Masking feature wording also removes the **parks'** only evidence. Gladstone Park's is "Outdoor gym
Café", London Fields' is "Lido and lido café Outdoor gym", Mayow Park's is "play area café outdoor
gym" — facilities lists, the same pattern that produced the five wrong claims. Those venues genuinely
are outdoor, so the fix moves ~7 accidentally-correct claims to **`unknown`**.

That is treated as correct, not as a loss. A claim that is right by accident, from evidence that does
not support it, is not a trustworthy fact, and "unknown remains unknown" is the standing rule. The
trade is: remove five actively harmful claims, lose seven accidentally-right values, and let the parks
be re-established by wording that actually states the setting. **An owner who would rather keep the
parks' accidental `outdoor` and suppress only the indoor-category venues should say so — that is the
one point here where two readings are both defensible.**

## Blast radius — and why a full replay is not yet possible

A per-venue replay over the stored text was attempted and ran into something more important.

**Of the 24 venues with an active `environment` claim, 11 have ZERO eligible evidence rows** — among
them 9 of the 15 `outdoor` claims: Burgess Park, Colne Valley, London Fields, Mayow Park, Queen
Elizabeth Olympic Park, Queen's House, Sydenham Hill Wood, Walthamstow Wetlands and The Wallace
Collection. Their rows all carry `subject_scope = NULL`: they predate
`20260926140000_venue_source_evidence_subject_scope.sql` and have never been re-crawled. NULL fails
closed, so **the evidence behind those served claims would not be allowed to establish them today.**

This generalises, and it is the headline finding of this stretch. Across **242 claims currently served
to parents over 74 venues**:

| Evidence behind a served claim | Claims |
|---|---|
| `subject_scope = NULL` (unclassified, fails closed) | **165 (68%)** |
| eligible (`venue_own_subtree` / `venue_named_page`) | 71 (29%) |
| explicitly ineligible scope | 3 |
| no evidence link at all | 3 |

**NULL means unclassified, not false.** These claims are not shown to be wrong, and nothing here is
grounds for bulk invalidation — that is explicitly forbidden, and the rows must not be deleted or
marked false. What it does mean is that the project cannot presently demonstrate that 68% of what
parents see rests on evidence eligible under its own rule.

The remedy is a **non-destructive backfill**: re-classify the stored rows with the same `scopeFor`
logic the pipeline already uses at crawl time, which is idempotent and needs no Google request and no
re-fetch. Only then can a meaningful replay of this change, or of the extraction-quality cohort, be
run — because today a replay over ineligible rows would measure facts that are not being served from
those rows anyway.

So this change lands with: the contract established, both defects fixed, every one of the ten
production excerpts verified against the new classifier, 19 tests, and five killed mutants — but **no
production repair**, and the backfill named as the next prerequisite.
