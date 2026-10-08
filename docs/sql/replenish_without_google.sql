-- OPTIONAL. NOT APPLIED. Production change; needs the owner's approval. See docs/EVIDENCE_EXPIRY_PROTECTION.md §4.
--
-- What it changes: the hourly replenisher (`public.refresh_venue_data`, run by pg_cron job
-- `familypilot-venue-freshness`) queues venues whose evidence is due as mode 'regenerate'. A 'regenerate' run re-reads
-- the venue's own website AND may buy a Google Place Details call when the stored Google record is 14 days old or more.
-- This version queues 'refetch_official' instead for every venue whose stored record has a website: the same website
-- re-read and the same claim renewal, with Google never asked (`googleAccess: 'disabled'`). Venues without a stored
-- website keep 'regenerate', because without one there is nothing to re-read.
--
-- Everything else is byte-for-byte the definition read from production on 2026-10-08 (pg_get_functiondef).
--
-- Before: run the PRE-CHECK at the bottom and keep its output.
-- Rollback: re-run the definition in the ROLLBACK block (the production definition as read on 2026-10-08).

create or replace function public.refresh_venue_data()
 returns integer
 language plpgsql
 set search_path to ''
as $function$
declare queued integer;
begin
 perform pg_advisory_xact_lock(8142026);
 if not exists(select 1 from private.venue_data_settings where refresh_enabled) then return 0; end if;

 update public.venue_claims
 set valid_until = checked_at + case
   when field_key like 'familyFacilities.%'
     or field_key like 'accessibility.%'
     or field_key like 'sendInfo.%'
     or field_key = 'pushchairSuitability' then 30
   else 90 end
 where valid_until is null;

 update public.venue_claims set status='disputed', updated_at=now()
 where status='active' and approved_by='ai_auto_approved';

 update public.venue_enrichment_jobs
 set status='failed', locked_at=null, dispatch_token=null,
     last_error='Worker lease expired after retry limit', updated_at=now()
 where status='processing' and locked_at < now() - interval '10 minutes' and attempts >= 5;

 if exists(select 1 from private.venue_data_settings where last_refresh=current_date) then return 0; end if;
 update private.venue_data_settings set last_refresh=current_date;

 with candidates as (
  select p.familypilot_place_id, (p.website is not null and p.website <> '') as has_site
  from public.place_records p
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
 insert into public.venue_enrichment_jobs(familypilot_place_id,mode)
 select familypilot_place_id, case when has_site then 'refetch_official' else 'regenerate' end from candidates
 on conflict(familypilot_place_id) do update set
   mode=excluded.mode, status='pending', attempts=0, available_at=now(),
   locked_at=null, dispatch_token=null, last_error=null, updated_at=now();
 get diagnostics queued=row_count;
 return queued;
end; $function$;

-- PRE-CHECK (read-only): how many venues each mode would take, today.
-- select (p.website is not null and p.website <> '') as has_site, count(*)
-- from public.place_records p group by 1;

-- VERIFY (read-only), the day after: the modes the replenisher queued, and Google usage by scope.
-- select mode, status, count(*) from public.venue_enrichment_jobs
--   where updated_at > now() - interval '1 day' group by 1,2;
-- select usage_day, scope, sum(calls) from public.google_places_usage
--   where usage_day >= current_date - 1 group by 1,2 order by 1,2;

-- ROLLBACK: the production definition as read on 2026-10-08 differs from the above in exactly two places:
--   candidates selects only p.familypilot_place_id;
--   the insert selects (familypilot_place_id,'regenerate') and the conflict clause sets mode='regenerate'.
-- Re-create it with those two lines restored (the full text is in docs/EVIDENCE_EXPIRY_PROTECTION.md, appendix).
