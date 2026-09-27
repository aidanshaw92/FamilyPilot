-- P0 Venue Source Integrity: record whose page a piece of evidence actually is.
--
-- `venue_source_evidence.familypilot_place_id` has always meant "the venue whose crawl fetched
-- this", and the pipeline treated it as "the venue this page is about". Those are different
-- statements, and on the sixteen domains carrying more than one catalogue venue they came apart:
-- Tate Britain and Tate Modern both served facility facts read off the Tate Liverpool page.
--
-- `subject_scope` records the relationship that was established at fetch time, so downstream code
-- reads a finding instead of re-inferring one. Forward-only and additive: nullable, no default,
-- no backfill, no data touched. NULL means "stored before this column existed", and every consumer
-- treats NULL exactly as it treats an unestablished relationship -- withheld, never assumed valid.

alter table public.venue_source_evidence
  add column if not exists subject_scope text,
  add column if not exists subject_scope_reason text;

-- The vocabulary is a stored contract, so constrain it rather than trusting every writer.
-- NULL is permitted on purpose: it is the pre-existing-row state, and it fails closed.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.venue_source_evidence'::regclass
      and conname = 'venue_source_evidence_subject_scope_check'
  ) then
    alter table public.venue_source_evidence
      add constraint venue_source_evidence_subject_scope_check
      check (subject_scope is null or subject_scope in (
        'venue_own_subtree',
        'venue_named_page',
        'organisation_ancestor',
        'other_catalogue_venue',
        'sibling_unverified'
      ));
  end if;
end $$;

comment on column public.venue_source_evidence.subject_scope is
  'Relationship between this page and the venue it was crawled for, decided at fetch time from '
  'place_records.website values. Only venue_own_subtree and venue_named_page may support a '
  'venue-specific claim. NULL means pre-provenance and fails closed.';

comment on column public.venue_source_evidence.subject_scope_reason is
  'Which rule produced subject_scope, for auditing without re-deriving the verdict.';

-- Partial index: audits and the eventual repair both filter on the scopes that withhold, which
-- are the minority of rows once the crawl is scoped.
create index if not exists venue_source_evidence_subject_scope_idx
  on public.venue_source_evidence (subject_scope)
  where subject_scope is not null;
