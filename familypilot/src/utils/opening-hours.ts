import { OpeningHoursPoint, OpeningHoursSchedule } from '@/src/types/opening-hours';

/**
 * Answers one question: is this place actually open for the whole of a proposed visit?
 *
 * Everything here is pure and deterministic — no clock, no device timezone, no I/O — so a plan
 * made on a phone in one timezone for a venue in another gives the same answer as the server.
 *
 * The three-state result is the point. A venue whose hours nobody has captured is `unknown`, not
 * `closed`: telling a family a place is shut when we simply do not know is the same class of
 * error as telling them it is open when it is not.
 */

const MINUTES_PER_DAY = 1440;
const MINUTES_PER_WEEK = MINUTES_PER_DAY * 7;

export type OpeningStatus = 'open' | 'closed' | 'unknown';

export type OpeningHoursReason =
  /** The provider never gave us a machine-readable schedule. Display text alone does not count. */
  | 'no-structured-hours'
  /** Google sends an empty period list for a place that is open on no day at all. */
  | 'never-open'
  /** A period with no closing time, which the provider uses to mean "always open". */
  | 'open-24h'
  | 'within-opening-period'
  /** Nothing is open on the requested weekday. */
  | 'closed-that-day'
  /** Open when the visit starts, shut before it ends. */
  | 'closes-during-visit'
  /** Open that day, but not across the requested window. */
  | 'outside-opening-period'
  /** The date or the visit window could not be read, so no claim is made either way. */
  | 'invalid-input';

export interface OpeningHoursVerdict {
  status: OpeningStatus;
  reason: OpeningHoursReason;
  /**
   * The venue is open when the visit starts but shuts before it ends. `status` is still `closed`,
   * because the proposed visit does not fit — this flag is what lets a caller say "closes at 5pm"
   * rather than just "closed".
   */
  closesDuringVisit: boolean;
  /** Venue-local `HH:MM` the covering period ends, when one covers the start of the visit. */
  closesAt?: string;
}

