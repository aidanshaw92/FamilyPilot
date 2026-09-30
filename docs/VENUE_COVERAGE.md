# Venue coverage: making the pipeline answer a parent's question

Source integrity asked *can this fact be trusted?* Coverage asks *is there a fact at all?* The
integrity work is finished and unchanged by anything here: subject scope, `eligibleFact`,
`usableFor` / `isCompleteRead` and reconciliation are untouched. This document is about which pages a
crawl gets to read before it stops, and what that costs.

The success metric is **additional trustworthy family facts served to parents**, not evidence rows,
not pages fetched. Unknown remains unknown.

## Where FamilyPilot stands (measured 30 Sep 2026, 134 venues)

Served-to-parents means an active claim, in date, not `ai_auto_approved` — what `getConsumerMetadata`
projects.

| Field | Venues served | % of 134 |
| --- | --- | --- |
| `accessibility.accessibleToilet` | 38 | 28.4% |
| `familyFacilities.playground` | 35 | 26.1% |
| `familyFacilities.parking` | 30 | 22.4% |
| `familyFacilities.babyChanging` | 27 | 20.1% |
| `familyFacilities.toilets` | 24 | 17.9% |
| `familyFacilities.freeParking` | 21 | 15.7% |
| `accessibility.wheelchairAccessible` | 19 | 14.2% |
| `environment` | 19 | 14.2% |
| `pushchairSuitability` | 8 | 6.0% |
| `familyFacilities.cafe` | 1 | 0.7% |

**66 of 134 venues serve none of those ten fields.** The average venue serves 1.66 of them.

Why, in the crawl's own numbers:

| Venue state (distinct usable pages ever fetched) | Venues |
| --- | --- |
| Nothing usable at all | 38 |
| Homepage only | 5 |
| 2–3 pages | 15 |
| 4 or more | 76 |
| No website recorded | 6 |

A correction to an earlier note in this workstream: the figure "51 homepage-only venues" was the count
of venues with a *homepage evidence row*, not venues whose only usable page is the homepage. The real
homepage-only population is 5. The dominant gap is different and larger: 38 venues where every page
attempt failed (187 of 953 evidence rows are Cloudflare-blocked), and a long tail where pages were read
but the wrong pages.

## Round 1: the crawl budget

### The defect, measured rather than assumed

`MAX_PAGES = 5` was three limits wearing one name: the candidate-list length, the fetch-attempt limit
and the stored-page limit.

1. **A failed fetch consumed a page slot.** 33.7% of 953 evidence rows are non-usable — 598 `ok`,
   34 `fetched_truncated`, 187 `blocked`, 118 `error`, 11 `timeout`, 4 `non_html`, 1 `too_large`. Across
   234 crawl rounds the average was 4.07 attempts, 2.70 usable, 1.37 failed; **56 rounds produced no
   usable page and 35 only the homepage**.
2. **The reserve list was unreachable.** The queue held exactly `MAX_PAGES - 1` candidates, so
   `if (!next && reserve.length)` — which fires only on an empty queue — could not be reached while any
   selected candidate remained, and the queue emptied exactly as the attempt budget expired. The
   `isQuickFailure → continue` beside it looked like a retry and refunded nothing: the attempt had
   already been counted. A venue whose four selected guesses 404'd therefore never reached
   `/accessibility` or `/facilities`, which were sitting in that unreachable reserve.

Verified by running the real `mergePageCandidates`: for a venue owning its host, SELECTED was `/`,
`/visit`, `/plan-your-visit`, `/visitor-information`, `/your-visit` and the 13-candidate RESERVE began
`/accessibility`, `/access`, `/facilities`, `/faq` …

### Three ceilings, each answering one question

| Ceiling | Default | Question it answers |
| --- | --- | --- |
| `USABLE_PAGE_TARGET` | 6 | How many readable pages are enough? |
| `MAX_FETCH_ATTEMPTS` | 10 | How many URLs may be tried, successful or not? |
| `GATHER_BUDGET_MS` | 33 000 | How long may all of this take, measured from entry? |
| `PAGE_BUDGET_MS` | 12 000 | How long may one page take, DNS and redirects included? |
| `MIN_PAGE_WINDOW_MS` | 4 000 | How small a window is not worth starting a page in? |

A failed fetch consumes an attempt and never a usable-page slot: `usablePageCount()` counts
`pagesFetched`, which holds only `ok` / `cached` / `fetched_truncated`.

