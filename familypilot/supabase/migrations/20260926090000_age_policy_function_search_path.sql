-- Pin the search_path of the two age-policy CHECK validators.
--
-- Supabase's security advisor reports `function_search_path_mutable` for both, and the reason it
-- matters here is specific rather than generic. These functions are not called by application code
-- that could sanitise its own environment: they are called by a CHECK constraint on
-- `venue_family_metadata`, as the role performing the WRITE, with that role's `search_path` in
-- force. A role whose search_path resolves an unqualified name to something other than
-- `pg_catalog` would change what the validator computes, and the validator is the only thing
-- standing between an editor payload and a stored age policy that removes a venue from a parent's
-- results. Whether that is reachable today is beside the point: the guard should not depend on the
-- caller's environment at all.
--
-- `''` rather than `pg_catalog, pg_temp`: pg_catalog is always searched first whether or not it is
-- listed, so an empty path resolves every built-in these bodies use (`jsonb_typeof`, `coalesce`,
-- `trunc`, `btrim`, `length`, `jsonb_array_length`, `jsonb_array_elements`, and the `->` / `->>`
-- operators) while resolving nothing else. Omitting pg_temp is deliberate: nothing here creates or
-- reads a temporary object, and leaving it out means a caller cannot shadow a name with one.
--
-- The one cross-function call is already schema-qualified -- `venue_age_policy_is_valid` calls
-- `public.venue_age_bounds_are_valid(entry)` -- so pinning the path does not break it. That is
-- asserted, not assumed: checks/venue_age_policy_shape_check.sql exercises all 35 shape cases
-- through the outer validator after this migration runs, so a name this path can no longer resolve
-- fails CI rather than production.
--
-- ALTER FUNCTION rather than CREATE OR REPLACE with the bodies restated. Restating them would
-- duplicate ninety lines of guard logic across two migrations, and the copy would be free to drift
-- from the original. ALTER only sets proconfig, leaves the CHECK constraint attached and the
-- existing grants untouched, and is idempotent.

alter function public.venue_age_bounds_are_valid(jsonb) set search_path = '';
alter function public.venue_age_policy_is_valid(jsonb) set search_path = '';

comment on function public.venue_age_bounds_are_valid(jsonb) is
  'Bounds half of the venue_age_policy shape guard. search_path is pinned to '''' because this runs '
  'inside a CHECK constraint as the writing role, and must not depend on that role''s environment.';

comment on function public.venue_age_policy_is_valid(jsonb) is
  'Shape guard behind venue_family_metadata_age_policy_shape. search_path is pinned to '''' because '
  'this runs inside a CHECK constraint as the writing role, and must not depend on that role''s '
  'environment.';
