-- Atomic reservation of billable Google Places units against a per-scope daily cap, an all-scope daily cap
-- and an all-scope calendar-month cap.
--
-- Why this exists: record_google_places_usage() only counts, after the fact, and the application reads the
-- totals back at most once a minute. Ten serverless instances that each read "40 of 50" can each spend
-- ten more. A cap that is checked in one place and written in another cannot be exact across processes.
--
-- This function checks and increments in ONE transaction, serialised by a transaction-scoped advisory lock
-- on (month, environment); one lock covers the day and month figures, so they cannot disagree. Two concurrent callers cannot both see room for the last unit: the second waits
-- for the first to commit, then sees the incremented total. The lock is held only for a SELECT and an
-- UPSERT on at most a few rows, so the wait is milliseconds.
--
-- It is used only when the application runs with GOOGLE_PLACES_ATOMIC_CAP=true. Without that variable the
-- existing record_google_places_usage() path is unchanged, and this function is never called.
--
-- Semantics:
--   * p_scope_cap / p_total_cap / p_month_cap are the ceilings in billable units (per scope per day, all scopes
--     per day, all scopes per UTC calendar month); NULL means "no ceiling of that kind".
--   * A request is refused if it would CROSS a ceiling (used + units > cap), so a cap is a ceiling, not a trigger.
--   * A refusal changes nothing. An allowed request is recorded in the same statement that approved it.
--   * Units are reserved BEFORE the provider is called. A call that then fails at the provider stays counted,
--     which over-counts and never under-counts.
create or replace function public.reserve_google_places_usage(
  p_sku text,
  p_scope text,
  p_environment text,
  p_units bigint,
  p_scope_cap bigint default null,
  p_total_cap bigint default null,
  p_month_cap bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_day date := current_date;
  v_units bigint := greatest(coalesce(p_units, 1), 1);
  v_scope_used bigint;
  v_total_used bigint;
  v_month_used bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('google_places_usage:' || to_char(v_day, 'YYYY-MM') || ':' || p_environment, 0));

  select coalesce(sum(calls) filter (where scope = p_scope), 0), coalesce(sum(calls), 0)
    into v_scope_used, v_total_used
    from public.google_places_usage
   where usage_day = v_day and environment = p_environment;

  select coalesce(sum(calls), 0) into v_month_used
    from public.google_places_usage
   where usage_day >= date_trunc('month', v_day)::date and usage_day <= v_day and environment = p_environment;

  if p_scope_cap is not null and v_scope_used + v_units > p_scope_cap then
    return jsonb_build_object('allowed', false, 'reason', 'scope_cap', 'scope_used', v_scope_used, 'total_used', v_total_used, 'month_used', v_month_used);
  end if;
  if p_total_cap is not null and v_total_used + v_units > p_total_cap then
    return jsonb_build_object('allowed', false, 'reason', 'total_cap', 'scope_used', v_scope_used, 'total_used', v_total_used, 'month_used', v_month_used);
  end if;
  if p_month_cap is not null and v_month_used + v_units > p_month_cap then
    return jsonb_build_object('allowed', false, 'reason', 'month_cap', 'scope_used', v_scope_used, 'total_used', v_total_used, 'month_used', v_month_used);
  end if;

  insert into public.google_places_usage (usage_day, sku, scope, environment, calls)
  values (v_day, p_sku, p_scope, p_environment, v_units)
  on conflict (usage_day, sku, scope, environment)
  do update set calls = public.google_places_usage.calls + v_units, updated_at = now();

  return jsonb_build_object('allowed', true, 'reason', 'ok', 'scope_used', v_scope_used + v_units, 'total_used', v_total_used + v_units, 'month_used', v_month_used + v_units);
end;
$$;

revoke all on function public.reserve_google_places_usage(text, text, text, bigint, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.reserve_google_places_usage(text, text, text, bigint, bigint, bigint, bigint) to service_role;
