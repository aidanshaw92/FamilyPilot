import type { VenueRule, VenueRuleNote, VenueRuleVerdict, VenueRuleVisit } from '@/src/types/venue-rules';

import { venueLocalDate } from '@/src/utils/opening-hours';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Day of week (0 = Sunday) of a calendar date, independent of the host timezone. */
function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Whether a rule is in force on a date. A rule with no dates applies always; `from` and `until` are inclusive; `weekdays`
 * narrows it further. A visit date that cannot be read leaves every rule applying, so a warning is never lost; blocking
 * needs a readable date (see `evaluateVenueRules`).
 */
export function ruleAppliesOn(rule: VenueRule, date: string): boolean {
  if (!DATE.test(date)) return true;
  if (rule.from && DATE.test(rule.from) && date < rule.from) return false;
  if (rule.until && DATE.test(rule.until) && date > rule.until) return false;
  if (rule.weekdays && rule.weekdays.length > 0 && !rule.weekdays.includes(weekdayOf(date))) return false;
  return true;
}

const hasBoundedDates = (rule: VenueRule): boolean => Boolean(rule.from || rule.until || rule.weekdays?.length);

/**
 * What a venue's recorded rules mean for one visit by one household.
 *
 * THE LINE BETWEEN BLOCK, WARN AND SAY NOTHING:
 *   - A venue-wide closure that covers the date refuses the date. Nothing else does this.
 *   - A pushchair prohibition refuses a household that LISTED buggy access as a must-have, and only when the reviewer marked
 *     the rule as covering the core visit. For a household that merely brings a pushchair it is a prominent warning with
 *     what to do about it; for a household with no pushchair it is not mentioned at all.
 *   - Step-free gaps warn a party that has a wheelchair or mobility-aid user, and are not mentioned to anyone else.
 *   - An area closure, a booking note or a caution is information and never prevents a visit.
 * Unknown is never produced here: a venue with no rules returns no notes, which callers must not read as "no restrictions".
 */
export function evaluateVenueRules(rules: readonly VenueRule[] | null | undefined, visit: VenueRuleVisit): VenueRuleVerdict {
  const verdict: VenueRuleVerdict = { closedAllDay: null, blocksHousehold: null, exceptions: [], notes: [] };
  if (!rules?.length) return verdict;

  const important: VenueRuleNote[] = [];
  const info: VenueRuleNote[] = [];
  const seen = new Set<string>();
  const push = (list: VenueRuleNote[], rule: VenueRule) => {
    if (seen.has(rule.id)) return;
    seen.add(rule.id);
    list.push({ ruleId: rule.id, severity: list === important ? 'important' : 'info', text: rule.text });
  };

  for (const rule of rules) {
    if (!ruleAppliesOn(rule, visit.date)) continue;

    switch (rule.kind) {
      case 'closure': {
        // Only a dated whole-venue closure that covers a readable date refuses it. An undated "closed" is a statement the
        // reviewer did not bound, so it is shown as a warning rather than silently ruling the venue out for ever.
        if (rule.scope === 'venue') {
          if (DATE.test(visit.date) && hasBoundedDates(rule)) verdict.closedAllDay ??= rule;
          else push(important, rule);
          break;
        }
        const takesAway = (rule.affectsFacilities ?? []).some((f) => visit.requiredFacilities?.includes(f));
        push(takesAway || rule.coversCoreVisit ? important : info, rule);
        break;
      }
      case 'pushchair': {
        if (!visit.usesPushchair && !visit.requiresPushchair) break;
        if (visit.requiresPushchair && rule.coversCoreVisit) {
          verdict.blocksHousehold ??= rule;
          break;
        }
        push(important, rule);
        break;
      }
      case 'step_free': {
        if (!visit.needsStepFree) break;
        if (rule.coversCoreVisit && rule.scope === 'venue') {
          verdict.blocksHousehold ??= rule;
          break;
        }
        push(important, rule);
        break;
      }
      case 'booking':
      case 'caution':
        push(info, rule);
        break;
    }
  }

  if (verdict.blocksHousehold) verdict.exceptions = rules.filter((r) => r.exceptionOf === verdict.blocksHousehold!.id && ruleAppliesOn(r, visit.date));
  verdict.notes = [...important, ...info];
  return verdict;
}

/**
 * The reviewed whole-venue closure that covers the venue-local day `instant` falls on, if any. One definition for Home, Explore and
 * Venue Detail, so a card cannot say "Closed today" while the page beneath it says "Open until 5pm".
 */
export function closureToday(
  rules: readonly VenueRule[] | null | undefined,
  instant: Date,
  timezone: string = 'Europe/London',
): VenueRule | null {
  const date = venueLocalDate(instant, timezone);
  if (!date) return null;
  return evaluateVenueRules(rules, { date, usesPushchair: false, requiresPushchair: false, needsStepFree: false }).closedAllDay;
}
