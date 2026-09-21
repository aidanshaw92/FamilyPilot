-- Asserts the database's own guard on the venue age-policy read model.
--
-- The matcher treats `venue_family_metadata.venue_age_policy` as authoritative: an entry in
-- `restrictions` removes a venue from a parent's results. So the shapes that entry may take are a
-- property of the TABLE, not of one JavaScript projector -- and the only way to know that is to
-- run it. vitest cannot; this can.
--
-- Two separate things are checked, because either alone would be a false pass:
--   1. the constraint is actually attached to the column and calls the validator;
--   2. the validator itself accepts and rejects the right shapes.
--
-- Read-only: every assertion is a function call or a catalogue query, so nothing is written and
-- no probe object is created.

do $$
declare
  constraint_def text;
begin
  select pg_get_constraintdef(c.oid) into constraint_def
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'venue_family_metadata'
    and c.conname = 'venue_family_metadata_age_policy_shape';

  if constraint_def is null then
    raise exception 'venue_family_metadata has no age-policy shape constraint';
  end if;

  if constraint_def not like '%venue_age_policy_is_valid%' then
    raise exception 'the shape constraint does not call the validator: %', constraint_def;
  end if;

  if constraint_def not like '%venue_age_policy%' then
    raise exception 'the shape constraint does not guard the venue_age_policy column: %', constraint_def;
  end if;

  raise notice 'constraint attached: %', constraint_def;

  -- A CHECK constraint calls its validator as the role doing the WRITE, and that call is
  -- privilege-checked. If service_role ever loses EXECUTE here, every enrichment write to this
  -- table fails with "permission denied for function" -- a failure that has nothing to do with
  -- age policy and would be baffling at 3am. Asserted however the privilege was granted.
  if not has_function_privilege('service_role', 'public.venue_age_policy_is_valid(jsonb)', 'EXECUTE') then
    raise exception 'service_role cannot execute the age-policy validator, so it cannot write the table';
  end if;
  if not has_function_privilege('service_role', 'public.venue_age_bounds_are_valid(jsonb)', 'EXECUTE') then
    raise exception 'service_role cannot execute the age-bounds validator, so it cannot write the table';
  end if;

  -- The reader roles have no business executing it, and the privilege model says so.
  if has_function_privilege('anon', 'public.venue_age_policy_is_valid(jsonb)', 'EXECUTE') then
    raise exception 'anon should not hold EXECUTE on the age-policy validator';
  end if;
end;
$$;

do $$
declare
  c record;
  got boolean;
  failures int := 0;
