import {
  DraftConfidence,
  DraftTriStateField,
  VenueEnrichmentDraftJson,
} from '@/src/types/ai-enrichment';

/** Display-only defaults for legacy/partial AI drafts in the review UI. Server schema remains authoritative. */

const TRI_STATE = new Set(['yes', 'no', 'unknown']);
const PUSHCHAIR = new Set(['excellent', 'good', 'mixed', 'difficult', 'unknown']);
const TERRAIN = new Set(['flat', 'mostly_flat', 'mixed', 'hilly', 'very_hilly', 'unknown']);
const ENVIRONMENT = new Set(['indoor', 'outdoor', 'mixed', 'unknown']);
const ENERGY_LEVEL = new Set(['low', 'moderate', 'high', 'mixed', 'unknown']);
const RAINY = new Set(['yes', 'no', 'unknown']);
const CONFIDENCE = new Set(['high', 'medium', 'low', 'unknown']);

/** Keys of a DraftTriStateField — must not become review row labels. */
const FIELD_META_KEYS = new Set([
  'value',
  'confidence',
  'reason',
  'sourceUrl',
  'evidence',
  'sourceType',
  'retrievedAt',
]);

function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function normalizeConfidence(value: unknown): DraftConfidence {
  return typeof value === 'string' && CONFIDENCE.has(value) ? (value as DraftConfidence) : 'unknown';
}

function normalizeEvidenceMeta(raw: unknown) {
  const r = asObject(raw);
  return {
    sourceUrl: typeof r.sourceUrl === 'string' ? r.sourceUrl : null,
    evidence: typeof r.evidence === 'string' ? r.evidence : null,
    sourceType: typeof r.sourceType === 'string' ? r.sourceType : null,
    retrievedAt: typeof r.retrievedAt === 'string' ? r.retrievedAt : null,
  };
}

function emptyReviewField(defaultValue = 'unknown'): DraftTriStateField {
  return {
    value: defaultValue as DraftTriStateField['value'],
    confidence: 'unknown',
    reason: null,
    sourceUrl: null,
    evidence: null,
    sourceType: null,
    retrievedAt: null,
  };
}

function normalizeTriStateField(raw: unknown): DraftTriStateField {
  if (!raw || typeof raw !== 'object') return emptyReviewField('unknown');
  const r = raw as Partial<DraftTriStateField>;
  const value = TRI_STATE.has(r.value ?? '') ? (r.value as DraftTriStateField['value']) : 'unknown';
  return {
    value,
    confidence: normalizeConfidence(r.confidence),
    reason: typeof r.reason === 'string' ? r.reason : null,
    ...normalizeEvidenceMeta(raw),
  };
}

function normalizeEnumField(raw: unknown, allowed: Set<string>, fallback = 'unknown'): DraftTriStateField {
  if (!raw || typeof raw !== 'object') return emptyReviewField(fallback);
  const r = raw as Partial<DraftTriStateField>;
  const value = allowed.has(r.value ?? '') ? (r.value as DraftTriStateField['value']) : fallback;
  return {
    value,
    confidence: normalizeConfidence(r.confidence),
    reason: typeof r.reason === 'string' ? r.reason : null,
    ...normalizeEvidenceMeta(raw),
  };
}

function normalizePushchairField(raw: unknown): VenueEnrichmentDraftJson['pushchairSuitability'] {
  if (!raw || typeof raw !== 'object') {
    return emptyReviewField('unknown') as VenueEnrichmentDraftJson['pushchairSuitability'];
  }
  const r = raw as Partial<VenueEnrichmentDraftJson['pushchairSuitability']>;
  const value = PUSHCHAIR.has(r.value ?? '')
    ? r.value!
    : 'unknown';
  return {
    value,
    confidence: normalizeConfidence(r.confidence),
    reason: typeof r.reason === 'string' ? r.reason : null,
    ...normalizeEvidenceMeta(raw),
  };
}

function normalizeTerrainField(raw: unknown): VenueEnrichmentDraftJson['terrain'] {
  if (!raw || typeof raw !== 'object') {
    return emptyReviewField('unknown') as VenueEnrichmentDraftJson['terrain'];
  }
  const r = raw as Partial<VenueEnrichmentDraftJson['terrain']>;
  const value = TERRAIN.has(r.value ?? '') ? r.value! : 'unknown';
  return {
    value,
    confidence: normalizeConfidence(r.confidence),
    reason: typeof r.reason === 'string' ? r.reason : null,
    ...normalizeEvidenceMeta(raw),
  };
}

function normalizeRecordFields(raw: unknown): Record<string, DraftTriStateField> {
  const input = asObject(raw);
  const keys = Object.keys(input);

  // Legacy drafts sometimes store a single field object at the record root.
  if (keys.length > 0 && keys.every((key) => FIELD_META_KEYS.has(key))) {
    return { unspecified: normalizeTriStateField(input) };
  }

  const out: Record<string, DraftTriStateField> = {};
  for (const [key, val] of Object.entries(input)) {
    if (FIELD_META_KEYS.has(key)) continue;
    out[key] = normalizeTriStateField(val);
  }
  return out;
}

/** Client-safe shell for review UI — fills absent legacy fields with unknown/null, preserves existing evidence. */
export function normalizeDraftForReview(raw: unknown): VenueEnrichmentDraftJson {
  const input = asObject(raw);
  const age = asObject(input.recommendedAge);
  const facilities = asObject(input.familyFacilities);

  return {
    recommendedAge: {
      min: typeof age.min === 'number' ? age.min : null,
      max: typeof age.max === 'number' ? age.max : null,
      notes: typeof age.notes === 'string' ? age.notes : null,
      confidence: normalizeConfidence(age.confidence),
    },
    familyFacilities: {
      toilets: normalizeTriStateField(facilities.toilets),
      babyChanging: normalizeTriStateField(facilities.babyChanging),
      parking: normalizeTriStateField(facilities.parking),
      cafe: normalizeTriStateField(facilities.cafe),
    },
    pushchairSuitability: normalizePushchairField(input.pushchairSuitability),
    terrain: normalizeTerrainField(input.terrain),
    environment: normalizeEnumField(input.environment, ENVIRONMENT) as VenueEnrichmentDraftJson['environment'],
    energyLevel: normalizeEnumField(input.energyLevel, ENERGY_LEVEL) as VenueEnrichmentDraftJson['energyLevel'],
    accessibility: normalizeRecordFields(input.accessibility),
    sendInfo: normalizeRecordFields(input.sendInfo),
    whyFamiliesLike: Array.isArray(input.whyFamiliesLike)
      ? input.whyFamiliesLike.filter((s): s is string => typeof s === 'string').slice(0, 8)
      : [],
    goodToKnow: Array.isArray(input.goodToKnow)
      ? input.goodToKnow.filter((s): s is string => typeof s === 'string').slice(0, 8)
      : [],
    suggestedVisitDuration:
      typeof input.suggestedVisitDuration === 'number' ? input.suggestedVisitDuration : null,
    rainyDaySuitability: RAINY.has(String(input.rainyDaySuitability))
      ? (input.rainyDaySuitability as VenueEnrichmentDraftJson['rainyDaySuitability'])
      : 'unknown',
    overallDraftConfidence: normalizeConfidence(input.overallDraftConfidence),
  };
}
