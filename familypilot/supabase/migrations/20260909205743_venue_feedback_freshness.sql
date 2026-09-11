-- Private first-hand observations, explicit retention, and bounded scheduled refresh.
create table public.venue_visit_reports (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 familypilot_place_id text not null references public.place_records(familypilot_place_id) on delete cascade,
 visit_date date not null,
 answers jsonb not null check (jsonb_typeof(answers)='object' and octet_length(answers::text)<2000),
 status text not null default 'active' check(status in ('active','ignored')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,familypilot_place_id,visit_date)
);
alter table public.venue_visit_reports enable row level security;
revoke all on public.venue_visit_reports from public,anon,authenticated;
grant all on public.venue_visit_reports to service_role;
create index venue_visit_reports_venue_date on public.venue_visit_reports(familypilot_place_id,visit_date desc) where status='active';
create index venue_visit_reports_user_created on public.venue_visit_reports(user_id,created_at);

create or replace function public.submit_venue_visit_report(p_user_id uuid,p_venue_id text,p_visit_date date,p_answers jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare report_id uuid; k text; v text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,814));
 select id into report_id from public.venue_visit_reports where user_id=p_user_id and familypilot_place_id=p_venue_id and visit_date=p_visit_date and answers=p_answers;
 if report_id is not null then return report_id; end if;
 if exists(select 1 from public.venue_visit_reports where user_id=p_user_id and updated_at>now()-interval '1 minute') then raise exception 'Report rate limit'; end if;
 if (select count(*) from public.venue_visit_reports where user_id=p_user_id and updated_at>now()-interval '1 day')>=10 then raise exception 'Report rate limit'; end if;
 if not exists(select 1 from public.place_records where familypilot_place_id=p_venue_id) then raise exception 'Unknown venue'; end if;
 if p_visit_date<current_date-30 or p_visit_date>current_date+1 then raise exception 'Invalid date'; end if;
 if p_answers is null or jsonb_typeof(p_answers)<>'object' or (select count(*) from jsonb_object_keys(p_answers)) not between 1 and 3 then raise exception 'Invalid answers'; end if;
 for k,v in select * from jsonb_each_text(p_answers) loop
  if k not in ('babyChanging','pushchair','toilets','parking','cafe') or v is null or
    (k='pushchair' and v not in ('good','mixed','difficult','did_not_check')) or
    (k<>'pushchair' and v not in ('yes','no','unavailable','did_not_check')) then raise exception 'Invalid answer'; end if;
 end loop;
 insert into public.venue_visit_reports(user_id,familypilot_place_id,visit_date,answers)
 values(p_user_id,p_venue_id,p_visit_date,p_answers)
 on conflict(user_id,familypilot_place_id,visit_date) do update set answers=excluded.answers,updated_at=now()
 returning id into report_id;
 -- At most one recheck per venue per day, regardless of how many parents respond.
 insert into public.venue_enrichment_jobs(familypilot_place_id,mode)
 values(p_venue_id,'regenerate')
 on conflict(familypilot_place_id) do update set mode='regenerate',status='pending',attempts=0,
 available_at=greatest(now(),coalesce(venue_enrichment_jobs.completed_at,now()-interval '1 day')+interval '1 day'),
 locked_at=null,dispatch_token=null,last_error=null,updated_at=now()
 where venue_enrichment_jobs.status in ('completed','failed');
 return report_id;
end; $$;
revoke all on function public.submit_venue_visit_report(uuid,text,date,jsonb) from public,anon,authenticated;
grant execute on function public.submit_venue_visit_report(uuid,text,date,jsonb) to service_role;

