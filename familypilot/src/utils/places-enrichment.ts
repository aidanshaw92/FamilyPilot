import { EnrichmentStatus, VenueFamilyMetadata } from '@/src/types/places';

export function deriveEnrichmentStatus(metadata: VenueFamilyMetadata | null): EnrichmentStatus {
  if (!metadata) return 'provider_only';

  const hasFamilyContent = Boolean(
    metadata.bestAges ||
      metadata.facilities?.length ||
      metadata.terrain ||
      metadata.familyNotes ||
      metadata.goodToKnow?.length,
  );

  if (!hasFamilyContent) return 'provider_only';

  const coreFields = ['bestAges', 'facilities', 'terrain'] as const;
  const allCoreVerified = coreFields.every(
    (field) => metadata.provenance[field]?.reliability === 'familypilot',
  );
  if (allCoreVerified) return 'verified';

  return 'enriched';
}
