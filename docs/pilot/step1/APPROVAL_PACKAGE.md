# Step 1 final approval package (17 venues)

Prepared 9 October 05:50 UTC; snapshot re-verified **07:31 UTC**. **Not executed. I will run nothing until you say "run A" / "run B".**

## Snapshot: still matches (read-only checks at 07:31 UTC, repeated from 05:47)

| Check | Result |
|---|---|
| Active claims at the 21 venues | **76**, id fingerprint **`882b02667bf8e90022b7c0150b8c2fae`** (same as the analysis and the rollback) |
| Last change to any of them | 7 Oct 15:29 (nothing since) |
| The function's own eligibility rule applied to the 17 | **17 of 17** eligible; oldest stored reading 27 Sep 00:36 UTC |
| Open or pending enrichment jobs | **0** (any venue) |
| Google usage today (before any Step 1 action) | **Not none:** 9 nearby_search, **1 place_details (06:25 UTC)**, **44 place_photos (06:27 UTC)**, all `production`, all from normal app use by a person (the photo switch is not yet set, and a parent opening a venue can still buy one Place Details). **None is from Step 1**: no job exists. Use these as the baseline; the ledger cannot tell a parent's call from a job's, so the proof that Run A makes none is the code path below, not the ledger |

**Deadline: 10 October 00:36 UTC.** Museum of the Home's stored reading passes 13 days then; after that the command returns 16 and only that venue's wheelchair fact is lost. Nothing else expires.

## Why 17 is safer than 18 (and 21)

The 18-venue version also let the job **replace** Colne Valley's wrong "parking: no" with "parking: **yes**". The only source for the "yes" is the Denham Country Park visitor-centre page (same postcode as the catalogue pin), but the catalogue calls the place "Colne Valley **Regional Park**", so publishing it states parking for a very large park from one page. The 17 leaves Colne Valley out of the job and **only withdraws the wrong claim**, so parking returns to *unknown*. The three further venues dropped from 21 (Frameless, Tate Modern, Chiswick House) would only have swapped stronger quotations for weaker ones.

## Run A: queue the stored-page re-read for 17 venues

Expected result: **17**. A second call returns 0 (idempotent).

```sql
select public.enqueue_reextract_jobs('official-source-rules-v6', 25, array[
  'fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY','fp-google-ChIJKUrjG7wcdkgRbfTuKDBgWXI','fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc',
  'fp-google-ChIJs_wmr0cWa0gRZpEqERRReXQ','fp-google-ChIJs_wmr0cWa0gRHr60qjwn1Mo','fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8',
  'fp-google-ChIJczuZfc0adkgRc8X-u3ZiHcE','fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM','fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI',
  'fp-google-ChIJAVlhMIUCdkgRCJEgHVbITq4','fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI','fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y',
  'fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54','fp-google-ChIJN3hATcsSdkgRPscumUj6FqU','fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY',
  'fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8','fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM'
]);
```

**What it changes:** inserts 17 `reextract` jobs. The existing every-minute worker then re-reads each venue's **stored** page text with the v6 extractor and publishes through the ordinary approval pipeline. Net effect: **4 withdrawals, 16 additions, 1 same-value re-quote (London Eye, trailing space)**.

