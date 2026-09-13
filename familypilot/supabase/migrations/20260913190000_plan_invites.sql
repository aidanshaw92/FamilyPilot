-- Additive: per-plan invites between already-connected families. A standing
-- planning_connections row is a general friendship; a plan_invites row shares one
-- specific saved plan with one connected family, with its own accept/decline state
-- independent of the connection itself, so a family can be invited to some days and
-- not others and each invite tracks its own pending/accepted/declined status.
create table if not exists public.plan_invites (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.planning_connections(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  plan_date date not null,
  plan_snapshot jsonb not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (invitee_id <> owner_id)
);
create index plan_invites_owner_idx on public.plan_invites(owner_id);
create index plan_invites_invitee_idx on public.plan_invites(invitee_id);
alter table public.plan_invites enable row level security;
revoke all on public.plan_invites from anon,authenticated;
grant select,insert,update,delete on public.plan_invites to service_role;