**Why 10 attempts.** At the measured 66.3% usable rate, six usable pages needs 9.05 attempts in
expectation, so 10 is the first ceiling that does not routinely truncate the target. Expected cost per
venue rises from 4.07 attempts to roughly 8.7 (+4.6). Catalogue-wide worst case is 134 × 10 = 1 340
fetches per full pass against about 545 today; `refresh_venue_data` enqueues at most 50 venues a day, so
the daily worst case is 500 fetches against about 204.

**Why the wall clock is not optional.** `enrichment-worker/index.ts` aborts its call to the API after
`AbortSignal.timeout(50000)` while `vercel.json` gives the function `maxDuration: 60`. An overrun
therefore calls `fail_venue_enrichment_job` while the function runs on and may still publish claims —
a correctness hazard, not a latency one. Ten attempts alone cannot be trusted against it: measured
crawl spans already reach 20.48 s p99 and 26.78 s max at only 4.07 attempts.

**Why 33 s, from function entry.** Measured over 128 completed jobs (`completed_at` against the evidence
rows of the same round):

| Measure | p50 | p95 | p99 | max |
| --- | --- | --- | --- | --- |
| First fetch → job completed | 4.71 s | 10.60 s | 20.48 s | 26.78 s |
| Last fetch → job completed (the tail) | 2.40 s | 4.69 s | 6.25 s | 11.33 s |
| One page (208 rounds) | 0.61 s | 2.44 s | 6.07 s | 6.29 s |

The first version of this budget was 28 s **starting at the first fetch**, with 5 s reserved for the head
in arithmetic only. Review rejected that, correctly: `googleRequest` in `server/places/lib/google-places.js`
uses `AbortSignal.timeout(15000)`, so `ensurePlaceDetails` alone can spend 15 s, and the crawl then got a
fresh 28 s regardless — a real worst case of 15 + 28 + 11.33 = **54.3 s** against a 50 s abort. The
assumption about the head was the defect.

There is now one budget, measured from `gatherEvidenceForVenue`'s entry, that the head and the crawl
share: 50 − 11.33 (measured tail max) − 5 (margin) = 33.67, taken as **33 s**. A slow head eats into page
fetching, which is the right trade — fewer pages beats a job the worker has already abandoned. Every page
is started only while at least `MIN_PAGE_WINDOW_MS` remains, and is handed
`min(PAGE_BUDGET_MS, remaining)`, never more. The homepage is subject to the same rule: if the head has
spent the budget, nothing is fetched and the gather returns an empty bundle, which fails closed
everywhere downstream. The guard never interrupts a fetch in flight, so the crawl always stops on a whole
page with its evidence stored.

`MIN_PAGE_WINDOW_MS` is 4 s because per-page p95 is 2.44 s: below that the fetch would most likely be cut
off mid-read and waste an attempt.

**Why a per-page budget exists at all, and why it covers DNS.** `FETCH_TIMEOUT_MS` bounds one HTTP hop and
was restarted on every redirect, so a page behind the maximum three redirects could hold 4 × 6 s = 24 s
while the crawl guard had reserved 12 s for it. One deadline now covers the whole chain.

Review found a second hole in the same claim: the deadline was computed, then `assertSafeUrl` ran a
`dns/promises.lookup` with **no timeout and no signal**, and the HTTP timer was armed afterwards from the
now-stale pre-DNS remainder. So resolution time sat outside the page budget entirely. Now the page
deadline covers validation as well: resolution is raced against it, the remainder is recomputed after
validation before the HTTP hop starts, and a validation that completes after the deadline has passed can
never initiate a fetch. The lookup itself cannot be cancelled, so the safety promise is converted to a
settled value before the race (no late unhandled rejection), and a validation *error* is still rethrown —
refusing an unsafe URL is not a fetch outcome and never was.

Nothing measured comes near these caps (per-page max 6.29 s), so they cut off nothing observed and make
the worst case arithmetic rather than a hope.

### Candidate order: by field, not by hit rate

| Guess | Rows | Usable | Hit rate |
| --- | --- | --- | --- |
| `/visit` | 208 | 145 | 70% |
| `/plan-your-visit` | 184 | 115 | 62% |
| `/accessibility` | 50 | 40 | 80% |
| `/parking` | 28 | 26 | 93% |
| `/faq` | 25 | 21 | 84% |
| `/family` | 18 | 18 | 100% |
| `/getting-here` | 14 | 13 | 93% |
| `/facilities` | 3 | 2 | barely tried |
| `/your-visit` | 69 | 12 | 17% |
| `/visitor-information` | 70 | 7 | 10% |
| `/toilets`, `/baby-changing`, `/children`, `/kids` | 0 | 0 | never tried |

