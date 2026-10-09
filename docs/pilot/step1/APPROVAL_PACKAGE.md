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

## Run B: Colne Valley, withdraw only (run after A; run once)

Expected: **UPDATE 1**, **UPDATE 1**. Re-running changes nothing.

```sql
begin;
update public.venue_claims
   set status = 'disputed', updated_at = now()
 where id = 'eabed57d-f4e9-45a7-a8b6-f2746451cb89' and status = 'active' and field_key = 'familyFacilities.parking';
update public.venue_family_metadata
   set family_facilities = family_facilities - 'parking', updated_at = now()
 where familypilot_place_id = 'fp-google-ChIJq-jJARlxdkgRNLTE490EqVU' and family_facilities ->> 'parking' = 'no';
commit;
```

**Changes:** the claim "parking: no" (`eabed57d-f4e9-45a7-a8b6-f2746451cb89`, from "Parking is not permitted on Denham Court Drive", a rule about one road) is withdrawn, and the served row loses its `parking` key, so Colne Valley parking is **unknown**. Nothing is published in its place. *Known limit:* the scheduled refresh on 24 October uses the same extractor and would publish "parking: yes" from the visitor-centre sentence automatically; closing that needs a rename of the catalogue entry or a scoping rule, which is not part of this approval.

## Expected result

Active claims at the 21 venues: **87** = 76 − 4 (Run A) − 1 (Run B) + 16. Three left-out venues (Frameless, Tate Modern, Chiswick House) untouched. Colne Valley keeps toilets, baby changing, playground and "parking charges apply" and has no parking value.

## No paid provider, crawler or model call

- The job mode is `reextract`: the worker reads the venue's **latest stored** page text; it has no code path to fetch a page, call a model or call Google in this mode (tests: `evidence-reprocess.test.ts`, including "never builds the request when access is disabled", which also runs in the 3363-test suite).
- Real `main` code was run offline over the same stored pages for all three variants with 0 network attempts (`real-run.json`).
- After the run I check that no `place_details` / `text_search` usage row exists for today (`post-run-checks.sql`, check 8).

## Rollback (`rollback-2026-10-08.sql`, paste as ONE run, attached)

One transaction: marks everything the run wrote not-active, re-activates what it replaced or withdrew (the 5 named claims included, so Colne Valley's too), restores the 21 served rows to the 8 October snapshot (hash-checked against production), then **a guard aborts the whole transaction unless the result is exactly 76 active claims with fingerprint `882b02667bf8e90022b7c0150b8c2fae`**. Tested today on a local PostgreSQL 16 seeded with the post-run state (87 active): returned 76 and the exact fingerprint; and with a deliberately tampered state it aborted with "Rollback check failed" and changed nothing. Use it only if no one else has edited these venues since the run.

## After you approve

Run A → ~30 minutes → I run `post-run-checks.sql` (read-only) and report. Run B can follow Run A immediately. I repair nothing by hand.
