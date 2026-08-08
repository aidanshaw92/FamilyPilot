import type { EnrichmentStats } from '@/src/types/enrichment';

export type EnrichmentQueueStatusFilter =
  | 'all'
  | 'provider_only'
  | 'ai_draft'
  | 'enriched'
  | 'verified';

export function getEnrichmentQueueEmptyMessage(
  statusFilter: EnrichmentQueueStatusFilter,
  stats: EnrichmentStats | null,
): string {
  if (stats && stats.discovered > 0) {
    switch (statusFilter) {
      case 'provider_only':
        return 'No provider-only venues in this beta area.';
      case 'ai_draft':
        return 'No AI drafts awaiting review.';
      case 'enriched':
        return 'No enriched venues in the queue.';
      case 'verified':
        return 'No verified venues in the queue.';
      case 'all':
      default:
        return 'No venues match the current filters.';
    }
  }

  return 'No venues in queue. Sync Google places for your beta area first.';
}
