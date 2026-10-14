# Step 1: final approval gate

2026-10-08. One page. **Supersedes the numbers in `STEP1_REEXTRACT_GATE.md`**, which were taken from a filtered
sentence corpus and were wrong in three places: the venues hold **76** active claims (not 80), the run makes **5**
withdrawals (not 7) and **18** additions (not 16). This version re-ran the same rules over the **complete stored text
of every page** the live job will read (161 pages, 434,130 characters, 21 venues). Nothing has been run.

## What the run does

Re-reads the stored pages of 21 venues with extractor v6 and publishes or withdraws what those pages say, under the
same publication rules as every other run. **Result: 18 facts added, 1 corrected, 4 withdrawn, 17 re-quoted with the
same value, 54 untouched** (76 claims accounted for: 5 + 17 + 54).

## The 21 venues

`fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY` Gunnersbury Park · `fp-google-ChIJKUrjG7wcdkgRbfTuKDBgWXI` Museum of the Home
(window closes **10 Oct**) · `fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc` RAF Museum · `fp-google-ChIJs_wmr0cWa0gRZpEqERRReXQ`
Queen's House · `fp-google-ChIJs_wmr0cWa0gRHr60qjwn1Mo` National Maritime Museum · `fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8`
Saatchi Gallery · `fp-google-ChIJczuZfc0adkgRc8X-u3ZiHcE` Wallace Collection · `fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM`
William Morris Gallery · `fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI` London Eye · `fp-google-ChIJId2oNroFdkgReafXXIrGnkY`
Frameless · `fp-google-ChIJAVlhMIUCdkgRCJEgHVbITq4` Cutty Sark · `fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI` Mudchute ·
`fp-osm-679119297` Chiswick House · `fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y` Hackney City Farm ·
`fp-google-ChIJlRl2MakEdkgR55tr4CNv_B8` Tate Modern · `fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54` V&A ·
`fp-google-ChIJN3hATcsSdkgRPscumUj6FqU` Northala Fields · `fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY` Sydenham Hill Wood ·
`fp-google-ChIJq-jJARlxdkgRNLTE490EqVU` Colne Valley · `fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8` Queen Elizabeth Olympic
Park · `fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM` Whitechapel Gallery.

All 21 have an own-page reading inside the 13-day window today (newest 27 Sep to 2 Oct). Every one of the 76 active
claims is automatic (`source_evidence_auto_v2`); none is a person's, so no human decision is touched.

## The 4 withdrawals and the 1 correction

| Venue | Field and value | Source page | The quotation | Why it goes |
| --- | --- | --- | --- | --- |
| Sydenham Hill Wood | accessible toilet: yes | `wildlondon.org.uk/…/sydenham-hill-wood-and-coxs-walk` | "The **nearest** Changing Places Toilet can be found in **Dulwich Park**" | a toilet in another park |
| Queen Elizabeth Olympic Park | parking: yes | `queenelizabetholympicpark.co.uk/plan-your-visit/getting-here` | "Lee Valley **VeloPark** Venue car parking is available for up to 3 hours for facility users" | another venue's car park |
| Queen Elizabeth Olympic Park | free parking: no | same page | "Timber Lodge Cafe The **nearby Olympic Park Avenue** has on-street pay and display spaces" | a street outside the park |
| Whitechapel Gallery | free parking: no | `whitechapelgallery.org/visit-2/` | "Buckle Street Multistorey Car Park … Free parking for Blue Badge holders is available at the top of Osborn Street" | a council car park and street bays, and it says free parking exists for some visitors |
| Colne Valley Regional Park | parking: **no → yes** (the correction) | `colnevalleypark.org.uk/visitor-centre/` | was "Parking is not permitted on **Denham Court Drive**" (a road); becomes "There are two carparks run by Bucks County Council" | the old value was the opposite of what the page says about parking |

Withdrawn means the field returns to **unknown**; nothing is deleted. Two weak claims that the corpus run withdrew are
**kept** on the complete pages, because other sentences on the same pages support them: Colne Valley's "outdoor" and
QEOP's café. QEOP's café is still quoted from a navigation menu ("Bars Cafés Grab and Go Restaurants"); it is true that
the park has cafés, but the quotation is weak and I will tighten the extractor for menu text separately. It is not made worse by this run.

