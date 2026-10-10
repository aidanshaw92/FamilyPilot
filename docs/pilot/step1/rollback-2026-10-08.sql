-- Step 1 rollback (the 17-venue run plus the Colne Valley withdrawal). Paste into the Supabase SQL editor as ONE run. It is a single transaction.
-- Use it only if the run has to be undone and nothing else has changed these venues since: step 3 restores the whole
-- venue_family_metadata serving row from the snapshot taken on 2026-10-08 (verified byte for byte against production).
begin;

create temporary table s1_ids on commit drop as
  select unnest(array[
    'fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY',
    'fp-google-ChIJKUrjG7wcdkgRbfTuKDBgWXI',
    'fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc',
    'fp-google-ChIJs_wmr0cWa0gRZpEqERRReXQ',
    'fp-google-ChIJs_wmr0cWa0gRHr60qjwn1Mo',
    'fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8',
    'fp-google-ChIJczuZfc0adkgRc8X-u3ZiHcE',
    'fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM',
    'fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI',
    'fp-google-ChIJAVlhMIUCdkgRCJEgHVbITq4',
    'fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI',
    'fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y',
    'fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54',
    'fp-google-ChIJN3hATcsSdkgRPscumUj6FqU',
    'fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY',
    'fp-google-ChIJq-jJARlxdkgRNLTE490EqVU',
    'fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8',
    'fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM'
  ]::text[]) as id;

-- 1. Every claim the v6 run wrote (new facts, the Colne Valley correction, the London Eye re-quote) stops being active.
--    This also frees the one-active-claim-per-field index for step 2.
create temporary table s1_new on commit drop as
  select c.id, c.supersedes_claim_id
  from public.venue_claims c
  join public.venue_enrichment_drafts d on d.id = c.approved_from_draft_id
  where d.model = 'official-source-rules-v6'
    and c.familypilot_place_id in (select id from s1_ids);

update public.venue_claims
   set status = 'disputed', updated_at = now()
 where id in (select id from s1_new) and status = 'active';

-- 2. Bring back what the run replaced (supersedes_claim_id) or withdrew (the five named claims), unless a field has
--    some other active claim already.
update public.venue_claims o
   set status = 'active', updated_at = now()
 where (o.id in (select supersedes_claim_id from s1_new where supersedes_claim_id is not null)
        or o.id in ('24a699e3-1e99-46ac-8f45-b50e8d4e536a','eabed57d-f4e9-45a7-a8b6-f2746451cb89',
                    '37cf3fa6-7b0f-4905-b2e8-9b3dbd85cead','be6f2b75-2265-4e2a-ae87-1e7021c5eb9b',
                    'e7f221fa-9e6f-406e-8645-d7557cdc00a9'))
   and o.status in ('disputed', 'superseded')
   and not exists (select 1 from public.venue_claims a
                    where a.familypilot_place_id = o.familypilot_place_id
                      and a.field_key = o.field_key and a.status = 'active');

