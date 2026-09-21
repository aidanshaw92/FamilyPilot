-- Assert the privilege state that 20260920210000_least_privilege_client_roles.sql establishes.
--
-- Runnable against any database that carries the migration -- the disposable local fixture before
-- the PR, and production after it is applied. It only reads the catalogue and creates three
-- throwaway `zz_probe*` objects, which it drops again; it touches no application row.
--
--   psql -v ON_ERROR_STOP=1 -d <db> -f least_privilege_acl_check.sql
--
-- Every assertion collects into `failures` and raises once at the end, so a run reports every
-- deviation rather than only the first.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. The existing tables.
-- ---------------------------------------------------------------------------
do $$
declare
  failures text[] := '{}';
  expected record;
  actual text;
begin
  for expected in
    select * from (values
      -- Deliberately world-readable catalogue: SELECT and nothing else.
      ('canonical_venues',        'anon',          'SELECT'),
      ('canonical_venues',        'authenticated', 'SELECT'),
      ('place_records',           'anon',          'SELECT'),
      ('place_records',           'authenticated', 'SELECT'),
      ('venue_claims',            'anon',          'SELECT'),
      ('venue_claims',            'authenticated', 'SELECT'),
      ('venue_family_metadata',   'anon',          'SELECT'),
      ('venue_family_metadata',   'authenticated', 'SELECT'),
      ('venue_place_links',       'anon',          'SELECT'),
      ('venue_place_links',       'authenticated', 'SELECT'),
      -- Internal catalogue: nothing at all.
      ('venue_enrichment_drafts', 'anon',          ''),
      ('venue_enrichment_drafts', 'authenticated', ''),
      ('venue_source_evidence',   'anon',          ''),
      ('venue_source_evidence',   'authenticated', ''),
      -- The one table the client reaches through PostgREST: row CRUD, no whole-table privilege.
      ('planning_workspaces',     'anon',          ''),
      ('planning_workspaces',     'authenticated', 'DELETE,INSERT,SELECT,UPDATE'),
      -- The four tables that already carried their own revoke. Unchanged by this migration.
      ('planning_connections',    'anon',          ''),
      ('planning_connections',    'authenticated', ''),
      ('venue_enrichment_jobs',   'anon',          ''),
      ('venue_enrichment_jobs',   'authenticated', ''),
      ('venue_visit_reports',     'anon',          ''),
      ('venue_visit_reports',     'authenticated', ''),
      ('plan_invites',            'anon',          ''),
      ('plan_invites',            'authenticated', '')
    ) as t(table_name, grantee, privileges)
  loop
    -- MAINTAIN exists only from PostgreSQL 17, so the privilege list is version-dependent.
    select coalesce(string_agg(p, ',' order by p), '')
      into actual
    from unnest(
      case when current_setting('server_version_num')::int >= 170000
           then array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']
           else array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']
      end) as p
    where has_table_privilege(expected.grantee, format('public.%I', expected.table_name), p);

    if actual is distinct from expected.privileges then
      failures := failures || format('%s / %s: expected [%s] got [%s]',
                                     expected.table_name, expected.grantee,
                                     expected.privileges, actual);
    end if;
  end loop;

  -- service_role must keep the full set on every one of them.
  for expected in
    select unnest(array['canonical_venues','place_records','venue_claims','venue_family_metadata',
                        'venue_place_links','venue_enrichment_drafts','venue_source_evidence',
                        'planning_workspaces','planning_connections','venue_enrichment_jobs',
                        'venue_visit_reports','plan_invites']) as table_name
  loop
    if not has_table_privilege('service_role', format('public.%I', expected.table_name), 'SELECT')
       or not has_table_privilege('service_role', format('public.%I', expected.table_name), 'INSERT')
       or not has_table_privilege('service_role', format('public.%I', expected.table_name), 'UPDATE')
       or not has_table_privilege('service_role', format('public.%I', expected.table_name), 'DELETE') then
      failures := failures || format('%s / service_role: lost a row privilege', expected.table_name);
    end if;
  end loop;

  -- No table may carry a grant to PUBLIC, which would reach every role including anon.
  if exists (
    select 1 from pg_class c, aclexplode(c.relacl) a
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.grantee = 0
  ) then
    failures := failures || 'a public table carries a grant to PUBLIC'::text;
  end if;

  if array_length(failures, 1) is not null then
    raise exception E'TABLE ACL CHECK FAILED:\n%', array_to_string(failures, E'\n');
  end if;
  raise notice 'PASS 1/3  table ACLs match the intended matrix (24 role/table pairs, service_role intact)';
end $$;

-- ---------------------------------------------------------------------------
-- 2. What a NEW object inherits, and 3. that an explicit grant still works.
--
-- The three probe objects are created and dropped inside ONE DO block on purpose. A failed
-- assertion raises, PostgreSQL rolls the whole block back, and the probes vanish with it -- so a
-- failing run cannot leave `zz_probe*` debris behind in the schema it was only meant to inspect.
-- (An earlier version created them as top-level statements; a deliberate mutation proved that a
-- failure left the table behind and poisoned every later run.)
-- ---------------------------------------------------------------------------
do $$
declare
  failures text[] := '{}';
  r text;
  p text;
