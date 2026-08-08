import type { VenueEnrichmentDraftRecord } from '@/src/types/ai-enrichment';

/** True when a pending draft predates evidence-backed enrichment. */
export function isLegacyDraft(draft: VenueEnrichmentDraftRecord | null | undefined): boolean {
  if (!draft || draft.status !== 'pending_review') return false;
  return draft.evidenceStatus == null || draft.evidenceStatus === 'legacy_no_sources';
}
