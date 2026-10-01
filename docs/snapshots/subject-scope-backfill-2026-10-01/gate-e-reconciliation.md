# Gate E: the candidate claim delta, and the repair

## What resuming the cron would actually have done, which is not what I assumed

Before calculating any delta it was worth establishing how publication is actually triggered, because
the risk I had been bounding ("hundreds of facts auto-publish within the hour") turned out to be
wrong in shape.

`claim_next_venue_enrichment_job()` takes **one** `pending` job per invocation. All 155 jobs were
`completed`, and nothing in the codebase returns a completed job to `pending` except
`refresh_venue_data()` -- the hourly `familypilot-venue-freshness` schedule, which is gated to once
per UTC day and queues **at most 50 venues**. `last_refresh` was already `2026-10-01`, so today's
batch had run and drained by 03:01, which is why an every-minute dispatcher had been returning in six
milliseconds.

So: **resuming the cron at that moment would have published nothing at all.** The delta lands at the
next daily refresh, 50 venues at a time, bounded by design. That is a materially better position than
the one Gate B was protecting against, and it is the reason the staging below could be unhurried.

## The canary: a venue where nothing should change

Horniman Butterfly House: 7 served claims, and all 5 of its evidence rows classified
`other_catalogue_venue`. Per `reconcileSourceClaims` step 3 -- skip when the backing source is NULL or
ineligible -- every one of those claims must be skipped. Predicted delta: nothing.

Queued it alone, invoked the worker with the same `net.http_post` call the cron uses.

| | predicted | actual |
|---|---|---|
| claims changed | 0 | 0 (fingerprint `0f40d88a0c01ac84fd885e5672b9bfc8` before and after) |
| Google Places calls | 0 | **0** (`google_places_usage` stayed empty) |
| job outcome | completed | completed, `processed: 1` |

Two things the canary showed that a prediction would not have:

- The crawl added 10 evidence rows, 7 of them **404s** under the Butterfly House's own path
  (`/visit/displays/butterfly-house/{accessibility,facilities,families,faq,faqs,parking,getting-here}`).
  They classify `venue_own_subtree`, so eligible *rows* appeared -- but with `fetch_status = 'error'`
  and no facts, and `eligibleFact` rejects them. No new claims, correctly. Worth noting separately
  that the crawler speculatively guesses URLs and most of those guesses miss.
- The page carrying 29 facts -- `playground=yes` ×4, `toilets` ×8, `babyChanging` ×10 -- is
  `horniman.ac.uk/plan-your-visit/`, the **Museum's** page. Those are exactly the 7 served claims'
  source. They are now frozen: served to parents, backed by evidence the system says cannot establish
  them, and the pipeline will neither refresh nor withdraw them.

That settles the shape of the repair. **Re-running enrichment is a no-op for claims on ineligible
evidence, by explicit design.** They cannot be fixed by the pipeline; they need withdrawing.

## The delta, reviewed programmatically

65 served claims rest on ineligible evidence across 23 venues (the 62 from this cohort plus 3 on
evidence already scoped before it). Split by whether the fact is independently supportable -- does
*eligible*, cleanly-fetched evidence at the same venue state the same field and value at high
confidence?

- **16 rescuable.** Left alone deliberately. The pipeline republishes these from the proper source on
  its next run, and the new claim supersedes the old. Withdrawing them would have destroyed a true
  fact the system *can* establish.
- **49 unsupportable.** No eligible evidence anywhere at that venue states the fact. Cohort frozen as
  `42d37e4336efee472813f58e15de695a`.

By field: `babyChanging` 9, `freeParking` 8, `playground` 6, `toilets` 6, `accessibleToilet` 5,
`parking` 5, `environment` 4, `wheelchairAccessible` 3, `sensoryFriendlySessions` 2,
`pushchairSuitability` 1. By venue, the largest: Walthamstow Wetlands 8, Horniman Butterfly House 7,
then Madame Tussauds, Sydenham Hill Wood, V&A East Storehouse and the South Kensington V&A at 3 each.

### Why the API and not SQL

