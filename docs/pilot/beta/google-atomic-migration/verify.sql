-- Production checks for reserve_google_places_usage(). Run AFTER apply.sql and BEFORE the atomic flag is enabled.
-- Everything that writes runs inside a transaction that is rolled back, under a throwaway environment name, so the real
-- spend ledger is never changed. Any failed check raises an exception and the whole script stops.
begin;
do $$
declare
  r jsonb;
  before_rows bigint; before_sum bigint;
  sig text := 'public.reserve_google_places_usage(text,text,text,bigint,bigint,bigint,bigint)';
begin
  select count(*), coalesce(sum(calls),0) into before_rows, before_sum from public.google_places_usage;

  -- 1. Shape
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='reserve_google_places_usage' and p.prosecdef
                    and p.proconfig::text like '%search_path=pg_catalog, public%') then
    raise exception 'function missing, not SECURITY DEFINER, or search_path not pinned';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='reserve_google_places_usage') <> 1 then
    raise exception 'unexpected number of overloads';
  end if;

  -- 2. Privileges: service_role only
  if has_function_privilege('anon', sig, 'EXECUTE') or has_function_privilege('authenticated', sig, 'EXECUTE') then
    raise exception 'a client role can execute the function';
  end if;
  if not has_function_privilege('service_role', sig, 'EXECUTE') then
    raise exception 'service_role cannot execute the function';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = sig::regprocedure and a.grantee = 0) then
    raise exception 'PUBLIC can execute the function';
  end if;

  -- 3. Behaviour, in a throwaway environment inside this transaction
  r := public.reserve_google_places_usage('sku_a','a','migration-check',30,50,60,900);
  if (r->>'allowed')::boolean is not true or (r->>'scope_used')::bigint <> 30 then raise exception 'first reservation: %', r; end if;
  r := public.reserve_google_places_usage('sku_a','a','migration-check',21,50,60,900);
  if (r->>'allowed')::boolean is not false or r->>'reason' <> 'scope_cap' then raise exception 'scope ceiling: %', r; end if;
  r := public.reserve_google_places_usage('sku_b','b','migration-check',30,50,60,900);
  if (r->>'allowed')::boolean is not true then raise exception 'second scope: %', r; end if;
  r := public.reserve_google_places_usage('sku_c','c','migration-check',1,50,60,900);
  if (r->>'allowed')::boolean is not false or r->>'reason' <> 'total_cap' then raise exception 'total ceiling: %', r; end if;
  if (select coalesce(sum(calls),0) from public.google_places_usage where environment='migration-check' and usage_day=current_date) <> 60 then
    raise exception 'a refusal changed the stored total';
  end if;
  r := public.reserve_google_places_usage('sku_c','c','migration-check',1,50,null,59);
  if (r->>'allowed')::boolean is not false or r->>'reason' <> 'month_cap' then raise exception 'month ceiling: %', r; end if;
  r := public.reserve_google_places_usage('sku_d','d','migration-check',100,null,null,null);
  if (r->>'allowed')::boolean is not true then raise exception 'NULL ceilings must mean no ceiling: %', r; end if;

  raise notice 'reserve_google_places_usage: shape, privileges and ceilings pass (rows before=%, sum before=%)', before_rows, before_sum;
end;
$$;
rollback;

-- 4. The rollback above left the real ledger untouched: no throwaway rows exist and nothing was written.
select (select count(*) from public.google_places_usage where environment = 'migration-check') as throwaway_rows_left; -- expected 0
