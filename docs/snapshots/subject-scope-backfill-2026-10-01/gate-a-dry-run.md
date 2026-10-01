# Gate A: subject_scope backfill dry run

**Frozen cohort fingerprint:** `6c72504d2264b9656e3f6e217f999bb0`
(`md5(string_agg(id::text, ',' order by id))` over `venue_source_evidence where subject_scope is null`)
**Frozen at:** 2026-10-01T15:06:51Z · **Rows:** 763 · **Oldest:** 2026-08-08T14:40:35Z ·
**Newest:** 2026-09-27T00:42:07Z

Nothing has been crawled since `20260926140000_venue_source_evidence_subject_scope.sql` landed, which
is why the cohort is closed rather than growing: every row predates the column.

## How this was run, and why not with the committed script

`scripts/backfill-subject-scope.mjs` needs `SUPABASE_URL` and a service-role key. Neither exists in
this sandbox and no `.env` is present, so the script could not run here. Reading the service-role key
out of Vercel to make it run would have meant handling a production secret for no gain, since
read-only SQL access was already available.

So the inputs were read out of production read-only and fed to the repository's **own**
`classifySubjectScope` from `server/enrichment/_lib/source-identity.js` -- not a reimplementation of
it. Every input was checksummed server-side and compared against the local copy before use, because a
transcription error would have produced a plausible-looking wrong answer:

| input | rows | md5 (server, `collate "C"`) | local md5 |
|---|---|---|---|
| `place_records` (id, name, website) | 155 | `e82a775df1a864e37913f3ff1ddf2dda` | match |
| venue legend (distinct cohort venues) | 121 | `41fdd91ba530cfdd71d63d87a3f55cf4` | match |
| distinct (venue, url) pairs, batch 1 | 324 | `fca1bf06d774d892c5de248f4fe9b814` | match |
| distinct (venue, url) pairs, batch 2 | 287 | `6a5ed2adc7e2f50a2d0c21690a0a01af` | match |
| global pair ordering (positional channel) | 611 | `235554a29eaebb9559938ee42accdb37` | match |

The first comparison failed and the reason is worth keeping: Postgres ordered by its default
collation and JavaScript by UTF-16 code unit. Re-running the aggregate with `collate "C"` matched
exactly. A checksum is only a checksum if both sides agree what order means.

Page titles were pulled for the 11 pairs whose verdict could still change once a title was known.
That subset is exact rather than a sample: the title is read in one branch only, and that branch is
unreachable unless the URL already names the venue, so a null-title run is final for all other rows.
A separate count confirmed only 2 of 613 distinct (venue, url, title) tuples differ by title alone,
and neither is in the title-sensitive set.

## Classification distribution

611 distinct (venue, url) pairs; 763 rows; 121 venues. `unknownVenue` 0, `unclassifiable` 0.

| scope | rows | pairs | eligible? |
|---|---|---|---|
| `venue_own_subtree` | 363 | 291 | yes |
| `venue_named_page` | 15 | 11 | yes |
| `sibling_unverified` | 303 | 259 | no |
| `other_catalogue_venue` | 58 | 36 | no |
| `organisation_ancestor` | 24 | 14 | no |

By reason: `under_own_website` 363, `same_host_no_established_relationship` 298,
`under_another_catalogue_venue` 58, `ancestor_of_own_website` 24, `named_in_url_and_title` 15,
`different_host` 5.

- **wouldBeEligible: 378 rows**
- **wouldBeIneligible: 385 rows**
- **remaining unresolved: 0** (every row classified; NULL would have failed closed anyway)
- venues affected: 121 · with at least one ineligible row: 72 · **left with no eligible evidence at
  all: 15** (Primrose Hill, Brockwell Park, Babylon Park London, Broomfield Park, Trent Park,
  Crossrail Place Roof Garden, Alexandra Park, Gadebridge Park, Wimbledon Lawn Tennis Museum,
  Churchill War Rooms, Alexandra Palace Ice Rink, Walthamstow Wetlands, Madame Tussauds London,
  Horniman Butterfly House, Hyde Park Corner)

