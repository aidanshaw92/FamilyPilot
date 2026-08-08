import { VenueEnrichmentDraftJson } from '@/src/types/ai-enrichment';
import { EnrichmentSavePayload } from '@/src/types/enrichment';

function triState(value?: 'yes' | 'no' | 'unknown') {
  if (value === 'yes' || value === 'no' || value === 'unknown') return value;
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
    pushchairSuitability: draft.pushchairSuitability.value,
    extendedTerrain: draft.terrain.value,
    visitDurationMinutes: draft.suggestedVisitDuration,
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
