# Step 1: why the two simulations disagreed, row by row

Status: 2026-10-08. **Nothing has been run in production.** Everything below was computed offline from read-only exports and
from `main` (`b74a4c8`; no file under `server/` or `api/` differs from the commit both earlier simulations used).

## The short answer

| | Gate in PR #185 (merged) | Final gate (PR #187) | **Real code, production page order (this page)** |
|---|---:|---:|---:|
| Active claims at the 21 venues | "80" | 76 | **76** |
| Added | 16 | 18 | **18** |
| Corrected (value changes) | 1 | 1 | **1** (Colne Valley parking, no → yes) |
| Withdrawn | 7 | 4 (+ the correction's old row = 5 ids) | **4** (+ the correction's old row = 5 ids) |
| Same value, different quotation (row replaced) | 18 | 17 | **4** (2 are a trailing space) |
| Rows left exactly as they are | 51 | 54 | **67** |

Three separate things moved the numbers. None of them is a change in production or in the pages.

1. **"80" was an arithmetic slip, not a change in production.** The venue table in the first gate adds up to 76. Production
   holds 76 active claims at these venues today and held 76 when the claims were exported (8 October, 09:37). The 76 claim ids
   match `docs/data/served-claims-2026-10-08.csv` one for one. Newest active claim: created 7 October 15:29, nothing updated since.
2. **The first simulation read a filtered corpus.** The replay corpus keeps only sentences that mention a facility, parking,
   buggies, food or ages. A page that also holds a contradicting sentence, or a supporting sentence the filter dropped, was
   misjudged in both directions (§2). The second simulation used the complete stored text of the 161 pages, which is what the job reads.
3. **Both simulations listed a venue's pages in URL order; the job lists them newest first.** When two pages state the same
   fact, the page order decides which quotation is stored. The existing claims were made in production order, so a run in that
   order reproduces **67 of the 71 surviving claims byte for byte** (value, page, quotation, read date, expiry), which is also the best
   validation that the order is right. In URL order 13 of those looked like re-quotes. They are not.

## 1. The stored pages did not change

Read-only check against production just now: **161 pages, 434,130 characters, newest read 2 October 09:20; 0 evidence rows
created since the export.** No venue holds more than 22 evidence rows, none has two rows with the same timestamp, so the job's
"newest 100 rows" cut-off and ordering are not a factor.

## 2. Row by row: what differed between the first two simulations

| Row | First (corpus) | Second (full text) | Why |
|---|---|---|---|
| Sydenham Hill Wood, wheelchair access: yes | add | **not added** | The corpus kept only "The two entrances into Dulwich Wood … are wheelchair accessible". The full page also says "The station is not wheelchair accessible on either side", so the extractor sees yes and no and withholds the fact. Correctly not published (the second sentence is about a station; a person could settle it). |
| London Eye, wheelchair access: yes | none | **add** | "The London Eye is a wheelchair-friendly attraction with full accessibility throughout." was filtered out of the corpus. |
| The Wallace Collection, wheelchair access: yes | none | **add** | "Lift access is available to all floors." was filtered out. |
| Queen's House, wheelchair access: yes | none | **add** | The corpus held one of the venue's 7 stored pages; "All floors of the Queen's House have lift access." is on another. |
| Colne Valley, environment: outdoor | withdraw | **kept** | The corpus no longer contained the supporting sentence, so the claim looked unsupported. The full page still says it. |
| Queen Elizabeth Olympic Park, café: yes | withdraw | **kept** | Same cause. |
| Saatchi Gallery, wheelchair access: yes | add (from /visit) | add (from /contact) | Same fact and same words; page order. |
| 16 → 18 additions | | | 16 − Sydenham (1) + London Eye, Wallace, Queen's House (3) = 18. |
| 7 → 4 withdrawals (+ the correction) | | | First: 7 listed withdrawals, including Colne parking, which is also the correction. Remove Colne environment and QEOP café (kept) and move Colne parking to the correction: 4 withdrawals + 1 correction = 5 ids. |

The full table for all 95 rows (76 claims + 19 additions) is `docs/pilot/step1/row-by-row.md`.

