-- Venue freshness maintenance. Production activation requires review.
--
-- SUPERSEDES the earlier version of this file, which has never been applied to production
-- (verified: private.venue_data_settings, public.refresh_venue_data() and the
-- familypilot-venue-freshness schedule all absent). That version contained:
--
--   update public.venue_claims set status='expired' where status='active' and valid_until<current_date;
--
-- which is removed here, for two reasons. It was redundant — isClaimActive() already enforces
-- expiry when claims are read, so nothing depended on the column being mutated. And it was
-- destructive — once a claim is stamped 'expired' it is gone from the active set for good, so a
-- claim whose source merely timed out for a day could never be reinstated, and the 14-day grace
-- window could never be evaluated. Expiry stays a read-time derivation.
--
-- Retention of old visit reports is deliberately NOT part of this script. It is unrelated policy
-- and belongs in its own reviewed change.

create table if not exists private.venue_data_settings(
  id boolean primary key default true check(id),
  refresh_enabled boolean not null default false,
  last_refresh date
);
alter table private.venue_data_settings enable row level security;
revoke all on private.venue_data_settings from public,anon,authenticated;
grant all on private.venue_data_settings to service_role;
insert into private.venue_data_settings(id) values(true) on conflict (id) do nothing;

create or replace function public.refresh_venue_data()
returns integer language plpgsql security invoker set search_path='' as $$
declare queued integer;
begin
 perform pg_advisory_xact_lock(8142026);
 if not exists(select 1 from private.venue_data_settings where refresh_enabled) then return 0; end if;

 -- Claims carry bounded lifetimes even if an earlier writer omitted expiry. Mirrors expiryDate()
 -- in trusted-evidence.js: 30 days for facility/accessibility/buggy/SEND facts, 90 otherwise.
 update public.venue_claims
 set valid_until = checked_at + case
   when field_key like 'familyFacilities.%'
     or field_key like 'accessibility.%'
     or field_key like 'sendInfo.%'
     or field_key = 'pushchairSuitability' then 30
   else 90 end
 where valid_until is null;

 -- Legacy automatic approvals accepted model confidence without source proof. The application
 -- already refuses to serve them; this makes the database agree.
 update public.venue_claims set status='disputed', updated_at=now()
 where status='active' and approved_by='ai_auto_approved';

 -- Recover exhausted leases instead of leaving processing jobs stuck forever.
 update public.venue_enrichment_jobs
 set status='failed', locked_at=null, dispatch_token=null,
     last_error='Worker lease expired after retry limit', updated_at=now()
 where status='processing' and locked_at < now() - interval '10 minutes' and attempts >= 5;

 if exists(select 1 from private.venue_data_settings where last_refresh=current_date) then return 0; end if;
 update private.venue_data_settings set last_refresh=current_date;

 -- Queue at most 50 rechecks a day: venues never enriched, venues not looked at for a fortnight,
 -- and venues whose soonest trusted claim expires within 7 days. The expiry rule matches the
 -- application's, so the scheduler and the freshness classifier cannot disagree about a claim.
 --
 -- venue_enrichment_jobs.familypilot_place_id is UNIQUE, so a venue with eight claims expiring on
 -- the same day still gets exactly one job; the conflict clause below is the requeue.
 with candidates as (
  select p.familypilot_place_id from public.place_records p
  left join public.venue_enrichment_jobs j using(familypilot_place_id)
  where j.id is null or (j.status in ('completed','failed') and
   ((case when j.status='failed' then j.updated_at else coalesce(j.completed_at,j.updated_at) end) < now() - interval '14 days' or
     (j.updated_at < now() - interval '1 day' and exists(
        select 1 from public.venue_claims c
        where c.familypilot_place_id = p.familypilot_place_id
          and c.status = 'active'
          and coalesce(c.valid_until, c.checked_at + case
                when c.field_key like 'familyFacilities.%'
                  or c.field_key like 'accessibility.%'
                  or c.field_key like 'sendInfo.%'
                  or c.field_key = 'pushchairSuitability' then 30
                else 90 end) <= current_date + 7))))
  order by coalesce(j.completed_at,j.updated_at,'1970-01-01'::timestamptz) limit 50
 )
 -- mode 'regenerate' re-fetches sources and re-runs the evidence pipeline, which is exactly what
 -- an expiry refresh needs. The mode CHECK allows only 'generate' and 'regenerate', and the Edge
 -- worker understands those two; introducing a third would change that contract for no behaviour.
 insert into public.venue_enrichment_jobs(familypilot_place_id,mode)
 select familypilot_place_id,'regenerate' from candidates
 on conflict(familypilot_place_id) do update set
   mode='regenerate', status='pending', attempts=0, available_at=now(),
   locked_at=null, dispatch_token=null, last_error=null, updated_at=now();
 get diagnostics queued=row_count;
 return queued;
end; $$;

revoke all on function public.refresh_venue_data() from public,anon,authenticated;
grant execute on function public.refresh_venue_data() to service_role;

-- Hourly with a daily guard inside the function: a missed hour self-heals instead of skipping a day.
select cron.schedule('familypilot-venue-freshness','17 * * * *','select public.refresh_venue_data();');

-- Run only after the new production API and approval gates have been verified.
-- update private.venue_data_settings set refresh_enabled=true where id=true;
-- select public.refresh_venue_data();
