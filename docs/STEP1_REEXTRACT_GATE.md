# Step 1 safety gate: re-reading 21 venues' stored pages with extractor v6

2026-10-08, after #175, #176, #177, #180 and #182 merged (main `ce5b8fa`, deployed, free posture canary green). Nothing
here has been run. The command at the end waits for your written go.

## 1. The 21 venues, checked against production today

Every one still has a usable own-page reading inside the 13-day queue window. The window is the reading date plus 13
days, so the earliest closes on **10 October** (Museum of the Home). All active claims at these venues are automatic
(`source_evidence_auto_v2`, 80 claims); none is a person's.

| Venue | id | Newest own-page reading | Window closes | Active claims |
| --- | --- | --- | --- | ---: |
| Museum of the Home | `fp-google-ChIJKUrjG7wcdkgRbfTuKDBgWXI` | 27 Sep | **10 Oct** | 0 (draft) |
| London Eye | `fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI` | 1 Oct | 14 Oct | 5 |
| William Morris Gallery | `fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM` | 1 Oct | 14 Oct | 3 |
| The Wallace Collection | `fp-google-ChIJczuZfc0adkgRc8X-u3ZiHcE` | 1 Oct | 14 Oct | 5 |
| Mudchute Park and Farm | `fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI` | 1 Oct | 14 Oct | 3 |
| Queen Elizabeth Olympic Park | `fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8` | 1 Oct | 14 Oct | 4 |
| Northala Fields | `fp-google-ChIJN3hATcsSdkgRPscumUj6FqU` | 1 Oct | 14 Oct | 2 |
| Saatchi Gallery | `fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8` | 1 Oct | 14 Oct | 3 |
| Frameless | `fp-google-ChIJId2oNroFdkgReafXXIrGnkY` | 1 Oct | 14 Oct | 3 |
| Whitechapel Gallery | `fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM` | 1 Oct | 14 Oct | 3 |
| National Maritime Museum | `fp-google-ChIJs_wmr0cWa0gRHr60qjwn1Mo` | 1 Oct | 14 Oct | 5 |
| Colne Valley Regional Park | `fp-google-ChIJq-jJARlxdkgRNLTE490EqVU` | 1 Oct | 14 Oct | 6 |
| Tate Modern | `fp-google-ChIJlRl2MakEdkgR55tr4CNv_B8` | 1 Oct | 14 Oct | 5 |
| Chiswick House | `fp-osm-679119297` | 1 Oct | 14 Oct | 5 |
| Victoria and Albert Museum | `fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54` | 1 Oct | 14 Oct | 3 |
| Cutty Sark | `fp-google-ChIJAVlhMIUCdkgRCJEgHVbITq4` | 1 Oct | 14 Oct | 1 |
| Queen's House | `fp-google-ChIJs_wmr0cWa0gRZpEqERRReXQ` | 1 Oct | 14 Oct | 2 |
| Sydenham Hill Wood | `fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY` | 1 Oct | 14 Oct | 3 |
| Hackney City Farm | `fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y` | 1 Oct | 14 Oct | 3 |
| Gunnersbury Park | `fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY` | 2 Oct | 15 Oct | 4 |
| Royal Air Force Museum London | `fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc` | 2 Oct | 15 Oct | 8 |

