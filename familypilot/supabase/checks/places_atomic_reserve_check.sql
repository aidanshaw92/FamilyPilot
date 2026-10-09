-- Asserts public.reserve_google_places_usage() exists, is pinned, is closed to client roles, open to service_role,
-- and applies the per-scope and total ceilings. Concurrency is proven separately by places_atomic_reserve_concurrency.sh.
do $$
declare
  r jsonb;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'reserve_google_places_usage'
                    and p.proconfig is not null and p.proconfig::text like '%search_path%') then
    raise exception 'reserve_google_places_usage is missing or has no pinned search_path';
  end if;

  if has_function_privilege('anon', 'public.reserve_google_places_usage(text,text,text,bigint,bigint,bigint,bigint)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reserve_google_places_usage(text,text,text,bigint,bigint,bigint,bigint)', 'EXECUTE') then
    raise exception 'a client role can execute reserve_google_places_usage';
  end if;
  if not has_function_privilege('service_role', 'public.reserve_google_places_usage(text,text,text,bigint,bigint,bigint,bigint)', 'EXECUTE') then
    raise exception 'service_role cannot execute reserve_google_places_usage';
  end if;

  delete from public.google_places_usage where environment = 'atomic-check' and usage_day = current_date;

  r := public.reserve_google_places_usage('sku_a', 'a', 'atomic-check', 30, 50, 60);
  if (r->>'allowed')::boolean is not true then raise exception 'first reservation refused: %', r; end if;
  r := public.reserve_google_places_usage('sku_a', 'a', 'atomic-check', 21, 50, 60);
  if (r->>'allowed')::boolean is not false or r->>'reason' <> 'scope_cap' then raise exception 'scope ceiling not applied: %', r; end if;
  r := public.reserve_google_places_usage('sku_b', 'b', 'atomic-check', 30, 50, 60);
  if (r->>'allowed')::boolean is not true then raise exception 'second scope refused: %', r; end if;
  r := public.reserve_google_places_usage('sku_c', 'c', 'atomic-check', 1, 50, 60);
  if (r->>'allowed')::boolean is not false or r->>'reason' <> 'total_cap' then raise exception 'total ceiling not applied: %', r; end if;
  if (select coalesce(sum(calls), 0) from public.google_places_usage where environment = 'atomic-check' and usage_day = current_date) <> 60 then
    raise exception 'a refusal changed the stored total';
  end if;
  r := public.reserve_google_places_usage('sku_c', 'c', 'atomic-check', 100, null, null);
  if (r->>'allowed')::boolean is not true then raise exception 'NULL caps should mean no ceiling: %', r; end if;

  -- Monthly ceiling: earlier days of the month count, today is added to them, a refusal writes nothing.
  delete from public.google_places_usage where environment = 'atomic-check-m';
  if extract(day from current_date) > 1 then
    insert into public.google_places_usage (usage_day, sku, scope, environment, calls)
    values (date_trunc('month', current_date)::date, 'sku_m', 'm', 'atomic-check-m', 90);
    r := public.reserve_google_places_usage('sku_m', 'm', 'atomic-check-m', 11, null, null, 100);
    if (r->>'allowed')::boolean is not false or r->>'reason' <> 'month_cap' then raise exception 'month ceiling not applied: %', r; end if;
    r := public.reserve_google_places_usage('sku_m', 'm', 'atomic-check-m', 10, null, null, 100);
    if (r->>'allowed')::boolean is not true or (r->>'month_used')::bigint <> 100 then raise exception 'month figure wrong: %', r; end if;
    r := public.reserve_google_places_usage('sku_m', 'm', 'atomic-check-m', 1, null, null, 100);
    if (r->>'allowed')::boolean is not false then raise exception 'month ceiling is not a ceiling: %', r; end if;
  end if;
  delete from public.google_places_usage where environment = 'atomic-check-m';

  delete from public.google_places_usage where environment = 'atomic-check' and usage_day = current_date;
  raise notice 'reserve_google_places_usage: privileges and ceilings are as expected';
end;
$$;
