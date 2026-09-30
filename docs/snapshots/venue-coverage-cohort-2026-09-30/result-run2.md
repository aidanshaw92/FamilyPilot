# Frozen-18 cohort, second run — 2026-09-30 18:22 to 18:40 UTC

Deployed code: `1d0f4d2` (PR #114 squash). Vercel deployment `dpl_6NAShMBfy4j7MG6Z4sw52W5kJN52`, READY on
that commit before the requeue. Before-snapshot taken at 18:21:13, requeue at 18:22, last job completed
18:40:20. All 18 jobs `completed`, `attempts = 1`, zero failures, queue drained to 0.

## The prediction held exactly

| | Before | After | Predicted |
| --- | --- | --- | --- |
| Cohort core fields served (of 180) | 12 | **16** | 16 |
| Venues serving nothing | 10 | **8** | 8 |
| Cohort active claims | 12 | 16 | |
| Cohort disputed | 1 | 1 | |
| Claims lost to eligible-source conflict | | **0** | |

Per field, all ten. Nothing decreased.

| Field | Before | After |
| --- | --- | --- |
| `familyFacilities.babyChanging` | 1 | 1 |
| `familyFacilities.toilets` | 0 | 0 |
| `familyFacilities.parking` | 3 | **4** |
| `familyFacilities.freeParking` | 1 | 1 |
| `accessibility.accessibleToilet` | 0 | 0 |
| `accessibility.wheelchairAccessible` | 2 | 2 |
| `pushchairSuitability` | 1 | 1 |
| `environment` | 2 | **3** |
| `familyFacilities.cafe` | 0 | **2** |
| `familyFacilities.playground` | 2 | 2 |
| **total** | **12** | **16** |

The four gains are the four that were predicted, in the predicted fields and from the predicted
mechanisms. No unpredicted venue gained or lost anything.

| Venue | Field | Value | Mechanism | Matched text |
| --- | --- | --- | --- | --- |
| The Courtauld Gallery | `familyFacilities.cafe` | yes | new pattern `caf[eé] is (located\|situated) (on\|in\|at\|within)` | "the Courtauld Café all-day restaurant and café **is located on** the ground floor across from the gallery entrance" |
| Mudchute Park and Farm | `familyFacilities.cafe` | yes | new pattern `the caf[eé] is dog[\s-]friendly` | "**The cafe is dog friendly** so they are allowed in the courtyard and in the pets corner" |
| The Graffiti Tunnel | `familyFacilities.parking` | no | new negative `(car )?parking is not (allowed\|permitted)` | "Please note, **car parking is not allowed** at Leake Street Arches" |
| Flip Out Brent Cross | `environment` | indoor | page-title propagation fix | "North London's Ultimate **Indoor** Trampoline & Adventure Park" |

Each matched sentence was checked against the five café patterns individually rather than inferred from
the claim: the Courtauld fired pattern 4 only, Mudchute pattern 5 only. Neither fired the three broader
patterns, and neither came from the over-broad `the cafe is <any word>` rule that was removed. The
Courtauld's café is inside its own building and Mudchute's is in its own courtyard, so neither is the
nearby-café failure mode.

Both controls stayed at zero, as expected: Churchill War Rooms 0 → 0 and National Portrait Gallery
0 → 0, both still with zero readable pages.

## Blast radius

Nothing outside the cohort moved.

| Check | Value |
| --- | --- |
| Claims touched outside the cohort | **0** |
| Evidence rows touched outside the cohort | **0** |
| Non-cohort jobs run in the window | **0** |
| `private.venue_data_settings.last_refresh` | `2026-09-30`, unchanged |
| Global active claims | 231 → 235 (+4) |
| Global disputed | 7 → 7 |
| Global evidence rows | 1072 → 1076 (+4) |

The +4 global active is exactly the cohort's +4, and all four new evidence rows are Crossrail's. The
global digests `28bc1abf…` / `3c2f9bba…` did move, to `7f0d652c7f92b47cff065a40e35e8e4b` and
`257017827975fdbcd0dbe51ab5a23591`; that is expected, because 16 cohort claims were superseded and
recreated and 4 evidence rows were added. The digests cannot by themselves show *where* the change
landed, so the four zero rows above are the actual proof, not the digests.

## Crossrail Place Roof Garden: the empty-shell accounting did change its crawl

This was the specific question. Answer: yes, for Crossrail, and measurably.

Its 14 evidence rows by `created_at`:

- 5 created 2026-09-11 — homepage plus four sitewide `canarywharf.com/*` paths
- 5 created 2026-09-30 16:04 (first cohort run) — `accessibility`, `facilities`, `family`, `families`, `faq`
- 4 created 2026-09-30 18:34 (this run) — `faqs`, `parking`, `getting-here`, `access`

This run touched exactly **10** rows: the homepage, the five from the first run, and the four new ones.
The four sitewide `canarywharf.com/*` rows were not revisited, consistent with the field-first
`PATH_PRIORITY` ordering putting them outside the attempt window.

Ten attempts is `MAX_FETCH_ATTEMPTS = max(10, USABLE_PAGE_TARGET)` = 10. Crossrail stopped on the
**attempt ceiling**, not on the usable-page target, because every one of its pages is an empty shell and
`usablePageCount` never left 0. Under the old structural rule those same `ok` pages counted as usable,
so the loop would have stopped at 6. That is the behaviour change, and the four newly discovered URLs
are its visible effect.

One honest limit on this measurement: the first run's attempt count is **not recoverable**. Those rows
were re-fetched at 18:34, so `updated_at` now reads 18:34 for them, and the evidence table keeps no
per-fetch history. The 6-attempt figure for the first run is a derivation from the code plus
`created_at`, not something measured. What is measured: 10 rows touched this run, 4 URLs newly
discovered, and **0 rows with readable text, ever, across all 14**.

Crossrail therefore still serves nothing, and that is correct fail-closed behaviour rather than a miss.
The site is client-rendered: all 14 rows have `fetch_status = 'ok'`, `extracted_text` empty,
`page_title` null. No crawl change can fix it; only rendering can.

**The accounting change is Crossrail-only, as predicted.** Belmont Children's Farm has 6 readable rows
and 0 shells, of which **4 contain CSS custom-property syntax** — they pass the evidence-bearing rule as
readable body, because they genuinely carry text, it is just stylesheet text. So the empty-shell rule
did not touch nine of the ten class-4 content-extraction-failure rows. Belmont's published
`environment = mixed` cites, verbatim, `ment-wrapper } Indoor & Outdoor Visitors Farm { --stroke-style`.
The value happens to be right; the provenance shown to a reviewer is CSS.

## Three pre-existing publication defects this run exposed

None of these is caused by PR #114 and none is a regression. All three were already being served before
the requeue, and this run re-affirmed them by superseding and recreating the claims. They are recorded
here because the success metric is trustworthy parent-facing facts, not the count.

**1. Paradox Museum London serves `pushchairSuitability = good` while its own page says prams cannot go
in.** The source page states it twice: "the space is **not accessible for prams/strollers**. The museum
space is **inaccessible for prams/strollers** but pram storage is available at the entrance."

Two independent root causes in `pushchair-evidence.js`:

- `EXCELLENT_PATTERNS` contains `/\bstep.?free\b/i`, which matches the phrase "A few exhibits are **not
  step-free**". Negation is not handled, so an explicit negative counts as a positive signal. This is
  the same class of defect as the café regex caught in review on #114.
- No `DIFFICULT_PATTERNS` entry matches "not accessible for prams/strollers" or "inaccessible for
  prams". The list requires wording like "prams not" or "not suitable"; "not accessible for prams"
  slips through. So the count is excellent ≥ 1, difficult 0, and the verdict lands on `good`.

Production blast radius, measured across all eight venues serving this field: **one venue**. Paradox is
the only one whose verdict its own source contradicts. Woodside Animal Farm also has explicit denial
text but publishes `difficult`, which is the cautious end.

**2. Thorpe Park serves both `parking = yes` and `freeParking = yes`, and its own page prices parking at
£12.** `freeParking` matched "Free parking" inside a hotel short-break bundle on the homepage: "An
overnight stay with 2 day theme park entry, including Fright Nights Buffet breakfast **Free parking**
Wi-Fi." That is a package perk, not day-visitor parking. The venue's own directions page says "Car
Parking tickets are £12, with Priority Parking available for £20." No conflict was raised because the
`freeParking` negatives are `paid parking`, `pay and display`, `parking charges`, `parking fee` — none
of which matches "Parking tickets are £12".

**3. Babylon Park London serves `familyFacilities.playground = yes` from marketing metaphor**: "rack up
high scores in an **epic arcade playground**!" That is an arcade, not a playground.

## A fourth issue, in diagnostics rather than data

`evidence_excerpt` is not reliably the sentence that matched. The Courtauld's café claim stores
"Courtauld Cafe Striking, stylish, yet re…" while the rule actually fired on "café **is located on** the
ground floor" further down the page. Thorpe Park's excerpt did contain its trigger. So excerpt anchoring
is inconsistent, which makes claims harder to audit — it is what made three sound claims look suspect
on first reading here.

Separately, crawl diagnostics are **not persisted at all**: `evidence-pipeline.js` builds
`fetchAttempts`, `usablePageCount`, `emptyShells`, `candidatesRemaining` and `stopReason` and returns
them in the bundle, but `draft-store.js` stores only `pagesChecked`, `cacheHits` and `sourceStatus`.
Every counter in the Crossrail section above had to be reconstructed from `created_at` / `updated_at`
on the evidence rows. That is why the first run's attempt count is unrecoverable.

## Verdict against the decision rule

The rule was: parent-facing coverage materially increases → roll the discovery improvement outward;
pages increase but served facts barely move → stop increasing crawl volume and diagnose extraction.

Coverage increased by the predicted amount, from the predicted mechanisms, with zero collateral
movement and both controls holding. The three evidence-backed extraction patterns and the title
propagation fix each did exactly what the corpus said they would.

But the cohort's ceiling is still extraction, not discovery. Crossrail proves crawling harder cannot
help a client-rendered site, and Belmont proves a page can pass the evidence-bearing rule on stylesheet
text. And the three defects above say the next risk is no longer missing facts but wrong ones.
