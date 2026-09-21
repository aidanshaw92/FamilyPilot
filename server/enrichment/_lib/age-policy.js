/**
 * Venue age policy: the only age fact allowed to remove a venue from a parent's results.
 *
 * P0-B1 settled that `minRecommendedAge` / `maxRecommendedAge` are advice -- they rank and
 * explain and may never exclude. This module owns the other kind: a door policy, "under 4s are
 * not admitted", which a family is turned away at. Because it removes options from parents, every
 * rule below is written to fail towards SHOWING the venue.
 *
 * Canonical truth is a set of `agePolicy.<sourceKey>` claims. Each claim is one SOURCE's stated
 * policy, and its JSON carries normalised rules:
 *
 *   {"rules": [{"scope": "venue", "effect": "excludes",
 *               "minMonthsInclusive": 48, "maxMonthsExclusive": null,
 *               "statedAs": "Under 4s are not admitted"}],
 *    "sourceUrl": "...", "retrievedAt": "2026-09-21"}
 *
 * Four properties this shape buys, each answering a defect in the previous revision:
 *
 * - **A rule carries its own min AND max.** There is no free-floating minimum for someone else's
 *   maximum to pair with, so a range no single source stated cannot be composed.
 * - **Identity is the source, not the value.** `agePolicy.<sourceKey>` is derived from the source
 *   URL alone, so re-reading a page supersedes that source's claim while other sources keep
 *   theirs. The unique active-claim index then stops being a one-policy-per-venue limit.
 * - **Scope is explicit.** Only `venue` may exclude. An activity rule ("soft play is 5+") or an
 *   accompaniment rule ("under 2s must be with an adult") is a caveat about part of a visit, and
 *   removing the whole venue for it would be wrong. Scope that cannot be determined is
 *   `ambiguous`, which is also only ever a caveat.
 * - **Months, not years.** "Under 6 months not admitted" is a real policy and the group it matters
 *   most for is precisely the one whole years cannot express.
 */

/** Scopes that describe part of a visit rather than the door. None of these may exclude. */
const CAVEAT_SCOPES = new Set(['activity', 'accompaniment', 'ambiguous']);
const ALL_SCOPES = new Set(['venue', ...CAVEAT_SCOPES]);

/**
 * Source types admissible behind a hard gate.
 *
 * `ai_assisted` is deliberately absent. `buildClaimRecord` falls back to it whenever a claim is
 * approved with no field evidence, so admitting it here would let an editor-typed number with no
 * source remove a venue -- which is the single most damaging thing this feature can do wrong.
 */
const GATING_SOURCE_TYPES = new Set(['official', 'official_website', 'operator', 'human_verified']);

/** Confidence levels admissible behind a hard gate. `unknown` is the no-evidence fallback. */
const GATING_CONFIDENCE = new Set(['high']);

const AGE_POLICY_PREFIX = 'agePolicy.';

/**
 * The hard-gating read model travels under a Symbol, not a string key.
 *
 * `saveMetadata` falls back to the RAW editor payload whenever a venue has no active claims, so a
 * string key would let a typed value reach `venue_age_restriction` with no claim behind it -- the
 * defect this design exists to remove. An editor payload arrives as parsed JSON and cannot carry a
 * Symbol, while object spread (which the payload takes several times on its way through) preserves
 * one. So "only the claim projection writes this column" is enforced by the language rather than by
 * every row builder remembering a rule -- and there are two row builders, which is how the string
 * key slipped through once already.
 */
const PROJECTED_AGE_RESTRICTION = Symbol.for('familypilot.venueAgeRestriction');

/** Whether a field key names an age-policy claim. */
function isAgePolicyFieldKey(fieldKey) {
  return typeof fieldKey === 'string' && fieldKey.startsWith(AGE_POLICY_PREFIX);
}

/**
 * Stable claim identity for one source.
 *
 * Derived from the source URL ONLY -- never the value, never the evidence text -- so that
 * re-reading the same page supersedes the same claim even when the policy it states has changed.
 * An identity that moved with the value would leave the old policy active alongside the new one.
 */
