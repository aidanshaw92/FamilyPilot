/**
 * Validate and normalise structured AI draft output.
 * Rejects malformed model responses — never inserts unvalidated data.
 */

const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low', 'unknown']);
const TRI_STATE = new Set(['yes', 'no', 'unknown']);
const PUSHCHAIR = new Set(['excellent', 'good', 'mixed', 'difficult', 'unknown']);
const TERRAIN = new Set(['flat', 'mostly_flat', 'mixed', 'hilly', 'very_hilly', 'unknown']);
const RAINY = new Set(['yes', 'no', 'unknown']);

function normaliseConfidence(value) {
  if (CONFIDENCE_VALUES.has(value)) return value;
  return 'unknown';
}

function normaliseEvidenceField(raw) {
  if (raw == null) return { sourceUrl: null, evidence: null, sourceType: null, retrievedAt: null };
  return {
    sourceUrl: typeof raw.sourceUrl === 'string' ? raw.sourceUrl : null,
    evidence: typeof raw.evidence === 'string' ? raw.evidence.slice(0, 500) : null,
    sourceType: typeof raw.sourceType === 'string' ? raw.sourceType : null,
    retrievedAt: typeof raw.retrievedAt === 'string' ? raw.retrievedAt : null,
  };
}

function normaliseTriStateField(raw, fallback = {}) {
  const value = TRI_STATE.has(raw?.value) ? raw.value : 'unknown';
  const evidenceMeta = normaliseEvidenceField(raw);
  return {
    value,
    confidence: normaliseConfidence(raw?.confidence ?? fallback.confidence),
    reason: typeof raw?.reason === 'string' ? raw.reason : null,
    ...evidenceMeta,
  };
}

function emptyTriStateField() {
  return {
    value: 'unknown',
    confidence: 'unknown',
    reason: null,
    sourceUrl: null,
    evidence: null,
    sourceType: null,
    retrievedAt: null,
  };
}

function normaliseDraftJson(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI draft must be a JSON object');
  }

  const age = raw.recommendedAge ?? {};
  const facilities = raw.familyFacilities ?? {};
  const pushchair = raw.pushchairSuitability ?? {};
  const terrain = raw.terrain ?? {};

  const draft = {
    recommendedAge: {
      min: typeof age.min === 'number' ? age.min : null,
      max: typeof age.max === 'number' ? age.max : null,
      notes: typeof age.notes === 'string' ? age.notes : null,
      confidence: normaliseConfidence(age.confidence),
    },
    familyFacilities: {
      toilets: normaliseTriStateField(facilities.toilets),
      babyChanging: normaliseTriStateField(facilities.babyChanging),
      parking: normaliseTriStateField(facilities.parking),
      cafe: normaliseTriStateField(facilities.cafe),
    },
    pushchairSuitability: (() => {
      const base = {
        value: PUSHCHAIR.has(pushchair.value) ? pushchair.value : 'unknown',
        confidence: normaliseConfidence(pushchair.confidence),
        reason: typeof pushchair.reason === 'string' ? pushchair.reason : null,
      };
      return { ...base, ...normaliseEvidenceField(pushchair) };
    })(),
    terrain: (() => {
      const base = {
        value: TERRAIN.has(terrain.value) ? terrain.value : 'unknown',
        confidence: normaliseConfidence(terrain.confidence),
        reason: typeof terrain.reason === 'string' ? terrain.reason : null,
      };
      return { ...base, ...normaliseEvidenceField(terrain) };
    })(),
    accessibility: {},
    sendInfo: {},
    whyFamiliesLike: Array.isArray(raw.whyFamiliesLike)
      ? raw.whyFamiliesLike.filter((s) => typeof s === 'string').slice(0, 8)
      : [],
    goodToKnow: Array.isArray(raw.goodToKnow)
      ? raw.goodToKnow.filter((s) => typeof s === 'string').slice(0, 8)
      : [],
    suggestedVisitDuration:
      typeof raw.suggestedVisitDuration === 'number' ? raw.suggestedVisitDuration : null,
    rainyDaySuitability: RAINY.has(raw.rainyDaySuitability) ? raw.rainyDaySuitability : 'unknown',
    overallDraftConfidence: normaliseConfidence(raw.overallDraftConfidence),
  };

  for (const [key, val] of Object.entries(raw.accessibility ?? {})) {
    if (typeof key === 'string') draft.accessibility[key] = normaliseTriStateField(val);
  }
  for (const [key, val] of Object.entries(raw.sendInfo ?? {})) {
    if (typeof key === 'string') draft.sendInfo[key] = normaliseTriStateField(val);
  }

  return draft;
}

function extractConfidenceJson(draft) {
  const out = { overall: draft.overallDraftConfidence };
  out.recommendedAge = draft.recommendedAge.confidence;
  for (const [key, field] of Object.entries(draft.familyFacilities)) {
    out[`familyFacilities.${key}`] = field.confidence;
  }
  out.pushchairSuitability = draft.pushchairSuitability.confidence;
  out.terrain = draft.terrain.confidence;
  return out;
}

function parseModelJson(text) {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON object found in AI response');
  return JSON.parse(jsonMatch[0]);
}

module.exports = {
  normaliseDraftJson,
  extractConfidenceJson,
  parseModelJson,
  emptyTriStateField,
};
