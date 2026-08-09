import { VenueEnrichmentDraftJson } from '@/src/types/ai-enrichment';
import {
  EnrichmentSavePayload,
  PushchairSuitability,
  VenueEnergyLevel,
  VenueEnvironment,
} from '@/src/types/enrichment';

function triState(value?: 'yes' | 'no' | 'unknown') {
  if (value === 'yes' || value === 'no' || value === 'unknown') return value;
  return 'unknown';
}

function environmentOrUnknown(value?: string): VenueEnvironment {
  if (value === 'indoor' || value === 'outdoor' || value === 'mixed' || value === 'unknown') {
    return value;
  }
  return 'unknown';
}

function energyOrUnknown(value?: string): VenueEnergyLevel {
  if (value === 'low' || value === 'moderate' || value === 'high' || value === 'mixed' || value === 'unknown') {
    return value;
  }
  return 'unknown';
}

/** Pre-fill editor form from AI draft JSON for human review. */
export function draftJsonToReviewForm(draft: VenueEnrichmentDraftJson): EnrichmentSavePayload {
  const age = draft.recommendedAge;
  return {
    minRecommendedAge: age.min,
    maxRecommendedAge: age.max,
    ageNotes: age.notes ?? undefined,
    familyFacilities: {
      toilets: triState(draft.familyFacilities.toilets.value),
      babyChanging: triState(draft.familyFacilities.babyChanging.value),
      parking: triState(draft.familyFacilities.parking.value),
      cafe: triState(draft.familyFacilities.cafe.value),
    },
    pushchairSuitability: draft.pushchairSuitability.value as PushchairSuitability,
    extendedTerrain: draft.terrain.value,
    environment: environmentOrUnknown(draft.environment?.value),
    energyLevel: energyOrUnknown(draft.energyLevel?.value),
    visitDurationMinutes: draft.suggestedVisitDuration,
    accessibility: Object.fromEntries(
      Object.entries(draft.accessibility ?? {}).map(([key, field]) => [
        key,
        triState(field.value),
      ]),
    ),
    sendInfo: Object.fromEntries(
      Object.entries(draft.sendInfo ?? {}).map(([key, field]) => [
        key,
        triState(field.value),
      ]),
    ),
    whyFamiliesLike: draft.whyFamiliesLike ?? [],
    goodToKnow: draft.goodToKnow ?? [],
    lastChecked: new Date().toISOString().slice(0, 10),
    enrichmentProvenance: {
      sourceType: 'ai_assisted',
      checkedDate: new Date().toISOString().slice(0, 10),
      evidenceNotes: 'AI draft — review before publishing.',
    },
  };
}

export function formatDraftConfidence(confidence?: string): string {
  if (!confidence || confidence === 'unknown') return 'Unknown';
  return confidence.charAt(0).toUpperCase() + confidence.slice(1);
}
