import type { OpeningHoursPeriod, OpeningHoursSchedule } from '@/src/types/opening-hours';
import type { OfficialHoursRule } from '@/src/types/official-hours';
import type { VenueRuleNote } from '@/src/types/venue-rules';
import { clock12 } from '@/src/utils/opening-today';
import { parseCalendarDate, parseClockTime, venueLocalDate, weekdayOf } from '@/src/utils/opening-hours';

/**
 * Which hours to believe for one day, and what to tell the parent when two sources disagree.
 *
 * THE HIERARCHY, for the whole venue's opening hours on a given date:
 *   1. The venue's own pages, read and approved by a person, when the reading is recent (OFFICIAL_MAX_AGE_DAYS) and gives
 *      clock times. Seasonal: a rule applies only inside its dates.
 *   2. The provider's weekly hours.
 *   3. Nothing: unknown, never "closed".
 *
 * THE RULES THAT KEEP IT HONEST:
 *   - The provider's hours are never replaced silently. When the two sources disagree about that day, the venue's own hours are
 *     used AND a note says so, naming both, so the parent can check. When they agree, nothing is said.
 *   - A reading that gives no clock time ("until dusk") cannot be scheduled against. It is compared where it can be (a place
 *     listed as open 24 hours that opens at 7am is a disagreement) and reported, but the provider's schedule is kept.
 *   - A part of the venue (the museum inside a park) never speaks for the whole venue. Only venue-scope hours can agree with,
 *     contradict or replace the provider's.
 *   - A reading older than OFFICIAL_MAX_AGE_DAYS is ignored rather than trusted: hours change with the season.
 *   - A closure on a date is a venue rule (types/venue-rules.ts) and outranks hours entirely; it is not handled here.
 */
export const OFFICIAL_MAX_AGE_DAYS = 45;
/** Opening and closing times within this many minutes of each other are the same hours. */
export const TOLERANCE_MINUTES = 15;

export type HoursAgreement =
  | 'agree'
  | 'conflict'
  /** The venue gives no clock time (or the provider has no usable hours for a conflict to be told from): reported, provider kept. */
  | 'not-comparable'
  /** The provider had nothing; the venue's own hours fill the gap. */
  | 'official-only'
  | 'provider-only'
  | 'none';

