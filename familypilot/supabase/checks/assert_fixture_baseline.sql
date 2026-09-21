-- Guard for the CI privilege job: prove the fixture really reproduced the BROAD legacy ACL before
-- the migration runs against it.
--
-- Without this, a fixture that silently degraded -- a renamed table, a dropped ALTER DEFAULT
-- PRIVILEGES line, an empty database -- would let the migration "pass" while subtracting nothing,
-- and the check that follows would confirm a state nothing had to achieve.

\set ON_ERROR_STOP on

do $$
declare
  failures text[] := '{}';
  t text;
begin
  -- The seven catalogue tables must start with the full broad set for both client roles.
  foreach t in array array['canonical_venues','place_records','venue_claims','venue_family_metadata',
                           'venue_place_links','venue_enrichment_drafts','venue_source_evidence'] loop
    if not has_table_privilege('anon', format('public.%I', t), 'TRUNCATE') then
      failures := failures || format('fixture: anon should start with TRUNCATE on %s', t)::text;
    end if;
    if not has_table_privilege('authenticated', format('public.%I', t), 'TRUNCATE') then
      failures := failures || format('fixture: authenticated should start with TRUNCATE on %s', t)::text;
    end if;
  end loop;

  -- planning_workspaces: the instructive case. Its own migration granted the four row privileges
  -- and revoked anon, but the broad default survived underneath for `authenticated`.
  if not has_table_privilege('authenticated', 'public.planning_workspaces', 'TRUNCATE') then
    failures := failures || 'fixture: authenticated should start with TRUNCATE on planning_workspaces'::text;
  end if;
  if has_table_privilege('anon', 'public.planning_workspaces', 'SELECT') then
    failures := failures || 'fixture: anon should already be revoked on planning_workspaces'::text;
  end if;

  -- The four tables that already carried their own revoke must start clean, or the migration would
  -- appear to fix something that was never broken.
  foreach t in array array['planning_connections','venue_enrichment_jobs','venue_visit_reports','plan_invites'] loop
    if has_table_privilege('anon', format('public.%I', t), 'SELECT')
       or has_table_privilege('authenticated', format('public.%I', t), 'SELECT') then
      failures := failures || format('fixture: %s should already be clean', t)::text;
    end if;
  end loop;

  -- A function created now must still reach PUBLIC, which is the condition the migration removes.
  execute 'create function public.zz_fixture_probe() returns int language sql immutable as ''select 1''';
  if not has_function_privilege('anon', 'public.zz_fixture_probe()', 'EXECUTE') then
    failures := failures || 'fixture: anon should start with EXECUTE on a new function, via PUBLIC'::text;
  end if;
  execute 'drop function public.zz_fixture_probe()';

  -- And the extensions schema must exist, or the migration''s grant-back is never exercised.
  if to_regnamespace('extensions') is null then
    failures := failures || 'fixture: the extensions schema is missing'::text;
  end if;

  if array_length(failures, 1) is not null then
    raise exception E'FIXTURE BASELINE CHECK FAILED:\n%', array_to_string(failures, E'\n');
  end if;
  raise notice 'FIXTURE OK  the broad legacy ACL is present, the four clean tables are clean, and PUBLIC still reaches a new function';
end $$;
