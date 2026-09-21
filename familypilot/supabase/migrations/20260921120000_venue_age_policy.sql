-- The read model for a venue's age policy: the doors it enforces, the caveats it states, and
-- whether its sources contradict each other.
--
-- Canonical truth is NOT this column. It is the `agePolicy.<sourceKey>` claims in `venue_claims`,
-- whose JSON holds normalised rules in MONTHS together with the source that stated them. This
-- column is the projection of those claims: only trusted, in-lifetime, human-approved,
-- venue-scoped, `effect: excludes` rules become doors, everything else becomes a caveat, and a
-- disagreement between sources leaves no door standing at all.
--
-- Why a projection rather than editable columns. A previous revision of this work added
-- `min_admission_age` / `max_admission_age` smallints that the editor payload wrote directly.
-- Three problems, all of which this shape removes rather than documents:
--
--   1. A venue-EXCLUDING value could persist here with no claim behind it. `saveMetadata` falls
--      back to the raw editor payload whenever a venue has no active claims, so a typed number
--      became a hard gate with no source. Nothing can write this column except the claim
--      projection, so that is now unrepresentable rather than merely discouraged.
--   2. Whole years cannot state "under 6 months not admitted". Months are the unit a door policy
--      is actually written in for babies, which is exactly the group it matters most for.
--   3. Two scalar keys cannot hold two sources' policies, because the active-claim index is unique
--      per (place, field_key). Composing a min from one source with a max from another would
--      invent a range no source stated.
--
-- Shape, when present:
--   {"restrictions": [{"minMonthsInclusive": 48, "maxMonthsExclusive": null,
--                      "sourceUrl": "https://...", "checkedAt": "2026-09-21",
--                      "statedAs": "Under 4s are not admitted"}],
--    "caveats": [{"scope": "activity", "activity": "soft play", "accompaniment": null,
--                 "minMonthsInclusive": 60, "maxMonthsExclusive": null,
--                 "statedAs": "Soft play is 5+", "sourceUrl": "https://..."}],
--    "sourcesDisagree": false}
--
-- `restrictions` is a LIST and a child must satisfy every entry. "Under 4s not admitted" and
-- "over 12s not admitted" are two doors from one source, not a contradiction, and an earlier
-- revision that collapsed all doors into one interval could not represent them.
--
-- Half-open [min, max), matching the recommendation interval from P0-B1: a minimum of 48 admits a
-- child on their fourth birthday and not the day before; a maximum of 144 admits them through the
-- whole of their eleventh year. NULL means unknown, and unknown never excludes.
--
-- Privileges are inherited: 20260920210000 left this table granting anon/authenticated SELECT
-- only, and a new column carries the table's ACL.

alter table public.venue_family_metadata
  add column if not exists venue_age_policy jsonb;

-- The bounds half of the shape guard, shared by doors and caveats.
--
-- Both keys must be PRESENT and each must be a non-negative whole number or null, at least one of
-- them must be a real bound, and a minimum must fall below its maximum. Every one of those is a
-- row the matcher would otherwise read as a door policy: a fractional month it cannot compare
-- cleanly, a negative bound no child can be under, an inverted interval that admits nobody, or an
-- entry with no bound at all that excludes everybody or nobody depending on how it is read.
create or replace function public.venue_age_bounds_are_valid(entry jsonb)
returns boolean
language plpgsql
immutable
parallel safe
as $$
declare
  lo numeric;
  hi numeric;
begin
  -- coalesce() is load-bearing throughout this function. `->` on an absent key yields SQL NULL,
  -- jsonb_typeof(NULL) is NULL, and a NULL comparison is neither true nor false -- which a CHECK
  -- treats as SATISFIED. Without the coalesce, a missing key passes the test meant to reject it.
  if coalesce(jsonb_typeof(entry -> 'minMonthsInclusive'), 'missing') not in ('number', 'null') then
    return false;
  end if;
  if coalesce(jsonb_typeof(entry -> 'maxMonthsExclusive'), 'missing') not in ('number', 'null') then
    return false;
  end if;

  -- States no bound at all: admits everyone, and should have been left out entirely.
  if jsonb_typeof(entry -> 'minMonthsInclusive') <> 'number'
     and jsonb_typeof(entry -> 'maxMonthsExclusive') <> 'number' then
    return false;
  end if;

  if jsonb_typeof(entry -> 'minMonthsInclusive') = 'number' then
    lo := (entry ->> 'minMonthsInclusive')::numeric;
    if lo < 0 or lo <> trunc(lo) then return false; end if;
  end if;

  if jsonb_typeof(entry -> 'maxMonthsExclusive') = 'number' then
    hi := (entry ->> 'maxMonthsExclusive')::numeric;
    if hi < 0 or hi <> trunc(hi) then return false; end if;
  end if;

  if lo is not null and hi is not null and lo >= hi then return false; end if;

  return true;
end;
$$;

-- The whole shape guard.
--
-- The matcher treats this column as authoritative, so a malformed row must fail at WRITE time
-- rather than be read as a door policy nobody stated. The JS projector already refuses to build
-- these shapes; this constraint is what makes that true of the table rather than of one code path.
create or replace function public.venue_age_policy_is_valid(policy jsonb)
returns boolean
language plpgsql
immutable
parallel safe
as $$
declare
  entry jsonb;
  disagree boolean;