export interface HoursReconciliation {
  /** What the app should use for this date. `undefined` means nothing machine-readable (unknown, never closed). */
  schedule: OpeningHoursSchedule | undefined;
  basis: 'official' | 'provider' | 'none';
  agreement: HoursAgreement;
  /** Present only when the parent should be told something. */
  note: VenueRuleNote | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const daysBetween = (a: string, b: string): number => Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const inSeason = (rule: OfficialHoursRule, date: string): boolean =>
  !(rule.from && DATE.test(rule.from) && date < rule.from) && !(rule.until && DATE.test(rule.until) && date > rule.until);

const isFresh = (rule: OfficialHoursRule, asOf: string): boolean =>
  Boolean(rule.checkedAt && DATE.test(rule.checkedAt.slice(0, 10))) && daysBetween(rule.checkedAt!.slice(0, 10), asOf) <= OFFICIAL_MAX_AGE_DAYS;

interface Span { open: number; close: number }

function providerSpans(provider: OpeningHoursSchedule | undefined, weekday: number): { spans: Span[]; always: boolean } | null {
  if (!provider?.periods) return null;
  if (provider.periods.some((p) => p?.open && !p.close)) return { spans: [], always: true };
  const spans = provider.periods
    .filter((p): p is OpeningHoursPeriod & { close: NonNullable<OpeningHoursPeriod['close']> } => p?.open?.day === weekday && Boolean(p.close))
    .map((p) => {
      const open = p.open.hour * 60 + p.open.minute;
      let close = p.close.hour * 60 + p.close.minute;
      if (p.close.day !== p.open.day || close <= open) close += 1440;
      return { open, close };
    })
    .sort((a, b) => a.open - b.open);
  return { spans, always: false };
}

const officialSpan = (rule: OfficialHoursRule): Span | null => {
  const open = parseClockTime(rule.open);
  const close = rule.close ? parseClockTime(rule.close) : null;
  return open === null || close === null ? null : { open, close: close <= open ? close + 1440 : close };
};

const near = (a: number, b: number): boolean => Math.abs(a - b) <= TOLERANCE_MINUTES;
const spansAgree = (a: Span[], b: Span[]): boolean => a.length === b.length && a.every((s, i) => near(s.open, b[i].open) && near(s.close, b[i].close));
const clock = (minutes: number): string => clock12(minutes % 1440);
const describeSpans = (spans: Span[]): string => spans.map((s) => `${clock(s.open)} to ${clock(s.close)}`).join(' and ');

/** A weekly schedule for the day's season: the venue's own hours where it gives them, the provider's for every other day. */
function hybridSchedule(provider: OpeningHoursSchedule | undefined, venueRules: OfficialHoursRule[], date: string): OpeningHoursSchedule {
  const periods: OpeningHoursPeriod[] = [];
  for (let day = 0; day < 7; day += 1) {
    const rules = venueRules.filter((r) => r.days.includes(day) && inSeason(r, date));
    const spans = rules.map(officialSpan);
    if (rules.length > 0 && spans.every((s): s is Span => s !== null)) {
      for (const s of spans as Span[]) {
        periods.push({
          open: { day, hour: Math.floor(s.open / 60), minute: s.open % 60 },
          close: { day: (day + Math.floor(s.close / 1440)) % 7, hour: Math.floor((s.close % 1440) / 60), minute: s.close % 60 },
        });
      }
    } else {
      for (const p of provider?.periods ?? []) if (p?.open?.day === day && p.close) periods.push(p);
    }
  }
  return { periods, ...(provider?.timezone ? { timezone: provider.timezone } : { timezone: 'Europe/London' }) };
}

export function reconcileHours(
  provider: OpeningHoursSchedule | undefined,
  official: readonly OfficialHoursRule[] | null | undefined,
  date: string,
  asOf: string = date,
): HoursReconciliation {
  const baseline = (agreement: HoursAgreement): HoursReconciliation => ({
    schedule: provider, basis: provider ? 'provider' : 'none', agreement: provider ? agreement : 'none', note: null,
  });
  const parsed = DATE.test(date) ? parseCalendarDate(date) : null;
  const weekday = parsed ? weekdayOf(parsed.year, parsed.month, parsed.day) : null;
  if (!official?.length || weekday === null) return baseline('provider-only');

  const venueRules = official.filter((r) => r.scope === 'venue' && inSeason(r, date) && isFresh(r, asOf));
  const today = venueRules.filter((r) => r.days.includes(weekday));
  if (today.length === 0) return baseline('provider-only');

  const sourceNote = (text: string): VenueRuleNote => ({ ruleId: 'hours-differ', severity: 'important', text });
  const day = DAY_NAMES[weekday];
  const theirs = today.map(officialSpan);
  const prov = providerSpans(provider, weekday);

  // The venue gives no clock time for its close ("until dusk"): nothing to schedule against, but a plain contradiction is still told.
  if (theirs.some((s) => s === null)) {
    const rule = today.find((r) => officialSpan(r) === null)!;
    const open = parseClockTime(rule.open);
    const words = `${rule.closeText ?? 'a closing time we cannot schedule'}`;
    if (prov?.always && open !== null && open > 0) {
      return {
        schedule: provider, basis: 'provider', agreement: 'not-comparable',
        note: sourceNote(`Opening hours differ between sources: Google lists this place as open 24 hours; the venue’s website says ${clock(open)} until ${words}. Check before you go.`),
      };
    }
    if (prov && !prov.always && prov.spans.length > 0 && open !== null && !near(prov.spans[0].open, open)) {
      return {
        schedule: provider, basis: 'provider', agreement: 'not-comparable',
        note: sourceNote(`Opening hours differ between sources: Google lists ${describeSpans(prov.spans)} on ${day}; the venue’s website says ${clock(open)} until ${words}. Check before you go.`),
      };
    }
    return baseline('not-comparable');
  }

  const official_ = theirs as Span[];
  // The provider has nothing usable at all: the venue's own hours fill the gap, with nothing to disagree with.
  if (!prov) return { schedule: hybridSchedule(undefined, venueRules, date), basis: 'official', agreement: 'official-only', note: null };
  if (!prov.always && spansAgree(prov.spans, official_)) return baseline('agree');

  const providerSays = prov.always ? 'open 24 hours' : prov.spans.length === 0 ? 'closed' : describeSpans(prov.spans);
  const note = sourceNote(
    `Opening hours differ between sources on ${day}: Google lists ${providerSays}; the venue’s website says ${describeSpans(official_)}. We’ve used the venue’s website. Check before you go.`,
  );
  return { schedule: hybridSchedule(provider, venueRules, date), basis: 'official', agreement: 'conflict', note };
}

/** `reconcileHours` for the venue-local calendar day that `instant` falls on (Home, Explore and the Today card). */
export function reconcileHoursOn(
  provider: OpeningHoursSchedule | undefined,
  official: readonly OfficialHoursRule[] | null | undefined,
  instant: Date,
): HoursReconciliation {
  const date = venueLocalDate(instant, provider?.timezone ?? 'Europe/London');
  return date ? reconcileHours(provider, official, date, date) : reconcileHours(provider, undefined, '');
}
