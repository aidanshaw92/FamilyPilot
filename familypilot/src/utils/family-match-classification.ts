import { EnrichmentStatus } from '@/src/types';
import { isUnreviewedEnrichmentStatus } from '@/src/utils/enrichment-rules';

export type MatchClassification =
  | 'Potential match'
  | 'Excellent match'
  | 'Great match'
  | 'Good match'
  | 'Worth considering'
  | 'Limited match';

export function getMatchClassification(
  score: number,
  enrichmentStatus?: EnrichmentStatus,
): MatchClassification {
  if (isUnreviewedEnrichmentStatus(enrichmentStatus)) {
    return 'Potential match';
  }
  if (score >= 90) return 'Excellent match';
  if (score >= 80) return 'Great match';
  if (score >= 70) return 'Good match';
  if (score >= 60) return 'Worth considering';
  return 'Limited match';
}

export function getQualitativeRating(value: number): 'Excellent' | 'Good' | 'Fair' | 'Limited' {
  if (value >= 85) return 'Excellent';
  if (value >= 70) return 'Good';
  if (value >= 55) return 'Fair';
  return 'Limited';
}

export function formatTerrainLabel(terrain: string): string {
  switch (terrain) {
    case 'flat':
      return 'Mostly flat';
    case 'hilly':
      return 'Hilly in places';
    default:
      return 'Mixed terrain';
  }
}

export function getProviderOnlyTrustCopy(): string {
  return 'Family suitability not yet reviewed';
}

export function getEnrichedTrustCopy(): string {
  return 'FamilyPilot family details available';
}

export function getVerifiedTrustCopy(): string {
  return 'Family details checked recently';
}

export function getEnrichmentTrustCopy(status?: EnrichmentStatus): string {
  if (status === 'verified') return getVerifiedTrustCopy();
  if (status === 'enriched') return getEnrichedTrustCopy();
  return getProviderOnlyTrustCopy();
}

/** Internal editorial label — not shown in consumer app. */
export function getAiDraftInternalLabel(): string {
  return 'AI suggestion — review required';
}

export function getProviderOnlyDetailTrustCopy(): string {
  return 'Live place data · family details still being verified';
}

export function getEnrichedDetailTrustCopy(): string {
  return 'FamilyPilot family details added · some fields may still be unconfirmed';
}

export function getVerifiedDetailTrustCopy(): string {
  return 'Core family details checked against a reliable source';
}

export function getEnrichmentDetailTrustCopy(status?: EnrichmentStatus): string {
  if (status === 'verified') return getVerifiedDetailTrustCopy();
  if (status === 'enriched') return getEnrichedDetailTrustCopy();
  return getProviderOnlyDetailTrustCopy();
}
