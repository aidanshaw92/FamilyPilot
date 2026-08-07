import { EnrichmentSavePayload } from '../../src/types/enrichment';
import { VenueEnrichmentDraftJson } from '../../src/types/ai-enrichment';

function triStateFromDraft(value?: 'yes' | 'no' | 'unknown') {
  if (value === 'yes' || value === 'no' || value === 'unknown') return value;
  return 'unknown';
}

/** Map reviewed AI draft JSON into trusted enrichment save payload. */
export function draftJsonToSavePayload(
  draft: VenueEnrichmentDraftJson,
  options: {
    reviewedBy?: string;
    model: string;
    approvedAt: string;
    sourceContext?: Record<string, unknown>;
  },
): EnrichmentSavePayload {
  const age = draft.recommendedAge;
  return {
    minRecommendedAge: age.min,
    maxRecommendedAge: age.max,
    ageNotes: age.notes ?? undefined,
    familyFacilities: {
      toilets: triStateFromDraft(draft.familyFacilities.toilets.value),
      babyChanging: triStateFromDraft(draft.familyFacilities.babyChanging.value),
      parking: triStateFromDraft(draft.familyFacilities.parking.value),
      cafe: triStateFromDraft(draft.familyFacilities.cafe.value),
    },
    pushchairSuitability: draft.pushchairSuitability.value,
    extendedTerrain: draft.terrain.value,
    visitDurationMinutes: draft.suggestedVisitDuration,
    whyFamiliesLike: draft.whyFamiliesLike ?? [],
    goodToKnow: draft.goodToKnow ?? [],
    accessibility: Object.fromEntries(
      Object.entries(draft.accessibility ?? {}).map(([key, field]) => [
        key,
        triStateFromDraft(field.value),
      ]),
    ),
    sendInfo: Object.fromEntries(
      Object.entries(draft.sendInfo ?? {}).map(([key, field]) => [
        key,
        triStateFromDraft(field.value),
      ]),
    ),
    lastChecked: options.approvedAt.slice(0, 10),
    checkedBy: options.reviewedBy,
    enrichmentProvenance: {
      sourceType: 'ai_assisted',
      checkedDate: options.approvedAt.slice(0, 10),
      checkedBy: options.reviewedBy,
      evidenceNotes: `AI-assisted draft (${options.model}) reviewed and approved by editor.`,
      sourceReference: JSON.stringify({
        origin: 'ai_assisted',
        model: options.model,
        humanReviewed: true,
        approvedBy: options.reviewedBy,
        approvedAt: options.approvedAt,
        sourceContext: options.sourceContext ?? {},
        overallDraftConfidence: draft.overallDraftConfidence,
      }),
    },
    requestedStatus: 'enriched',
  };
}

/** Pre-fill internal editor form from AI draft for human review. */
export function draftJsonToReviewForm(draft: VenueEnrichmentDraftJson): EnrichmentSavePayload {
  return draftJsonToSavePayload(draft, {
    model: 'review',
    approvedAt: new Date().toISOString(),
  });
}
