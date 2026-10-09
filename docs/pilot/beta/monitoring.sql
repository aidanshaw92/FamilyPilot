-- FamilyPilot beta: the daily read-only check. Paste into the Supabase SQL editor. Every statement is a SELECT.
-- Run each block on its own. "Healthy" is written above each one.

-- 1. PAID GOOGLE USAGE. Healthy: no place_photos and no place_details rows dated today (or since the switch), whatever else is there.
--    One quiet day is not proof the endpoint is shut: also run the live-canaries workflow with assert_fail_closed=true.
select usage_day, sku, scope, environment, calls
from public.google_places_usage
where usage_day >= current_date - 7
order by usage_day desc, sku, scope;

-- 2. EVIDENCE DID NOT MOVE UNEXPECTEDLY. Healthy: after Step 1 the active count is 87 and stays 87 until a batch you approved.
select count(*) filter (where status = 'active') as active_claims,
       count(*) filter (where status = 'disputed') as disputed_claims,
       max(updated_at) as last_change
from public.venue_claims;

-- 3. CLAIMS THAT CHANGED IN THE LAST DAY (who and what). Healthy: empty unless you published something.
select familypilot_place_id, field_key, status, source_type, approved_by, updated_at
from public.venue_claims
where updated_at >= now() - interval '1 day'
order by updated_at desc
limit 50;

-- 4. RULES IN FORCE AND WHEN THEY LAPSE (rules expire after 30 days). Healthy: none expired-but-active; each has a human approver.
select familypilot_place_id, field_key, value_json, approved_by, valid_until,
       (valid_until < now()) as lapsed
from public.venue_claims
where status = 'active' and (field_key like 'rules.%' or field_key like 'hours.%')
order by valid_until;

-- 5. HOW MUCH OF THE CATALOGUE HAS CURRENT FACTS ("missing venue data"). Healthy: the number with facts never falls
--    between two days with no approved change. The pilot ten must each appear in the second query.
select count(*) as venues,
       count(*) filter (where exists (select 1 from public.venue_claims c where c.familypilot_place_id = p.familypilot_place_id
         and c.status = 'active' and (c.valid_until is null or c.valid_until > now()))) as with_current_claims
from public.place_records p;
select p.name, count(c.id) as current_claims
from public.place_records p
join public.venue_claims c on c.familypilot_place_id = p.familypilot_place_id
 and c.status = 'active' and (c.valid_until is null or c.valid_until > now())
where p.name ilike any (array['%Natural History Museum%','%Science Museum%','%Discover%'])
group by p.name order by p.name;

-- 6. WHAT FAMILIES REPORT. Healthy: any "no" or "difficult" is read by a person within two days.
select familypilot_place_id, visit_date, answers, created_at
from public.venue_visit_reports
where created_at >= now() - interval '3 days'
order by created_at desc
limit 50;

-- 7. WHO IS IN. Healthy: the count equals the number of invitations you have sent, and no address you did not invite.
select count(*) as accounts,
       count(*) filter (where email_confirmed_at is not null) as confirmed,
       count(*) filter (where last_sign_in_at >= now() - interval '2 days') as active_last_2_days,
       count(*) filter (where is_anonymous) as anonymous
from auth.users;