begin
  if policy is null then return true; end if;
  if jsonb_typeof(policy) <> 'object' then return false; end if;

  -- coalesce() is load-bearing on every one of these, for the reason spelled out in
  -- venue_age_bounds_are_valid: an ABSENT key makes `jsonb_typeof(...) <> 'array'` evaluate to
  -- NULL, and plpgsql takes a NULL condition as false, so the guard meant to reject the key's
  -- absence silently accepts it. Proven by test: without the coalesce, a policy with no `caveats`
  -- and no `sourcesDisagree` at all was stored.
  if coalesce(jsonb_typeof(policy -> 'restrictions'), 'missing') <> 'array' then return false; end if;
  if coalesce(jsonb_typeof(policy -> 'caveats'), 'missing') <> 'array' then return false; end if;
  if coalesce(jsonb_typeof(policy -> 'sourcesDisagree'), 'missing') <> 'boolean' then return false; end if;

  disagree := (policy ->> 'sourcesDisagree')::boolean;

  -- Fail open, enforced rather than trusted: a contradiction between sources must leave no door
  -- standing. Picking a side would invent a policy neither source stated.
  if disagree and jsonb_array_length(policy -> 'restrictions') > 0 then
    return false;
  end if;

  -- An empty policy is the same as no policy. Storing it would make "unknown" two different
  -- states, and the second one would be easy to read as "checked, nothing applies".
  if jsonb_array_length(policy -> 'restrictions') = 0
     and jsonb_array_length(policy -> 'caveats') = 0
     and not disagree then
    return false;
  end if;

  for entry in select value from jsonb_array_elements(policy -> 'restrictions') loop
    if jsonb_typeof(entry) <> 'object' then return false; end if;
    -- A door with no source is the single failure this whole design exists to prevent.
    if coalesce(jsonb_typeof(entry -> 'sourceUrl'), 'missing') <> 'string' then return false; end if;
    if length(btrim(entry ->> 'sourceUrl')) = 0 then return false; end if;
    if coalesce(jsonb_typeof(entry -> 'checkedAt'), 'missing') not in ('string', 'null') then return false; end if;
    if not public.venue_age_bounds_are_valid(entry) then return false; end if;
  end loop;

  for entry in select value from jsonb_array_elements(policy -> 'caveats') loop
    if jsonb_typeof(entry) <> 'object' then return false; end if;
    -- A caveat may be sourceless (it explains rather than excludes) but its scope must be one we
    -- know how to render, or a parent is shown a rule nobody can place.
    if coalesce(entry ->> 'scope', '') not in ('venue', 'activity', 'accompaniment', 'ambiguous') then
      return false;
    end if;
    if coalesce(jsonb_typeof(entry -> 'sourceUrl'), 'missing') not in ('string', 'null') then return false; end if;
    if not public.venue_age_bounds_are_valid(entry) then return false; end if;
  end loop;

  return true;
end;
$$;

-- A CHECK constraint calls its validator as the role performing the WRITE, and that call is
-- privilege-checked: a writer without EXECUTE gets "permission denied for function", not a
-- constraint violation. Verified directly, not assumed.
--
-- These grants are belt-and-braces rather than the thing that makes it work today. Production's
-- default privileges (reproduced in checks/fixture_production_acl_baseline.sql) already grant
-- service_role EXECUTE on new functions in public, and migration 20260920210000 revoked that
-- default from public, anon and authenticated only -- so service_role would inherit EXECUTE
-- anyway. Stating it here pins the requirement to this migration instead of to a default someone
-- may tighten later, and checks/venue_age_policy_shape_check.sql asserts the privilege holds
-- however it was granted.
-- Defence in depth, and the rule this repo already holds for every function a migration creates
-- (asserted by least-privilege-acl.test.ts): close it explicitly rather than relying on the
-- default privileges 20260920210000 installed.
revoke all on function public.venue_age_bounds_are_valid(jsonb) from public, anon, authenticated;
revoke all on function public.venue_age_policy_is_valid(jsonb) from public, anon, authenticated;

grant execute on function public.venue_age_bounds_are_valid(jsonb) to service_role;
grant execute on function public.venue_age_policy_is_valid(jsonb) to service_role;

alter table public.venue_family_metadata
  drop constraint if exists venue_family_metadata_age_restriction_shape;

alter table public.venue_family_metadata
  drop constraint if exists venue_family_metadata_age_policy_shape;

alter table public.venue_family_metadata
  add constraint venue_family_metadata_age_policy_shape
  check (public.venue_age_policy_is_valid(venue_age_policy));

comment on column public.venue_family_metadata.venue_age_policy is
  'READ MODEL ONLY. Projection of agePolicy.<sourceKey> claims: restrictions[] are doors a child '
  'must satisfy ALL of, in months, half-open [min, max); caveats[] explain without excluding; '
  'sourcesDisagree means trusted sources contradict each other and nothing gates. Never written '
  'from an editor payload. NULL means unknown, which never excludes. Truth is venue_claims.';
