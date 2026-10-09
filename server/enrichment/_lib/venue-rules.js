/**
 * Venue rules: the read model behind `metadata.rules` (see src/types/venue-rules.ts).
 *
 * A rule is stored as one claim per rule, field key `rules.<id>`, whose JSON is the rule itself:
 *
 *   rules.pushchair-play-areas -> {"kind":"pushchair","scope":"area","area":"storytelling and play areas",
 *                                  "coversCoreVisit":true,"text":"Pushchairs and buggies are not allowed in ..."}
 *
 * Why claims: every rule then has a source page, a checked date, an approver, a lifetime and supersession for free, and
 * a parent report can dispute it the same way it disputes any other fact. No table and no migration is needed:
 * `venue_claims.field_key` is free text and the replace RPC accepts any key.
 *
 * WHO MAY PUBLISH ONE. A rule can refuse a date or a household, so it follows the age-policy rule: only a claim approved
 * by a person (`human:` namespace) is projected. An automatic approver can never create a rule that gates, and a claim
 * that fails any check below is dropped, never half-applied. Dropping is the safe direction: a venue with no rules is shown
 * with nothing claimed about it.
 *
 * The projection is read-only and is attached to the consumer metadata alone. It is deliberately NOT part of
 * `metadataRowFromPayload`, which also feeds database persistence, so no column or write path changes.
 */

const { isHumanApprover } = require('./approval-actors');

const PROJECTED_RULES = Symbol.for('familypilot.venueRules');
const PREFIX = 'rules.';
const KINDS = new Set(['closure', 'pushchair', 'step_free', 'booking', 'caution']);
const SCOPES = new Set(['venue', 'area']);
const FACILITIES = new Set(['toilets', 'babyChanging', 'parking']);
const ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 400;
const MIN_TEXT = 12;

const isRuleFieldKey = (fieldKey) => typeof fieldKey === 'string' && fieldKey.startsWith(PREFIX);
const ruleFieldKey = (id) => `${PREFIX}${id}`;

const validDate = (value) => {
  if (!DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

/** One claim as a rule, or null when it is not a well-formed, human-approved, source-backed rule. */
function ruleFromClaim(claim) {
  if (!claim || !isRuleFieldKey(claim.fieldKey)) return null;
  if (!isHumanApprover(claim.approvedBy)) return null;
  const id = claim.fieldKey.slice(PREFIX.length);
  if (!ID.test(id)) return null;
  const v = claim.valueJson;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  if (!KINDS.has(v.kind) || !SCOPES.has(v.scope)) return null;
  const text = typeof v.text === 'string' ? v.text.replace(/\s+/g, ' ').trim() : '';
  if (text.length < MIN_TEXT || text.length > MAX_TEXT) return null;
  // A rule with no source page is an assertion, not evidence.
  if (typeof claim.sourceUrl !== 'string' || !/^https:\/\//.test(claim.sourceUrl)) return null;

  const rule = { id, kind: v.kind, scope: v.scope, text, sourceUrl: claim.sourceUrl, checkedAt: claim.checkedAt ?? null };

  if (v.scope === 'area') {
    const area = typeof v.area === 'string' ? v.area.trim() : '';
    if (!area || area.length > 80) return null;
    rule.area = area;
  }
  if (v.coversCoreVisit === true) rule.coversCoreVisit = true;
  if (v.exceptionOf != null) {
    if (typeof v.exceptionOf !== 'string' || !ID.test(v.exceptionOf) || v.exceptionOf === id) return null;
    rule.exceptionOf = v.exceptionOf;
  }
  for (const key of ['from', 'until']) {
    if (v[key] == null) continue;
    if (typeof v[key] !== 'string' || !validDate(v[key])) return null;
    rule[key] = v[key];
  }
  if (rule.from && rule.until && rule.from > rule.until) return null;
  if (v.weekdays != null) {
    if (!Array.isArray(v.weekdays) || v.weekdays.length === 0 || v.weekdays.length > 7) return null;
    if (!v.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return null;
    rule.weekdays = [...new Set(v.weekdays)].sort();
  }
  if (v.affectsFacilities != null) {
    if (!Array.isArray(v.affectsFacilities) || !v.affectsFacilities.every((f) => FACILITIES.has(f))) return null;
    if (v.affectsFacilities.length) rule.affectsFacilities = [...new Set(v.affectsFacilities)];
  }
  // A whole-venue closure must say when, or it would rule the venue out for ever (src/services/matching/venue-rules.ts
  // shows an undated one as a warning instead; the projection keeps it so that warning is not lost).
  return rule;
}

/** The active rule claims as a stable, id-ordered list. Empty when there are none. */
function projectRules(activeClaims) {
  const byId = new Map();
  for (const claim of activeClaims ?? []) {
    const rule = ruleFromClaim(claim);
    if (rule) byId.set(rule.id, rule);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

module.exports = { PROJECTED_RULES, isRuleFieldKey, ruleFieldKey, ruleFromClaim, projectRules };
