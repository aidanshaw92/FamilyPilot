-- Two accounts, one database: can account B see or change account A's rows?
-- The policies and grants below are copied from production's pg_policy / role_table_grants (read-only query, 9 Oct 2026).
-- Run on a THROWAWAY database: psql -v ON_ERROR_STOP=1 -f rls-isolation.sql
drop schema if exists auth cascade; create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
drop table if exists planning_workspaces, saved_places_backups, planning_connections, plan_invites, venue_visit_reports cascade;
create table planning_workspaces(user_id uuid primary key, data jsonb not null, updated_at timestamptz default now());
create table saved_places_backups(user_id uuid primary key, data jsonb not null, updated_at timestamptz default now());
create table planning_connections(id uuid primary key default gen_random_uuid(), owner_id uuid, guest_id uuid, owner_snapshot jsonb, guest_snapshot jsonb);
create table plan_invites(id uuid primary key default gen_random_uuid(), owner_id uuid, invitee_id uuid, plan_snapshot jsonb);
create table venue_visit_reports(id uuid primary key default gen_random_uuid(), user_id uuid, familypilot_place_id text, answers jsonb);
alter table planning_workspaces enable row level security; alter table saved_places_backups enable row level security;
alter table planning_connections enable row level security; alter table plan_invites enable row level security; alter table venue_visit_reports enable row level security;
-- production: owner-only policies on the two backup tables; RLS on with NO policy and NO grant for the other three
create policy "Read own planning workspace" on planning_workspaces for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own planning workspace" on planning_workspaces for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own planning workspace" on planning_workspaces for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own planning workspace" on planning_workspaces for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Read own saved backup" on saved_places_backups for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own saved backup" on saved_places_backups for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own saved backup" on saved_places_backups for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own saved backup" on saved_places_backups for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on planning_workspaces, saved_places_backups to authenticated;
grant usage on schema auth, public to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
-- service-role stand-in (the serverless functions): bypasses RLS, owns the three server-only tables
insert into planning_connections(owner_id, owner_snapshot) values ('aaaaaaaa-0000-0000-0000-000000000001', '{"label":"A"}');
insert into plan_invites(owner_id, plan_snapshot) values ('aaaaaaaa-0000-0000-0000-000000000001', '{"x":1}');
insert into venue_visit_reports(user_id, familypilot_place_id, answers) values ('aaaaaaaa-0000-0000-0000-000000000001', 'fp-x', '{"toilets":"yes"}');

create temp table results(test text, ok boolean);
create or replace function pg_temp.expect(t text, ok boolean) returns void language sql as $$ insert into results values (t, ok) $$;
grant all on results to authenticated, anon;
grant execute on function pg_temp.expect(text, boolean) to authenticated, anon;

-- A writes its own rows
set role authenticated; select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into planning_workspaces values ('aaaaaaaa-0000-0000-0000-000000000001', '{"families":[{"label":"A"}]}');
insert into saved_places_backups values ('aaaaaaaa-0000-0000-0000-000000000001', '{"saved":["fp-1"]}');
select pg_temp.expect('A can read its own workspace', (select count(*) from planning_workspaces) = 1);
select pg_temp.expect('A can read its own saved places', (select count(*) from saved_places_backups) = 1);
reset role;

-- B is another account
set role authenticated; select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select pg_temp.expect('B sees none of A''s workspace', (select count(*) from planning_workspaces) = 0);
select pg_temp.expect('B sees none of A''s saved places', (select count(*) from saved_places_backups) = 0);
with u as (update planning_workspaces set data = '{"hacked":true}' returning 1) select pg_temp.expect('B cannot update A''s workspace (0 rows)', (select count(*) from u) = 0);
with d as (delete from saved_places_backups returning 1) select pg_temp.expect('B cannot delete A''s saved places (0 rows)', (select count(*) from d) = 0);
do $$ begin
  begin insert into planning_workspaces values ('aaaaaaaa-0000-0000-0000-000000000001', '{"x":1}'); perform pg_temp.expect('B cannot insert a row as A', false);
  exception when others then perform pg_temp.expect('B cannot insert a row as A', true); end;
  begin perform 1 from planning_connections; perform pg_temp.expect('B cannot read connections at all', false);
  exception when insufficient_privilege then perform pg_temp.expect('B cannot read connections at all (no grant)', true); end;
  begin perform 1 from plan_invites; perform pg_temp.expect('B cannot read invites at all', false);
  exception when insufficient_privilege then perform pg_temp.expect('B cannot read invites at all (no grant)', true); end;
  begin perform 1 from venue_visit_reports; perform pg_temp.expect('B cannot read visit reports at all', false);
  exception when insufficient_privilege then perform pg_temp.expect('B cannot read visit reports at all (no grant)', true); end;
end $$;
reset role;

-- A signed-out visitor (anon)
set role anon; select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin perform 1 from planning_workspaces; perform pg_temp.expect('anon cannot read workspaces', false);
  exception when insufficient_privilege then perform pg_temp.expect('anon cannot read workspaces (no grant)', true); end;
  begin perform 1 from saved_places_backups; perform pg_temp.expect('anon cannot read saved places', false);
  exception when insufficient_privilege then perform pg_temp.expect('anon cannot read saved places (no grant)', true); end;
end $$;
reset role;

-- A's rows are untouched after all of that
select pg_temp.expect('A''s workspace is unchanged', (select data from planning_workspaces where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = '{"families":[{"label":"A"}]}'::jsonb);
select pg_temp.expect('A''s saved places are unchanged', (select count(*) from saved_places_backups) = 1);
select test, case when ok then 'ok' else 'FAIL' end as result from results order by ok, test;
select case when bool_and(ok) then 'ALL ISOLATION CHECKS PASSED' else 'ISOLATION FAILED' end from results;