function agePolicyFieldKey(sourceUrl) {
  const normalised = String(sourceUrl || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  if (!normalised) return null;

  // A short, stable, non-cryptographic digest. Readability matters more than collision resistance
  // here: a collision would merge two sources' claims, which the conflict rule then fails open on.
  let hash = 5381;
  for (let i = 0; i < normalised.length; i += 1) {
    hash = ((hash * 33) ^ normalised.charCodeAt(i)) >>> 0;
  }
  return `${AGE_POLICY_PREFIX}${hash.toString(36)}`;
}

function isMonthBound(value) {
  return value === null || value === undefined || (Number.isInteger(value) && value >= 0);
}

/**
 * Validate and normalise the rules inside one claim's JSON.
 *
 * Anything malformed is DROPPED rather than coerced. A rule we cannot read is not a rule we may
 * enforce, and guessing at a half-understood door policy is how a venue disappears for a reason
 * nobody can explain.
 */
function normaliseAgeRules(valueJson) {
  const rules = Array.isArray(valueJson?.rules) ? valueJson.rules : [];
  const out = [];

  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') continue;

    const scope = ALL_SCOPES.has(rule.scope) ? rule.scope : 'ambiguous';
    const min = rule.minMonthsInclusive ?? null;
    const max = rule.maxMonthsExclusive ?? null;
    if (!isMonthBound(min) || !isMonthBound(max)) continue;
    if (min === null && max === null) continue;              // states no bound at all
    if (min !== null && max !== null && min >= max) continue; // admits nobody: a transcription error

    out.push({
      scope,
      // Only a venue-scoped rule can exclude; everything else is explanation.
      effect: scope === 'venue' ? 'excludes' : 'caveat',
      minMonthsInclusive: min,
      maxMonthsExclusive: max,
      activity: typeof rule.activity === 'string' ? rule.activity : null,
      accompaniment: rule.accompaniment && typeof rule.accompaniment === 'object' ? rule.accompaniment : null,
      statedAs: typeof rule.statedAs === 'string' ? rule.statedAs : null,
    });
  }

  return out;
}

/**
 * Whether a claim's provenance is strong enough to remove a venue.
 *
 * Every condition here is a separate way the previous revision could have gated on nothing: an
 * editor-typed value with no evidence row, no source URL, the `ai_assisted` fallback source type,
 * the `unknown` confidence fallback, or an automatic approval.
 */
function claimMayGate(claim, today = new Date().toISOString().slice(0, 10)) {
  if (!claim) return false;
  if (claim.status !== 'active') return false;
  if (!claim.sourceEvidenceId) return false;
  if (!claim.sourceUrl) return false;
  if (!GATING_SOURCE_TYPES.has(claim.sourceType)) return false;
  if (!GATING_CONFIDENCE.has(claim.confidence)) return false;
  if (!claim.approvedBy || claim.approvedBy === 'ai_auto_approved') return false;

  // Strictly within its own lifetime. Grace exists so a fact survives a transient fetch failure
  // for display; it must never keep a venue hidden from every family on a policy nobody re-read.
  if (!claim.validUntil || String(claim.validUntil).slice(0, 10) < today) return false;

  return true;
}

function sameInterval(a, b) {
  return a.minMonthsInclusive === b.minMonthsInclusive && a.maxMonthsExclusive === b.maxMonthsExclusive;
}

/**
 * The venue restriction to project, or null.
 *
 * Returns null -- meaning unknown, meaning nothing is excluded -- whenever the sources do not
 * speak with one voice. Two trusted sources stating different doors is a genuine contradiction,
 * and picking one would invent a policy neither stated; the same failing-open ruling the
 * deterministic request parser makes for a contradicted field.
 */
function venueRestrictionFromClaims(claims, today = new Date().toISOString().slice(0, 10)) {
  const gating = [];

  for (const claim of claims || []) {
    if (!isAgePolicyFieldKey(claim?.fieldKey)) continue;
    if (!claimMayGate(claim, today)) continue;
    for (const rule of normaliseAgeRules(claim.valueJson)) {
      if (rule.scope !== 'venue') continue;
      gating.push({ rule, claim });
    }
  }

  if (gating.length === 0) return null;

  const [first, ...rest] = gating;
  if (rest.some((other) => !sameInterval(other.rule, first.rule))) return null; // sources disagree

  return {
    minMonthsInclusive: first.rule.minMonthsInclusive,
    maxMonthsExclusive: first.rule.maxMonthsExclusive,
    sourceUrl: first.claim.sourceUrl,
    checkedAt: String(first.claim.checkedAt || '').slice(0, 10) || null,
  };
}

/**
 * Rules that explain rather than exclude: activity, accompaniment, ambiguous scope, and any
 * venue rule whose provenance or lifetime fell short. A parent is better served by "soft play is
 * 5+" on the venue than by the venue vanishing.
 */
function ageCaveatsFromClaims(claims, today = new Date().toISOString().slice(0, 10)) {
  const caveats = [];

  for (const claim of claims || []) {
    if (!isAgePolicyFieldKey(claim?.fieldKey)) continue;
    const gates = claimMayGate(claim, today);
    for (const rule of normaliseAgeRules(claim.valueJson)) {
      if (rule.scope === 'venue' && gates) continue; // that one excludes; it is not a caveat
      caveats.push({
        scope: rule.scope,
        activity: rule.activity,
        accompaniment: rule.accompaniment,
        statedAs: rule.statedAs,
        minMonthsInclusive: rule.minMonthsInclusive,
        maxMonthsExclusive: rule.maxMonthsExclusive,
        sourceUrl: claim.sourceUrl ?? null,
      });
    }
  }

  return caveats;
}

module.exports = {
  AGE_POLICY_PREFIX,
  PROJECTED_AGE_RESTRICTION,
  CAVEAT_SCOPES,
  GATING_SOURCE_TYPES,
  GATING_CONFIDENCE,
  isAgePolicyFieldKey,
  agePolicyFieldKey,
  normaliseAgeRules,
  claimMayGate,
  venueRestrictionFromClaims,
  ageCaveatsFromClaims,
};
