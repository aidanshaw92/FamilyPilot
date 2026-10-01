# Contaminated extraction cohort: diagnosis and first canary

Continues `docs/snapshots/extraction-quality-2026-10-01/audit.md`, which fixed the extractor, repaired
three venues, and deliberately left the wider rollout to be decided from post-fix evidence.

## Read-only diagnosis

**Cohort frozen 2026-10-01T16:10:08Z.** Row fingerprint `a024378089da607fb3377ffaf1037f14`,
served-claim fingerprint `a5b73df0060c666423f25449a3caee57`.

The contamination predicate was rebuilt in SQL (the audit's was ad-hoc) and validated against real
text before being trusted, because a false-positive-driven re-crawl is worse than none:

| class | signal, confirmed in production | rows |
|---|---|---|
| CSS | Belmont's `--grid-gutter: calc(var(--sqs-mobile-site-gutter...` ; Sydenham Hill's `.st0{fill-rule:evenodd...}` SVG stylesheet | 110 |
| JSON | ASK Italian's `{"@context":"https://schema.org","@type":"Restaurant"` ; V&A East Storehouse's schema.org `Museum` payload | 64 |
| JS | RAF Museum and Frameless Astro bundles, `e.addEventListener("astro:hydrate"...)` | 96 |
| **any** | | **214** |

Totals line up with the audit's independent measurement (214 rows vs 197; contaminated rows average
5,649 characters against 3,707 clean, versus the audit's 5,658 and 3,798), which is the main reason to
believe the two are measuring the same phenomenon.

**The decisive number: of rows re-crawled since the fix went live, ZERO are contaminated.** All 214
predate 02:00 today. The fix works; the remainder are simply URLs the crawl has not revisited.

### Two findings that reshaped the plan

**1. No served claim carries junk provenance any more.** Of 189 served claims, 186 have an excerpt and
not one contains a brace, a `"@` key, an arrow or a CSS custom property. The audit's three cases were
repaired and nothing regressed. So the remaining value is not "clean up what parents see" -- it is
**crowding-out recovery**, because contaminated rows crowd real prose out of the 8,000-character
budget.

**2. Only half the cohort can affect anything.** 119 of 214 dirty rows sit on eligible scope; the other
95 are `sibling_unverified`, `other_catalogue_venue` or `organisation_ancestor`, where subject scope
fails closed and a repair cannot publish or withdraw a thing. Re-crawling all 50 venues would spend
real work on rows that cannot matter.

That gives a priority cohort rather than a blanket rollout: **dirty AND at the 8,000-character cap
(so displacement is proven) AND on eligible scope** -- 24 rows across 14 venues, carrying 47 served
claims.

| venue | class | rows at cap | served |
|---|---|---|---|
| Horniman Museum and Gardens | CSS | 4 | 6 |
| Belmont Children's Farm | CSS | 4 | 1 |
| The Graffiti Tunnel | CSS+JSON | 3 | 1 |
| Woodside Animal Farm | JS | 2 | 8 |
| Beckenham Place Park | CSS | 2 | 4 |
| Young V&A | JSON+JS | 1 | 5 |
| Sydenham Hill Wood | CSS | 1 | 4 |
| Golders Hill Park | JSON | 1 | 3 |
| The National Gallery | CSS+JS | 1 | 3 |
| Victoria and Albert Museum | JSON | 1 | 3 |
| William Morris Gallery | CSS | 1 | 3 |
| ASK Italian | CSS+JSON | 1 | 2 |
| Saatchi Gallery | JS | 1 | 2 |
| V&A East Storehouse | JSON | 1 | 2 |

## Canary: three venues, one per class

Chosen to cover CSS, JS and JSON **and** to put real preservation risk on the table -- 16 served
claims between them -- rather than three quiet venues.

**Predicted Google Places calls: 0** for all three (every place row fetched inside the 14-day
freshness window, so `ensurePlaceDetails` returns early). **Actual: 0.**

| | predicted | actual |
|---|---|---|
| jobs completing first attempt | 3 | 3 |
| newly fetched rows contaminated | 0 | **0 of 17** |
| Google Places calls | 0 | **0** |
| Woodside `environment=indoor` | disputed | **disputed** |
| V&A claims re-pointed to own page | yes | **yes** |
| Horniman's four well-evidenced claims | preserved | preserved |

Stored length on refreshed rows: Woodside 4,614 → 2,343 (−49%), V&A East Storehouse 7,693 → 4,752
(−38%), Horniman 7,807 → 7,480 (−4%).

### A third class of junk provenance, not in the original audit

**V&A East Storehouse's two served claims were backed by `vam.ac.uk/east/museum/visit`** -- scope
`sibling_unverified`, a different V&A East building. The Gate E sweep had spared them precisely because
they were among the 16 "rescuable": the venue's own page states the same facts, so the values were true
and only the pointer was wrong. The re-crawl moved both onto `vam.ac.uk/east/storehouse/visit`
(`venue_own_subtree`). Sibling provenance is a third contamination class alongside CSS, JSON and JS,
and it is the one that actually misleads an auditor.

### Horniman: a latent defect the canary surfaced, and Woodside: one it cleared

Woodside's `environment=indoor` came from "the heated **indoor soft play centre** and cafe" -- a Q2 case
published before the feature mask shipped, which reconciliation could not touch until the page was
re-fetched. The canary re-fetched it and the claim was disputed. That is the cohort repair doing
exactly what it is for.

Horniman went the other way and that is covered in `regression.md`.

### Still wrong at Horniman, recorded not fixed

`familyFacilities.parking = yes` cites **"Buggy parking is available in Gallery Square."** Buggy
storage is not car parking, and `match-explanations` renders this value to a parent as "Parking
confirmed on site". The off-site parking guard does not cover it, because the parking is on site -- it
is simply not for cars. A separate evidence-driven rule, not a reopening of Q3.

`familyFacilities.playground = yes` rests on a sentence about the cafe being next to the Kusuma Nature
Play Area. The play area is the Horniman's own, so the value is right and the provenance is oblique.

---

# Widen, and the result

Deployment `dpl_C3pcUx38TT9RJWdtnpkbSvQwzuUR` confirmed READY on `9e53d033` (the masked-verdict fix)
before the queue was touched. Horniman was then re-run to repair the false `environment = mixed` the
canary had introduced: **disputed**, its other six claims preserved. Then the remaining 11 priority
venues, 17 rows at cap, 31 served claims.

**Predicted Google Places calls: 0. Actual: 0.**

## Priority cohort: cleared

Measured on the **newest row per (venue, url)**, which is what `getCachedEvidence` actually serves --
the earlier 214 counted superseded history and was not a progress metric at all:

| | before | after |
|---|---|---|
| priority rows (dirty + at 8,000-char cap + eligible scope) | 24 | **0** |
| priority venues | 14 | **0** |
| dirty newest rows, all classes | 93 | 93 |
| of those, eligible but below the cap | 44 | 44 |
| of those, ineligible scope | 49 | 49 |

Nothing below the cap or on ineligible scope was touched, deliberately. Displacement is unproven
below the cap, and on ineligible scope subject scope fails closed so a repair cannot publish or
withdraw anything. Those 93 clear on their own through the daily 50-venue refresh.

## Preservation: 9 of 11 venues at delta zero

| venue | served before | after | delta |
|---|---|---|---|
| ASK Italian | 2 | 1 | **−1** |
| Beckenham Place Park | 4 | 5 | **+1** |
| Belmont Children's Farm, Golders Hill Park, Saatchi Gallery, Sydenham Hill Wood, The Graffiti Tunnel, The National Gallery, Victoria and Albert Museum, William Morris Gallery, Young V&A | | | 0 |

Both movements are correct, and both were the point of the exercise.

**ASK Italian lost `environment = outdoor`.** Its excerpt was an uppercase facility list:
"Facilities ACCESSIBILITY BABY CHANGING **OUTDOOR SEATING** Contact Address 23-24 Gloucest..." -- a
restaurant classified as an outdoor venue because its facilities list mentions outdoor seating. The
same shape as the Nando's JSON-LD case in the original audit, and the deployed feature mask now
suppresses it. The claim had been published off the JSON-LD-contaminated capture; the clean
re-extraction does not yield it.

**Beckenham Place Park gained `familyFacilities.cafe = yes`**, from its own page: "Businesses in the
park The Homestead Café ... is located in the Homestead courtyard." `venue_own_subtree`,
`fetch_status = ok`. A fact that CSS had been crowding out of the 8,000-character budget -- which is
precisely the benefit this workstream was predicted to deliver, and the only one it actually produced.

## Whole-workstream claim arithmetic

```
  189 served at the start
-   1 Woodside   environment=indoor   ("the heated indoor soft play centre")   latent Q2, cleared
-   1 ASK Italian environment=outdoor ("OUTDOOR SEATING" facility list)        latent Q2, cleared
+   1 Horniman   environment=mixed    introduced by the canary, then withdrawn
-   1 Horniman   environment=mixed    withdrawn after the fix deployed
+   1 Beckenham  cafe=yes             crowding-out recovery
= 188 served     ... 188 actual
```

Plus two claims **re-pointed**, not counted above because the value did not change: V&A East
Storehouse's `wheelchairAccessible` and `pushchairSuitability` moved off
`vam.ac.uk/east/museum/visit` (`sibling_unverified`, a different V&A East building) onto the venue's
own `/east/storehouse/visit`.

## Findings recorded, not acted on

**Horniman `familyFacilities.parking = yes` still cites "Buggy parking is available in Gallery
Square."** Buggy storage is not car parking, and the UI renders the value as "Parking confirmed on
site". The off-site guard cannot catch it because the parking *is* on site -- it is simply not for
cars. Needs its own evidence-driven rule.

**Navigation chrome is a fourth residue class.** Beckenham's `playground = yes` is true but its
excerpt is a menu dump: "Playgrounds - Cycle Routes - Walking - Nature trails - BMX Skate Park -
Swimming Lake - Parkrun - Venue Hire". The audit saw the same family in Golders Hill Park, whose
stored text was its own breadcrumb repeated to the cap. Neither CSS, JSON nor JS catches it, and a
nav menu naming every facility in a borough is a provenance that cannot distinguish one venue's
playground from the next page's.

**Clean pages can still sit at the cap.** Four of Horniman's six refreshed rows are at 8,000
characters with no contamination at all, which is why its average length fell only 4% against
Woodside's 49%. Crowding-out from sheer page length is a different problem from residue, and this
workstream does not address it.
