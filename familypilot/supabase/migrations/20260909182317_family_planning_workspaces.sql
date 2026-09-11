-- Additive planning schema. Apply once to the FamilyPilot Supabase project.
-- Client rows are private; connected-family operations go through the authenticated API.
create table if not exists public.planning_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.planning_workspaces enable row level security;
create policy "Read own planning workspace" on public.planning_workspaces for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own planning workspace" on public.planning_workspaces for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own planning workspace" on public.planning_workspaces for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own planning workspace" on public.planning_workspaces for delete to authenticated using ((select auth.uid()) = user_id);
grant select,insert,update,delete on public.planning_workspaces to authenticated;
revoke all on public.planning_workspaces from anon;

create table if not exists public.planning_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete cascade,
  token_hash text not null unique,
  owner_snapshot jsonb not null,
  guest_snapshot jsonb,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (guest_id is null or guest_id <> owner_id)
);
create index planning_connections_owner_idx on public.planning_connections(owner_id);
create index planning_connections_guest_idx on public.planning_connections(guest_id);
alter table public.planning_connections enable row level security;
revoke all on public.planning_connections from anon,authenticated;
grant select,insert,update,delete on public.planning_connections to service_role;
grant select,insert,update,delete on public.planning_workspaces to service_role;