`/visit` and `/plan-your-visit` are demoted **despite** the best hit rates: their pages are the ones
already crawled, and another copy of the same generic page is not another family fact. They sit
mid-list, not last, because the attempt ceiling still reaches them on most venues. `/your-visit` and
`/visitor-information` — slots 3 and 4 of the old order — are demoted on their own numbers.
`/toilets` and `/baby-changing` are last of the topical guesses precisely because their yield is
unknown; the cohort measures it before they are trusted further up.

### Real links outrank every guess

The `+200` discovery boost is unchanged: if a venue's homepage says where its family or facility page
is, that link is followed before any guess. What changed is which real links are recognised — added:
`families`, `children`, `childrens`, `kids`, `baby changing`, `baby-changing`, `changing places`,
`toilet`, `toilets`, `pushchair`, `pushchairs`, `buggy park`, `buggy storage`.

Two deliberate omissions:

- **`baby` and `buggy` alone.** They match baby-class and pushchair-shop pages more often than facility
  pages, and a speculative attempt is the one thing this change spends. Only the compounds are trusted.
- **`plan a visit`.** The user asked for it *if the corpus shows it occurs*. It does not: zero of 953
  evidence rows carry a `plan-a-visit` path. That is partial evidence — the corpus holds only URLs we
  attempted — so the term is left out rather than added on a guess.

A keyword in a path is site structure; the same word in a sentence is not. The existing suite caught
this immediately: the anchor "We help families find jobs" made a **careers page** a top candidate the
moment `families` joined the strong list. Those terms (and `family`, which always carried the same
hazard) now score at full strength in a URL path, and in anchor text only when the anchor reads like
navigation — at most four words. "Toilets and baby changing" qualifies; the careers sentence does not.

### Known limitation, reported rather than fixed

Among **real** links, `scoreLink` still gives `/visit\b` a +14 bonus against `/accessibility`'s +12, so
a generic visit link outranks an accessibility link on a link-rich site. That is the opposite of the
speculative order above. It is left alone in this round because re-ranking real links is a wider change
than the one asked for; the cohort funnel will show whether it matters, since it reports which
candidate type won each slot.

### Verification

- 1 183 tests pass, 65 files; `tsc --noEmit` clean.
- 15 mutants aimed at the new logic. All killed but one, and the survivors were answered by adding the
  missing tests rather than loosening assertions: the chain deadline dropped from the recursive redirect
  call; a hard `20` restored over the candidate list's own length; the gather deadline read moved back to
  after the head; and the race around URL validation removed — which needed a test asserting the call
  *returns* at the budget rather than when a hanging resolver answers, since the recomputed remainder
  already produced the same status.
- The one mutant left alive is equivalent, not a gap: disabling the `DEADLINE_LOST` branch changes no
  observable outcome, because the timer having fired means `Date.now() >= chainDeadlineAt`, so the
  post-validation recomputation returns the identical timeout. The branch is kept for intent and as
  protection if that recomputation is ever changed.
- The before half is run as code: the same 404 scenario with the ceilings collapsed back to one number
  of five loses `/parking` and serves the homepage alone.
- The redirect-deadline test runs offline by construction — an IP-literal host skips DNS and
  `globalThis.fetch` is replaced — and separates a carried deadline (~400 ms) from a per-hop timer (6 s).
- The head is modelled inside the gather, not before the call: the fake clock charges the head cost on
  its second read, which is where the pipeline records `headElapsedMs`. Charging it before the call is
  exactly the mistake review found, and would have tested nothing.

### Expected effects to watch, including an unwelcome one

Reading more of a venue's own pages enlarges the eligible conflict set, and reconciliation disputes a
claim when two eligible pages state different values for the same field. So **some fields may lose
coverage**: a venue whose `/accessibility` page says parking is unavailable while its `/parking` page
says otherwise will have that claim disputed rather than served. That is the intended behaviour from
rounds 3–5 — a contradiction inside a venue's own site is not a fact — but it means the cohort's net
change may be smaller than its gross gain, and both need reporting separately.

Residual risks: 10 sequential requests to one host inside 33 s where there were 4, with no per-host
delay and no `robots.txt` check (both pre-existing); and roughly 4.6 extra evidence rows per crawl round,
each capped at 8 000 characters of extracted text.

One piece of the request is still unbounded, stated precisely rather than claimed away: the per-page
`saveEvidenceRecord` write has no timeout of its own. The guard measures real elapsed time between pages,
so a slow write consumes the window and the next page is refused — but a write already in flight is not
cut short. Those writes are inside the measured spans above (25.17 s max crawl span, 11.33 s max tail),
which is the evidence the 5 s margin rests on. Bounding them would mean a timeout on the Supabase client,
which is wider than this change.

