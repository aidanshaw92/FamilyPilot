-- Opt-in cloud backup for Saved places.
--
-- WHAT THIS IS FOR. Saved places live in AsyncStorage and therefore only on one device: reinstall the
-- app or pick up a second phone and they are gone. This gives a parent somewhere to put them, on
-- purpose, and get them back.
--
-- OPT-IN, NOT AUTOMATIC. Signing in does not upload anything. `docs/PRIVACY_MODEL.md` classifies saves
-- as Behavioural data and marks them opt-in, and the account screen already promises as much in so many
-- words ("Device data has not been automatically uploaded"). A parent presses a control, or nothing
-- leaves the device.
--
-- WHAT IS DELIBERATELY NOT IN HERE. The family profile is not backed up by this table, and children's
-- names and dates of birth do not reach the cloud through it. That is the owner's decision pending a
-- GDPR-K/COPPA view, and it is enforced in the projection rather than merely intended: see
-- `src/services/saved/saved-backup-projection.ts`, which drops every personalised field from the venue
-- snapshot before upload, and the tests that assert the payload carries no home-distance, no score
-- explanation and no routine text.
--
-- The rows here therefore hold public venue facts (name, category, coordinates, address) plus the
-- parent's own filing of them (which list, when saved). A leak of this table would reveal which public
-- places a family bookmarked. That is not nothing, which is why it is behind RLS and opt-in -- but it is
-- categorically less than their children's ages or where they live.
--
-- THE PATTERN IS COPIED, NOT INVENTED. Identical in shape to planning_workspaces (migration
-- 20260909182317): user_id primary key referencing auth.users with cascade delete, RLS on, four own-row
-- policies, grants to `authenticated` only, everything revoked from `anon`. That shape is already live
-- in production and verified. Deleting the account deletes the backup, via the cascade.

create table if not exists public.saved_places_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- An object, not an array, so the payload can gain fields later without a migration. Shape:
  -- { "version": 1, "items": [...], "savedIds": [...] }
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.saved_places_backups enable row level security;

-- `(select auth.uid())` rather than a bare `auth.uid()`: the subquery form is evaluated once per
-- statement instead of once per row. Same as planning_workspaces.
create policy "Read own saved backup" on public.saved_places_backups
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own saved backup" on public.saved_places_backups
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own saved backup" on public.saved_places_backups
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Delete matters as much as the rest: a parent who backed up must be able to take it back down.
create policy "Delete own saved backup" on public.saved_places_backups
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.saved_places_backups to authenticated;
revoke all on public.saved_places_backups from anon;