## 3. The real code, not a mirror

`scripts/pilot/step1-real-run.cjs` runs **the actual** `verifiedBundleForVenue`, `reconcileSourceClaims` and `reviewEvidence` from
`main` over the stored pages and the 76 claims, with only the database reads and the dispute write replaced by in-memory
recorders. A network guard fails the run on any socket or `fetch`; there were **0 attempts**. Result: `docs/pilot/step1/real-run.json`.

**Withdrawn (fact returns to unknown; nothing deleted):**

| Venue | Claim | Why |
|---|---|---|
| Sydenham Hill Wood | accessible toilet: yes (`24a699e3…`) | "The **nearest** Changing Places Toilet can be found in Dulwich Park": another park |
| Queen Elizabeth Olympic Park | parking: yes (`37cf3fa6…`) | "Lee Valley VeloPark Venue car parking": another venue's car park |
| Queen Elizabeth Olympic Park | free parking: no (`be6f2b75…`) | "The nearby Olympic Park Avenue has on-street pay and display": a street |
| Whitechapel Gallery | free parking: no (`e7f221fa…`) | A council multi-storey and street bays; the page says free parking exists for some visitors |

**Corrected:** Colne Valley parking: no → yes (`eabed57d…` superseded). Old: "Parking is not permitted on Denham Court Drive" (a road). New: "There are two carparks run by Bucks County Council."

**Added (18):** nine wheelchair-access (Gunnersbury, Museum of the Home, RAF Museum, Queen's House, National Maritime Museum,
Saatchi, Wallace, William Morris Gallery, London Eye), and nine facilities (Cutty Sark café and toilets, Mudchute toilets,
Chiswick toilets, Hackney City Farm café and toilets, Tate Modern café, V&A café, Northala parking). Five of the nine access
facts rest mainly on a venue-wide lift statement (the v6 rule you approved).

### Where I would not call the quotation strong (so you can see it before you approve)

| Row | Quotation | Concern |
|---|---|---|
| Museum of the Home, wheelchair access | `\n" } Your visit Accessibility There is step-free access to all our galleries.` | Value is right; the stored text carries stray markup. |
| Cutty Sark, café | "The main toilets are next to the cafe in the Dry Berth …" | Establishes a café exists, indirectly. |
| Hackney City Farm, café | "Yes, one outside near the cafe entrance and there are two inside the cafe …" | An answer about toilets that mentions the café. |
| Tate Modern, café | "Tate Modern Corner Cafe, Bar, Venue Opening times …" | A late-night bar's page; "Cafe, Bar". |
| Frameless, wheelchair access (re-quote) | was "The whole building is wheelchair accessible, including our toilets and Café Bar." now "…lifts to every floor including our disabled toilets." from the sensory-sessions page | Value unchanged; the quotation gets weaker. |
| Chiswick House, café (re-quote) | was "visit our Café Colicci …" now "Baby changing is available in the toilets by the Café …" | Value unchanged; weaker. |

None changes what a parent sees today except by *adding* a true fact. The two re-quotes replace a better quotation with a
weaker one for the same value; each is undone by one statement (§5).

Two existing claims are weak on provenance and **are not touched by Step 1** (they were never withdrawn on the complete pages):
Colne Valley *outdoor* ("get outdoor active or just relax": a marketing line) and QEOP *café* (a navigation menu). They go to the
review queue; they are not a reason to hold Step 1.

## 4. Consistent with the approved gate?

Yes, point by point (code read on `main`, and the run above):

- **The 21 ids:** identical to the approved list (checked mechanically against `docs/STEP1_FINAL_GATE.md` and the command below).
- **Stored pages only:** `reextract` → `evidenceMode: 'stored'` → `verifiedBundleForVenue`; the crawler is not reached. 0 network attempts in the run above.
- **No model, no Google, no other paid call:** `sourceOnly: true` takes the rule output; Place Details lives only in the crawl path. Production Google use today is the 03:00 discovery sync's 10 calls and nothing else.
- **Only automatic claims are ever touched:** all 76 are `source_evidence_auto_v2`; `reconcileSourceClaims` skips any other approver and any field outside the facility vocabulary, so pricing, age-policy, rule and hours claims cannot be affected.
- **Withdrawal needs the claim's own page, read completely, to stop saying it** (or two eligible own pages to disagree). 4 do; no other did.
- **Dates never extended:** `checked_at` = the page's reading date, `valid_until` = that + 30 days. A 1 October reading still lapses on 31 October.
- **Time sensitivity:** publication needs a reading under 14 days old. Museum of the Home (read 27 September) falls out of that window on 11 October; the others on 15 October. The *withdrawals* do not depend on the clock. So a late run loses additions, never gains withdrawals.