begin
  for c in
    select * from (values
      -- Accepted.
      ('null policy',                  null::jsonb,                                                                                                                                                                                                                              true),
      ('one door',                     '{"restrictions":[{"minMonthsInclusive":48,"maxMonthsExclusive":null,"sourceUrl":"https://a","checkedAt":"2026-09-21"}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                      true),
      ('two doors from one source',    '{"restrictions":[{"minMonthsInclusive":48,"maxMonthsExclusive":null,"sourceUrl":"https://a","checkedAt":null},{"minMonthsInclusive":null,"maxMonthsExclusive":144,"sourceUrl":"https://a","checkedAt":null}],"caveats":[],"sourcesDisagree":false}'::jsonb, true),
      ('month-precise baby bound',     '{"restrictions":[{"minMonthsInclusive":6,"maxMonthsExclusive":18,"sourceUrl":"https://a","checkedAt":"2026-09-21"}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                         true),
      ('caveats only, no door',        '{"restrictions":[],"caveats":[{"scope":"activity","minMonthsInclusive":60,"maxMonthsExclusive":null,"sourceUrl":null}],"sourcesDisagree":false}'::jsonb,                                                                                  true),
      ('a disagreement with no door',  '{"restrictions":[],"caveats":[],"sourcesDisagree":true}'::jsonb,                                                                                                                                                                         true),
      ('non-gating venue caveat',      '{"restrictions":[],"caveats":[{"scope":"venue","minMonthsInclusive":48,"maxMonthsExclusive":null,"sourceUrl":"https://a"}],"sourcesDisagree":true}'::jsonb,                                                                               true),

      -- Rejected: the door would exclude families on something nobody stated.
      ('a disagreement WITH a door',   '{"restrictions":[{"minMonthsInclusive":48,"maxMonthsExclusive":null,"sourceUrl":"https://a","checkedAt":null}],"caveats":[],"sourcesDisagree":true}'::jsonb,                                                                              false),
      ('an empty policy',              '{"restrictions":[],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                                                                                                                        false),
      ('not an object',                '[]'::jsonb,                                                                                                                                                                                                                              false),
      ('a scalar',                     '"nope"'::jsonb,                                                                                                                                                                                                                          false),
      ('restrictions not an array',    '{"restrictions":{},"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                                                                                                                        false),
      ('restrictions key absent',      '{"caveats":[],"sourcesDisagree":true}'::jsonb,                                                                                                                                                                                           false),
      ('caveats key absent',           '{"restrictions":[],"sourcesDisagree":true}'::jsonb,                                                                                                                                                                                      false),
      ('sourcesDisagree key absent',   '{"restrictions":[],"caveats":[{"scope":"venue","minMonthsInclusive":48,"maxMonthsExclusive":null,"sourceUrl":null}]}'::jsonb,                                                                                                             false),
      ('sourcesDisagree not boolean',  '{"restrictions":[],"caveats":[],"sourcesDisagree":"true"}'::jsonb,                                                                                                                                                                       false),
      ('door with no sourceUrl key',   '{"restrictions":[{"minMonthsInclusive":48,"maxMonthsExclusive":null,"checkedAt":null}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                                                     false),
      ('door with null sourceUrl',     '{"restrictions":[{"minMonthsInclusive":48,"maxMonthsExclusive":null,"sourceUrl":null,"checkedAt":null}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                                    false),
      ('door with empty sourceUrl',    '{"restrictions":[{"minMonthsInclusive":48,"maxMonthsExclusive":null,"sourceUrl":"","checkedAt":null}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                                      false),
      ('door with blank sourceUrl',    '{"restrictions":[{"minMonthsInclusive":48,"maxMonthsExclusive":null,"sourceUrl":"   ","checkedAt":null}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                                   false),
      ('door with numeric sourceUrl',  '{"restrictions":[{"minMonthsInclusive":48,"maxMonthsExclusive":null,"sourceUrl":7,"checkedAt":null}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                                       false),
      ('door with no bound at all',    '{"restrictions":[{"minMonthsInclusive":null,"maxMonthsExclusive":null,"sourceUrl":"https://a","checkedAt":null}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                           false),
      ('door with only a null min',    '{"restrictions":[{"minMonthsInclusive":null,"sourceUrl":"https://a","checkedAt":null}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                                                     false),
      ('door missing the max key',     '{"restrictions":[{"minMonthsInclusive":48,"sourceUrl":"https://a","checkedAt":null}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                                                       false),
      ('negative bound',               '{"restrictions":[{"minMonthsInclusive":-1,"maxMonthsExclusive":null,"sourceUrl":"https://a","checkedAt":null}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                             false),
      ('fractional bound',             '{"restrictions":[{"minMonthsInclusive":4.5,"maxMonthsExclusive":null,"sourceUrl":"https://a","checkedAt":null}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                            false),
      ('inverted interval',            '{"restrictions":[{"minMonthsInclusive":144,"maxMonthsExclusive":48,"sourceUrl":"https://a","checkedAt":null}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                              false),
      ('empty interval, min = max',    '{"restrictions":[{"minMonthsInclusive":48,"maxMonthsExclusive":48,"sourceUrl":"https://a","checkedAt":null}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                               false),
      ('checkedAt not a string',       '{"restrictions":[{"minMonthsInclusive":48,"maxMonthsExclusive":null,"sourceUrl":"https://a","checkedAt":20260921}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                         false),
      ('checkedAt key absent',         '{"restrictions":[{"minMonthsInclusive":48,"maxMonthsExclusive":null,"sourceUrl":"https://a"}],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                                              false),
      ('door not an object',           '{"restrictions":["under 4s"],"caveats":[],"sourcesDisagree":false}'::jsonb,                                                                                                                                                              false),
      ('caveat with unknown scope',    '{"restrictions":[],"caveats":[{"scope":"carpark","minMonthsInclusive":60,"maxMonthsExclusive":null,"sourceUrl":null}],"sourcesDisagree":false}'::jsonb,                                                                                   false),
      ('caveat with no scope',         '{"restrictions":[],"caveats":[{"minMonthsInclusive":60,"maxMonthsExclusive":null,"sourceUrl":null}],"sourcesDisagree":false}'::jsonb,                                                                                                     false),
      ('caveat with no bounds',        '{"restrictions":[],"caveats":[{"scope":"ambiguous","minMonthsInclusive":null,"maxMonthsExclusive":null,"sourceUrl":null}],"sourcesDisagree":false}'::jsonb,                                                                               false),
      ('caveat with fractional bound', '{"restrictions":[],"caveats":[{"scope":"activity","minMonthsInclusive":60.5,"maxMonthsExclusive":null,"sourceUrl":null}],"sourcesDisagree":false}'::jsonb,                                                                                false)
    ) as t(label, policy, expected)
  loop
    got := public.venue_age_policy_is_valid(c.policy);
    if got is distinct from c.expected then
      failures := failures + 1;
      raise warning 'MISMATCH: % -- accepted=% expected=%', c.label, got, c.expected;
    end if;
  end loop;

  if failures > 0 then
    raise exception '% age-policy shape case(s) behaved wrongly', failures;
  end if;

  raise notice 'age-policy shape guard: all cases correct';
end;
$$;
