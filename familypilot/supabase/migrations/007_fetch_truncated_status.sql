-- Allow truncated fetch status for bounded official-page reads

ALTER TABLE venue_source_evidence
  DROP CONSTRAINT IF EXISTS venue_source_evidence_fetch_status_check;

ALTER TABLE venue_source_evidence
  ADD CONSTRAINT venue_source_evidence_fetch_status_check
  CHECK (fetch_status IN (
    'ok', 'cached', 'fetched_truncated', 'timeout', 'blocked', 'error',
    'too_large', 'too_large_unusable', 'non_html'
  ));
