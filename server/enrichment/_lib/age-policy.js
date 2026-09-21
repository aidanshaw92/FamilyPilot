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
 * Properties of this shape, each answering a defect a review found in an earlier revision:
 *
 * - **A rule carries its own min AND max.** There is no free-floating minimum for someone else's
 *   maximum to pair with, so a range no single source stated cannot be composed.
 * - **Identity is the source, not the value.** `agePolicy.<sourceKey>` is derived from the source
 *   URL alone, so re-reading a page supersedes that source's claim while other sources keep
 *   theirs. The unique active-claim index then stops being a one-policy-per-venue limit.
 * - **Scope AND effect must both say "door".** Only `scope: venue` with `effect: excludes` may
 *   exclude. An activity rule ("soft play is 5+") or an accompaniment rule ("under 2s must be
 *   with an adult") describes part of a visit, and removing the whole venue for it would be
 *   wrong. A rule whose scope or effect cannot be read is a caveat, never a door.
 * - **Months, not years.** "Under 6 months not admitted" is a real policy and the group it matters
 *   most for is precisely the one whole years cannot express.
 * - **One source may state several doors.** "Under 4s not admitted" and "over 12s not admitted"
 *   are two restrictions, not a contradiction, so the read model is a LIST and a child must
 *   satisfy every entry. Disagreement is a separate question, asked between sources.
 */

const { createHash } = require('crypto');
const { OFFICIAL_SOURCE_TYPES } = require('./source-types');
const { isHumanApprover } = require('./approval-actors');

/** Scopes that describe part of a visit rather than the door. None of these may exclude. */
const CAVEAT_SCOPES = new Set(['activity', 'accompaniment', 'ambiguous']);
const ALL_SCOPES = new Set(['venue', ...CAVEAT_SCOPES]);

/**
 * Source types admissible behind a hard gate: the venue's own pages, exactly the set the
 * automatic publisher already trusts. Shared rather than restated -- see source-types.js, which
 * also records why `council_page` gates nothing.
 */
const GATING_SOURCE_TYPES = OFFICIAL_SOURCE_TYPES;

/** Confidence levels admissible behind a hard gate. `unknown` is the no-evidence fallback. */
const GATING_CONFIDENCE = new Set(['high']);

const AGE_POLICY_PREFIX = 'agePolicy.';

/** Bits of SHA-256 kept in a field key. 128 bits: a collision is not a thing that happens. */
const SOURCE_KEY_HEX_CHARS = 32;

/**
 * The projected age policy travels under a Symbol, not a string key.
 *
 * `saveMetadata` falls back to the RAW editor payload whenever a venue has no active claims, so a
 * string key would let a typed value reach the column with no claim behind it -- the defect this
 * design exists to remove. An editor payload arrives as parsed JSON and cannot carry a Symbol,
 * while object spread (which the payload takes several times on its way through) preserves one.
 * So "only the claim projection writes this column" is enforced by the language rather than by
 * every row builder remembering a rule -- and there are two row builders, which is how the string
 * key slipped through once already.
 */
const PROJECTED_AGE_POLICY = Symbol.for('familypilot.venueAgePolicy');

/** Whether a field key names an age-policy claim. */
function isAgePolicyFieldKey(fieldKey) {
  return typeof fieldKey === 'string' && fieldKey.startsWith(AGE_POLICY_PREFIX);
}

/**
 * One source URL, in the form two references to the same page agree on.
 *
 * Only the parts of a URL that are defined to be case-insensitive are lowercased: the scheme and
 * the host. A path and a query are case-SENSITIVE per RFC 3986, and `/Policy` may be a different
 * document from `/policy`; an earlier revision lowercased the whole string, which silently merged
 * two sources into one claim identity. The default port and the fragment are dropped because
 * neither names a different resource.
 *
 * `http` and `https` on the same host and path fold to one identity. They are the same document
 * in practice, and a site moving to https mid-life would otherwise FORK its claim: the superseded
 * policy would stay active as a phantom second source and disagree with the page that replaced
 * it. That fails open rather than dangerously, but a feature that quietly stops working is its
 * own kind of wrong.
 */
function canonicalSourceUrl(sourceUrl) {
  const raw = String(sourceUrl ?? '').trim();
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;

  const port =
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
      ? ''
      : url.port;

  // A trailing slash on a directory path is the same resource; a case difference is not.
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '';

  return `https://${url.hostname.toLowerCase()}${port ? `:${port}` : ''}${path}${url.search}`;
}

/**
 * Stable claim identity for one source.
 *
 * Derived from the source URL ONLY -- never the value, never the evidence text -- so that
 * re-reading the same page supersedes the same claim even when the policy it states has changed.
 * An identity that moved with the value would leave the old policy active alongside the new one.
 *
 * The digest must be collision-RESISTANT, not merely short. Active-claim uniqueness is per
 * `field_key`, and `replaceActiveClaim` supersedes the row holding that key -- so two sources
 * colliding would not produce a conflict to fail open on, it would silently delete one source's
 * policy and leave the other standing alone as an unopposed gate. The previous 32-bit
 * non-cryptographic digest made that a real possibility.
 */
function agePolicyFieldKey(sourceUrl) {
  const canonical = canonicalSourceUrl(sourceUrl);
  if (!canonical) return null;
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `${AGE_POLICY_PREFIX}${digest.slice(0, SOURCE_KEY_HEX_CHARS)}`;
}

function isMonthBound(value) {
  return value === null || value === undefined || (Number.isInteger(value) && value >= 0);
}

/**
 * Validate and normalise the rules inside one claim's JSON.
 *
 * Anything malformed is DROPPED rather than coerced, and anything ambiguous is demoted to a
 * caveat rather than promoted to a door. A rule we cannot read is not a rule we may enforce, and
 * guessing at a half-understood door policy is how a venue disappears for a reason nobody can
 * explain.
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

    // Both halves must say "door", and each is read from the claim rather than inferred from the
    // other. Deriving effect from scope -- as an earlier revision did -- turned a venue-scoped
    // rule that said `effect: caveat`, or said nothing at all, into a hard exclusion.
    const excludes = scope === 'venue' && rule.effect === 'excludes';

    out.push({
      scope,
      effect: excludes ? 'excludes' : 'caveat',
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
 * Every condition is a separate way an earlier revision could have gated on nothing: an
 * editor-typed value with no evidence row, no source URL, a source type no evidence row can even
 * hold, the `unknown` confidence fallback, an automatic approval, or a claim whose key no longer
 * matches the source it names.
 */
function claimMayGate(claim, today = new Date().toISOString().slice(0, 10)) {
  if (!claim) return false;
  if (claim.status !== 'active') return false;
  if (!claim.sourceEvidenceId) return false;
  if (!claim.sourceUrl) return false;
  if (!GATING_SOURCE_TYPES.has(claim.sourceType)) return false;
  if (!GATING_CONFIDENCE.has(claim.confidence)) return false;
  if (!isHumanApprover(claim.approvedBy)) return false;

  // Identity must still be the source it claims. Without this, a claim written under one key and
  // later re-pointed at a different URL would keep the first key's slot while gating on the
  // second's provenance, and two sources could share one slot.
  if (claim.fieldKey !== agePolicyFieldKey(claim.sourceUrl)) return false;

  // Strictly within its own lifetime. Grace exists so a fact survives a transient fetch failure
  // for display; it must never keep a venue hidden from every family on a policy nobody re-read.
  if (!claim.validUntil || String(claim.validUntil).slice(0, 10) < today) return false;

  return true;
}

/** A claim's set of door intervals, in a form two sources can be compared by. */
function intervalSignature(rules) {
  return rules
    .map((rule) => `${rule.minMonthsInclusive ?? '*'}:${rule.maxMonthsExclusive ?? '*'}`)
    .sort()
    .join(',');
}

/** Whether a set of doors leaves no admitted band at all. Their intersection is what applies. */
function admitsNobody(restrictions) {
  const lower = restrictions.map((r) => r.minMonthsInclusive).filter((v) => v !== null);
  const upper = restrictions.map((r) => r.maxMonthsExclusive).filter((v) => v !== null);
  if (lower.length === 0 || upper.length === 0) return false;
  return Math.max(...lower) >= Math.min(...upper);
}

function restrictionFrom(rule, claim) {
  return {
    minMonthsInclusive: rule.minMonthsInclusive,
    maxMonthsExclusive: rule.maxMonthsExclusive,
    sourceUrl: claim.sourceUrl,
    checkedAt: String(claim.checkedAt || '').slice(0, 10) || null,
    statedAs: rule.statedAs,
  };
}

function caveatFrom(rule, claim) {
  return {
    scope: rule.scope,
    activity: rule.activity,
    accompaniment: rule.accompaniment,
    statedAs: rule.statedAs,
    minMonthsInclusive: rule.minMonthsInclusive,
    maxMonthsExclusive: rule.maxMonthsExclusive,
    sourceUrl: claim.sourceUrl ?? null,
  };
}

/**
 * The whole projected age policy for a venue, or null when there is nothing to say.
 *
 *   { restrictions: [...], caveats: [...], sourcesDisagree: boolean }
 *
 * `restrictions` are doors: a child must satisfy EVERY entry. Several entries are the normal case
 * for one source stating both ends of its policy, and collapsing them into a single interval --
 * as an earlier revision did -- made "under 4s and over 12s are not admitted" unrepresentable.
 *
 * `sourcesDisagree` is asked BETWEEN sources, not within one. Two sources whose door intervals
 * are not the same set is a genuine contradiction: picking a side would invent a policy neither
 * stated, so nothing gates and the rules are surfaced as caveats instead. The same failing-open
 * ruling the deterministic request parser makes for a contradicted field.
 *
 * Everything that is not a door lands in `caveats` -- activity, accompaniment and ambiguous rules,
 * venue rules whose provenance or lifetime fell short, and venue rules knocked out by a
 * disagreement. A parent is better served by "soft play is 5+" on the venue than by the venue
 * vanishing with no explanation.
 */
function projectAgePolicy(claims, today = new Date().toISOString().slice(0, 10)) {
  const gatingBySource = [];
  const caveats = [];

  // Sorted so a venue's projection does not depend on the order rows came back in.
  const agePolicyClaims = (claims || [])
    .filter((claim) => isAgePolicyFieldKey(claim?.fieldKey))
    .slice()
    .sort((a, b) => String(a.fieldKey).localeCompare(String(b.fieldKey)));

  for (const claim of agePolicyClaims) {
    const mayGate = claimMayGate(claim, today);
    const doors = [];

    for (const rule of normaliseAgeRules(claim.valueJson)) {
      if (rule.effect === 'excludes' && mayGate) doors.push(rule);
      else caveats.push(caveatFrom(rule, claim));
    }

    if (doors.length > 0) gatingBySource.push({ claim, doors });
  }

  const signatures = new Set(gatingBySource.map((source) => intervalSignature(source.doors)));
  const sourcesDisagree = signatures.size > 1;

  let restrictions = [];
  if (sourcesDisagree) {
    // Nothing gates. The doors still explain something, so they survive as caveats.
    for (const { claim, doors } of gatingBySource) {
      for (const rule of doors) caveats.push(caveatFrom(rule, claim));
    }
  } else if (gatingBySource.length > 0) {
    // Every gating source states the identical set of doors, so any one of them is the policy.
    const [{ claim, doors }] = gatingBySource;
    const seen = new Set();
    for (const rule of doors) {
      const key = intervalSignature([rule]);
      if (seen.has(key)) continue;
      seen.add(key);
      restrictions.push(restrictionFrom(rule, claim));
    }

    // Doors that between them admit NOBODY. Each rule passed validation alone, so this is not a
    // malformed rule but a malformed policy -- "over 12s only" alongside "under 4s only" is a
    // transcription error, not a venue that turns every family away. `normaliseAgeRules` drops
    // the single-rule form of this for the same reason; enforcing the combination would hide the
    // venue from everyone on nobody's stated policy. The rules still explain, so they survive as
    // caveats.
    if (admitsNobody(restrictions)) {
      for (const rule of doors) caveats.push(caveatFrom(rule, claim));
      restrictions = [];
    }
  }

  if (restrictions.length === 0 && caveats.length === 0 && !sourcesDisagree) return null;
  return { restrictions, caveats, sourcesDisagree };
}

module.exports = {
  AGE_POLICY_PREFIX,
  PROJECTED_AGE_POLICY,
  CAVEAT_SCOPES,
  ALL_SCOPES,
  GATING_SOURCE_TYPES,
  GATING_CONFIDENCE,
  isAgePolicyFieldKey,
  canonicalSourceUrl,
  agePolicyFieldKey,
  normaliseAgeRules,
  claimMayGate,
  projectAgePolicy,
};
