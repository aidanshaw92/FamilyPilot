/**
 * Strict schema for AI-parsed day requests — no venue IDs or scores.
 */

const { parseExplicitTextConstraints } = require('./explicit-constraint-parser');

const STRENGTH = new Set(['required', 'preferred', 'context']);

/**
 * Constraint authority, highest first.
 *
 *   1. the family profile and this server   (ageRecommendedFit, journey, budget)
 *   2. deterministic parsing of the parent's own words
 *   3. the model, as soft suggestions only
 *
 * A language model may paraphrase, spot a synonym and rank. It may not decide that a venue
 * disappears. Production demonstrated both halves of why: before the prompt fix it dropped
 * "it must have parking", and after it invented a required pushchair nobody mentioned and a
 * 30-minute journey limit against a profile that said 45. `day-request-matcher` evaluates
 * journey at `required` whatever strength the request declares, so that invented 30 really did
 * remove every venue 31-45 minutes away.
 */

/** The only fields a model may contribute at all, and never above `preferred`. */
const MODEL_SUGGESTABLE_FIELDS = new Set([
  'environment',
  'energyLevel',
  'pushchair',
  'babyChanging',
  'toilets',
  'parking',
  'visitDuration',
]);

/**
 * A model field survives only where the parent's own words positively support it.
 *
 * Capping an unsupported field to `preferred` stops it excluding a venue, but it still moves fit
 * classification, preferredUnknowns, ranking and the explanation shown to the parent. Production
 * invented a `pushchair` requirement for a request that never mentioned one; nothing the parent
 * did not express should change what they are shown, softly or otherwise.
 *
 * Support is positive support, not mention: "I don't need parking" supports nothing, so a model
 * proposing parking cannot smuggle it back in.
 */
const MODEL_MAX_STRENGTH = 'preferred';

/**
 * A venue's recommended ages rank a result; they never gate one.
 *
 * Emitted frozen and by spread rather than assembled per call site, so the three producers below
 * cannot drift apart. `required` is deliberately unreachable: `applyConstraint` on the client
 * rejects a required constraint whose outcome is `unsuitable` OR `unknown`, which would turn
 * "this place suggests other ages" and "nobody published an age suggestion" alike into a
 * rejection. Mirrors AGE_RECOMMENDATION_STRENGTH in src/services/matching/age-suitability.ts.
 */
const AGE_RECOMMENDED_FIT = Object.freeze({ strength: 'preferred', value: 'in_range' });

/**
 * Budget is profile-owned. The schema can only express `within_profile`, so there is nothing for
 * a model to say about it that the profile does not already say better.
 */
const BUDGET_WITHIN_PROFILE = Object.freeze({ strength: 'preferred', value: 'within_profile' });
const ENV_NEED = new Set(['indoor', 'outdoor', 'either']);
const ENERGY_NEED = new Set(['high', 'moderate', 'low', 'either']);

function normaliseStrength(value, fallback = 'preferred') {
  return STRENGTH.has(value) ? value : fallback;
}

function normaliseConstraint(raw, allowedValues, defaultValue) {
  if (!raw || typeof raw !== 'object') return null;
  const value = allowedValues.has(raw.value) ? raw.value : defaultValue;
  return {
    strength: normaliseStrength(raw.strength),
    value,
  };
}

function normaliseDurationConstraint(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    strength: normaliseStrength(raw.strength),
    value: {
      maxMinutes: typeof raw.value?.maxMinutes === 'number' ? raw.value.maxMinutes : undefined,
      minMinutes: typeof raw.value?.minMinutes === 'number' ? raw.value.minMinutes : undefined,
    },
  };
}

function normaliseJourneyConstraint(raw, profileMaxDrive) {
  if (!raw || typeof raw !== 'object') return null;
  const minutes =
    typeof raw.value?.maxMinutes === 'number' ? raw.value.maxMinutes : profileMaxDrive;
  return {
    strength: normaliseStrength(raw.strength, 'required'),
    value: { maxMinutes: minutes },
  };
}

function mergeWithProfile(parsed, profile) {
  const children = profile.members.filter((m) => m.role === 'child');
  const childAges = children.map((m) => m.age);
  // Whole years round every baby under one down to 0; ageMonths keeps a 2-month-old and an
  // 11-month-old apart, which is exactly where suitability differs most.
  const childAgeMonthsList = children.map((m) =>
    m.age === 0 && m.ageMonths != null ? m.ageMonths : m.age * 12,
  );
  // reconcileConstraints already assigned the server-owned fields last and unconditionally, so
  // there is nothing to fill in here. Re-deriving them would reintroduce the "only if absent"
  // rule that let a model-supplied journey survive.
  const constraints = { ...(parsed.constraints ?? {}) };

  return {
    rawText: parsed.rawText ?? '',
    parsedAt: new Date().toISOString(),
    childAges,
    childAgeMonthsList,
    homeLocation: profile.homeLocation,
    budgetTier: profile.budgetTier,
    maxDriveMinutes: profile.maxDriveMinutes,
    hasPushchair: Boolean(profile.pushchair?.trim()),
    constraints,
    context: {
      freeformNotes: typeof parsed.context?.freeformNotes === 'string' ? parsed.context.freeformNotes : undefined,
      timeWindow: typeof parsed.context?.timeWindow === 'string' ? parsed.context.timeWindow : undefined,
    },
  };
}

