import {
  EnrichmentProvenance,
  EnrichmentSavePayload,
  ExtendedTerrain,
  TriState,
} from '@/src/types/enrichment';
import { EnrichmentStatus, VenueFamilyMetadata } from '@/src/types/places';

/** Consumer-facing status — ai_draft behaves like provider_only until human approval. */
export function toConsumerEnrichmentStatus(status?: EnrichmentStatus): EnrichmentStatus {
  if (status === 'ai_draft') return 'provider_only';
  return status ?? 'provider_only';
}

export function isUnreviewedEnrichmentStatus(status?: EnrichmentStatus): boolean {
  return status === 'provider_only' || status === 'ai_draft';
}

/** Verified metadata must be re-checked within this window. */
export const VERIFIED_FRESHNESS_DAYS = 365;

/** Moderately stable fields — editorial guidance for re-check cadence. */
export const MODERATE_FRESHNESS_DAYS = 180;

/** Highly changeable fields — editorial guidance for re-check cadence. */
export const HIGH_CHANGE_FRESHNESS_DAYS = 90;

function isTriStateSet(value?: TriState): boolean {
  return value === 'yes' || value === 'no' || value === 'unknown';
}

function daysSince(dateStr: string): number {
  const checked = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - checked.getTime()) / (1000 * 60 * 60 * 24));
}

export function hasMeaningfulEnrichmentContent(
  payload: EnrichmentSavePayload | VenueFamilyMetadata | null,
): boolean {
  if (!payload) return false;
  return Boolean(
    payload.bestAges ||
      payload.ageNotes ||
      ('minRecommendedAge' in payload && payload.minRecommendedAge != null) ||
      ('maxRecommendedAge' in payload && payload.maxRecommendedAge != null) ||
      (payload.familyFacilities && Object.keys(payload.familyFacilities).length > 0) ||
      payload.pushchairSuitability ||
      payload.extendedTerrain ||
      payload.terrain ||
      payload.familyNotes ||
      (payload.goodToKnow && payload.goodToKnow.length > 0) ||
      (payload.whyFamiliesLike && payload.whyFamiliesLike.length > 0) ||
      (payload.accessibility && Object.keys(payload.accessibility).length > 0) ||
      (payload.sendInfo && Object.keys(payload.sendInfo).length > 0),
  );
}

export function hasAgeSuitability(payload: EnrichmentSavePayload | VenueFamilyMetadata): boolean {
  if ('minRecommendedAge' in payload && payload.minRecommendedAge != null) return true;
  if ('maxRecommendedAge' in payload && payload.maxRecommendedAge != null) return true;
  if (payload.bestAges?.trim()) return true;
  if (payload.ageNotes?.trim()) return true;
  return false;
}

export interface VerificationResult {
  ok: boolean;
  missing: string[];
}

export function validateVerifiedRequirements(payload: EnrichmentSavePayload): VerificationResult {
  const missing: string[] = [];
  const facilities = payload.familyFacilities ?? {};

  if (!isTriStateSet(payload.categoryConfirmed)) missing.push('categoryConfirmed');
  if (!hasAgeSuitability(payload)) missing.push('ageSuitability');
  if (!isTriStateSet(facilities.toilets)) missing.push('toilets');
  if (!isTriStateSet(facilities.babyChanging)) missing.push('babyChanging');
  if (!isTriStateSet(facilities.parking)) missing.push('parking');
  if (!payload.pushchairSuitability) missing.push('pushchairSuitability');
  if (!payload.extendedTerrain && !payload.terrain) missing.push('terrain');

  const prov = payload.enrichmentProvenance;
  if (!prov?.sourceType || !prov.checkedDate) missing.push('provenance');
  if (!payload.lastChecked) missing.push('lastChecked');

  if (payload.lastChecked && daysSince(payload.lastChecked) > VERIFIED_FRESHNESS_DAYS) {
    missing.push('lastCheckedFreshness');
  }

  return { ok: missing.length === 0, missing };
}

