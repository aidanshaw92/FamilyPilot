import { getMatchClassification } from '@/src/utils/family-match-classification';

/** Shared label for Family Match presentation across all variants. */
export const FAMILY_MATCH_LABEL = 'Family Match';

export function formatFamilyMatchLabel(score: number): string {
  return `${score}% ${FAMILY_MATCH_LABEL}`;
}

export function formatFamilyMatchSecondary(
  score: number,
  enrichmentStatus?: import('@/src/types').EnrichmentStatus,
): string {
  if (enrichmentStatus === 'provider_only') {
    return 'Based on location and category only';
  }
  return formatFamilyMatchLabel(score);
}

export { getMatchClassification };