## The controlled cohort (frozen, not yet run)

18 venues, selected from coverage gaps by query alone. No website was inspected before selection, and
the tie-break inside every group is `md5(venue_id)`, so the pick cannot be steered towards venues whose
pages are already known.

### A correction: the first cohort's category cap did not exist

The first version of this section claimed "at most three venues per category". It was not true. The SQL
ranked with

```sql
row_number() over (partition by stratum, category ...)
```

which caps three per category **per stratum**, not three per category. Run against production it gave
park 9, museum 6, attraction 2, soft_play 2, farm 1 — 15 of 20 venues from two categories, with
**activity and zoo contributing nothing at all**. Since the cohort exists to test whether the discovery
change generalises across site structures, that was materially less diverse than the document claimed.
Found in review, confirmed by re-running the documented query.

### What changed

- A genuine **global** cap of three per category, enforced once across the whole cohort.
- Within a category, a **round-robin across strata**: each category offers its best candidate from each
  stratum before any category takes a second from the same stratum, so a category's slots land in
  different strata wherever it has them.
- The two blocked controls are chosen first and by the same rule as before, so they cannot be crowded
  out; the category they sit in then has one slot fewer.
- A/B/C candidates are restricted to `fields_served <= 2`. Without it a well-served venue wins a
  category's C slot — the first run of the corrected query put Horniman Butterfly House, which already
  serves 7 of the 10 fields, into the zoo slot. The cohort is meant to be coverage gaps.

A first attempt at the fix is worth recording because it failed differently: ordering the round-robin
with the D stratum first gave **every** category its blocked venue, spending 7 of 21 slots on controls
that by definition cannot improve. Exactly two controls is the design.

### Composition

| Category | Venues | A | B | C | D |
| --- | --- | --- | --- | --- | --- |
| activity | 3 | 2 | 0 | 1 | 0 |
| attraction | 3 | 2 | 0 | 0 | 1 |
| farm | 2 | 0 | 1 | 1 | 0 |
| museum | 3 | 1 | 1 | 0 | 1 |
| park | 3 | 1 | 1 | 1 | 0 |
| soft_play | 2 | 0 | 2 | 0 | 0 |
| zoo | 2 | 2 | 0 | 0 | 0 |
| **total** | **18** | **8** | **5** | **3** | **2** |

All seven catalogue categories are represented, none with more than three. The strata are less even than
the original 7/7/4/2 because the category cap binds first; the parks and museums that used to fill A and
B now hold three slots between them rather than fifteen.

| Stratum | What it tests |
| --- | --- |
| A — pages read, no facts served | Were the wrong pages being read? |
| B — few usable pages | Does absorbing failures find more? |
| C — 4+ pages, 1–2 fields served | Was the budget spent on generic visit pages? |
| D — nothing usable | Control: Cloudflare-blocked sites should not improve |

### The frozen 18

| Stratum | Venue | Category | Fields | Usable pages | `familypilot_place_id` |
| --- | --- | --- | --- | --- | --- |
| A | Rowans Tenpin Bowl | activity | 0 | 1 | `fp-google-ChIJ4ytTKIUbdkgRWA5R15k-IiQ` |
| A | Hyde Park Winter Wonderland | activity | 0 | 5 | `fp-google-ChIJT8Zf9BwFdkgRK-CapYKxUBQ` |
| A | London Cable Car | attraction | 0 | 2 | `fp-google-ChIJzctoGW2p2EcRPZRecMnPjCM` |
| A | The Graffiti Tunnel | attraction | 0 | 2 | `fp-google-ChIJkSkaX7gEdkgRXGkVq9DzCcI` |
| A | The Courtauld Gallery | museum | 0 | 5 | `fp-google-ChIJJUQ-d8oEdkgR-JVIDfRa6aY` |
| A | Crossrail Place Roof Garden | park | 0 | 5 | `fp-google-ChIJEzFv5rACdkgRLA2fgj3u0ZY` |
| A | Hanwell Zoo | zoo | 0 | 5 | `fp-google-ChIJHQ0TmmENdkgRStqMV2LSW5M` |
| A | Golders Hill Park Zoo | zoo | 0 | 3 | `fp-google-ChIJv9tbXcsRdkgRdSU67tQcC2w` |
| B | Belmont Children's Farm | farm | 1 | 3 | `fp-google-ChIJ_zIJCh8XdkgRnCvSmVMa1iY` |
| B | Paradox Museum London | museum | 1 | 1 | `fp-google-ChIJQzfybmYFdkgR1tFou0zyzYQ` |
| B | Hyde Park Corner | park | 1 | 3 | `fp-google-ChIJl9GLq5sFdkgRprpfoNR3t3Q` |
| B | Babylon Park London | soft_play | 2 | 1 | `fp-google-ChIJ7_PV980bdkgROekbwOVWVfo` |
| B | Flip Out Brent Cross | soft_play | 2 | 2 | `fp-google-ChIJb5wm6eQQdkgR-qbm_aXw0xw` |
| C | Thorpe Park | activity | 2 | 4 | `fp-google-ChIJYQVF6Hh3dkgRKW4X8lXi-HI` |
| C | Mudchute Park and Farm | farm | 2 | 5 | `fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI` |
| C | Diana Princess of Wales Memorial Playground | park | 1 | 5 | `fp-google-ChIJ_X4Ce_0PdkgREqwQu2aBoOY` |
| D | Churchill War Rooms | attraction | 0 | 0 | `fp-google-ChIJq4lX1doEdkgR5JXPstgQjc0` |
| D | National Portrait Gallery | museum | 0 | 0 | `fp-google-ChIJeclqF84EdkgRYkL4mtJ7rLM` |

