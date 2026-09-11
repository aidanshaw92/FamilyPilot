-- Production activation requires review after the v2 application is deployed.
-- Keep activation separate from schema rollout: the production API must run evidence gate v2 first.
create table private.venue_data_settings(id boolean primary key default true check(id), refresh_enabled boolean not null default false, last_refresh date);
alter table private.venue_data_settings enable row level security;
revoke all on private.venue_data_settings from public,anon,authenticated;
grant all on private.venue_data_settings to service_role;
insert into private.venue_data_settings(id) values(true);

create or replace function public.refresh_venue_data()
returns integer language plpgsql security invoker set search_path='' as $$
declare queued integer;
begin
 perform pg_advisory_xact_lock(8142026);
 if not exists(select 1 from private.venue_data_settings where refresh_enabled) then return 0; end if;
 -- Claims carry bounded lifetimes even if an earlier writer omitted expiry.
 update public.venue_claims set valid_until=checked_at+case when field_key like 'familyFacilities.%' or field_key like 'accessibility.%' or field_key like 'sendInfo.%' or field_key='pushchairSuitability' then 30 else 90 end
 where valid_until is null;
 update public.venue_claims set status='expired',updated_at=now() where status='active' and valid_until<current_date;
 update public.venue_claims set status='disputed',updated_at=now() where status='active' and approved_by='ai_auto_approved';
 delete from public.venue_visit_reports where visit_date<current_date-180;
 -- Recover exhausted leases instead of leaving processing jobs stuck forever.
 update public.venue_enrichment_jobs set status='failed',locked_at=null,dispatch_token=null,last_error='Worker lease expired after retry limit',updated_at=now()
 where status='processing' and locked_at<now()-interval '10 minutes' and attempts>=5;
 if exists(select 1 from private.venue_data_settings where last_refresh=current_date) then return 0; end if;
 update private.venue_data_settings set last_refresh=current_date;
 with candidates as (
  select p.familypilot_place_id from public.place_records p
  left join public.venue_enrichment_jobs j using(familypilot_place_id)
  where j.id is null or (j.status in ('completed','failed') and
   ((case when j.status='failed' then j.updated_at else coalesce(j.completed_at,j.updated_at) end)<now()-interval '14 days' or
     (j.updated_at<now()-interval '1 day' and exists(select 1 from public.venue_claims c where c.familypilot_place_id=p.familypilot_place_id and c.status='active' and coalesce(c.valid_until,c.checked_at+30)<=current_date+7))))
  order by coalesce(j.completed_at,j.updated_at,'1970-01-01'::timestamptz) limit 50
 )
 insert into public.venue_enrichment_jobs(familypilot_place_id,mode)
 select familypilot_place_id,'regenerate' from candidates
 on conflict(familypilot_place_id) do update set mode='regenerate',status='pending',attempts=0,available_at=now(),locked_at=null,dispatch_token=null,last_error=null,updated_at=now();
 get diagnostics queued=row_count;
 return queued;
end; $$;
revoke all on function public.refresh_venue_data() from public,anon,authenticated;
grant execute on function public.refresh_venue_data() to service_role;
select cron.schedule('familypilot-venue-freshness','17 * * * *','select public.refresh_venue_data();');

-- Run only after the new production API and approval gates have been verified.
update private.venue_data_settings set refresh_enabled=true where id=true;
select public.refresh_venue_data();
