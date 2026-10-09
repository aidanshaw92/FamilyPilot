-- Colne Valley: withdraw the wrong "no" only. Publishes nothing about parking. Run once, after the enqueue.
-- Expected: UPDATE 1, UPDATE 1.
begin;
update public.venue_claims
   set status = 'disputed', updated_at = now()
 where id = 'eabed57d-f4e9-45a7-a8b6-f2746451cb89' and status = 'active' and field_key = 'familyFacilities.parking';
update public.venue_family_metadata
   set family_facilities = family_facilities - 'parking', updated_at = now()
 where familypilot_place_id = 'fp-google-ChIJq-jJARlxdkgRNLTE490EqVU' and family_facilities ->> 'parking' = 'no';
commit;