-- 3. Restore what the app serves (venue_family_metadata) to the snapshot of 2026-10-08.
update public.venue_family_metadata set family_facilities='{"toilets": "yes"}'::jsonb, accessibility='{"accessibleToilet": "yes"}'::jsonb, facilities='["toilets"]'::jsonb, pushchair_suitability='mixed', step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 16:04:06.571+00' where familypilot_place_id='fp-google-ChIJ97pX3M0EdkgR8YFd4G1GZJ8';
update public.venue_family_metadata set family_facilities='{}'::jsonb, accessibility='{"accessibleToilet": "yes"}'::jsonb, facilities='[]'::jsonb, pushchair_suitability=NULL, step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 15:28:04.813+00' where familypilot_place_id='fp-google-ChIJAVlhMIUCdkgRCJEgHVbITq4';
update public.venue_family_metadata set family_facilities='{"parking": "no", "toilets": "yes", "babyChanging": "yes"}'::jsonb, accessibility='{"accessibleToilet": "yes"}'::jsonb, facilities='["toilets", "baby_changing"]'::jsonb, pushchair_suitability='mixed', step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 15:21:06.633+00' where familypilot_place_id='fp-google-ChIJc2nSALkEdkgRkuoJJBfzkUI';
update public.venue_family_metadata set family_facilities='{"cafe": "yes", "parking": "no", "toilets": "yes", "babyChanging": "yes"}'::jsonb, accessibility='{"accessibleToilet": "yes"}'::jsonb, facilities='["toilets", "baby_changing", "cafe"]'::jsonb, pushchair_suitability=NULL, step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 15:30:07.395+00' where familypilot_place_id='fp-google-ChIJczuZfc0adkgRc8X-u3ZiHcE';
update public.venue_family_metadata set family_facilities='{"parking": "yes", "freeParking": "yes"}'::jsonb, accessibility='{"accessibleToilet": "yes"}'::jsonb, facilities='["parking"]'::jsonb, pushchair_suitability=NULL, step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 16:22:06.236+00' where familypilot_place_id='fp-google-ChIJF4YXjN4DdkgRvJe2-r5usvY';
update public.venue_family_metadata set family_facilities='{"cafe": "yes", "babyChanging": "yes"}'::jsonb, accessibility='{"accessibleToilet": "yes"}'::jsonb, facilities='["baby_changing", "cafe"]'::jsonb, pushchair_suitability=NULL, step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 15:58:05.951+00' where familypilot_place_id='fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM';
update public.venue_family_metadata set family_facilities='{"cafe": "yes", "parking": "yes", "playground": "yes", "freeParking": "no"}'::jsonb, accessibility='{}'::jsonb, facilities='["cafe", "playground", "parking"]'::jsonb, pushchair_suitability=NULL, step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 16:02:05.71+00' where familypilot_place_id='fp-google-ChIJkf4NDG8ddkgRXEINXuEbip8';
update public.venue_family_metadata set family_facilities='{}'::jsonb, accessibility='{}'::jsonb, facilities='[]'::jsonb, pushchair_suitability=NULL, step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{}'::jsonb, last_checked=NULL, checked_by=NULL, updated_at='2026-10-07 15:38:02.691+00' where familypilot_place_id='fp-google-ChIJKUrjG7wcdkgRbfTuKDBgWXI';
update public.venue_family_metadata set family_facilities='{"toilets": "yes", "playground": "yes"}'::jsonb, accessibility='{}'::jsonb, facilities='["toilets", "playground"]'::jsonb, pushchair_suitability=NULL, step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 14:56:06.064+00' where familypilot_place_id='fp-google-ChIJN3hATcsSdkgRPscumUj6FqU';
update public.venue_family_metadata set family_facilities='{"cafe": "yes", "babyChanging": "yes"}'::jsonb, accessibility='{"accessibleToilet": "yes"}'::jsonb, facilities='["baby_changing", "cafe"]'::jsonb, pushchair_suitability=NULL, step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 15:56:05.369+00' where familypilot_place_id='fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI';
update public.venue_family_metadata set family_facilities='{"parking": "no", "toilets": "yes", "playground": "yes", "freeParking": "no", "babyChanging": "yes"}'::jsonb, accessibility='{}'::jsonb, facilities='["toilets", "baby_changing", "playground"]'::jsonb, pushchair_suitability=NULL, step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment='outdoor', field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 15:07:07.659+00' where familypilot_place_id='fp-google-ChIJq-jJARlxdkgRNLTE490EqVU';
update public.venue_family_metadata set family_facilities='{"cafe": "yes", "parking": "yes", "toilets": "yes"}'::jsonb, accessibility='{"accessibleToilet": "yes"}'::jsonb, facilities='["toilets", "cafe", "parking"]'::jsonb, pushchair_suitability=NULL, step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 15:54:06.58+00' where familypilot_place_id='fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY';
update public.venue_family_metadata set family_facilities='{"cafe": "yes", "toilets": "yes", "playground": "yes", "babyChanging": "yes"}'::jsonb, accessibility='{"accessibleToilet": "yes"}'::jsonb, facilities='["toilets", "baby_changing", "cafe", "playground"]'::jsonb, pushchair_suitability=NULL, step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 15:48:07.301+00' where familypilot_place_id='fp-google-ChIJs_wmr0cWa0gRHr60qjwn1Mo';
update public.venue_family_metadata set family_facilities='{"toilets": "yes"}'::jsonb, accessibility='{"accessibleToilet": "yes"}'::jsonb, facilities='["toilets"]'::jsonb, pushchair_suitability=NULL, step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 15:45:05.019+00' where familypilot_place_id='fp-google-ChIJs_wmr0cWa0gRZpEqERRReXQ';
update public.venue_family_metadata set family_facilities='{"cafe": "yes", "parking": "yes", "toilets": "yes", "playground": "yes", "freeParking": "no", "babyChanging": "yes"}'::jsonb, accessibility='{"accessibleToilet": "yes"}'::jsonb, facilities='["toilets", "baby_changing", "cafe", "playground", "parking"]'::jsonb, pushchair_suitability='good', step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 15:00:12.611+00' where familypilot_place_id='fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc';
update public.venue_family_metadata set family_facilities='{"parking": "no", "babyChanging": "yes"}'::jsonb, accessibility='{"accessibleToilet": "yes"}'::jsonb, facilities='["baby_changing"]'::jsonb, pushchair_suitability=NULL, step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 15:42:05.168+00' where familypilot_place_id='fp-google-ChIJvS60MMEcdkgRSMlH5VxD51Y';
update public.venue_family_metadata set family_facilities='{"toilets": "yes"}'::jsonb, accessibility='{"accessibleToilet": "yes", "wheelchairAccessible": "yes"}'::jsonb, facilities='["toilets"]'::jsonb, pushchair_suitability=NULL, step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 15:20:05.788+00' where familypilot_place_id='fp-google-ChIJw1d-sUMFdkgRH2XN_U0Jt54';
update public.venue_family_metadata set family_facilities='{"cafe": "yes", "freeParking": "no", "babyChanging": "yes"}'::jsonb, accessibility='{}'::jsonb, facilities='["baby_changing", "cafe"]'::jsonb, pushchair_suitability=NULL, step_free_access=NULL, accessible_toilet=NULL, parking_info=NULL, environment=NULL, field_provenance='{"bestAges": {"label": "ai_assisted", "source": "familypilot", "updatedAt": "2026-10-07", "reliability": "estimated"}}'::jsonb, last_checked='2026-10-07', checked_by='source_evidence_auto_v2', updated_at='2026-10-07 15:59:04.804+00' where familypilot_place_id='fp-google-ChIJzZtNX7UcdkgRzycysU2TrhM';

-- 4. Guard inside the transaction. If the state is not exactly the 8 October snapshot (76 active claims at the 21 venues
--    and this id fingerprint) the script stops with an error, the transaction is aborted and NOTHING is kept.
do $$
declare n integer; f text;
begin
  select count(*), md5(string_agg(id::text, ',' order by id::text collate "C")) into n, f
    from public.venue_claims
   where status = 'active'
     and familypilot_place_id in (select id from s1_ids union select unnest(array[
       'fp-google-ChIJId2oNroFdkgReafXXIrGnkY','fp-osm-679119297','fp-google-ChIJlRl2MakEdkgR55tr4CNv_B8']::text[]));
  if n <> 76 or f <> '882b02667bf8e90022b7c0150b8c2fae' then
    raise exception 'Rollback check failed: % active claims, fingerprint %. Nothing was changed.', n, f;
  end if;
end $$;
commit;
