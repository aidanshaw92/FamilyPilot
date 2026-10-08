# Production recovery plan: the existing-facts fixes, step by step

2026-10-08. Nothing here has been run. **Every step below writes to production and waits for your go.** Each lists:

- the exact command;
- what it may touch;
- the expected result;
- the checks to run afterwards;
- how to undo it.

None makes a Google request.

## Coverage, before and after (134 London destinations; at least one fact shown on Venue Detail)

| Stage | Destinations | What changes | Writes data? |
| --- | ---: | --- | --- |
| Production before #174 | 55 | | |
| #174 deployed (display only) | **68** | playground, accessible toilet and wheelchair facts already held are shown | no |
| Step 1 (stored pages, v5 and v6 rules) | 69 | Museum of the Home gains its first fact; 17 venues gain more; 3 wrong facts withdrawn | yes |
| Step 2 (rescope + your review) | 74 | Crystal Palace Park, Madame Tussauds, Primrose Hill, Tooting Commons, Walthamstow Wetlands | yes |
| Step 3 (#181, if you approve it) | 74 + up to 26 | sites wrongly read as blocked, *if* the hypothesis holds | yes |

**The audit projected 82; 74 is what the evidence supports.** The audit counted true sentences per field, without
checking three things:

- whether another page already gave the field;
- whether existing rules leave it unknown on purpose;
- whether the venue is a draft with nothing publishable.

`EXTRACTION_PILOT.md` and `DRAFT_DESTINATIONS_AUDIT.md` have the detail.

## Step 0: preconditions (read-only; I run these)

- #175, #176 and #177 are merged, and the production deployment of the merge commit reads **Deployment has
  completed**.
- The free posture canary passes on main.
- The latest job outcomes are healthy: no `failed` jobs from the last hour.

  ```sql
  select status, count(*) from venue_enrichment_jobs where updated_at > now() - interval '1 hour' group by 1;
  ```

## Step 1: apply the new extraction rules to stored pages (no network)

**When:** the day #177 deploys, and **no later than 10 October**. The queue only takes a venue whose newest own-page
reading is under 13 days old. The 26–27 September readings (Museum of the Home) drop out first; the 1–2 October ones
follow on 14–15 October. A venue that misses the window still gets the same rules from its scheduled refetch on
22–24 October.

**Command** (Supabase SQL editor, as the service role):

```sql
select public.enqueue_reextract_jobs('official-source-rules-v6', 25, array[
  -- extraction pilot, rules v6 (EXTRACTION_PILOT.md)
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
  'fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY', -- Sydenham Hill Wood (withdraws a wrong accessible toilet)
  -- parking corrections, rules v5 (PARKING_MISREADS.md)
  'fp-google-ChIJq-jJARlxdkgRNLTE490EqVU', -- Colne Valley Regional Park
  'fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8', -- Queen Elizabeth Olympic Park (VeloPark)
  'fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM'  -- Whitechapel Gallery
]);
```

- **Bounded.** At most 21 jobs, and the every-minute worker takes one at a time, so the step finishes in about 25
  minutes.
- **No network.** `reextract` re-reads stored text only. Claims keep the date of their reading, so nothing is extended.
- **The return value** is how many were queued. Fewer than 21 means some readings are already past the window. They
  are then covered by the scheduled refetch, not lost.

**Expected:**

- 20 new facts at 18 venues;
- Colne Valley parking corrected from "none on site" to "yes";
- Queen Elizabeth Olympic Park's "parking yes / free parking no" and Whitechapel's "free parking no" withdrawn;
- Sydenham Hill Wood's accessible toilet withdrawn.

**Check:**

```sql
-- What the run did: claims created or withdrawn by v6 drafts in the last two hours.
select p.name, c.field_key, c.value_json, c.status, c.checked_at, c.valid_until
from venue_claims c join place_records p using (familypilot_place_id)
join venue_enrichment_drafts d on d.id = c.approved_from_draft_id
where d.model = 'official-source-rules-v6' and c.updated_at > now() - interval '2 hours'
order by p.name, c.field_key;

-- The four claims that must no longer be served.
select id, status from venue_claims where id in (
  'eabed57d-f4e9-45a7-a8b6-f2746451cb89','37cf3fa6-7b0f-4905-b2e8-9b3dbd85cead','be6f2b75-2265-4e2a-ae87-1e7021c5eb9b');
```

**Undo** (per claim, in one transaction):

1. Mark the new claim `disputed`.
2. Set the `superseded` row it names in `supersedes_claim_id` back to `active`.

Nothing is deleted.

**If a correction does not happen** (for example the reading fell out of the window), the staged SQL in
`PARKING_MISREADS.md` withdraws the three parking claims directly. That's a separate approval.

## Step 2: website identity (#175)

1. **Dry run** (read-only; I can run it for you):

   ```sh
   node scripts/rescope-evidence.mjs
   ```

   Expected: 64 rows become eligible across 9 venues. The report lists each row with the facts it carries.

2. **Pause the every-minute worker,** so nothing auto-approves halfway through the write:

   ```sql
   select cron.alter_job(job_id := 2, active := false);
   ```

3. **Write** (widening changes only; the 35 narrowing rows are not written):

   ```sh
   RESCOPE_CONFIRM=yes node scripts/rescope-evidence.mjs --write
   ```

   This needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment. Every written row records
   `rescoped_2026_10 from <old scope>: <reason>`.

4. **Resume:**

   ```sql
   select cron.alter_job(job_id := 2, active := true);
   ```

5. **Re-run the stored pages** for the venues whose readings are still in the window:

   ```sql
   select public.enqueue_reextract_jobs('official-source-rules-v6', 10, array[
     'fp-google-ChIJgZ24Us4adkgRpDNAwNPO_SY', -- Madame Tussauds London
     'fp-google-ChIJ2yb0sesadkgRIQOyE6qMxLU', -- Primrose Hill
     'fp-google-ChIJi104LjcFdkgRnzOHTtw-7kM', -- Tooting Commons
     'fp-google-ChIJgUtOcjEcdkgR6Y_NLIc0XBQ'  -- Walthamstow Wetlands
   ]);
   ```

   Crystal Palace Park's readings date from 11 September, so it needs one website read first (no Google):

   ```sql
   select public.enqueue_venue_enrichment_jobs('refetch_official', array['fp-google-ChIJ94vQ-0IBdkgRxsGErkV2hZo']);
   ```

6. **Review.** Rescoped evidence is never approved automatically. A person approves the 17 true facts and declines the
   4 rejected ones in the internal review screen. `WEBSITE_IDENTITY.md` lists each fact, with its words.

**Undo:** for each written row, restore the scope named after `from` in its `subject_scope_reason`:

```sql
update venue_source_evidence
set subject_scope = split_part(split_part(subject_scope_reason, 'from ', 2), ':', 1),
    subject_scope_reason = null
where subject_scope_reason like 'rescoped_2026_10 from %';
```

## Step 3: the detector (#181), only if you approve that PR

After it deploys, read three of the "blocked" museums' own sites once (no Google):

```sql
select public.enqueue_venue_enrichment_jobs('refetch_official', array[
  'fp-google-ChIJB9OTMDIbdkgRp0JWbQGZsS8', -- The British Museum
  'fp-google-ChIJP9oAE0MFdkgR3iKGFKZO1SE', -- Science Museum
  'fp-google-ChIJQzRbYMUNdkgRfvuRYk-Rb9E'  -- Royal Botanic Gardens, Kew
]);
```

**Check:**

```sql
select familypilot_place_id, source_url, fetch_status, http_status, length(extracted_text) as text_len
from venue_source_evidence
where familypilot_place_id in ('fp-google-ChIJB9OTMDIbdkgRp0JWbQGZsS8','fp-google-ChIJP9oAE0MFdkgR3iKGFKZO1SE','fp-google-ChIJQzRbYMUNdkgRfvuRYk-Rb9E')
  and retrieved_at > now() - interval '2 hours';
```

**Reading the result:**

- `ok` rows with text mean the hypothesis is confirmed. The scheduled refetch then reads the other 23 from 22 October.
- `blocked` rows with `http_status` 403 mean the sites really refuse us. Those venues need a different evidence source.

## Step 4 (optional): scheduled refresh without Google

`docs/sql/replenish_without_google.sql`; see `EVIDENCE_EXPIRY_PROTECTION.md` §4. Apply it before 13 October if you want
the refresh to make no Google call at all.

## After each step: does it reach the app?

The display needs no deploy: Home, Explore, Venue Detail and Family Fit read served claims on every request. I check
each step by:

1. **Coverage** with the query below (the 134 ids are in `docs/data/served-claims-2026-10-08.csv` and the audit
   export).
2. **Venue Detail** on production for one changed venue per step:
   - Museum of the Home: wheelchair access;
   - Colne Valley: parking;
   - Walthamstow Wetlands: toilets, café.
3. **Family Fit:** a recovered facility appears as logistics only. It never makes a child "suited"; the semantic test
   suite pins this.

```sql
-- Destinations (of the given ids) showing at least one Venue Detail fact.
select count(distinct c.familypilot_place_id)
from venue_claims c join venue_family_metadata m using (familypilot_place_id)
where c.status = 'active' and c.valid_until >= current_date and c.approved_by <> 'ai_auto_approved'
  and m.enrichment_status <> 'ai_draft'
  and c.field_key in ('familyFacilities.toilets','familyFacilities.babyChanging','familyFacilities.parking',
    'familyFacilities.freeParking','familyFacilities.cafe','familyFacilities.playground','pushchairSuitability',
    'accessibility.wheelchairAccessible','accessibility.accessibleToilet')
  and c.familypilot_place_id = any (:ids);
```