The 18 additions are those in the "Added" table of `STEP1_REEXTRACT_GATE.md`, minus Sydenham Hill Wood's wheelchair
access (not produced from the complete pages), plus wheelchair access at the Wallace Collection, Queen's House and the
London Eye. Nine are wheelchair-access facts; five of those (Queen's House, National Maritime Museum, Saatchi Gallery,
Wallace Collection, William Morris Gallery) rest mainly on a venue-wide lift statement, the v6 rule you approved in the
extraction pilot. If you would rather not publish lift-only access, say so and I will take those five off the list; they
carry no other addition, so removing them loses nothing else.

## Confirmations (from the code on main `01041f1`, deployed)

- **No crawler.** A `reextract` job maps to `evidenceMode: 'stored'`; `generateDraftForVenue` then calls
  `verifiedBundleForVenue`, which reads `venue_source_evidence` rows and re-runs the extractor on stored text. The
  crawl function is not reached and no website is fetched.
- **No model.** `sourceOnly: true` takes the rule output as the draft (`model = 'official-source-rules-v6'`,
  cost 0); the model draft function is not called.
- **No Google or other paid service.** Place Details is requested only inside the crawl path. Nothing on this path
  holds a provider call. Production Google use today is the Monday/Thursday area sync's 10 discovery calls only.
- **Cannot promote the wrong thing.** A fact must be on the venue's own page (`venue_own_subtree` or
  `venue_named_page`), high confidence, no conflicting reading, official source type, a quotation of at least 15
  characters, a reading under 14 days old and not rescoped. Ambiguous, conflicting, stale, off-site and rescoped facts
  are withheld.
- **Dates never extended.** A claim's `checked_at` is the page's reading date and `valid_until` follows from it
  (30 days for facilities and access): a 1 October reading still lapses on 31 October.
- **Existing confirmed facts are only withdrawn by their own page.** Automatic claims only; the claim's own source page
  must have been read completely (`ok`) and no longer state the value, or two eligible own pages must disagree.
  The 4 above are the only ones the complete pages produce.
- **Bounded.** 21 jobs (limit 25); the every-minute worker takes one at a time, so about 25 minutes.
- **Idempotent.** A venue whose newest draft already carries v6 is skipped: a second call queues 0. Identical claims
  are not rewritten.
- **No collision with the scheduler.** The hourly freshness job queues at most once a day and has already used today's
  slot (`last_refresh = 2026-10-08`); nothing becomes queueable for these venues before 24 October. (Note for later:
  its job upsert overwrites a job in any status, so a future collision is possible near an expiry date; I will add the
  same "not while processing" guard the reextract function has.)
- **Monitoring and rollback.** Each draft records `model`, `evidenceMode = 'stored'` and the job id; each claim records
  `approved_from_draft_id`; the queue row records status and `last_error`. Everything is a status change; nothing is
  deleted. Undo per claim is below.

## The command (Supabase SQL editor)

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
-- expected return: 21
```

**Checks (about 30 minutes later):** every `reextract` job `completed` with no `last_error`; one v6 draft per venue with
`evidenceMode = 'stored'`; exactly these five claim ids no longer active — `24a699e3-1e99-46ac-8f45-b50e8d4e536a`,
`eabed57d-f4e9-45a7-a8b6-f2746451cb89` (replaced by parking = yes), `37cf3fa6-7b0f-4905-b2e8-9b3dbd85cead`,
`be6f2b75-2265-4e2a-ae87-1e7021c5eb9b`, `e7f221fa-9e6f-406e-8645-d7557cdc00a9`; 19 new active claims (18 additions and
the Colne Valley parking replacement); `google_places_usage` for today unchanged; coverage up by one destination (Museum of
the Home, its first fact). I run these read-only and report.

**Undo:** a withdrawn claim: `update venue_claims set status='active' where id='<id>' and status='disputed' and not
exists (select 1 from venue_claims a where a.familypilot_place_id=venue_claims.familypilot_place_id and
a.field_key=venue_claims.field_key and a.status='active');`. The Colne Valley correction: in one transaction mark the
new row `disputed` and set the row named in its `supersedes_claim_id` back to `active`. An addition: mark it `disputed`.

## Decision

Approve the command above (all 21), or tell me to remove any venue from the list first. It is independent of the
website-identity rescope, which stays a separate approval.
