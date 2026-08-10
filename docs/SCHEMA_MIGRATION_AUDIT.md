# Schema migration audit

Generated: 2026-08-10T19:31:43.218Z

## Committed migrations

- 001_initial_schema.sql: (no create tables)
- 002_place_records_and_metadata.sql: place_records, venue_family_metadata
- 003_venue_enrichment_workflow.sql: (no create tables)
- 004_place_records_service_role_grants.sql: (no create tables)
- 005_ai_enrichment_drafts.sql: venue_enrichment_drafts
- 006_venue_source_evidence.sql: venue_source_evidence
- 007_fetch_truncated_status.sql: (no create tables)
- 008_venue_claims.sql: venue_claims
- 009_venue_environment_energy.sql: (no create tables)
- 010_atomic_draft_regeneration.sql: (no create tables)
- 011_automatic_enrichment_worker.sql: public, private
- 012_enable_automatic_enrichment_schedule.sql: (no create tables)
- 013_canonical_venue_identity.sql: canonical_venues, venue_place_links
- 014_canonical_venue_grants.sql: (no create tables)

## Expected operational tables

- place_records
- venue_family_metadata
- venue_enrichment_drafts
- venue_source_evidence
- venue_claims
- venue_enrichment_jobs
- canonical_venues
- venue_place_links

## Known repository gaps

- 001_initial_schema.sql legacy venues model coexists with place_records stack
- BOOTSTRAP_FRESH_SUPABASE.sql does not include migrations 004-014
- 012_enable_automatic_enrichment_schedule.sql hard-codes production Supabase project URL
- place_record_id on venue_family_metadata is unused in application code

## Live production tables

- canonical_venues
- place_records
- venue_claims
- venue_enrichment_drafts
- venue_enrichment_jobs
- venue_family_metadata
- venue_place_links
- venue_source_evidence

## Drift vs expected operational tables

Missing in live: none

Extra in live: none
