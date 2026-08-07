import { deriveEnrichmentStatusFromRecord } from '@/src/utils/enrichment-rules';
import { EnrichmentStatus, VenueFamilyMetadata } from '@/src/types/places';

/** @deprecated use deriveEnrichmentStatusFromRecord */
export function deriveEnrichmentStatus(metadata: VenueFamilyMetadata | null): EnrichmentStatus {
  return deriveEnrichmentStatusFromRecord(metadata);
}