begin
  execute 'create table public.zz_probe_table (id int)';
  execute 'create sequence public.zz_probe_sequence';
  execute 'create function public.zz_probe_function() returns int language sql immutable as ''select 1''';

  foreach r in array array['anon','authenticated'] loop
    -- A new TABLE and SEQUENCE must grant a client role nothing.
    foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege(r, 'public.zz_probe_table', p) then
        failures := failures || format('new table: %s has %s', r, p)::text;
      end if;
    end loop;
    foreach p in array array['USAGE','SELECT','UPDATE'] loop
      if has_sequence_privilege(r, 'public.zz_probe_sequence', p) then
        failures := failures || format('new sequence: %s has %s', r, p)::text;
      end if;
    end loop;
  end loop;

  -- Neither may carry a PUBLIC grant, which would reach every role including anon.
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
             where c.oid = 'public.zz_probe_table'::regclass and a.grantee = 0) then
    failures := failures || 'new table: PUBLIC holds a privilege'::text;
  end if;
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
             where c.oid = 'public.zz_probe_sequence'::regclass and a.grantee = 0) then
    failures := failures || 'new sequence: PUBLIC holds a privilege'::text;
  end if;

  -- service_role keeps the full default on both.
  foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if not has_table_privilege('service_role', 'public.zz_probe_table', p) then
      failures := failures || format('new table: service_role lost %s', p)::text;
    end if;
  end loop;
  foreach p in array array['USAGE','SELECT','UPDATE'] loop
    if not has_sequence_privilege('service_role', 'public.zz_probe_sequence', p) then
      failures := failures || format('new sequence: service_role lost %s', p)::text;
    end if;
  end loop;

  -- A new FUNCTION must already be closed to the client roles, with no per-function revoke yet.
  -- PostgreSQL's built-in acldefault() grants EXECUTE to PUBLIC, and cancelling that needs the
  -- GLOBAL default-privileges statement in the migration (no IN SCHEMA). If someone re-scopes that
  -- statement to `in schema public`, PUBLIC keeps EXECUTE, every role inherits it, and these three
  -- assertions are what catch it.
  foreach r in array array['anon','authenticated'] loop
    if has_function_privilege(r, 'public.zz_probe_function()', 'EXECUTE') then
      failures := failures || format('new function: %s has EXECUTE before any per-function revoke -- is the PUBLIC revoke schema-scoped?', r)::text;
    end if;
  end loop;
  if exists (select 1 from pg_proc pr, aclexplode(pr.proacl) a
             where pr.oid = 'public.zz_probe_function()'::regprocedure and a.grantee = 0) then
    failures := failures || 'new function: PUBLIC holds EXECUTE'::text;
  end if;
  if not has_function_privilege('service_role', 'public.zz_probe_function()', 'EXECUTE') then
    failures := failures || 'new function: service_role lost EXECUTE'::text;
  end if;

  -- The per-function revoke is kept as defence in depth, so it must still work and must still
  -- leave service_role alone.
  execute 'revoke all on function public.zz_probe_function() from public, anon, authenticated';
  foreach r in array array['anon','authenticated'] loop
    if has_function_privilege(r, 'public.zz_probe_function()', 'EXECUTE') then
      failures := failures || format('function: %s has EXECUTE after the per-function revoke', r)::text;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.zz_probe_function()', 'EXECUTE') then
    failures := failures || 'function: the per-function revoke also removed service_role EXECUTE'::text;
  end if;

  if array_length(failures, 1) is not null then
    raise exception E'NEW-OBJECT DEFAULT CHECK FAILED:\n%', array_to_string(failures, E'\n');
  end if;
  raise notice 'PASS 2/3  a new table, sequence AND function grant anon/authenticated/PUBLIC nothing; service_role intact';

  -- 3. An explicit grant still works, and grants exactly what it names.
  execute 'grant select on table public.zz_probe_table to anon, authenticated';
  foreach r in array array['anon','authenticated'] loop
    if not has_table_privilege(r, 'public.zz_probe_table', 'SELECT') then
      failures := failures || format('%s did not receive the explicit SELECT', r)::text;
    end if;
    foreach p in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege(r, 'public.zz_probe_table', p) then
        failures := failures || format('%s gained %s alongside the explicit SELECT', r, p)::text;
      end if;
    end loop;
  end loop;

  if array_length(failures, 1) is not null then
    raise exception E'EXPLICIT GRANT CHECK FAILED:\n%', array_to_string(failures, E'\n');
  end if;
  raise notice 'PASS 3/3  grant select yields SELECT and nothing else';

  execute 'drop function public.zz_probe_function()';
  execute 'drop sequence public.zz_probe_sequence';
  execute 'drop table public.zz_probe_table';
end $$;

do $$
begin
  if exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relname like 'zz\_probe%')
     or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname like 'zz\_probe%') then
    raise exception 'probe objects were not fully dropped';
  end if;
  raise notice 'CLEANUP    no zz_probe* object remains';
end $$;
