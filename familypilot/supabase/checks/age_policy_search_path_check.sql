-- Asserts that the two age-policy CHECK validators do not depend on the caller's search_path.
--
-- Supabase's advisor reports `function_search_path_mutable` as a warning, and a warning is easy to
-- silence without fixing anything: `ALTER FUNCTION ... SET search_path` makes the advisor quiet
-- whether or not the guard still works afterwards, and whether or not it was ever caller-dependent
-- in the first place. So this file asserts three separate things, and the middle one is the only
-- one that proves the change was worth making:
--
--   1. the pin is actually recorded on both functions;
--   2. WITHOUT the pin the verdict really does change with the caller's search_path, and WITH it
--      the verdict holds -- demonstrated against a throwaway copy of the validator, so the claim
--      rests on observed behaviour rather than on the advisor's say-so;
--   3. the pinned functions still resolve every name their bodies use, proven by a write through
--      the real constraint.
--
-- Point 2 needs a copy rather than the real function because the real one is already pinned by the
-- time this runs, and un-pinning it to demonstrate the counterfactual would leave production's
-- guard temporarily weakened if this file were ever run anywhere but CI. The copy carries the same
-- unqualified `jsonb_typeof` call the real body opens with.

-- 1. The pin is recorded.
do $$
declare
  cfg text;
  fn text;
begin
  foreach fn in array array['venue_age_bounds_are_valid', 'venue_age_policy_is_valid'] loop
    select coalesce(array_to_string(p.proconfig, ','), '') into cfg
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fn;

    if cfg is null then
      raise exception 'public.% does not exist', fn;
    end if;
    if cfg not like '%search_path=%' then
      raise exception 'public.% has a mutable search_path (proconfig: %)', fn, coalesce(nullif(cfg, ''), '(none)');
    end if;
    raise notice 'public.% pins %', fn, cfg;
  end loop;
end;
$$;

-- 2. The counterfactual, against a throwaway copy.
do $$
declare
  unpinned_verdict boolean;
  pinned_verdict boolean;
begin
  create schema if not exists search_path_probe;

  -- A caller-controlled schema that shadows a name the validator bodies use unqualified.
  create or replace function search_path_probe.jsonb_typeof(jsonb)
  returns text language sql immutable as $body$ select 'array' $body$;

  -- The same opening guard the real validator uses, deliberately unpinned.
  create or replace function search_path_probe.guard_unpinned(entry jsonb)
  returns boolean language plpgsql immutable as $body$
  begin
    return coalesce(jsonb_typeof(entry -> 'minMonthsInclusive'), 'missing') in ('number', 'null');
  end;
  $body$;

  create or replace function search_path_probe.guard_pinned(entry jsonb)
  returns boolean language plpgsql immutable set search_path = '' as $body$
  begin
    return coalesce(jsonb_typeof(entry -> 'minMonthsInclusive'), 'missing') in ('number', 'null');
  end;
  $body$;

  -- With the probe schema ahead of pg_catalog, the shadow wins for anything unpinned.
  set local search_path = search_path_probe, public, pg_catalog;

  unpinned_verdict := search_path_probe.guard_unpinned('{"minMonthsInclusive": 48}'::jsonb);
  pinned_verdict := search_path_probe.guard_pinned('{"minMonthsInclusive": 48}'::jsonb);

  if unpinned_verdict then
    raise exception
      'the counterfactual did not reproduce: an unpinned guard was unaffected by a shadowed '
      'jsonb_typeof, so this check cannot show the pin does anything';
  end if;
  if not pinned_verdict then
    raise exception 'a pinned guard was still swayed by the caller search_path';
  end if;

  raise notice 'counterfactual holds: unpinned verdict %, pinned verdict %', unpinned_verdict, pinned_verdict;

  reset search_path;
  drop schema search_path_probe cascade;
end;
$$;

-- 3. The pinned functions still resolve everything their bodies need, through the real constraint.
do $$
declare
  -- The probe row is found again by this marker rather than by a returned key, because the table's
  -- primary key is a uuid in production and a bigserial in some fixtures. Capturing `id` into a
  -- typed variable made this file pass locally and fail against the production-shaped schema.
  probe_marker constant text := 'https://example.test/age-policy-search-path-probe';
  removed integer;
begin
  set local search_path = pg_catalog, public;

  insert into public.venue_family_metadata (venue_age_policy)
    values (jsonb_build_object(
      'restrictions', jsonb_build_array(jsonb_build_object(
        'minMonthsInclusive', 48, 'maxMonthsExclusive', null,
        'sourceUrl', probe_marker, 'checkedAt', '2026-09-26',
        'statedAs', 'Under 4s are not admitted')),
      'caveats', '[]'::jsonb,
      'sourcesDisagree', false));

  begin
    insert into public.venue_family_metadata (venue_age_policy)
      values ('{"restrictions":[{"minMonthsInclusive":48,"maxMonthsExclusive":null,"checkedAt":null}],"caveats":[],"sourcesDisagree":false}');
    raise exception 'a door with no source was accepted under the pinned path';
  exception when check_violation then
    raise notice 'the pinned guard still rejects a source-less door';
  end;

  delete from public.venue_family_metadata where venue_age_policy::text like '%' || probe_marker || '%';
  get diagnostics removed = row_count;
  if removed <> 1 then
    raise exception 'expected to remove exactly 1 probe row, removed %', removed;
  end if;

  raise notice 'pinned validators accept a valid policy and reject an invalid one; probe row removed';
end;
$$;
