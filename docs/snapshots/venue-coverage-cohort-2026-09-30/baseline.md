# Cohort baseline, captured before any requeue

Captured 2026-09-30 15:46:24 UTC, read-only, against production `uuolfuebwimrsjfgffsm`.
Merged code is `ea84329`; **this baseline was taken while production still served `ac0f897`**, so it
describes the state the old 5-page crawl left behind. Nothing below has been altered.

## Global

| | |
| --- | --- |
| Active claims | 227 |
| Disputed claims | 7 |
| Served to parents (active, in date, not `ai_auto_approved`) | 226 |
| Evidence rows | 953 |
| Jobs not completed | 0 |
| `last_refresh` | 2026-09-30 |
| Claims digest `md5(id:status)` | `5f1cd5f3d6c6a5f44f62e07201ee903d` |
| Evidence digest `md5(id)` | `2b32bc30f005fe3a435e8c744adb8a06` |

The digests are the check that nothing outside the cohort moves during the run.

## The frozen 18, before

Served = distinct core fields served to parents, of the ten. Eligible scope = evidence rows with
`subject_scope` in (`venue_own_subtree`, `venue_named_page`).

| Category | Venue | Served | Active | Disputed | Evidence rows | Usable URLs | Eligible scope | Null scope |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| activity | Hyde Park Winter Wonderland | 0 | 0 | 0 | 10 | 5 | 0 | 10 |
| activity | Rowans Tenpin Bowl | 0 | 0 | 0 | 5 | 1 | 0 | 5 |
| activity | Thorpe Park | 2 | 2 | 0 | 7 | 4 | 5 | 2 |
| attraction | Churchill War Rooms *(control)* | 0 | 0 | 0 | 5 | 0 | 0 | 5 |
| attraction | London Cable Car | 0 | 0 | 0 | 6 | 2 | 0 | 6 |
| attraction | The Graffiti Tunnel | 0 | 0 | 0 | 8 | 2 | 5 | 3 |
| farm | Belmont Children's Farm | 1 | 1 | 1 | 8 | 3 | 7 | 1 |
| farm | Mudchute Park and Farm | 2 | 2 | 0 | 5 | 5 | 0 | 5 |
| museum | National Portrait Gallery *(control)* | 0 | 0 | 0 | 5 | 0 | 0 | 5 |
| museum | Paradox Museum London | 1 | 1 | 0 | 6 | 1 | 0 | 6 |
| museum | The Courtauld Gallery | 0 | 0 | 0 | 8 | 5 | 5 | 3 |
| park | Crossrail Place Roof Garden | 0 | 0 | 0 | 5 | 5 | 0 | 5 |
| park | Diana Princess of Wales Memorial Playground | 1 | 1 | 0 | 10 | 5 | 0 | 10 |
| park | Hyde Park Corner | 1 | 1 | 0 | 12 | 3 | 5 | 7 |
| soft_play | Babylon Park London | 2 | 2 | 0 | 9 | 1 | 5 | 4 |
| soft_play | Flip Out Brent Cross | 2 | 2 | 0 | 8 | 2 | 0 | 8 |
| zoo | Golders Hill Park Zoo | 0 | 0 | 0 | 9 | 3 | 0 | 9 |
| zoo | Hanwell Zoo | 0 | 0 | 0 | 5 | 5 | 0 | 5 |
| **cohort** | | **12** | **12** | **1** | **141** | **52** | **32** | **109** |

## What stands out before the run

**10 of 18 venues serve nothing at all**, and the cohort holds 12 served core fields across 18 venues
out of a possible 180. That is the number the run has to move.

**109 of 141 evidence rows carry a null `subject_scope`** — rows stored before the provenance column
existed. They are withheld from publication by design and recover only when the crawl refetches the URL,
which the requeue will do (the automation path forces a refresh and records a scope on every page). So
part of any gain will come from provenance being recorded at last, not from new pages; the funnel
separates the two.

Two venues already show the pattern the change targets: **Crossrail Place Roof Garden and Hanwell Zoo
each have 5 usable pages and serve nothing**, so more pages alone will not help them — if they stay at
zero, the problem is extraction, not discovery.

The two controls have 0 usable URLs and 5 blocked rows each. They should stay at zero.

## Correction, 2026-09-30 18:21 UTC

This file first said **11 of 18 venues serve nothing**. That was my arithmetic error, not a data
change. Counting the Served column of the table above gives ten zero rows (Winter Wonderland, Rowans,
Churchill, Cable Car, Graffiti Tunnel, National Portrait Gallery, Courtauld, Crossrail, Golders Hill,
Hanwell) and eight non-zero rows summing to 12. The corrected figure is **10**, so the second run's
prediction is **10 → 8**, not 11 → 9. The wrong figure also reached `result.md` (corrected there) and
the body of PR #114, which is now immutable merged history; this note is the record.
