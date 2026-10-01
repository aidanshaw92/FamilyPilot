-- Asserts that the Google Places cost-control tables actually work for the role that uses them, and
-- are actually closed to the roles that must not.
--
-- Why this is a database check and not a vitest test: the whole saving depends on `service_role`
-- being able to read and write two tables that have RLS enabled with no policy. If a future
-- migration revoked a grant, or RLS stopped being bypassed, the cache would return zero rows, every
-- search would miss, and the project would quietly go back to buying nine Nearby Search requests per
-- page load. The failure mode is silent spend, so it needs an assertion that runs in Postgres.
--
-- This mirrors production's configuration, verified on 2026-10-01: Supabase grants `service_role`
-- rolbypassrls, and `venue_enrichment_jobs` and `venue_source_evidence` already use exactly this
-- pattern (RLS on, no policies, written by the service role).

do $$
begin
  -- 1. The posture the cache depends on.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'place_search_cache' and c.relrowsecurity
  ) then
    raise exception 'place_search_cache does not have row level security enabled';
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'google_places_usage' and c.relrowsecurity
  ) then
    raise exception 'google_places_usage does not have row level security enabled';
  end if;

  -- 2. Both counting functions must be pinned. An unpinned SECURITY DEFINER function resolves its
  --    own names against the caller's search_path.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('record_google_places_usage', 'purge_expired_place_search_cache')
      and (p.proconfig is null or not (p.proconfig::text like '%search_path%'))
  ) then
    raise exception 'a places cost-control function has no pinned search_path';
  end if;

  raise notice 'cost-control table posture and function pinning are as expected';
end;
$$;

-- 3. anon and authenticated must be refused both tables and the counter.
do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    begin
      execute format('set local role %I', v_role);
      perform count(*) from public.place_search_cache;
      raise exception '% can read place_search_cache', v_role;
    exception when insufficient_privilege then
      null; -- as required
    end;
    reset role;

    begin
      execute format('set local role %I', v_role);
      perform count(*) from public.google_places_usage;
      raise exception '% can read google_places_usage', v_role;
    exception when insufficient_privilege then
      null;
    end;
    reset role;

    begin
      execute format('set local role %I', v_role);
      perform public.record_google_places_usage('probe', 'probe', 'probe', 1);
      raise exception '% can increment the usage counter', v_role;
    exception when insufficient_privilege then
      null;
    end;
    reset role;
  end loop;

  raise notice 'anon and authenticated are refused both tables and the counter';
end;
$$;

-- 4. The role that actually does the work must be able to. This is the half that, if it broke, would
--    cost money rather than leak it.
do $$
declare
  v_first bigint;
  v_second bigint;
  v_purged integer;
  v_remaining text;
begin
  set local role service_role;

  v_first := public.record_google_places_usage('nearby_search', 'discovery', 'check', 4);
  v_second := public.record_google_places_usage('nearby_search', 'discovery', 'check', 6);
  if v_second <> v_first + 6 then
    raise exception 'the usage counter did not accumulate: % then %', v_first, v_second;
  end if;

  -- A negative figure must not be able to wind the counter back and buy more headroom.
  if public.record_google_places_usage('nearby_search', 'discovery', 'check', -1000) <> v_second then
    raise exception 'a negative call count changed the counter';
  end if;

  insert into public.place_search_cache (cache_key, payload, provider, cached_until)
  values ('check:fresh', '{}'::jsonb, 'google', now() + interval '6 hours'),
         ('check:expired', '{}'::jsonb, 'google', now() - interval '1 minute');

  -- The read the serving path makes. Zero rows here is the silent-spend failure.
  if (select count(*) from public.place_search_cache where cache_key = 'check:fresh') <> 1 then
    raise exception 'service_role cannot read back a row it just wrote';
  end if;

  v_purged := public.purge_expired_place_search_cache();
  if v_purged < 1 then
    raise exception 'purge removed nothing, so expired rows would be served';
  end if;

  select string_agg(cache_key, ',' order by cache_key) into v_remaining
  from public.place_search_cache where cache_key like 'check:%';
  if v_remaining is distinct from 'check:fresh' then
    raise exception 'purge removed the wrong rows; left: %', coalesce(v_remaining, '(none)');
  end if;

  delete from public.place_search_cache where cache_key like 'check:%';
  reset role;

  raise notice 'service_role can read, write, count and purge, and the counter cannot be wound back';
end;
$$;

-- The usage counter is append-and-accumulate in production: nothing deletes from it, so the migration
-- deliberately does not grant service_role DELETE on it. Clearing this check's own rows therefore
-- happens as the migration owner, outside the block above, rather than by widening that grant to suit
-- a test.
delete from public.google_places_usage where environment = 'check';
