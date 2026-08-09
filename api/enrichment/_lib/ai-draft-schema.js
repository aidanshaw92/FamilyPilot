/**
 * Validate and normalise structured AI draft output.
 * Rejects malformed model responses — never inserts unvalidated data.
 */

const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low', 'unknown']);
const TRI_STATE = new Set(['yes', 'no', 'unknown']);
const PUSHCHAIR = new Set(['excellent', 'good', 'mixed', 'difficult', 'unknown']);
const TERRAIN = new Set(['flat', 'mostly_flat', 'mixed', 'hilly', 'very_hilly', 'unknown']);
const ENVIRONMENT = new Set(['indoor', 'outdoor', 'mixed', 'unknown']);
const ENERGY_LEVEL = new Set(['low', 'moderate', 'high', 'mixed', 'unknown']);
const RAINY = new Set(['yes', 'no', 'unknown']);
const FIELD_META_KEYS = new Set([
  'value',
  'confidence',
  'reason',
  'sourceUrl',
  'evidence',
  'sourceType',
  'retrievedAt',
]);

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

function emptyEnumField(defaultValue = 'unknown') {
  return {
    value: defaultValue,
    confidence: 'unknown',
    reason: null,
    sourceUrl: null,
    evidence: null,
    sourceType: null,
    retrievedAt: null,
  };
}

function normaliseEnumField(raw, allowed, fallback = 'unknown') {
  const value = allowed.has(raw?.value) ? raw.value : fallback;
  const evidenceMeta = normaliseEvidenceField(raw);
  return {
    value,
    confidence: normaliseConfidence(raw?.confidence),
    reason: typeof raw?.reason === 'string' ? raw.reason : null,
    ...evidenceMeta,
  };
}

function emptyTriStateField() {
  return emptyEnumField('unknown');
}

function normaliseRecordFields(raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const keys = Object.keys(input);

  if (keys.length > 0 && keys.every((key) => FIELD_META_KEYS.has(key))) {
    return { unspecified: normaliseTriStateField(input) };
  }

  const out = {};
  for (const [key, val] of Object.entries(input)) {
    if (typeof key !== 'string' || FIELD_META_KEYS.has(key)) continue;
    out[key] = normaliseTriStateField(val);
  }
  return out;
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
    environment: normaliseEnumField(raw.environment, ENVIRONMENT),
    energyLevel: normaliseEnumField(raw.energyLevel, ENERGY_LEVEL),
    accessibility: normaliseRecordFields(raw.accessibility),
    sendInfo: normaliseRecordFields(raw.sendInfo),
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
  out.environment = draft.environment.confidence;
  out.energyLevel = draft.energyLevel.confidence;
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
