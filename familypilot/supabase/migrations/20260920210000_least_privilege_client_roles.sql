-- Client roles get only the access a migration deliberately grants them.
--
-- Seven catalogue tables predate the convention the repo now follows and still carry the Supabase
-- default ACL for `anon` and `authenticated`: INSERT, SELECT, UPDATE, DELETE, TRUNCATE,
-- REFERENCES, TRIGGER and (on PG17) MAINTAIN. `planning_workspaces` carries that same set for
-- `authenticated`. Its own migration is the instructive case: it granted the four row privileges
-- it meant to give and revoked `anon`, but a GRANT cannot subtract, so the broad default survived
-- underneath the narrower grant and the intent never took effect. Every table created since
-- 2026-09-09 revokes the default outright in its own migration -- `venue_enrichment_jobs`,
-- `planning_connections`, `venue_visit_reports` and `plan_invites` all do. This brings the older
-- tables up to the same standard and changes the default so a future one starts there.
--
-- Why this is not simply "RLS already stops it": RLS filters ROWS for SELECT/INSERT/UPDATE/DELETE.
-- It does not mediate TRUNCATE, REFERENCES, TRIGGER or MAINTAIN, which are whole-table privileges.
-- A TRUNCATE is not a filtered delete. No reachable path to them exists today -- `anon` and
-- `authenticated` cannot log in, and PostgREST exposes no endpoint for any of them -- so this is
-- least-privilege debt rather than an open door. But the safety of the current state rests on
-- PostgREST's surface rather than on the permission model, and that is the wrong thing to rely on.
--
-- Written as desired state (`revoke all`, then grant back exactly what is intended) rather than
-- subtracting named privileges. That makes the outcome identical whatever the table started with,
-- and avoids naming MAINTAIN, which does not exist before PostgreSQL 17.

-- ---------------------------------------------------------------------------
-- Catalogue tables that are deliberately world-readable.
-- ---------------------------------------------------------------------------
revoke all on table
  public.canonical_venues,
  public.place_records,
  public.venue_claims,
  public.venue_family_metadata,
  public.venue_place_links
from public, anon, authenticated;

grant select on table
  public.canonical_venues,
  public.place_records,
  public.venue_claims,
  public.venue_family_metadata,
  public.venue_place_links
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internal catalogue tables. No read policy exists on either, so their SELECT grant was already
-- dead weight; nothing here is intended for a client at any time.
-- ---------------------------------------------------------------------------
revoke all on table
  public.venue_enrichment_drafts,
  public.venue_source_evidence
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The one table the app reaches through PostgREST directly.
--
-- PlanningAccount.tsx calls .upsert(), .select() and .delete() on it as the signed-in user, so
-- `authenticated` genuinely needs row CRUD here -- and nothing else. Its four policies authorise
-- rows where auth.uid() = user_id; they were never meant to authorise emptying the table.
-- ---------------------------------------------------------------------------
revoke all on table public.planning_workspaces from public, anon, authenticated;

grant select, insert, update, delete
  on table public.planning_workspaces
  to authenticated;

-- ---------------------------------------------------------------------------
-- Defaults for objects created by `postgres`, which owns every table, sequence and function in
-- this schema.
--
-- Deliberately NOT touching `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`. That is Supabase's
-- internal administrative superuser; `postgres` is verified not to be a member of it and could not
-- execute the statement, and no application object is created as that role, so altering it would
-- be both unnecessary and outside what this project owns. Its defaults remain platform-owned
-- residual state. Note this is a statement about `supabase_admin` DEFAULTS only -- `postgres`
-- does own objects outside `public`, which is why the function revoke below needs care.
--
-- Sequences are included although `public` currently has none: leaving the default in place would
-- hand the same broad access to the first identity-backed client table anyone adds.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;

-- Functions need two statements, and the difference between them matters.
--
-- PostgreSQL's built-in `acldefault()` for a function grants EXECUTE to PUBLIC, and every role
-- belongs to PUBLIC -- so a new function is executable by `anon` the moment it is created unless
-- that default is cancelled. Cancelling it takes a GLOBAL default-privileges statement, one with
-- no `IN SCHEMA` clause, which is stored with `defaclnamespace = 0`. A schema-scoped statement is
-- merged on top of the global default rather than replacing it, so `IN SCHEMA public ... REVOKE
-- EXECUTE ON FUNCTIONS FROM PUBLIC` silently leaves PUBLIC's EXECUTE in place.
--
-- Verified on production (PostgreSQL 17.6) inside a rolled-back transaction. Before, a newly
-- created function came out `{=X/postgres,postgres=X/postgres,anon=X/postgres,...}` with
-- `has_function_privilege('anon', f, 'EXECUTE')` true. After the two statements below, the same
-- probe produced `{postgres=X/postgres,service_role=X/postgres}` with anon and authenticated
-- false and service_role true. Nothing persisted.
--
-- Being global, that revoke reaches every schema, which is more than this project owns. The
-- `extensions` schema is the case that matters: 49 of its 55 functions are owned by `postgres`,
-- 48 of them carrying PUBLIC EXECUTE, because `create extension` was run as `postgres`. Defaults
-- only affect future objects, so nothing breaks on the day this is applied -- but the next
-- `CREATE EXTENSION` or `ALTER EXTENSION ... UPDATE` run as `postgres` would produce functions
-- with no PUBLIC EXECUTE, and anything relying on them (an RLS policy, a column DEFAULT calling
-- `uuid_generate_v4()`, Supabase's own internals) would start failing in a way that points
-- nowhere near this migration.
--
-- So the global revoke is immediately given back for `extensions` alone. Verified on production
-- inside a rolled-back transaction: a function created there afterwards has `proacl` NULL, which
-- is byte-identical to the baseline before any of this ran -- not an approximation of it. The
-- schema is owned by `postgres`, and its three existing default-privilege rows are all granted by
-- `supabase_admin`, so this adds a row of its own rather than altering one of theirs.
--
-- `public`, `private` and any schema added later stay closed, which is the point.
--
-- This statement requires the `extensions` schema to exist. That is not a new dependency: 011
-- already does `create extension if not exists pg_net with schema extensions`, which is also the
-- concrete case this grant-back protects -- that statement runs as `postgres`, so re-running it or
-- upgrading pg_net would, without the line below, produce functions PUBLIC cannot execute. If the
-- schema were somehow absent the migration fails with `schema "extensions" does not exist` and the
-- runner's transaction rolls the whole file back, leaving privileges untouched. Verified.
--
-- The anon/authenticated revoke stays scoped to `public`: those two roles have no business in this
-- schema by default, and other schemas' defaults are not this migration's to change. EXECUTE is
-- the only function privilege, so `revoke execute` and `revoke all` are equivalent here; the
-- privilege is named explicitly to keep the statements readable as a set.
alter default privileges for role postgres
  revoke execute on functions from public;

alter default privileges for role postgres in schema extensions
  grant execute on functions to public;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- Per-function `revoke all on function ... from public, anon, authenticated` in each function's own
-- migration remains the convention, and `least-privilege-acl.test.ts` still requires it of every
-- new function. It is defence in depth rather than the only protection: the defaults above now
-- close the gap on their own, and the explicit revoke keeps a function private even if the default
-- is ever changed or the function is created by some other role.

-- service_role and postgres are untouched throughout: the server writes as service_role, which
-- also bypasses RLS, and every existing RPC is already granted to it explicitly.
