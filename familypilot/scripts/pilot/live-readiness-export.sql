-- Read-only. Run against production; save the single JSON cell it returns as claims.json for live-readiness.cjs.
select jsonb_build_object(
  'readAt', now(),
  'venues', (select jsonb_agg(jsonb_build_object(
      'venueId', p.familypilot_place_id, 'name', p.name,
      'providerHours', (p.opening_hours is not null and p.opening_hours <> 'null'::jsonb and p.opening_hours <> '{}'::jsonb and p.opening_hours <> '[]'::jsonb),
      'claims', coalesce((select jsonb_agg(jsonb_build_object('fieldKey', c.field_key, 'value', c.value_json, 'validUntil', c.valid_until, 'approvedBy', c.approved_by))
                          from public.venue_claims c where c.familypilot_place_id = p.familypilot_place_id and c.status = 'active'), '[]'::jsonb)))
    from public.place_records p
    where p.name in ('Royal Air Force Museum London', 'Horniman Museum and Gardens', 'Discover Children''s Story Centre', 'London Zoo', 'Science Museum'))
) as export;