No venue has a v6 draft yet (the 7 October re-read ran under rules v4, before #176 and #177 merged), so the function
below queues all 21.

## 2. What the job can and cannot do (read from the code on main)

**Stored pages only; no network of any kind.** `api/enrichment/index.js` maps a `reextract` row to
`{ evidenceMode: 'stored', sourceOnly: true }`. In `draft-store.js` `generateDraftForVenue`, `evidenceMode === 'stored'`
takes `verifiedBundleForVenue`, which reads `venue_source_evidence` and re-runs the extractor on the stored text; the
crawler (`gatherEvidenceForVenue`) is not called, so no website is fetched and Place Details is never requested.
`sourceOnly: true` also means the model draft (`generateDraft`) is not called: the draft is the rule output, `model =
'official-source-rules-v6'`, cost 0. The approval step (`tryAutoApproveDraft`) reads the same stored bundle again and
writes claims; it makes no request either. **No Google or other paid call exists on this path.**

**Only an eligible fact can be published** (`trusted-evidence.js` `eligibleFact`, with `excludeRescoped: true` from
auto-approve): a known field, high confidence, no conflict between sources, official source type, a quotation of at
least 15 characters, a reading at most 14 days old, an http(s) URL, and a page whose scope is the venue's own
(`venue_own_subtree` or `venue_named_page`) and was **not** rescoped. So an ambiguous reading (not high confidence), a
conflicting one, a stale one, an off-site page, a sibling venue's page, or a rescoped page cannot become a claim
automatically. Facts from ineligible pages are recorded as withheld, not published.

**Dates are never extended.** A claim takes `checkedAt` from the page's reading date and `validUntil` from that
(30 days for facilities, access and pushchair; 90 for environment and energy). Re-reading a page read on 1 October
yields a claim that lapses on 31 October, the same as the claim it replaces.

**A confirmed fact is withdrawn only by its own page.** `reconcileSourceClaims` touches only automatic claims (never a
person's), and disputes one only when (a) the very page the claim cites was read completely (`ok`) and, under the current
rules, no longer states that value, or (b) two eligible own pages read since the claim disagree. A failed, partial or
sibling page can neither keep a claim alive nor withdraw it.

**Bounded.** The function takes the 21 ids and a limit of 25; it inserts at most one job per venue; the every-minute
worker takes one job at a time, so the run finishes in about 25 minutes.

**Idempotent.** A venue whose newest draft already carries `official-source-rules-v6` is skipped, so a second call after
this one queues 0. Within a run, `isSameClaim` keeps a claim whose value, source, quotation, dates and approver are
identical; the same value with a different quotation replaces the row (the old row becomes `superseded`), which a parent
cannot see.

**Observable.** Each draft records `model = 'official-source-rules-v6'`, `sourceContext.evidenceMode = 'stored'` and the
`jobId`; each new claim records `approved_from_draft_id`; the queue row records status and `last_error`. The checks in
§5 read exactly these.

**Recoverable.** Every write is a row with a status: a new claim supersedes (never deletes) the old one, and a withdrawal
is a `disputed` status. §6 restores either in one statement. Nothing is deleted.

## 3. Expected changes, simulated

The simulation ran the v6 extractor and the auto-approval and reconciliation rules over the replay corpus (the latest
stored reading of each of these venues' own pages, exported read-only on 7 October; every sentence mentioning a
facility, buggies, food, parking or ages) against the 80 active claims exported read-only today. The live run reads the
same pages in full, so it can only differ by sentences the corpus filter dropped, which by construction mention none of
the extracted subjects.

| Outcome | Count |
| --- | ---: |
| New facts added | **16** at 13 venues |
| Corrected (value changes) | **1** (Colne Valley parking: "no" → "yes") |
| Withdrawn (page no longer supports the value under v6) | **7** |
| Same value, different quotation (row replaced, nothing visible changes) | 18 |
| Untouched | 51 |
| Venues with any visible change | 14 of 21 |

**Added:**

| Venue | Fact | The page's words |
| --- | --- | --- |
| Gunnersbury Park | wheelchair access: yes | "Step-free access is available throughout the museum, with some ramps and slopes" |
| Museum of the Home | wheelchair access: yes (its first fact; the venue leaves `ai_draft`) | "Step-free access is available to the Museum and to our galleries." |
| RAF Museum London | wheelchair access: yes | "We have step free access around our site and lifts to upper levels." |
| National Maritime Museum | wheelchair access: yes | "The building has accessible lifts to every floor." |
| Saatchi Gallery | wheelchair access: yes | "All floors have lifts and there is level access between the Galleries on each floor." |
| William Morris Gallery | wheelchair access: yes | "an entrance with a ramp, accessible toilets and lift access to all floors" |
| Sydenham Hill Wood | wheelchair access: yes | "The two entrances into Dulwich Wood … are wheelchair accessible" |
| Cutty Sark | toilets: yes; café: yes | "accessible cubicles in both the men's and the women's toilets"; "The main toilets are next to the cafe in the Dry Berth" |
| Mudchute Park and Farm | toilets: yes | "Toilets, including a disabled toilet, are available in the courtyard" |
| Chiswick House | toilets: yes | "Baby changing is available in the toilets by the Café" |
| Hackney City Farm | toilets: yes; café: yes | "There is an accessible toilet and baby changing facilities in the cafe." |
| Tate Modern | café: yes | "Tate Modern Corner Cafe, Bar, Venue Opening times …" |
| Victoria and Albert Museum | café: yes | "Main Café – 10.00 – 17.00 … Garden Café" |
| Northala Fields | parking: yes | "car parks are locked in accordance with park locking times" |

**Withdrawn, and why each is right:**

| Venue | Claim | Why v6 no longer supports it |
| --- | --- | --- |
| Sydenham Hill Wood | accessible toilet: yes | The quotation is "The **nearest** Changing Places Toilet can be found in Dulwich Park": off site. |
| Colne Valley Regional Park | parking: no | "Parking is not permitted on Denham Court Drive" is a road, not the park; the same page says "There are two carparks", which becomes the new claim. |
| Colne Valley Regional Park | environment: outdoor | The quotation ("get outdoor active or just relax") is a marketing line, not a statement about the site. The park is outdoors, but this page does not say so; the field returns to unknown until a page does. |
| Queen Elizabeth Olympic Park | café: yes | The quotation is a navigation menu ("Bars Cafés Grab and Go Restaurants"), not a sentence. |
| Queen Elizabeth Olympic Park | parking: yes | "Lee Valley VeloPark Venue car parking" is another venue's car park. |
| Queen Elizabeth Olympic Park | free parking: no | "The nearby Olympic Park Avenue has on-street pay and display" is a street, not the park. |
| Whitechapel Gallery | free parking: no | "Buckle Street Multistorey Car Park" is not the gallery's. |

The seven are the same three parking misreads #176 was written for, plus four more the v6 rules catch for the same
reason (off-site or non-sentence text). Each withdrawal removes a fact a parent would have been wrong to rely on.

**Not in the simulation, and why:** venues' facts outside the seven facility fields and the two access fields are not
affected by v6 and are not in the corpus; they are left exactly as they are. Pending human-review drafts at these venues
are replaced by the v6 draft, which is the normal effect of any new reading.

## 4. Preconditions (read-only; checked today, re-check at run time)

- main is `ce5b8fa` or later and the production deployment of it reads "Deployment has completed" (checked 09:35 UTC).
- Free posture canary on main: passed (run 37758289899).
- Scheduler healthy: `familypilot-automatic-enrichment` 1,440 runs in 24 h, 0 failed; no job `failed` or `processing`.
- The run must start **before 10 October** for Museum of the Home, and before 14 October for the rest.

```sql
select status, count(*) from venue_enrichment_jobs where updated_at > now() - interval '1 hour' group by 1;
select count(*) from venue_enrichment_jobs where status in ('processing','failed');  -- expect 0
```

## 5. The command (Supabase SQL editor, service role) — waits for your approval

```sql
select public.enqueue_reextract_jobs('official-source-rules-v6', 25, array[
  'fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY', -- Gunnersbury Park
  'fp-google-ChIJKUrjG7wcdkgRbfTuKDBgWXI', -- Museum of the Home
  'fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc', -- Royal Air Force Museum London
  'fp-google-ChIJs_wmr0cWa0gRZpEqERRReXQ', -- Queen's House
  'fp-google-ChIJs_wmr0cWa0gRHr60qjwn1Mo', -- National Maritime Museum
  'fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8', -- Saatchi Gallery
  'fp-google-ChIJczuZfc0adkgRc8X-u3ZiHcE', -- The Wallace Collection
  'fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM', -- William Morris Gallery
  'fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI', -- London Eye
  'fp-google-ChIJId2oNroFdkgReafXXIrGnkY', -- Frameless
  'fp-google-ChIJAVlhMIUCdkgRCJEgHVbITq4', -- Cutty Sark
  'fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI', -- Mudchute Park and Farm
  'fp-osm-679119297',                      -- Chiswick House
  'fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y', -- Hackney City Farm
  'fp-google-ChIJlRl2MakEdkgR55tr4CNv_B8', -- Tate Modern
  'fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54', -- Victoria and Albert Museum
  'fp-google-ChIJN3hATcsSdkgRPscumUj6FqU', -- Northala Fields
  'fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY', -- Sydenham Hill Wood
  'fp-google-ChIJq-jJARlxdkgRNLTE490EqVU', -- Colne Valley Regional Park
  'fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8', -- Queen Elizabeth Olympic Park
  'fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM'  -- Whitechapel Gallery
]);
-- expected return: 21
```

**After about 30 minutes, the checks:**

```sql
-- (a) every job finished
select familypilot_place_id, status, last_error from venue_enrichment_jobs
where mode='reextract' and updated_at > now() - interval '2 hours' order by status;

-- (b) the v6 drafts exist, one per venue, from stored evidence
select familypilot_place_id, status, source_context->>'evidenceMode' as evidence_mode
from venue_enrichment_drafts where model='official-source-rules-v6';

-- (c) what was published: expect the 16 additions and the Colne Valley correction above
select p.name, c.field_key, c.value_json, c.checked_at, c.valid_until, c.source_url
from venue_claims c join place_records p using (familypilot_place_id)
join venue_enrichment_drafts d on d.id = c.approved_from_draft_id
where d.model='official-source-rules-v6' and c.status='active'
  and not exists (select 1 from venue_claims s where s.id = c.supersedes_claim_id and s.value_json = c.value_json)
order by p.name, c.field_key;

-- (d) what was withdrawn: expect the 7 ids below and no other
select id, familypilot_place_id, field_key, value_json from venue_claims
where status='disputed' and updated_at > now() - interval '2 hours';
-- 24a699e3-1e99-46ac-8f45-b50e8d4e536a  Sydenham Hill Wood accessible toilet
-- eabed57d-f4e9-45a7-a8b6-f2746451cb89  Colne Valley parking
-- e96b04e6-ca08-4830-b4f2-3010fdafc334  Colne Valley environment
-- 9576b5fb-1505-4b22-b953-b9b70a688013  QEOP cafe
-- 37cf3fa6-7b0f-4905-b2e8-9b3dbd85cead  QEOP parking
-- be6f2b75-2265-4e2a-ae87-1e7021c5eb9b  QEOP free parking
-- e7f221fa-9e6f-406e-8645-d7557cdc00a9  Whitechapel free parking

-- (e) no Google use today beyond the Monday/Thursday area sync
select * from google_places_usage where day = current_date;

-- (f) coverage: expect 69 (68 today + Museum of the Home)
-- the query in PRODUCTION_RECOVERY_PLAN.md with the 134 ids
```

Then one production look at Venue Detail: Museum of the Home (wheelchair access), Colne Valley (parking), Cutty Sark
(toilets, café).

## 6. Undo

Per withdrawn claim (a `disputed` row with no replacement): set it back.

```sql
update venue_claims set status='active', updated_at=now() where id='<claim id>' and status='disputed'
  and not exists (select 1 from venue_claims a where a.familypilot_place_id=venue_claims.familypilot_place_id
                  and a.field_key=venue_claims.field_key and a.status='active');
```

Per replaced claim (the Colne Valley correction, or any same-value re-quote): one transaction, mark the new row
`disputed` and restore the row it names.

```sql
begin;
update venue_claims set status='disputed', updated_at=now() where id='<new claim id>';
update venue_claims set status='active', updated_at=now()
  where id = (select supersedes_claim_id from venue_claims where id='<new claim id>');
commit;
```

Per added claim: `update venue_claims set status='disputed' where id='<new claim id>'`. The Venue Detail and Family Fit
read served claims on every request, so each undo is visible at once. Nothing is deleted at any step.

## 7. What this step does not do

- It does not touch the website-identity rescope (Step 2), which stays a separate approval with its own dry run.
- It does not fetch any page, so a venue whose stored pages say nothing stays as it is.
- It does not change the scheduled refresh: the 31 October expiries are still refetched from 16 and 22–24 October.
