-- Step 1 post-run checks (read-only). Run about 30 minutes after the command; repeat if a job is still pending.
-- Expected values are in the comments.

-- 1. Jobs: 17 rows, all completed, last_error empty.
select familypilot_place_id, mode, status, attempts, last_error
from public.venue_enrichment_jobs
where familypilot_place_id = any (array['fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY','fp-google-ChIJKUrjG7wcdkgRbfTuKDBgWXI','fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc','fp-google-ChIJs_wmr0cWa0gRZpEqERRReXQ','fp-google-ChIJs_wmr0cWa0gRHr60qjwn1Mo','fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8','fp-google-ChIJczuZfc0adkgRc8X-u3ZiHcE','fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM','fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI','fp-google-ChIJAVlhMIUCdkgRCJEgHVbITq4','fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI','fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y','fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54','fp-google-ChIJN3hATcsSdkgRPscumUj6FqU','fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY','fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8','fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM']::text[])
order by status, familypilot_place_id;

-- 2. One official-source-rules-v6 draft per venue: 18 rows = the 17 venues + Headstone Manor's draft, which the scheduler wrote at 2026-10-09 00:17 UTC before the run
--    (16+1 if Museum of the Home was already outside its window).
select count(*) as v6_drafts, count(distinct familypilot_place_id) as venues from public.venue_enrichment_drafts where model = 'official-source-rules-v6';

-- 3. The five claims are no longer active: 5 rows, none 'active' (four withdrawn by the job; Colne Valley's by colne-withdraw-only.sql).
select id, familypilot_place_id, field_key, value_json, status
from public.venue_claims
where id in ('24a699e3-1e99-46ac-8f45-b50e8d4e536a','eabed57d-f4e9-45a7-a8b6-f2746451cb89','37cf3fa6-7b0f-4905-b2e8-9b3dbd85cead','be6f2b75-2265-4e2a-ae87-1e7021c5eb9b','e7f221fa-9e6f-406e-8645-d7557cdc00a9');

-- 4. Everything the run wrote: 17 new active rows (16 added facts and the London Eye re-quote). Colne Valley has none: it publishes nothing about parking.
select c.familypilot_place_id, c.field_key, c.value_json, c.status, c.supersedes_claim_id is not null as replaces_one, left(c.evidence_excerpt, 70) as quote
from public.venue_claims c join public.venue_enrichment_drafts d on d.id = c.approved_from_draft_id
where d.model = 'official-source-rules-v6' and d.familypilot_place_id <> 'fp-google-ChIJIwA11GYTdkgRoeeAutW9svo' -- Headstone Manor: written by the scheduler, not by this run
order by c.familypilot_place_id, c.field_key;

-- 5. Active claims at the 21 venues: 87 (76 - 4 withdrawn by the job - 1 Colne Valley + 16 added; the re-quote nets to zero).
select count(*) as active_claims
from public.venue_claims
where status = 'active' and familypilot_place_id in (select familypilot_place_id from public.place_records where familypilot_place_id = any (array[
  'fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY','fp-google-ChIJKUrjG7wcdkgRbfTuKDBgWXI','fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc','fp-google-ChIJs_wmr0cWa0gRZpEqERRReXQ','fp-google-ChIJs_wmr0cWa0gRHr60qjwn1Mo','fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8',
  'fp-google-ChIJczuZfc0adkgRc8X-u3ZiHcE','fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM','fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI','fp-google-ChIJId2oNroFdkgReafXXIrGnkY','fp-google-ChIJAVlhMIUCdkgRCJEgHVbITq4','fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI',
  'fp-osm-679119297','fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y','fp-google-ChIJlRl2MakEdkgR55tr4CNv_B8','fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54','fp-google-ChIJN3hATcsSdkgRPscumUj6FqU','fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY',
  'fp-google-ChIJq-jJARlxdkgRNLTE490EqVU','fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8','fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM']::text[]));

-- 6. The three left-out venues are untouched: 0 rows (no claim created or changed since the snapshot). Colne Valley appears only in check 3.
select id, field_key, status, updated_at from public.venue_claims
where familypilot_place_id in ('fp-google-ChIJId2oNroFdkgReafXXIrGnkY','fp-osm-679119297','fp-google-ChIJlRl2MakEdkgR55tr4CNv_B8') and updated_at > '2026-10-08 22:00+00';

-- 7. What a parent now sees: Colne Valley has NO parking key (unknown) and keeps freeParking no, toilets, babyChanging, playground; the Sydenham Hill Wood accessible toilet is gone.
select familypilot_place_id, family_facilities, accessibility from public.venue_family_metadata
where familypilot_place_id in ('fp-google-ChIJq-jJARlxdkgRNLTE490EqVU','fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY','fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8','fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM');

-- 8. No paid Google call from the run. BASELINE before Run A, 9 Oct 07:31 UTC: place_details 1 (06:25), place_photos 44 (06:27), nearby_search 9, which are normal app use. Parents can still
--    buy a Place Details by opening a venue, so a higher number is not by itself the run's; check updated_at against the run window and that the reextract jobs' mode is 'reextract'.
--    Originally: no place_details / text_search row dated today (nearby_search and place_photos
--    move with app traffic and are not the run's; see the note in FINAL_GATE.md).
select usage_day, sku, calls, updated_at from public.google_places_usage where usage_day >= current_date and sku not in ('nearby_search', 'place_photos', 'geocoding');
