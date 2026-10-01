# Gates B, C and D: pausing the publisher, the canary, and the backfill

## Gate B: the publisher paused, and the pre-state

`familypilot-automatic-enrichment` (jobid 2, `* * * * *`) set `active = false` at 2026-10-01T15:10Z;
last dispatch 15:10:00. Confirmed `active = false` by re-reading `cron.job`. The other two schedules
were left running deliberately: `familypilot-automatic-area-sync` (`0 3 * * 1,4`) next fires Monday,
and `familypilot-venue-freshness` (`17 * * * *`) is gated once per UTC day and `last_refresh` is
already `2026-10-01`, so neither could act during this window.

**Nothing was in flight.** `venue_enrichment_jobs`: 155 rows, every one `completed`, latest
2026-10-01T03:01:03Z. The queue has been drained since 03:01, which is why an every-minute dispatcher
had been returning in six milliseconds.

Pre-state, 2026-10-01T15:10:42Z:

| | |
|---|---|
| claims total | 495 |
| active | 243 |
| disputed | 11 |
| superseded | 241 |
| **served** | **242** |
| served fingerprint | `8321e7c4c4b8ba519553cf92ae25300b` |
| evidence rows | 1203 (763 NULL scope) |
| `private.venue_data_settings.last_refresh` | 2026-10-01 |

Two observations from capturing this, neither of them new problems:

- **`approved_by <> 'ai_auto_approved'` currently excludes nothing.** No claim carries that actor;
  239 of the 243 active claims are `source_evidence_auto_v2` and 4 are `enrichment-editor`. So
  "served" is, in today's data, simply every active in-date claim, and 239 of 242 came from the
  automatic pipeline. This is not a discovery: `approval-actors.js` already documents the rule as
  "a denylist of one" and replaced it with a positive `human:` namespace test for the one fact that
  can remove a venue. It raises the care level for Gate E rather than lowering it.
- **One active claim is already past its expiry**: Headstone Manor `pushchairSuitability = unknown`,
  `confidence = unknown`, `valid_until` 2026-09-10, approved by `enrichment-editor`. The
  `valid_until >= current_date` filter keeps it away from parents, so it is not a live defect, and it
  is outside this workstream. Recorded, not fixed.

## Gate C: the canary

17 venues, 96 distinct (venue, url) pairs, **134 of 763 rows (17.6%)**, chosen to cover every class
that would be written and every multi-venue host family in the cohort:

| host family | venues in canary |
|---|---|
| museum group | Horniman Museum + Horniman Butterfly House; Cutty Sark + National Maritime Museum + Queen's House (`rmg.co.uk`); V&A South Kensington + Young V&A + V&A East Storehouse; Tate Britain + Tate Modern; Churchill War Rooms (under `iwm.org.uk`) |
| council | Burgess Park + Southwark Park (`southwark.gov.uk`) |
| wildlife directory | Sydenham Hill Wood + Walthamstow Wetlands (`wildlondon.org.uk`) |
| royal parks | The Green Park |
| host mismatch | Crystal Palace Park |

**Predicted before the write**, then compared after:

| | predicted | actual |
|---|---|---|
| rows updated | 134 | 134 |
| `venue_own_subtree/under_own_website` | 35 | 35 |
| `sibling_unverified/same_host_no_established_relationship` | 58 | 58 |
| `other_catalogue_venue/under_another_catalogue_venue` | 27 | 27 |
| `venue_named_page/named_in_url_and_title` | 6 | 6 |
| `sibling_unverified/different_host` | 5 | 5 |
| `organisation_ancestor/ancestor_of_own_website` | 3 | 3 |
| eligible / ineligible | 41 / 93 | 41 / 93 |
| row-set fingerprint | `273420e3e43a21495ca50a001af254ca` | `273420e3e43a21495ca50a001af254ca` |

The fingerprint is the part that matters: the `RETURNING` set of the UPDATE hashes to exactly the row
set predicted for it, so the write touched those rows and no others.

**Blast radius after the canary:** 629 rows still NULL (763 − 134). Claims completely unchanged --
495 / 243 / 11 / 241 / 242, served fingerprint still `8321e7c4c4b8ba519553cf92ae25300b`. Nothing was
published, disputed or superseded. Cron still paused, no jobs pending.

### The strongest check available, and it was not planned

Production had already classified 440 evidence rows itself, at crawl time, through the live pipeline.
**49 distinct (venue, url) pairs appear in both that set and this cohort** -- the same page stored
twice, once before the migration and once after. Those 49 are a free equivalence test against
production's own output, chosen by the data rather than by me:

**49 of 49 agree. 0 disagree.**

That is what licences the rest of the write: the harness is not merely running the repository's
classifier, it demonstrably reproduces what production's classifier produced on every pair where both
have an opinion.

## Gate D: the remaining 629 rows

Written with the `subject_scope is null` guard retained, so a row classified concurrently could not be
overwritten. Final state: **`subject_scope is null` = 0 of 1203**.

Reconciliation against the Gate A dry run, exact in every class:

| class | already scoped before | Gate C | Gate D | my total | dry run said | final in table |
|---|---|---|---|---|---|---|
| `venue_own_subtree/under_own_website` | 375 | 35 | 328 | 363 | 363 | 738 |
| `sibling_unverified/same_host…` | 53 | 58 | 240 | 298 | 298 | 351 |
| `other_catalogue_venue/…` | 1 | 27 | 31 | 58 | 58 | 59 |
| `organisation_ancestor/…` | 6 | 3 | 21 | 24 | 24 | 30 |
| `venue_named_page/…` | 2 | 6 | 9 | 15 | 15 | 17 |
| `sibling_unverified/different_host` | 2 | 5 | 0 | 5 | 5 | 7 |
| `sibling_unverified/names_more_than_one…` | 1 | 0 | 0 | 0 | 0 | 1 |
| **total** | **440** | **134** | **629** | **763** | **763** | **1203** |

**Concurrent skips: 0**, as expected with the publisher paused -- so the whole frozen cohort was
written, and the figure needs no "plus legitimate skips" caveat.

**Claims after Gate D: 495 / 243 / 11 / 241 / 242, served fingerprint
`8321e7c4c4b8ba519553cf92ae25300b`** -- byte-identical to the Gate B pre-state. Filling 763
classifications changed no claim at all, which is the behaviour Gate A predicted and the reason the
publication side is a separate gate.

## One mechanical detail worth keeping

The positional channel used to carry 611 verdicts into SQL without shipping 60KB of literals was
first keyed on a dense venue index. After Gate C that broke: the index is derived from the venues
that still have NULL rows, and the canary removed 17 of them, so Postgres renumbered and the
alignment checksum failed -- loudly, before any write. Re-keying on the full `familypilot_place_id`
made it stable for any subset. The lesson is small and general: a positional channel must be keyed on
something that does not move when the population changes.

`updated_at` was deliberately not touched, because the committed script does not touch it either --
it sets `subject_scope` and `subject_scope_reason` and nothing else. Confirmed: 0 rows have an
`updated_at` after the write began.
