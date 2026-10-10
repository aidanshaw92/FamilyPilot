-- Rollback for 20261009120000_places_atomic_reserve.sql. Removes only the function this migration added.
-- It touches no table and no row, and record_google_places_usage() (the existing counter) is not affected.
-- Safe at any time: with GOOGLE_PLACES_ATOMIC_CAP off the function is never called; with it on, removing the function
-- makes every paid Google request refuse (fail closed), so remove the flag first.
drop function if exists public.reserve_google_places_usage(text, text, text, bigint, bigint, bigint, bigint);