/**
 * What the model suggested, reduced to something that cannot gate.
 *
 * Every surviving field is capped to `preferred`, and the three server-owned fields are dropped
 * outright rather than normalised — the model has no say in age, journey or budget, so reading
 * them at all would only invite someone to start trusting them again.
 */
function modelSuggestions(raw, supported) {
  const suggestions = {};
  const c = raw?.constraints ?? {};

  const environment = normaliseConstraint(c.environment, ENV_NEED, 'either');
  if (environment) suggestions.environment = environment;
  const energyLevel = normaliseConstraint(c.energyLevel, ENERGY_NEED, 'either');
  if (energyLevel) suggestions.energyLevel = energyLevel;
  if (c.pushchair) suggestions.pushchair = { strength: 'preferred', value: 'not_difficult' };
  if (c.babyChanging) suggestions.babyChanging = { strength: 'preferred', value: 'yes' };
  if (c.toilets) suggestions.toilets = { strength: 'preferred', value: 'yes' };
  if (c.parking) suggestions.parking = { strength: 'preferred', value: 'yes' };
  const visitDuration = normaliseDurationConstraint(c.visitDuration);
  if (visitDuration) suggestions.visitDuration = visitDuration;

  // Nothing leaves here outside the allowed set, nothing leaves here ungrounded in the parent's
  // own words, and nothing leaves here able to fail a venue closed.
  for (const [field, constraint] of Object.entries(suggestions)) {
    if (!MODEL_SUGGESTABLE_FIELDS.has(field) || !supported.has(field)) {
      delete suggestions[field];
      continue;
    }
    if (constraint.strength === 'required') constraint.strength = MODEL_MAX_STRENGTH;
  }

  return suggestions;
}

/**
 * Apply the authority order to produce the constraints the rest of the system acts on.
 *
 * Deterministic text does not merge with a model suggestion for the same field — it replaces it
 * whole. A model cannot weaken "must have parking" to preferred, cannot strengthen "would like
 * parking" to required, and cannot contradict the value the parent's own words carry.
 */
function reconcileConstraints(explicit, suggestions, profile) {
  const constraints = {};

  // 3. Model suggestions: lowest authority, already incapable of gating.
  for (const [field, constraint] of Object.entries(suggestions)) {
    constraints[field] = constraint;
  }

  // 2. The parent's own words, read deterministically. Replaces whatever the model said.
  for (const [field, constraint] of Object.entries(explicit)) {
    constraints[field] = { ...constraint };
  }

  // 1. Server and profile. Assigned last, so nothing below can have touched them.
  constraints.ageRecommendedFit = { ...AGE_RECOMMENDED_FIT };
  constraints.budget = { ...BUDGET_WITHIN_PROFILE };
  constraints.journey = {
    strength: 'required',
    value: { maxMinutes: profile.maxDriveMinutes },
  };

  return constraints;
}

/**
 * Offline / no-API-key path.
 *
 * Runs the same deterministic extractor as the real path, with no model suggestions, so the two
 * cannot drift into different rules about what "must have parking" means.
 */
function parseMockDayRequest(rawText, profile) {
  const { constraints: explicit } = parseExplicitTextConstraints(rawText);

  return mergeWithProfile(
    {
      rawText,
      constraints: reconcileConstraints(explicit, {}, profile),
      context: { freeformNotes: rawText.slice(0, 200) },
    },
    profile,
  );
}

function normaliseDayRequest(raw, profile) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Day request must be a JSON object');
  }
  if ('venueId' in raw || 'venues' in raw || 'score' in raw || 'ranking' in raw) {
    throw new Error('Parsed day request must not include venue IDs or scores');
  }

  const rawText = typeof raw.rawText === 'string' ? raw.rawText : '';
  const { constraints: explicit, supported } = parseExplicitTextConstraints(rawText);

  return mergeWithProfile(
    {
      rawText,
      constraints: reconcileConstraints(explicit, modelSuggestions(raw, supported), profile),
      context: raw.context ?? {},
    },
    profile,
  );
}

module.exports = {
  AGE_RECOMMENDED_FIT,
  BUDGET_WITHIN_PROFILE,
  MODEL_SUGGESTABLE_FIELDS,
  mergeWithProfile,
  modelSuggestions,
  normaliseDayRequest,
  parseMockDayRequest,
  reconcileConstraints,
};
