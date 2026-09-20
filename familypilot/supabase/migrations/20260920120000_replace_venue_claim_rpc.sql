-- Replace a venue's active claim for one field atomically.
--
-- createApprovedClaim() previously marked the existing claim `superseded` and then inserted its
-- replacement as two separate client calls. If the insert failed — a constraint violation, a
-- dropped connection, a function timeout — the supersede had already committed, so the venue was
-- left with no active claim for that field and a trusted fact a parent could previously see simply
-- disappeared. Now that the venue-freshness scheduler is live and replaces claims automatically,
-- that window is reachable without anyone driving it by hand.
--
-- The order below cannot be reversed. `idx_venue_claims_one_active_per_field` is a partial unique
-- index over (familypilot_place_id, field_key) WHERE status = 'active', so a replacement cannot be
-- inserted while the old row is still active. The supersede must come first — which is precisely
-- why it has to share a transaction with the insert. A plpgsql function body is one transaction,
-- so a failing INSERT rolls the UPDATE back with it and the old claim stays active.
--
-- Concurrency: two workers refreshing the same venue could otherwise both read the same active
-- claim, both supersede it, and both insert — with the unique index failing one of them after the
-- other had already committed. The advisory lock is transaction-scoped and keyed on the exact
-- (place, field) pair being replaced, so the second caller waits, then re-reads inside the lock and
-- sees the first caller's replacement. The unique index remains the final invariant; the lock
-- exists so that invariant is never the thing that discovers the race.

create or replace function public.replace_venue_claim(p_claim jsonb)
returns public.venue_claims
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_place    text := p_claim->>'familypilot_place_id';
  v_field    text := p_claim->>'field_key';
  v_existing uuid;
  v_new      public.venue_claims;
begin
  if v_place is null or v_field is null then
    raise exception 'replace_venue_claim requires familypilot_place_id and field_key';
  end if;
  -- Two different absences. A missing key yields SQL NULL; an explicit "value_json": null yields
  -- JSONB null, which is a perfectly valid non-SQL-NULL value and would satisfy the column's NOT
  -- NULL constraint while storing a claim that asserts nothing. The application layer already
  -- refuses null claim values, but this function is the authoritative write boundary and is
  -- callable directly by service_role, so it rejects both here.
  if p_claim->'value_json' is null or p_claim->'value_json' = 'null'::jsonb then
    raise exception 'replace_venue_claim requires a non-null value_json';
  end if;

  -- Transaction-scoped, released on commit or rollback. Keyed on the row identity being replaced
  -- so unrelated venues and unrelated fields never contend.
  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_place || '|' || v_field, 0)
  );

  -- Re-read inside the lock: whatever a concurrent caller committed is visible here.
  select id into v_existing
  from public.venue_claims
  where familypilot_place_id = v_place
    and field_key = v_field
    and status = 'active'
  for update;

  if v_existing is not null then
    update public.venue_claims
    set status = 'superseded', updated_at = now()
    where id = v_existing;
  end if;

  insert into public.venue_claims (
    familypilot_place_id, field_key, value_json, confidence,
    source_url, evidence_excerpt, source_type, source_evidence_id,
    checked_at, valid_until, approved_at, approved_by, approved_from_draft_id,
    status, supersedes_claim_id
  ) values (
    v_place,
    v_field,
    p_claim->'value_json',
    nullif(p_claim->>'confidence', ''),
    nullif(p_claim->>'source_url', ''),
    nullif(p_claim->>'evidence_excerpt', ''),
    nullif(p_claim->>'source_type', ''),
    nullif(p_claim->>'source_evidence_id', '')::uuid,
    (p_claim->>'checked_at')::date,
    nullif(p_claim->>'valid_until', '')::date,
    coalesce(nullif(p_claim->>'approved_at', '')::timestamptz, now()),
    p_claim->>'approved_by',
    nullif(p_claim->>'approved_from_draft_id', '')::uuid,
    'active',
    -- Authoritative: the claim this call actually superseded, not whatever the caller guessed
    -- before the lock was held.
    v_existing
  )
  returning * into v_new;

  return v_new;
end;
$$;

comment on function public.replace_venue_claim(jsonb) is
  'Atomically supersedes a venue field''s active claim and inserts its replacement in one transaction. A failed insert rolls back the supersede, so the previous claim stays active. Serialised per (familypilot_place_id, field_key) by a transaction-scoped advisory lock.';

revoke all on function public.replace_venue_claim(jsonb) from public, anon, authenticated;
grant execute on function public.replace_venue_claim(jsonb) to service_role;