These 18 IDs are the cohort. The query below produced them and is kept for audit, but the run uses the
frozen list: a later claim or crawl would otherwise change the strata under it and quietly reselect.

```sql
with core_fields(field_key) as (values
  ('familyFacilities.babyChanging'),('familyFacilities.toilets'),('familyFacilities.parking'),
  ('familyFacilities.freeParking'),('accessibility.accessibleToilet'),
  ('accessibility.wheelchairAccessible'),('pushchairSuitability'),('environment'),
  ('familyFacilities.cafe'),('familyFacilities.playground')
),
served as (
  select c.familypilot_place_id vid, count(distinct c.field_key) served_fields
  from venue_claims c join core_fields f on f.field_key = c.field_key
  where c.status = 'active' and c.valid_until >= current_date
    and c.approved_by <> 'ai_auto_approved'
  group by 1
),
crawl as (
  select familypilot_place_id vid,
         count(distinct source_url) filter (where fetch_status in ('ok','fetched_truncated')) usable_urls
  from venue_source_evidence group by 1
),
pool as (
  select p.familypilot_place_id vid, p.name, p.category,
         coalesce(s.served_fields,0) fields_served,
         coalesce(cr.usable_urls,0) usable_urls,
         case when coalesce(cr.usable_urls,0) = 0 then 'D_nothing_usable'
              when coalesce(s.served_fields,0) = 0 then 'A_pages_no_facts'
              when coalesce(cr.usable_urls,0) <= 3 then 'B_few_pages'
              else 'C_budget_on_generic' end as stratum
  from place_records p
  left join served s on s.vid = p.familypilot_place_id
  left join crawl cr on cr.vid = p.familypilot_place_id
  where p.website is not null
),
-- Exactly two blocked controls, picked first so the category cap cannot crowd them out.
controls as (
  select * from (
    select *, row_number() over (order by fields_served asc, md5(vid)) rn
    from pool where stratum = 'D_nothing_usable'
  ) d where rn <= 2
),
-- Genuine coverage gaps only.
gaps as (
  select * from pool where stratum <> 'D_nothing_usable' and fields_served <= 2
),
ranked as (
  select *,
    row_number() over (partition by category, stratum order by fields_served asc, md5(vid)) as k,
    case stratum when 'A_pages_no_facts' then 1 when 'B_few_pages' then 2 else 3 end as sp
  from gaps
),
-- Three per category ACROSS the cohort, less whatever the controls already hold there.
quota as (
  select r.*, 3 - coalesce((select count(*) from controls c where c.category = r.category), 0) as slots
  from ranked r
),
picked as (
  select *, row_number() over (partition by category order by k, sp, fields_served, md5(vid)) as rn_cat
  from quota
)
select stratum, vid, name, category, fields_served, usable_urls
from picked where rn_cat <= slots
union all
select stratum, vid, name, category, fields_served, usable_urls from controls;
```

### What the cohort run will report

The funnel, per venue and per stratum, so it is visible exactly where information is lost:

**generated → selected → attempted → usable → eligible scope → extracted facts → served claims**

plus which candidate type won each slot (real link or speculative guess), the stop reason, attempts,
elapsed crawl time, and cohort before → after counts for the ten fields in the table at the top —
gross gains and any disputes separately.

Nothing is requeued until the frozen cohort above is approved.
