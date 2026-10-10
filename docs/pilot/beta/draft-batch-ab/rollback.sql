-- Rollback of publishing batch draft-ab. Paste as ONE run. Withdraws exactly the 15 claims the batch wrote (they become 'disputed':
-- nothing is deleted, and the app stops using them at once). Touches nothing else. Expected result printed last: 0 active rows.
begin;
update public.venue_claims set status = 'disputed', updated_at = now()
 where id in ('e6d93177-2934-5ac3-b1e9-79be5421962f', 'fd88ccfe-7a04-58fe-8bbf-6539d1bbde71', 'f462d4b5-11ba-5bab-819d-e01727a02686', '68aeb0cd-bbc1-5d63-89fd-e8378a10dd95', 'c8591917-a224-551f-9b05-aea5cca971d5', '3cdcaca4-b18e-5fdf-9481-a99395470fee', 'bb8c6408-ca4b-5329-850c-acbbce3574ca', 'cba9f84d-1c50-53d8-8c23-1394c6296440', 'c805a2d0-614b-5224-9193-6acea61384a6', 'f27d0521-dca9-512b-b888-0fb3b0610cbd', '0e58034a-6960-582c-8788-b574b078915a', 'd7ed8e13-38ff-5622-a2b1-ced791183039', 'a64e9e1f-fd3a-57f7-a6b5-8efe2af40a4f', '5440846f-d24d-5bad-9347-2d7de970e769', 'a4497f36-a9c8-5981-9a3b-e225c7c2cec6') and status = 'active' and approved_by = 'human:owner-draft';
do $$
declare n integer;
begin
  select count(*) into n from public.venue_claims where id in ('e6d93177-2934-5ac3-b1e9-79be5421962f', 'fd88ccfe-7a04-58fe-8bbf-6539d1bbde71', 'f462d4b5-11ba-5bab-819d-e01727a02686', '68aeb0cd-bbc1-5d63-89fd-e8378a10dd95', 'c8591917-a224-551f-9b05-aea5cca971d5', '3cdcaca4-b18e-5fdf-9481-a99395470fee', 'bb8c6408-ca4b-5329-850c-acbbce3574ca', 'cba9f84d-1c50-53d8-8c23-1394c6296440', 'c805a2d0-614b-5224-9193-6acea61384a6', 'f27d0521-dca9-512b-b888-0fb3b0610cbd', '0e58034a-6960-582c-8788-b574b078915a', 'd7ed8e13-38ff-5622-a2b1-ced791183039', 'a64e9e1f-fd3a-57f7-a6b5-8efe2af40a4f', '5440846f-d24d-5bad-9347-2d7de970e769', 'a4497f36-a9c8-5981-9a3b-e225c7c2cec6') and status = 'active';
  if n <> 0 then raise exception 'Rollback aborted: % batch rows are still active. Nothing was changed.', n; end if;
end $$;
commit;
select count(*) as active_batch_rows from public.venue_claims where id in ('e6d93177-2934-5ac3-b1e9-79be5421962f', 'fd88ccfe-7a04-58fe-8bbf-6539d1bbde71', 'f462d4b5-11ba-5bab-819d-e01727a02686', '68aeb0cd-bbc1-5d63-89fd-e8378a10dd95', 'c8591917-a224-551f-9b05-aea5cca971d5', '3cdcaca4-b18e-5fdf-9481-a99395470fee', 'bb8c6408-ca4b-5329-850c-acbbce3574ca', 'cba9f84d-1c50-53d8-8c23-1394c6296440', 'c805a2d0-614b-5224-9193-6acea61384a6', 'f27d0521-dca9-512b-b888-0fb3b0610cbd', '0e58034a-6960-582c-8788-b574b078915a', 'd7ed8e13-38ff-5622-a2b1-ced791183039', 'a64e9e1f-fd3a-57f7-a6b5-8efe2af40a4f', '5440846f-d24d-5bad-9347-2d7de970e769', 'a4497f36-a9c8-5981-9a3b-e225c7c2cec6') and status = 'active';