interface Interval {
  start: number;
  end: number;
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_TIME = /^(\d{1,2}):(\d{2})$/;

/**
 * The weekday (0-6, 0 = Sunday) of a calendar date, independent of where the code is running.
 *
 * `Date.UTC` is used rather than the `Date` constructor precisely so the host timezone cannot
 * shift the result across a day boundary.
 */
function weekdayOf(year: number, month: number, day: number): number | null {
  const utc = Date.UTC(year, month - 1, day);
  const parsed = new Date(utc);
  // Rejects the likes of 2026-02-30, which Date.UTC silently rolls forward.
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed.getUTCDay();
}

function parseCalendarDate(value: string): { year: number; month: number; day: number } | null {
  const match = CALENDAR_DATE.exec(value.trim());
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Minutes past midnight for an `HH:MM` wall-clock time, or null if it is not one. */
export function parseClockTime(value: string): number | null {
  const match = CLOCK_TIME.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatClockTime(minutes: number): string {
  const normalised = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(normalised / 60);
  const minute = normalised % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * The calendar date at a venue at a given instant, as `YYYY-MM-DD`.
 *
 * Uses `Intl` so daylight saving is handled by the platform's own timezone database rather than
 * by arithmetic here. Returns null for a timezone the platform does not recognise, which keeps a
 * bad id from silently resolving to the device's own date.
 */
export function venueLocalDate(instant: Date, timezone: string): string | null {
  if (Number.isNaN(instant.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
    return CALENDAR_DATE.test(parts) ? parts : null;
  } catch {
    return null;
  }
}

/** The wall-clock time at a venue at a given instant, as `HH:MM`. */
export function venueLocalTime(instant: Date, timezone: string): string | null {
  if (Number.isNaN(instant.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(instant);
  } catch {
    return null;
  }
}

function pointToMinutes(point: OpeningHoursPoint): number | null {
  const { day, hour, minute } = point;
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return day * MINUTES_PER_DAY + hour * 60 + minute;
}

/**
 * Turns periods into absolute minute ranges on the weekly clock.
 *
 * A close at or before its open means the span runs past midnight — and, for a Saturday-night
 * period, past the end of the week — so a week is added to keep the range contiguous. Zero-length
 * spans are dropped rather than treated as a wrap, which would claim a full week of openness from
 * what is almost certainly bad data.
 */
function toIntervals(periods: OpeningHoursSchedule['periods']): Interval[] {
  const intervals: Interval[] = [];
  for (const period of periods ?? []) {
    if (!period?.open || !period.close) continue;
    const start = pointToMinutes(period.open);
    const closeAt = pointToMinutes(period.close);
    if (start === null || closeAt === null) continue;
    if (closeAt === start) continue;
    intervals.push({ start, end: closeAt < start ? closeAt + MINUTES_PER_WEEK : closeAt });
  }
  return mergeIntervals(intervals);
}

/**
 * Merges overlapping and touching spans, so that hours split into consecutive periods — a venue
 * listed as 09:00-12:00 and 12:00-17:00 — read as one continuous opening rather than a closure at
 * noon that no visitor would experience.
 */
function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length < 2) return intervals;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [sorted[0]];
  for (const interval of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

/** True when any span overlaps the given weekday at all, at either week offset. */
function anyOpeningOnDay(intervals: Interval[], weekday: number): boolean {
  const dayStart = weekday * MINUTES_PER_DAY;
  const dayEnd = dayStart + MINUTES_PER_DAY;
  return intervals.some(
    (interval) =>
      (interval.start < dayEnd && interval.end > dayStart) ||
      (interval.start - MINUTES_PER_WEEK < dayEnd && interval.end - MINUTES_PER_WEEK > dayStart),
  );
}

const unknown = (reason: OpeningHoursReason): OpeningHoursVerdict => ({
  status: 'unknown',
  reason,
  closesDuringVisit: false,
});

/**
 * Is the venue open for the whole of `visitStart`-`visitEnd` on `date`?
 *
 * @param date       The day of the visit, as a venue-local `YYYY-MM-DD`, or a `Date` instant —
 *                   in which case a timezone is required to know which local day it falls on.
 * @param visitStart Venue-local `HH:MM` the visit begins.
 * @param visitEnd   Venue-local `HH:MM` the visit ends. Earlier than the start means the visit
 *                   runs past midnight; equal to it asks about a single moment.
 * @param openingHours The stored schedule. Missing or period-less hours yield `unknown`.
 * @param timezone   IANA id overriding the schedule's own, for resolving a `Date`.
 */
export function isOpenOn(
  date: string | Date,
  visitStart: string,
  visitEnd: string,
  openingHours?: OpeningHoursSchedule | null,
  timezone?: string,
): OpeningHoursVerdict {
  // weekdayText is display copy in whatever language the provider chose. Parsing it back into
  // hours would be guesswork, so text-only hours count as no schedule at all.
  if (!openingHours?.periods) return unknown('no-structured-hours');

  const zone = timezone ?? openingHours.timezone;
  let calendarDate: string;
  if (typeof date === 'string') {
    calendarDate = date;
  } else {
    // Without a zone the venue's own date is unknowable, and falling back to the device's date is
    // the exact timezone bug this function exists to avoid.
    if (!zone) return unknown('invalid-input');
    const resolved = venueLocalDate(date, zone);
    if (!resolved) return unknown('invalid-input');
    calendarDate = resolved;
  }

  const parsedDate = parseCalendarDate(calendarDate);
  if (!parsedDate) return unknown('invalid-input');
  const weekday = weekdayOf(parsedDate.year, parsedDate.month, parsedDate.day);
  if (weekday === null) return unknown('invalid-input');

  const startMinutes = parseClockTime(visitStart);
  const endMinutes = parseClockTime(visitEnd);
  if (startMinutes === null || endMinutes === null) return unknown('invalid-input');

  if (openingHours.periods.length === 0) {
    return { status: 'closed', reason: 'never-open', closesDuringVisit: false };
  }

  // A period with no close is the provider's "always open". It answers every window, so it is
  // checked before any arithmetic.
  const alwaysOpen = openingHours.periods.some((period) => period?.open && !period.close);
  if (alwaysOpen) {
    return { status: 'open', reason: 'open-24h', closesDuringVisit: false };
  }

  const intervals = toIntervals(openingHours.periods);
  if (intervals.length === 0) return unknown('no-structured-hours');

  const visitStartAbs = weekday * MINUTES_PER_DAY + startMinutes;
  const visitEndAbs =
    weekday * MINUTES_PER_DAY + endMinutes + (endMinutes < startMinutes ? MINUTES_PER_DAY : 0);

  // A visit early on Sunday can be covered by a Saturday-night span that wrapped past the end of
  // the week, so the window is tested at both offsets.
  for (const shift of [0, MINUTES_PER_WEEK]) {
    const start = visitStartAbs + shift;
    const end = visitEndAbs + shift;
    const covering = intervals.find((interval) => interval.start <= start && end <= interval.end);
    if (covering) {
      return { status: 'open', reason: 'within-opening-period', closesDuringVisit: false };
    }
    const coversStart = intervals.find(
      (interval) => interval.start <= start && start < interval.end,
    );
    if (coversStart) {
      return {
        status: 'closed',
        reason: 'closes-during-visit',
        closesDuringVisit: true,
        closesAt: formatClockTime(coversStart.end),
      };
    }
  }

  return {
    status: 'closed',
    reason: anyOpeningOnDay(intervals, weekday) ? 'outside-opening-period' : 'closed-that-day',
    closesDuringVisit: false,
  };
}
