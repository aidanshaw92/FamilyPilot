# Schema migration audit

Generated: 2026-09-21T11:49:41.396Z

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
- 20260909182317_family_planning_workspaces.sql: public, public
- 20260909205743_venue_feedback_freshness.sql: (no create tables)
- 20260913190000_plan_invites.sql: public
- 20260913200000_automatic_area_sync.sql: (no create tables)
- 20260913210000_automatic_area_sync_schedule.sql: (no create tables)
- 20260913220000_area_sync_twice_weekly.sql: (no create tables)
- 20260920090000_venue_source_evidence_http_status.sql: (no create tables)
- 20260920120000_replace_venue_claim_rpc.sql: (no create tables)
- 20260920210000_least_privilege_client_roles.sql: (no create tables)
- 20260921120000_venue_age_admission.sql: (no create tables)

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

## Live audit

Run with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` plus `--live` to compare production.