export function resolveEnrichmentStatus(
  payload: EnrichmentSavePayload,
  existing: VenueFamilyMetadata | null,
): EnrichmentStatus {
  if (payload.requestedStatus === 'verified') {
    const validation = validateVerifiedRequirements(payload);
    if (!validation.ok) {
      throw new Error(`Cannot mark verified — missing: ${validation.missing.join(', ')}`);
    }
    return 'verified';
  }

  if (hasMeaningfulEnrichmentContent(payload) || hasMeaningfulEnrichmentContent(existing)) {
    return 'enriched';
  }

  return 'provider_only';
}

export function deriveEnrichmentStatusFromRecord(
  metadata: VenueFamilyMetadata | null,
): EnrichmentStatus {
  if (!metadata) return 'provider_only';

  if (metadata.enrichmentStatus === 'verified') {
    if (metadata.lastChecked && daysSince(metadata.lastChecked) <= VERIFIED_FRESHNESS_DAYS) {
      return 'verified';
    }
    return 'enriched';
  }

  if (metadata.enrichmentStatus === 'enriched') return 'enriched';
  if (metadata.enrichmentStatus === 'ai_draft') return 'ai_draft';
  if (metadata.enrichmentStatus === 'provider_only') return 'provider_only';

  if (!hasMeaningfulEnrichmentContent(metadata)) return 'provider_only';

  const asPayload: EnrichmentSavePayload = {
    minRecommendedAge: metadata.minRecommendedAge,
    maxRecommendedAge: metadata.maxRecommendedAge,
    ageNotes: metadata.ageNotes,
    bestAges: metadata.bestAges,
    familyFacilities: metadata.familyFacilities,
    pushchairSuitability: metadata.pushchairSuitability,
    extendedTerrain: metadata.extendedTerrain,
    terrain: metadata.terrain,
    categoryConfirmed: metadata.categoryConfirmed,
    enrichmentProvenance: metadata.enrichmentProvenance,
    lastChecked: metadata.lastChecked,
    goodToKnow: metadata.goodToKnow,
    whyFamiliesLike: metadata.whyFamiliesLike,
    familyNotes: metadata.familyNotes,
    accessibility: metadata.accessibility,
    sendInfo: metadata.sendInfo,
  };

  const validation = validateVerifiedRequirements(asPayload);
  if (validation.ok) return 'verified';

  return 'enriched';
}

export function buildBestAgesLabel(payload: EnrichmentSavePayload): string | undefined {
  if (payload.bestAges?.trim()) return payload.bestAges.trim();
  const min = payload.minRecommendedAge;
  const max = payload.maxRecommendedAge;
  if (min != null && max != null) return `${min} – ${max} years`;
  if (min != null) return `${min}+ years`;
  if (max != null) return `Up to ${max} years`;
  return undefined;
}

export function facilitiesFromTriState(map: EnrichmentSavePayload['familyFacilities']): string[] {
  if (!map) return [];
  const result: string[] = [];
  const add = (key: keyof NonNullable<typeof map>, facility: string) => {
    if (map[key] === 'yes') result.push(facility);
  };
  add('toilets', 'toilets');
  add('babyChanging', 'baby_changing');
  add('cafe', 'cafe');
  add('playground', 'playground');
  add('parking', 'parking');
  add('picnicArea', 'picnic');
  add('shade', 'shade');
  return [...new Set(result)];
}

export function mapExtendedTerrainToLegacy(
  extended?: ExtendedTerrain,
): 'flat' | 'hilly' | 'mixed' | undefined {
  switch (extended) {
    case 'flat':
    case 'mostly_flat':
      return 'flat';
    case 'hilly':
    case 'very_hilly':
      return 'hilly';
    case 'mixed':
      return 'mixed';
    default:
      return undefined;
  }
}

export function provenanceFromEnrichment(prov?: EnrichmentProvenance) {
  if (!prov) return {};
  return {
    bestAges: {
      source: 'familypilot' as const,
      updatedAt: prov.checkedDate,
      reliability: 'familypilot' as const,
      label: prov.sourceType,
    },
  };
}
