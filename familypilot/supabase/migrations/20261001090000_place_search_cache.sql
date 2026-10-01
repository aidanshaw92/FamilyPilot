-- A server-side cache for Google Places discovery searches, and a daily counter for every
-- billable Google request.
--
-- Why a table rather than an in-process Map: these endpoints run as Vercel serverless functions.
-- Module-level state lives only as long as one warm instance and is not shared between concurrent
-- instances, so an in-memory cache would pass a test and do almost nothing in production. That is
-- how `/api/places/search` came to bill NINE Nearby Search requests (a nine-point London grid) on
-- every fresh page load, with `Cache-Control: no-store` on the response so nothing downstream
-- absorbed the repeats either.
--
-- Why `public` and not `private`: PostgREST only serves the schemas Supabase exposes (public,
-- graphql_public). The API routes reach Postgres through supabase-js, so a table in `private` would
-- be unreachable from them -- `private.worker_secrets` is read by pg_cron and plain SQL, which is a
-- different access path. These tables therefore sit in `public` and are closed off the same way the
-- rest of the server-only data is: RLS on with no policy, and every privilege revoked from anon and
-- authenticated, so only the service role can see them.
--
-- Retention: Google's Maps Platform terms permit a place ID to be stored indefinitely and other
-- Places content to be cached temporarily. `cached_until` is always set well inside that window by
-- the writer, expired rows are not served, and purge_expired_place_search_cache() deletes them.
-- See docs/GOOGLE_PLACES_COST_CONTROL.md.

create table if not exists public.place_search_cache (
  cache_key text primary key,
  payload jsonb not null,
  provider text not null,
  -- How many billable provider requests this one row stands in for. The London grid writes 9.
  billable_calls integer not null default 1,
  fetched_at timestamptz not null default now(),
  cached_until timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.place_search_cache is
  'Temporary cache of provider discovery searches. Server-only: RLS on with no policy. Rows are not served past cached_until.';

create index if not exists place_search_cache_cached_until_idx
  on public.place_search_cache (cached_until);

-- Daily attribution for every billable request, by SKU family and scope. This is the record that
-- answers "who spent this" without waiting for a Google bill.
create table if not exists public.google_places_usage (
  usage_day date not null,
  sku text not null,
  scope text not null,
  environment text not null,
  calls bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (usage_day, sku, scope, environment)
);

comment on table public.google_places_usage is
  'Daily billable Google Places request counts by SKU family, scope and environment. Server-only.';

-- RLS on with no policy: the service role bypasses RLS, everyone else is denied by default. This is
-- belt and braces alongside the privilege revokes below, because a future migration that re-grants
-- table privileges broadly would otherwise reopen these.
alter table public.place_search_cache enable row level security;
alter table public.google_places_usage enable row level security;

revoke all on table public.place_search_cache from public, anon, authenticated;
revoke all on table public.google_places_usage from public, anon, authenticated;
grant select, insert, update, delete on table public.place_search_cache to service_role;
grant select, insert, update on table public.google_places_usage to service_role;

-- Incremented fire-and-forget from the request path, so it must never fail the request it is
-- counting: a conflict merges rather than raising. search_path is pinned because an unpinned
-- SECURITY DEFINER function resolves its own names against the caller's path.
create or replace function public.record_google_places_usage(
  p_sku text,
  p_scope text,
  p_environment text,
  p_calls bigint default 1
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_total bigint;
begin
  insert into public.google_places_usage (usage_day, sku, scope, environment, calls)
  values (current_date, p_sku, p_scope, p_environment, greatest(p_calls, 0))
  on conflict (usage_day, sku, scope, environment)
  do update set calls = public.google_places_usage.calls + greatest(p_calls, 0),
                updated_at = now()
  returning calls into v_total;

  return v_total;
end;
$$;

create or replace function public.purge_expired_place_search_cache()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer;
begin
  delete from public.place_search_cache where cached_until < now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.record_google_places_usage(text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.purge_expired_place_search_cache() from public, anon, authenticated;
grant execute on function public.record_google_places_usage(text, text, text, bigint) to service_role;
grant execute on function public.purge_expired_place_search_cache() to service_role;
