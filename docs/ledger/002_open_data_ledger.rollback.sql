-- PROPOSED. NOT APPLIED. Reverses 001_open_data_ledger.proposed.sql completely. No existing table was altered, so this leaves
-- production exactly as it was before 001.

-- A. Withdraw ONE batch (the normal rollback). Replace the id. Links go with the places.
--    begin;
--      select count(*) from public.open_data_places where import_batch_id = '00000000-0000-0000-0000-000000000000';  -- expect row_count
--      delete from public.open_data_places where import_batch_id = '00000000-0000-0000-0000-000000000000';
--      delete from public.place_import_batches where id = '00000000-0000-0000-0000-000000000000';
--    commit;

-- B. Remove the whole ledger.
begin;
drop table if exists public.open_data_place_links;
drop table if exists public.open_data_places;
drop table if exists public.place_import_batches;
commit;
