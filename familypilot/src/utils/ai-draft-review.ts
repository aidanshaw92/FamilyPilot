import { DraftTriStateField, VenueEnrichmentDraftJson } from '@/src/types/ai-enrichment';
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

/** Ensure legacy/partial AI draft JSON has all review fields before UI render. */
export function normalizeDraftForReview(raw: unknown): VenueEnrichmentDraftJson {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { normaliseDraftJson } = require('../../../api/enrichment/_lib/ai-draft-schema.js') as {
    normaliseDraftJson: (input: unknown) => VenueEnrichmentDraftJson;
  };
  return normaliseDraftJson(raw ?? {});
}

/** Pre-fill editor form from AI draft JSON for human review. */
export function draftJsonToReviewForm(raw: VenueEnrichmentDraftJson | unknown): EnrichmentSavePayload {
  const draft = normalizeDraftForReview(raw);
  const age = draft.recommendedAge;
  const facilities = draft.familyFacilities;
  return {
    minRecommendedAge: age.min,
    maxRecommendedAge: age.max,
    ageNotes: age.notes ?? undefined,
    familyFacilities: {
      toilets: triState(facilities.toilets?.value),
      babyChanging: triState(facilities.babyChanging?.value),
      parking: triState(facilities.parking?.value),
      cafe: triState(facilities.cafe?.value),
    },
    pushchairSuitability: (draft.pushchairSuitability?.value ?? 'unknown') as PushchairSuitability,
    extendedTerrain: draft.terrain?.value ?? 'unknown',
    environment: environmentOrUnknown(draft.environment?.value),
    energyLevel: energyOrUnknown(draft.energyLevel?.value),
    visitDurationMinutes: draft.suggestedVisitDuration,
    accessibility: Object.fromEntries(
      Object.entries(draft.accessibility ?? {})
        .filter((entry): entry is [string, DraftTriStateField] => Boolean(entry[1]))
        .map(([key, field]) => [key, triState(field.value)]),
    ),
    sendInfo: Object.fromEntries(
      Object.entries(draft.sendInfo ?? {})
        .filter((entry): entry is [string, DraftTriStateField] => Boolean(entry[1]))
        .map(([key, field]) => [key, triState(field.value)]),
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
