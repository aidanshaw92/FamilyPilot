/**
 * Official opening hours: the read model behind `metadata.officialHours` (see src/types/official-hours.ts).
 *
 * One claim per rule, field key `hours.<id>`, whose JSON is the rule. Same contract as venue rules (venue-rules.js):
 * stored as a claim so it carries its source page, quote, date, approver and lifetime; projected read-only to the consumer
 * metadata only; and published only from a person-approved claim, because a reading that contradicts the provider's hours can
 * change whether a day out is planned at all. A malformed claim is dropped, never half-applied.
 */

const { isHumanApprover } = require('./approval-actors');

const PROJECTED_OFFICIAL_HOURS = Symbol.for('familypilot.officialHours');
const PREFIX = 'hours.';
const ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

const isHoursFieldKey = (fieldKey) => typeof fieldKey === 'string' && fieldKey.startsWith(PREFIX);

const validDate = (value) => {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

function hoursRuleFromClaim(claim) {
  if (!claim || !isHoursFieldKey(claim.fieldKey)) return null;
  if (!isHumanApprover(claim.approvedBy)) return null;
  const id = claim.fieldKey.slice(PREFIX.length);
  if (!ID.test(id)) return null;
  const v = claim.valueJson;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  if (v.scope !== 'venue' && v.scope !== 'area') return null;
  if (!Array.isArray(v.days) || v.days.length === 0 || !v.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return null;
  if (typeof v.open !== 'string' || !CLOCK.test(v.open)) return null;
  // A close is a clock time or an explicit absence with the page's own words ("dusk"): never a guess.
  if (v.close !== null && !(typeof v.close === 'string' && CLOCK.test(v.close))) return null;
  if (v.close === null && !(typeof v.closeText === 'string' && v.closeText.trim())) return null;
  if (typeof claim.sourceUrl !== 'string' || !/^https:\/\//.test(claim.sourceUrl)) return null;
  const rule = {
    id, scope: v.scope, days: [...new Set(v.days)].sort(), open: v.open, close: v.close,
    sourceUrl: claim.sourceUrl, checkedAt: claim.checkedAt ?? null,
  };
  if (v.scope === 'area') {
    const area = typeof v.area === 'string' ? v.area.trim() : '';
    if (!area || area.length > 80) return null;
    rule.area = area;
  }
  for (const key of ['from', 'until']) {
    if (v[key] == null) continue;
    if (!validDate(v[key])) return null;
    rule[key] = v[key];
  }
  if (rule.from && rule.until && rule.from > rule.until) return null;
  if (v.close === null) rule.closeText = v.closeText.trim().slice(0, 40);
  if (v.lastEntry != null) {
    if (typeof v.lastEntry !== 'string' || !CLOCK.test(v.lastEntry)) return null;
    rule.lastEntry = v.lastEntry;
  }
  return rule;
}

function projectOfficialHours(activeClaims) {
  const byId = new Map();
  for (const claim of activeClaims ?? []) {
    const rule = hoursRuleFromClaim(claim);
    if (rule) byId.set(rule.id, rule);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

module.exports = { PROJECTED_OFFICIAL_HOURS, isHoursFieldKey, hoursRuleFromClaim, projectOfficialHours };