Venues (name → id): Gunnersbury Park `…ChIJrcFVE-YNdkgRJQPxAxaTnMY`, Museum of the Home `…KUrjG7wcdkgRbfTuKDBgWXI`, Royal Air Force Museum `…se1x6SoRdkgR83yrIhNV5gc`, Queen's House `…s_wmr0cWa0gRZpEqERRReXQ`, National Maritime Museum `…s_wmr0cWa0gRHr60qjwn1Mo`, Saatchi Gallery `…97pX3M0EdkgR8YFd4G1GZJ8`, The Wallace Collection `…czuZfc0adkgRc8X-u3ZiHcE`, William Morris Gallery `…f9LtmOcddkgRRv6MezIdvSM`, London Eye `…c2nSALkEdkgRkuoJJBfzkUI`, Cutty Sark `…AVlhMIUCdkgRCJEgHVbITq4`, Mudchute Park and Farm `…p8y37pgCdkgRBeRSa2iabyI`, Hackney City Farm `…vS60MMEcdkgRSMlH5VxD51Y`, Victoria and Albert Museum `…w1d-sUMFdkgRH2XN_U0Jt54`, Northala Fields `…N3hATcsSdkgRPscumUj6FqU`, Sydenham Hill Wood `…F4YXjN4DdkgRvJe2-r5usvY`, Queen Elizabeth Olympic Park `…kf4NDG8ddkgRXEINXuEbip8`, Whitechapel Gallery `…zZtNX7UcdkgRzycysU2TrhM` (all `fp-google-ChIJ…`).

### Withdrawn by Run A (4), each back to unknown, nothing deleted

| Venue, fact | Claim | The page's own words |
|---|---|---|
| Sydenham Hill Wood: accessible toilet "yes" | `24a699e3-1e99-46ac-8f45-b50e8d4e536a` | "The **nearest** Changing Places Toilet can be found in **Dulwich Park**" |
| Queen Elizabeth Olympic Park: parking "yes" | `37cf3fa6-7b0f-4905-b2e8-9b3dbd85cead` | "**Lee Valley VeloPark** Venue car parking is available… for facility users" |
| Queen Elizabeth Olympic Park: free parking "no" | `be6f2b75-2265-4e2a-ae87-1e7021c5eb9b` | "…on-street pay and display spaces **and Blue Badge spaces**" |
| Whitechapel Gallery: free parking "no" | `e7f221fa-9e6f-406e-8645-d7557cdc00a9` | "**Free parking for Blue Badge holders** is available at the top of Osborn Street" |

### Added by Run A (16), each valid 30 days from its reading