`handleClaimStatusChange` does not only set a status. It then calls
`saveMetadata(..., { fromClaims: true })`, which **re-projects `venue_family_metadata` from the
remaining active claims**. A direct `update venue_claims set status='disputed'` would have left that
projection stale and parents would have carried on seeing the withdrawn fact. The endpoint is the only
correct instrument, and checking that before acting is the difference between a repair and a
half-repair. Called via `net.http_post` with the admin token read inside SQL from the vault, so the
token is never printed.

### The withdrawal, staged

**One claim first.** Horniman Butterfly House `familyFacilities.playground=yes`. The API response
carried the excerpt behind it:

> "There are also toilet facilities by the **Kusuma Nature Play Area**, which are accessible and
> include baby changing." -- `horniman.ac.uk/plan-your-visit/`

A play area in the *Museum's gardens*, published as a facility of a butterfly conservatory. That is
the defect this whole workstream exists to catch, stated in the venue's own words.

| | before | after |
|---|---|---|
| claim status | active | disputed |
| `family_facilities` | parking, toilets, **playground**, babyChanging | parking, toilets, babyChanging |
| `facilities` | …, **playground**, … | playground removed |
| `checked_by` | `source_evidence_auto_v2` | `subject-scope-phase6-canary` |
| served / disputed | 242 / 11 | 241 / 12 |

**Then the venue's remaining 6**, all HTTP 200. Horniman Butterfly House ended with all 7 disputed,
`family_facilities = {}` and `facilities = []` -- the correct end state for a venue whose every fact
was read off another venue's page.

**Then the remaining 42**, all HTTP 200.

### Final reconciliation

| | before | after | delta |
|---|---|---|---|
| claims total | 495 | 495 | 0 -- nothing deleted |
| active | 243 | 194 | −49 |
| disputed | 11 | 60 | +49 |
| superseded | 241 | 241 | 0 |
| **served** | **242** | **193** | **−49** |
| served venues | 74 | 68 | −6 |
| Google Places calls | 0 | 0 | **0** |

193 served = 174 on eligible evidence + 16 ineligible-but-supportable + 3 with no
`source_evidence_id` at all (pre-existing, out of scope). **`unsupportable_remaining = 0`**: every
claim that could not be established has been withdrawn, and nothing else was touched.

## Q1, Q2 and Q3, repaired through the pipeline

Five venues re-queued and run through the worker. No manual claim edits; every change is the pipeline
reading the page with the new extractor and reconciling its own claim.

| venue | outcome |
|---|---|
| Belmont Children's Farm (Q1) | `familyFacilities.playground=yes` **disputed** -- the soft-play fix. `environment` went wrong; see below. |
| Flip Out Watford (Q3) | `familyFacilities.parking=yes` **disputed** -- off-site parking guard |
| Nando's (Q3) | `parking=yes`, `freeParking=yes` **and** `environment=outdoor` all **disputed** -- off-site parking plus outdoor-feature masking |
| Whitechapel Gallery (Q3) | `parking=yes` **disputed**; `freeParking=no` correctly retained |
| Rickmansworth Aquadrome (Q2) | unchanged; its news-page `environment=outdoor` was never served and stays unpublished |

Google Places calls for all five: **0**.

## The regression this exposed, and why it is in this record

Belmont's `environment=mixed` was disputed and replaced with `environment=indoor` -- for an outdoor
farm. That is wrong, and it is wrong because of my own earlier change, not because of the data.

Its page reads "Indoor & Outdoor Visitors Farm Soft Play Cafe". `soft play` is a feature noun two
words past "Outdoor", and `FEATURE_PHRASE` allowed two modifiers between a prefix and its noun, so it
matched "Outdoor Visitors Farm Soft Play" and masked the venue's own "Outdoor". Reproduced
deterministically before touching anything: the phrase alone gives `mixed`; appending
" Soft Play Cafe The Farm ..." flips it to `indoor`.

Fixed by forbidding the modifier run from crossing a venue noun, with the four corpus cases the
two-modifier window exists for re-verified, a counterfactual showing 2 of the 4 new tests fail
without the fix, and a committed regression test carrying the real excerpts. Realised production
impact: one claim, Belmont's.

**The cron therefore stays paused** until that fix is on `main` and deployed. Resuming first would let
the next daily batch publish the same error for any venue whose banner has the shape
"Indoor & Outdoor <venue noun> <feature>". The repair order is: deploy, re-run Belmont, verify
`environment=mixed`, then resume.
