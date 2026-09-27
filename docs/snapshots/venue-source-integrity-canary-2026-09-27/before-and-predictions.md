# Young V&A canary — before-state and predictions

One venue, requeued through the real every-minute production worker, to prove the source-integrity
prevention fix (`0f6ce93`, live since 2026-09-27 07:5x UTC) behaves as intended before any repair.

Before-state captured **read-only at 2026-09-27 09:07:13 UTC**, entirely before the job row was
touched. Predictions were written **before** requeueing, so the verification can fail.

## Subject

| field | value |
| --- | --- |
| venue | Young V&A |
| `familypilot_place_id` | `fp-google-ChIJyxOhp9scdkgR3ciFcAfeG1c` |
| `place_records.website` | `https://www.vam.ac.uk/young/` |
| job id | `0ab7388f-a2b2-4a7d-8b6f-fc01d382a021` |
| job before | `status=completed`, `mode=regenerate`, `attempts=1`, `available_at=2026-09-20 12:57:20.585+00`, `locked_at=NULL`, `dispatch_token=NULL`, `completed_at=2026-09-20 12:58:09.510+00`, `last_error=NULL`, created `2026-09-11 19:41:12.434+00` |

## Global counters before

| measure | value |
| --- | --- |
| active claims (all venues) | 224 |
| total claims (all venues) | 387 |
| evidence rows (all venues) | 875 |
| evidence rows with a scope | 0 |
| active `agePolicy.%` claims | 0 |
| non-null `venue_age_policy` | 0 |
| claim `id:status` md5 | `28a1bf4faad3ff74be91696b88e7f6ad` |
| job `id:status:mode` md5 | `d28f80f47f1038b66873a23ff618794e` |
| evidence id md5 | `0f9932be1dbce9ec84b5d43c110a8026` |

## The catalogue on `vam.ac.uk` — why this venue was chosen

| venue | `place_records.website` |
| --- | --- |
| Young V&A | `https://www.vam.ac.uk/young/` |
| Victoria and Albert Museum | `https://www.vam.ac.uk/south-kensington` |
| V&A East Storehouse | `https://www.vam.ac.uk/east/storehouse/visit` |
| *V&A Wedgwood Collection* | **not in the catalogue** |

Three catalogue venues on one host, plus a fourth sibling that is not a catalogue venue. That
exercises the hard reject, the withhold, and the legitimate accept in a single run.

## Young V&A's 6 active claims before (all `source_evidence_auto_v2`, `valid_until 2026-10-20`)

| claim id | field | value | source_url | evidence id | predicted scope |
| --- | --- | --- | --- | --- | --- |
| `91013d5a-2582-45f1-9fa0-1533b8f640c9` | familyFacilities.babyChanging | yes | `/young/visit` | `482ab2d3…` | **venue_own_subtree — eligible** |
| `e1cd19d8-c128-4672-927e-fdc872f96fb3` | familyFacilities.parking | yes | `/young/visit` | `482ab2d3…` | **venue_own_subtree — eligible** |
| `c5aabddd-7311-40c8-9286-7476134738fb` | accessibility.accessibleToilet | yes | `/south-kensington/visit` | `db68ef7c…` | **other_catalogue_venue — reject before fetch** |
| `2b26a0aa-fc82-48eb-8356-8c76a2564616` | accessibility.wheelchairAccessible | yes | `/east/storehouse/visit` | `66085031…` | **other_catalogue_venue — reject before fetch** |
| `d185a8a0-cb65-478e-a9ef-a5b961b2f5c5` | pushchairSuitability | good | `/east/storehouse/visit` | `66085031…` | **other_catalogue_venue — reject before fetch** |
| `ab9967e4-1b81-41fd-9b5d-a64fe76076f2` | familyFacilities.toilets | yes | `/wedgwood/visit` | `82f27cd2…` | **sibling_unverified — fetched, withheld** |

Twelve further claims are `superseded` (ids `b8e1aace…`, `d1857f1a…`, `3272cd26…`, `7f17681a…`,
`2cb5c31b…`, `702cf861…`, `9f960f09…`, `5ee8c75e…`, `8b926065…`, `c7b6a547…`, `5927338c…`,
`3510b8d4…`). None should move.

## Young V&A's 9 evidence rows before — every one `subject_scope = NULL`

`66085031…` `/east/storehouse/visit` · `82f27cd2…` `/wedgwood/visit` · `db68ef7c…`
`/south-kensington/visit` · `482ab2d3…` `/young/visit` · `af97f725…` `/young/` (all retrieved
2026-09-20 12:58) and the 2026-09-11 generation `a1c01c88…`, `57cd1d2b…`, `6569ded8…`, `03c06fe8…`.

Page titles already name the right venue on every row — `Visit V&A Wedgwood Collection`,
`Visit V&A South Kensington`, `Visit V&A East Storehouse` — which is the signal nothing ever read.

## Consumer-visible metadata before

`enrichment_status=enriched`, `family_facilities={parking:yes, toilets:yes, babyChanging:yes}`,
`accessibility={accessibleToilet:yes, wheelchairAccessible:yes}`, `send_info={}`,
`pushchair_suitability=good`, `environment=NULL`, `venue_age_policy=NULL`, `best_ages=NULL`,
`checked_by=source_evidence_auto_v2`, `updated_at=2026-09-20 12:58:09.114+00`.

## Predictions

Written before the write. Any miss is a finding, not a detail to reconcile afterwards.

1. **Only Young V&A is processed.** No other venue's job, claims or evidence change.
2. `/young/` and `/young/visit` are refetched and their rows carry
   `subject_scope='venue_own_subtree'`. The automation path passes `sourceOnly: true`, so
   `forceRefresh` is on and the cache is bypassed — every page it touches is genuinely refetched.
3. `/south-kensington/visit` and `/east/storehouse/visit` are **rejected at discovery** and never
   fetched, appearing in `diagnostics.linksRejectedAsOtherVenue`. **No new evidence row** for
   either, and their existing rows keep `subject_scope = NULL`, untouched.
4. `/wedgwood/visit`, if still linked and selected, **is** fetched and stored with
   `subject_scope='sibling_unverified'` — retained and recorded, not deleted, not marked false, and
   not eligible to support a claim.
5. **No claim is disputed.** `reconcileSourceClaims` only considers a claim whose `source_url` is in
   this run's bundle with `retrievedAt >= checkedAt` (`auto-approve.js:77`). The two rejected pages
   are absent from the bundle, so those three claims are skipped outright — the same principle as
   "a failed fetch cannot establish absence", extended to a page never fetched. The Wedgwood claim
   is also safe: reconciliation runs with `enforceSubjectScope: false`, so its fact still counts.
6. `babyChanging` and `parking` may be **superseded and replaced** by fresh claims from
   `/young/visit`, since auto-approve is live (220 of 224 active claims are
   `source_evidence_auto_v2`). That keeps the active count the same and creates two new claim ids.
7. **Global active claims stay 224**, `agePolicy` stays 0, `venue_age_policy` stays 0.
8. **Consumer metadata keeps all six facts.** `approveDraft` calls
   `saveMetadata(..., {fromClaims: true})`, and the four non-eligible claims remain active, so the
   projection should not narrow. Only `updated_at` moves.

The sharpest test is 3 + 5 together: the contaminated sources stop being re-confirmed, while nothing
already published is withdrawn. Prevention live, repair still gated.