Wheelchair access "yes" at 9 venues (Gunnersbury, Museum of the Home, RAF Museum, Queen's House, National Maritime Museum, Saatchi, Wallace Collection, William Morris Gallery, London Eye); toilets "yes" at Cutty Sark, Mudchute, Hackney City Farm; café "yes" at Cutty Sark, Hackney City Farm, V&A; parking "yes" at Northala Fields. Quotations for each are in `APPROVAL.md`. Nine are wheelchair "yes" claims from the automatic rule you approved; they are positive statements. If you want a person to see those nine first, say so and I drop them from the run.

## Run B: Colne Valley, withdraw only (hardened; run ONLY after Run A has finished and its post-run checks have passed)

Run B is one transaction that **refuses to start, changing nothing, unless Run A is demonstrably complete** (no job pending or processing anywhere; all 17 re-read jobs completed without error after Run A began; a v6 draft for each of the 17; the four Run A withdrawals no longer active; the Colne claim still active; exactly 88 active claims at the 21 venues), and then **aborts the whole transaction unless both rows change** (the claim and the served parking value). Expected message: `Run B done: 1 claim and 1 served row changed`, then `87`. Running it twice is refused. Tested locally on seven cases (success; second run; before Run A; a job still processing; a withdrawn claim still active; only one of the two rows updatable, where the claim stayed active; a job from an earlier day): `RUN_B_TEST.md`.

```sql
-- Run B: Colne Valley, withdraw only. Run it ONLY after Run A has finished and post-run-checks.sql has passed.
-- One transaction, all or nothing. It refuses to start (nothing is changed) unless Run A is complete:
--   * no enrichment job is pending or processing anywhere;
--   * all 17 venues' re-read jobs are 'completed' with no error, and each has an official-source-rules-v6 draft written after 07:31 UTC on 9 Oct;
--   * the four claims Run A withdraws are no longer active, and the Colne Valley claim being withdrawn is still active;
--   * the 21 venues hold exactly 88 active claims (76 - 4 withdrawn + 16 added).
-- It then updates exactly two rows (the claim and the served parking value) and aborts the whole transaction unless BOTH changed.
-- Expected result: "Run B done: 1 claim and 1 served row changed". Running it a second time aborts, because Run A's state no longer holds.
begin;
do $$
declare
  ids17 text[] := array[
    'fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY','fp-google-ChIJKUrjG7wcdkgRbfTuKDBgWXI','fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc',
    'fp-google-ChIJs_wmr0cWa0gRZpEqERRReXQ','fp-google-ChIJs_wmr0cWa0gRHr60qjwn1Mo','fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8',
    'fp-google-ChIJczuZfc0adkgRc8X-u3ZiHcE','fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM','fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI',
    'fp-google-ChIJAVlhMIUCdkgRCJEgHVbITq4','fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI','fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y',
    'fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54','fp-google-ChIJN3hATcsSdkgRPscumUj6FqU','fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY',
    'fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8','fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM']::text[];
  ids21 text[];
  n integer; claim_rows integer; served_rows integer;
begin
  ids21 := ids17 || array['fp-google-ChIJq-jJARlxdkgRNLTE490EqVU','fp-google-ChIJId2oNroFdkgReafXXIrGnkY','fp-osm-679119297','fp-google-ChIJlRl2MakEdkgR55tr4CNv_B8']::text[];

  select count(*) into n from public.venue_enrichment_jobs where status in ('pending', 'processing');
  if n <> 0 then raise exception 'Run B refused: % enrichment job(s) are still pending or processing. Wait for Run A to finish. Nothing was changed.', n; end if;

  select count(*) into n from public.venue_enrichment_jobs
   where familypilot_place_id = any (ids17) and mode = 'reextract' and status = 'completed' and last_error is null and updated_at > '2026-10-09 07:31:00+00';
  if n <> 17 then raise exception 'Run B refused: % of 17 re-read jobs are completed without error after Run A started. Nothing was changed.', n; end if;

  select count(distinct familypilot_place_id) into n from public.venue_enrichment_drafts
   where model = 'official-source-rules-v6' and generated_at > '2026-10-09 07:31:00+00' and familypilot_place_id = any (ids17);
  if n <> 17 then raise exception 'Run B refused: % of 17 venues have a v6 draft from Run A. Nothing was changed.', n; end if;

  select count(*) into n from public.venue_claims
   where status = 'active' and id in ('24a699e3-1e99-46ac-8f45-b50e8d4e536a','37cf3fa6-7b0f-4905-b2e8-9b3dbd85cead','be6f2b75-2265-4e2a-ae87-1e7021c5eb9b','e7f221fa-9e6f-406e-8645-d7557cdc00a9');
  if n <> 0 then raise exception 'Run B refused: % of the four claims Run A withdraws are still active. Nothing was changed.', n; end if;

  select count(*) into n from public.venue_claims
   where status = 'active' and id = 'eabed57d-f4e9-45a7-a8b6-f2746451cb89' and field_key = 'familyFacilities.parking' and familypilot_place_id = 'fp-google-ChIJq-jJARlxdkgRNLTE490EqVU';
  if n <> 1 then raise exception 'Run B refused: the Colne Valley claim is not active as expected (already withdrawn?). Nothing was changed.'; end if;

  select count(*) into n from public.venue_claims where status = 'active' and familypilot_place_id = any (ids21);
  if n <> 88 then raise exception 'Run B refused: the 21 venues hold % active claims, expected 88 after Run A. Nothing was changed.', n; end if;

  update public.venue_claims set status = 'disputed', updated_at = now()
   where id = 'eabed57d-f4e9-45a7-a8b6-f2746451cb89' and status = 'active' and field_key = 'familyFacilities.parking';
  get diagnostics claim_rows = row_count;

  update public.venue_family_metadata set family_facilities = family_facilities - 'parking', updated_at = now()
   where familypilot_place_id = 'fp-google-ChIJq-jJARlxdkgRNLTE490EqVU' and family_facilities ->> 'parking' = 'no';
  get diagnostics served_rows = row_count;

  if claim_rows <> 1 or served_rows <> 1 then
    raise exception 'Run B aborted: expected 1 claim and 1 served row, changed % and %. Nothing was changed.', claim_rows, served_rows;
  end if;
  raise notice 'Run B done: % claim and % served row changed', claim_rows, served_rows;
end $$;
commit;
select count(*) as active_claims_at_21_venues from public.venue_claims where status = 'active' and familypilot_place_id = any (array[
  'fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY','fp-google-ChIJKUrjG7wcdkgRbfTuKDBgWXI','fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc','fp-google-ChIJs_wmr0cWa0gRZpEqERRReXQ','fp-google-ChIJs_wmr0cWa0gRHr60qjwn1Mo','fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8',
  'fp-google-ChIJczuZfc0adkgRc8X-u3ZiHcE','fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM','fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI','fp-google-ChIJId2oNroFdkgReafXXIrGnkY','fp-google-ChIJAVlhMIUCdkgRCJEgHVbITq4','fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI',
  'fp-osm-679119297','fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y','fp-google-ChIJlRl2MakEdkgR55tr4CNv_B8','fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54','fp-google-ChIJN3hATcsSdkgRPscumUj6FqU','fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY',
  'fp-google-ChIJq-jJARlxdkgRNLTE490EqVU','fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8','fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM']::text[]);
-- expected: 87
```

**What it changes:** the claim "parking: no" (`eabed57d-f4e9-45a7-a8b6-f2746451cb89`, from "Parking is not permitted on Denham Court Drive", a rule about one road) is withdrawn, and the served row loses its `parking` key, so Colne Valley parking is **unknown**. Nothing is published in its place. *Known limit:* the scheduled refresh on 24 October uses the same extractor and would publish "parking: yes" from the visitor-centre sentence automatically; closing that needs a rename of the catalogue entry or a scoping rule, which is not part of this approval.

**Order:** Run A → I run `post-run-checks.sql` (about 30 minutes later) and report → only if it passes, you approve Run B → I run it.

## Expected result

Active claims at the 21 venues: **87** = 76 − 4 (Run A) − 1 (Run B) + 16. Three left-out venues (Frameless, Tate Modern, Chiswick House) untouched. Colne Valley keeps toilets, baby changing, playground and "parking charges apply" and has no parking value.

## No paid provider, crawler or model call

- The job mode is `reextract`: the worker reads the venue's **latest stored** page text; it has no code path to fetch a page, call a model or call Google in this mode (tests: `evidence-reprocess.test.ts`, including "never builds the request when access is disabled", which also runs in the 3363-test suite).
- Real `main` code was run offline over the same stored pages for all three variants with 0 network attempts (`real-run.json`).
- After the run I check that no `place_details` / `text_search` usage row exists for today (`post-run-checks.sql`, check 8).

## Rollback (`rollback-2026-10-08.sql`, paste as ONE run, attached)

One transaction: marks everything the run wrote not-active, re-activates what it replaced or withdrew (the 5 named claims included, so Colne Valley's too), restores the 21 served rows to the 8 October snapshot (hash-checked against production), then **a guard aborts the whole transaction unless the result is exactly 76 active claims with fingerprint `882b02667bf8e90022b7c0150b8c2fae`**. Tested today on a local PostgreSQL 16 seeded with the post-run state (87 active): returned 76 and the exact fingerprint; and with a deliberately tampered state it aborted with "Rollback check failed" and changed nothing. Use it only if no one else has edited these venues since the run.

## After you approve

Run A → ~30 minutes → I run `post-run-checks.sql` (read-only) and report. **Run B waits for that report and your separate approval.** I repair nothing by hand.
