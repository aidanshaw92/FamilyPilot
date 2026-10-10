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