## Currently served claims linked to each class

Served = `status='active' AND valid_until >= current_date AND approved_by <> 'ai_auto_approved'`.

242 served claims across 74 venues, which reconciles exactly: 165 cite this cohort, 74 cite evidence
already scoped, 3 carry no `source_evidence_id`.

| prospective scope | served claims |
|---|---|
| `venue_own_subtree` | 90 |
| `venue_named_page` | 13 |
| `sibling_unverified` | 47 |
| `other_catalogue_venue` | 13 |
| `organisation_ancestor` | 2 |

**103 become eligible. 62 become explicitly ineligible** -- 13 of them resting on another catalogue
venue's page, which `source-identity.js` calls "never usable here".

## Prospective new facts

Among rows becoming eligible: 1070 extracted facts in the cohort, 613 of them on rows becoming
eligible, covering 165 distinct (venue, field) pairs, of which **144 pairs across 54 venues have no
served claim today**. These are what could newly publish:

`accessibleToilet` 29, `playground` 27, `parking` 20, `babyChanging` 17, `toilets` 16,
`wheelchairAccessible` 16, `freeParking` 8, `pushchairSuitability` 6, `environment` 4, `cafe` 1.

## Hazard analysis

The instruction was to analyse the numbers rather than ask about them, and to stop only for a
qualitatively different hazard that cannot be safely bounded. There is one hazard I had wrong, and it
is recorded here because the correction is the point.

**What I assumed:** that filling a scope cannot retract anything, because reconciliation runs with
`enforceSubjectScope: false`.

**What the code actually says.** `reconcileSourceClaims` step 3 skips a claim whose backing source is
`NULL` **or ineligible**. NULL and ineligible are treated alike, so today all 165 of these claims are
skipped. After the write, the 62 ineligible ones stay skipped -- but **the 103 that become eligible
stop being skipped and come under reconciliation for the first time**. If the backing page no longer
carries the claim's field and value, that function disputes it. The write can therefore withdraw live
claims; it just does so by promoting them into scope, not by condemning them.

**Why it is nonetheless bounded, measured rather than argued:**

1. A dispute needs a backing source matched on `claim.sourceUrl`, with `retrievedAt >=
   claim.checkedAt` and `fetchStatus` usable, and withdrawal additionally needs a **complete** read
   (`fetchStatus = 'ok'`; `fetched_truncated` and `cached` cannot establish absence). So nothing
   happens until the venue is crawled again -- which is what pausing the cron in Gate B prevents.
2. Measured against the stored evidence: of the 103 claims becoming eligible, **103 are still stated
   by their own page and 0 are not**. Predicted disputes if the next crawl returns the same content:
   **0**.

So the exposure is real in mechanism and currently zero in magnitude. The remaining risk is the
144 prospective new facts auto-publishing through the every-minute cron, which is precisely what
Gate B pauses and Gate E stages. No qualitatively different hazard; proceeding without asking.

## Findings to carry into Gate E

- **Battersea Park** reaches `venue_named_page` from
  `wandsworth.gov.uk/parking/parking-zones/battersea-park-area-parking-zones/`, titled "Battersea Park
  area parking zones". The scope verdict is correct on its own terms -- the page names the venue in
  both URL and title -- but the page is about **street parking zones around** the park. Scope says
  whose page it is, not whether the sentence is about the venue's own facilities; that second question
  is the off-site parking guard's, which is already in `main`.
- **Rickmansworth Aquadrome** carries `environment=outdoor` read off a news headline
  ("Outdoor fun for all the family as interactive trails return"). Its URL is `/news/...`, outside the
  venue's own `/services/...` path, so the scope gate alone makes it ineligible. A Q2 case that needs
  no Q2 reasoning.
- Cross-venue contamination the classifier catches structurally: `royalparks.org.uk` stores
  `brompton-cemetery`, `bushy-park` and `greenwich-park` pages under eight different park venues;
  `vam.ac.uk/wedgwood/visit` sits under V&A East Storehouse and the South Kensington V&A;
  `tate.org.uk/visit/tate-liverpool` under both Tate Britain and Tate Modern.
