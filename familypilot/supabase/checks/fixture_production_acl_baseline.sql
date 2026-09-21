-- Recreate production's privilege state as it stands BEFORE
-- 20260920210000_least_privilege_client_roles.sql is applied.
--
-- This exists so the migration can be tested against the state it will actually meet, rather than
-- against an empty database where every statement trivially succeeds. Applying the migration to
-- this fixture and then running least_privilege_acl_check.sql is what CI does on every pull
-- request; the same pair was run by hand against a disposable cluster while the migration was
-- written, and the resulting before-state was diffed row for row against production.
--
-- Run as a superuser (or as `postgres`) against a THROWAWAY database:
--   psql -v ON_ERROR_STOP=1 -d <disposable-db> -f fixture_production_acl_baseline.sql
--
-- It is never run against production: production already IS this state.

\set ON_ERROR_STOP on

-- Supabase's client roles. `anon` and `authenticated` cannot log in and do not bypass RLS;
-- `service_role` bypasses RLS. None of them is a superuser. PostgREST assumes one of these roles
-- per request, which is why their table privileges are the thing under test.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- Supabase's own extensions schema, owned by `postgres` exactly as in production, where 49 of its
-- 55 functions are postgres-owned. The migration's global function revoke reaches this schema, so
-- the check needs it present to prove the revoke is given back here.
create schema if not exists extensions authorization postgres;

-- The default privileges Supabase ships for role `postgres` in `public`:
--   tables    postgres/anon/authenticated/service_role = arwdDxt(m)
--   sequences postgres/anon/authenticated/service_role = rwU
--   functions postgres/anon/authenticated/service_role = X, with PUBLIC revoked
-- This is the reason the older tables carry a broad ACL nobody wrote a GRANT for.
alter default privileges for role postgres in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

-- The twelve tables production holds in `public`. Column definitions are irrelevant here: only
-- the ACL each one inherits is under test.
create table public.canonical_venues         (id uuid primary key default gen_random_uuid());
create table public.place_records            (id uuid primary key default gen_random_uuid());
create table public.venue_claims             (id uuid primary key default gen_random_uuid());
create table public.venue_family_metadata    (id uuid primary key default gen_random_uuid());
create table public.venue_place_links        (id uuid primary key default gen_random_uuid());
create table public.venue_enrichment_drafts  (id uuid primary key default gen_random_uuid());
create table public.venue_source_evidence    (id uuid primary key default gen_random_uuid());
create table public.planning_workspaces      (id uuid primary key default gen_random_uuid(), user_id uuid);
create table public.planning_connections     (id uuid primary key default gen_random_uuid());
create table public.venue_enrichment_jobs    (id uuid primary key default gen_random_uuid());
create table public.venue_visit_reports      (id uuid primary key default gen_random_uuid());
create table public.plan_invites             (id uuid primary key default gen_random_uuid());

-- The privilege statements the repo's own earlier migrations already carry, replayed in file
-- order. These are what make four of the twelve tables already clean -- and what makes
-- planning_workspaces the instructive case: the GRANT below states the intent, but cannot subtract
-- the broad default sitting underneath it.
-- 20260909182317_family_planning_workspaces.sql
grant select,insert,update,delete on public.planning_workspaces to authenticated;
revoke all on public.planning_workspaces from anon;
revoke all on public.planning_connections from anon,authenticated;
grant select,insert,update,delete on public.planning_connections to service_role;
grant select,insert,update,delete on public.planning_workspaces to service_role;
-- 20260909205743_venue_feedback_freshness.sql
revoke all on public.venue_visit_reports from public,anon,authenticated;
-- 011_automatic_enrichment_worker.sql
revoke all on table public.venue_enrichment_jobs from public, anon, authenticated;
-- 20260913190000_plan_invites.sql
revoke all on public.plan_invites from anon,authenticated;
