/**
 * Server-side enrichment validation — mirror of familypilot/src/utils/enrichment-rules.ts
 */

const VERIFIED_FRESHNESS_DAYS = 365;

function isTriStateSet(value) {
  return value === 'yes' || value === 'no' || value === 'unknown';
}

function daysSince(dateStr) {
  const checked = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - checked.getTime()) / (1000 * 60 * 60 * 24));
}

function hasAgeSuitability(payload) {
  if (payload.minRecommendedAge != null) return true;
  if (payload.maxRecommendedAge != null) return true;
  if (payload.bestAges?.trim()) return true;
  if (payload.ageNotes?.trim()) return true;
  return false;
}

function hasMeaningfulContent(payload) {
  if (!payload) return false;
  return Boolean(
    payload.bestAges ||
      payload.ageNotes ||
      payload.minRecommendedAge != null ||
      payload.maxRecommendedAge != null ||
      (payload.familyFacilities && Object.keys(payload.familyFacilities).length > 0) ||
      payload.pushchairSuitability ||
      payload.extendedTerrain ||
      payload.terrain ||
      payload.familyNotes ||
      (payload.goodToKnow && payload.goodToKnow.length > 0) ||
      (payload.whyFamiliesLike && payload.whyFamiliesLike.length > 0),
  );
}

function validateVerifiedRequirements(payload) {
  const missing = [];
  const facilities = payload.familyFacilities || {};

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

function resolveEnrichmentStatus(payload, existing) {
  if (payload.requestedStatus === 'verified') {
    const validation = validateVerifiedRequirements(payload);
    if (!validation.ok) {
      const err = new Error(`Cannot mark verified — missing: ${validation.missing.join(', ')}`);
      err.code = 'VALIDATION_ERROR';
      err.missing = validation.missing;
      throw err;
    }
    return 'verified';
  }

  if (hasMeaningfulContent(payload) || hasMeaningfulContent(existing)) {
    return 'enriched';
  }

  return 'provider_only';
}

function buildBestAges(payload) {
  if (payload.bestAges?.trim()) return payload.bestAges.trim();
  const { minRecommendedAge: min, maxRecommendedAge: max } = payload;
  if (min != null && max != null) return `${min} – ${max} years`;
  if (min != null) return `${min}+ years`;
  if (max != null) return `Up to ${max} years`;
  return null;
}

function facilitiesFromTriState(map) {
  if (!map) return [];
  const result = [];
  if (map.toilets === 'yes') result.push('toilets');
  if (map.babyChanging === 'yes') result.push('baby_changing');
  if (map.cafe === 'yes') result.push('cafe');
  if (map.playground === 'yes') result.push('playground');
  if (map.parking === 'yes') result.push('parking');
  if (map.picnicArea === 'yes') result.push('picnic');
  if (map.shade === 'yes') result.push('shade');
  return [...new Set(result)];
}

function mapExtendedTerrain(extended) {
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
      return null;
  }
}

function sanitizePayload(body) {
  if (!body || typeof body !== 'object') {
    const err = new Error('Invalid payload');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  return body;
}

module.exports = {
  validateVerifiedRequirements,
  resolveEnrichmentStatus,
  buildBestAges,
  facilitiesFromTriState,
  mapExtendedTerrain,
  sanitizePayload,
  hasMeaningfulContent,
};
