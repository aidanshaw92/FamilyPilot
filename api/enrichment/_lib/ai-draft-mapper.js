/**
 * Server-side mirror of familypilot/server/enrichment/ai-draft-mapper.ts
 */

function triStateFromDraft(value) {
  if (value === 'yes' || value === 'no' || value === 'unknown') return value;
  return 'unknown';
}

function collectFieldEvidence(draft) {
  const fields = {};
  const add = (key, field) => {
    if (!field) return;
    fields[key] = {
      value: field.value,
      confidence: field.confidence,
      sourceUrl: field.sourceUrl ?? null,
      evidence: field.evidence ?? null,
      sourceType: field.sourceType ?? null,
      retrievedAt: field.retrievedAt ?? null,
    };
  };
  for (const [key, field] of Object.entries(draft.familyFacilities ?? {})) {
    add(`familyFacilities.${key}`, field);
  }
  add('pushchairSuitability', draft.pushchairSuitability);
  add('terrain', draft.terrain);
  for (const [key, field] of Object.entries(draft.accessibility ?? {})) {
    add(`accessibility.${key}`, field);
  }
  for (const [key, field] of Object.entries(draft.sendInfo ?? {})) {
    add(`sendInfo.${key}`, field);
  }
  return fields;
}

function draftJsonToSavePayload(draft, options) {
  const age = draft.recommendedAge ?? {};
  const evidenceBundle = options.sourceContext?.evidenceBundle ?? null;
  return {
    minRecommendedAge: age.min ?? null,
    maxRecommendedAge: age.max ?? null,
    ageNotes: age.notes ?? undefined,
    familyFacilities: {
      toilets: triStateFromDraft(draft.familyFacilities?.toilets?.value),
      babyChanging: triStateFromDraft(draft.familyFacilities?.babyChanging?.value),
      parking: triStateFromDraft(draft.familyFacilities?.parking?.value),
      cafe: triStateFromDraft(draft.familyFacilities?.cafe?.value),
    },
    pushchairSuitability: draft.pushchairSuitability?.value ?? 'unknown',
    extendedTerrain: draft.terrain?.value ?? 'unknown',
    visitDurationMinutes: draft.suggestedVisitDuration ?? null,
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
        evidenceStatus: options.evidenceStatus ?? options.sourceContext?.evidenceStatus ?? null,
        sourcePagesChecked: options.sourceContext?.sourcePagesChecked ?? null,
        sourceStatus: options.sourceContext?.sourceStatus ?? null,
        fieldEvidence: collectFieldEvidence(draft),
        evidenceBundleSummary: evidenceBundle
          ? {
              sourceStatus: evidenceBundle.sourceStatus,
              pagesChecked: evidenceBundle.pagesChecked,
              factCount: evidenceBundle.facts?.length ?? 0,
            }
          : null,
        sourceContext: options.sourceContext ?? {},
        overallDraftConfidence: draft.overallDraftConfidence,
      }),
    },
    requestedStatus: 'enriched',
  };
}

module.exports = { draftJsonToSavePayload, collectFieldEvidence };