**Could an unexpected withdrawal or correction occur?** Not from the stored pages: the real code produces exactly 5 ids, and a
second run queues 0 jobs (idempotent). The ways it could differ are (a) a page re-read between now and the run (the scheduler's
next slot for these venues is 24 October and there are no open jobs), (b) a code change on `main` before then (none under
`server/` or `api/` since `01041f1`). I re-run the harness against production immediately before you execute and after.

## 5. Command, checks, undo

```sql
select public.enqueue_reextract_jobs('official-source-rules-v6', 25, array[
  'fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY','fp-google-ChIJKUrjG7wcdkgRbfTuKDBgWXI','fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc',
  'fp-google-ChIJs_wmr0cWa0gRZpEqERRReXQ','fp-google-ChIJs_wmr0cWa0gRHr60qjwn1Mo','fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8',
  'fp-google-ChIJczuZfc0adkgRc8X-u3ZiHcE','fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM','fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI',
  'fp-google-ChIJId2oNroFdkgReafXXIrGnkY','fp-google-ChIJAVlhMIUCdkgRCJEgHVbITq4','fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI',
  'fp-osm-679119297','fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y','fp-google-ChIJlRl2MakEdkgR55tr4CNv_B8',
  'fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54','fp-google-ChIJN3hATcsSdkgRPscumUj6FqU','fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY',
  'fp-google-ChIJq-jJARlxdkgRNLTE490EqVU','fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8','fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM'
]);
-- expected return: 21   (a second call returns 0)
```

**Option B (more conservative, 19 venues).** Drop `fp-google-ChIJId2oNroFdkgReafXXIrGnkY` (Frameless: its only effect is the weaker re-quote)
and `fp-google-ChIJlRl2MakEdkgR55tr4CNv_B8` (Tate Modern: its only effect is the Corner bar café). Nothing else is lost. Option A is
what you approved; I recommend A, because the effects of both are small and reversible, but B removes every quotation I called weak
*except* Chiswick, Hackney, Cutty Sark and Museum of the Home, whose other facts are good.

**Checks, about 30 minutes later (read-only, I run them):**

- every `reextract` job `completed`, no `last_error`; one `official-source-rules-v6` draft per venue with `evidenceMode = 'stored'`;
- exactly these five claims no longer active: `24a699e3-1e99-46ac-8f45-b50e8d4e536a`, `eabed57d-f4e9-45a7-a8b6-f2746451cb89`, `37cf3fa6-7b0f-4905-b2e8-9b3dbd85cead`, `be6f2b75-2265-4e2a-ae87-1e7021c5eb9b`, `e7f221fa-9e6f-406e-8645-d7557cdc00a9`;
- active claims at the 21 venues: 76 − 5 + 19 = **90** (18 additions + the Colne Valley replacement);
- `google_places_usage` for today unchanged (10 `nearby_search`).

**Undo:** a withdrawn claim: `update venue_claims set status='active' where id='<id>' and status='disputed' and not exists (select 1 from venue_claims a where a.familypilot_place_id=venue_claims.familypilot_place_id and a.field_key=venue_claims.field_key and a.status='active');`
The Colne Valley correction: in one transaction mark the new row `disputed` and set the row named in its `supersedes_claim_id` back to `active`.
An addition: mark it `disputed`. A re-quote: mark the new row `disputed` and its `supersedes_claim_id` row `active`.

**Stop point.** Not executed. Deadline: the earliest reading (Museum of the Home) leaves the 13-day queue window on **10 October**.
