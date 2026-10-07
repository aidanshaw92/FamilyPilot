import { OpeningHoursSchedule } from '@/src/types/opening-hours';
import {
  Interval,
  MINUTES_PER_DAY,
  MINUTES_PER_WEEK,
  parseCalendarDate,
  parseClockTime,
  toIntervals,
  venueLocalDate,
  venueLocalTime,
  weekdayOf,
} from '@/src/utils/opening-hours';

/**
 * What a place's opening hours mean for TODAY, worked out from the stored weekly schedule and the clock, never
 * from a point-in-time "open now" flag.
 *
 * THE DEFECT THIS EXISTS TO FIX. Google's `openNow` is a snapshot, taken when a search ran and then stored and
 * replayed from the discovery cache for hours. The cache behind Home was written at about 01:40, so almost every
 * place carried `isOpen: false` ("shut now" at one in the morning) for the whole day that followed, and Home
 * treated that as live: both Farms served were dropped as "closed", and 27 of 28 museums with them. The weekly
 * schedule (`regularOpeningHours`) was stored all along and answers the question correctly at any time of day.
 *
 * Pure: the caller supplies the instant. Timezones come from the schedule, falling back to the UK, which is where
 * every venue FamilyPilot serves is.
 */
export type OpeningTodayState =
  | 'open_now'
  | 'closing_soon'
  | 'open_all_day'
  | 'opens_later'
  | 'closed_for_today'
  | 'closed_today'
  | 'never_open'
  | 'unknown';

export interface OpeningToday {
  state: OpeningTodayState;
  /** The line a parent reads: "Open until 5pm", "Closed today · opens Wed 10am". */
  label: string;
  /** Minutes past midnight today, when known. */
  opensAt?: number;
  closesAt?: number;
  /** Today's opening spans as local minutes, for a venue that opens in more than one block. */
  spans: Array<{ start: number; end: number; realEnd?: number }>;
  /** Shut today: in how many days it next opens (1 = tomorrow), when the schedule says. */
  opensAgainInDays?: number;
}

const FALLBACK_ZONE = 'Europe/London';
/** A snapshot older than this is not a statement about NOW. */
const SNAPSHOT_FRESH_MS = 90 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 10:00 -> "10am", 17:30 -> "5:30pm", 12:00 -> "12pm", 0:00 -> "midnight". */
export function clock12(minutesPastMidnight: number): string {
  const m = ((Math.round(minutesPastMidnight) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (m === 0) return 'midnight';
  const hour = Math.floor(m / 60);
  const minute = m % 60;
  const suffix = hour >= 12 ? 'pm' : 'am';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${h12}${suffix}` : `${h12}:${String(minute).padStart(2, '0')}${suffix}`;
}

function unknownToday(): OpeningToday {
  return { state: 'unknown', label: 'Opening hours not confirmed', spans: [] };
}

function dayAndMinutes(now: Date, zone: string): { weekday: number; minutes: number } | null {
  const date = venueLocalDate(now, zone);
  const time = venueLocalTime(now, zone);
  if (!date || !time) return null;
  const parsed = parseCalendarDate(date);
  const minutes = parseClockTime(time);
  if (!parsed || minutes === null) return null;
  const weekday = weekdayOf(parsed.year, parsed.month, parsed.day);
  return weekday === null ? null : { weekday, minutes };
}

/** The opening spans that fall on `weekday`, in local minutes, clamped to the day. */
function spansOnDay(intervals: Interval[], weekday: number): Array<{ start: number; end: number; realEnd: number }> {
  const dayStart = weekday * MINUTES_PER_DAY;
  const out: Array<{ start: number; end: number; realEnd: number }> = [];
  for (const shift of [-MINUTES_PER_WEEK, 0, MINUTES_PER_WEEK]) {
    for (const interval of intervals) {
      const start = interval.start + shift;
      const end = interval.end + shift;
      if (end <= dayStart || start >= dayStart + MINUTES_PER_DAY) continue;
      out.push({ start: Math.max(0, start - dayStart), end: Math.min(MINUTES_PER_DAY, end - dayStart), realEnd: end - dayStart });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The next time the place opens after `fromAbs` on the weekly clock, as a day offset and local minutes. */
function nextOpening(intervals: Interval[], fromAbs: number): { dayOffset: number; weekday: number; minutes: number } | null {
  let best: number | null = null;
  for (const shift of [0, MINUTES_PER_WEEK, MINUTES_PER_WEEK * 2]) {
    for (const interval of intervals) {
      const start = interval.start + shift;
      if (start > fromAbs && (best === null || start < best)) best = start;
    }
  }
  if (best === null) return null;
  const dayIndex = Math.floor(best / MINUTES_PER_DAY);
  const fromDay = Math.floor(fromAbs / MINUTES_PER_DAY);
  return { dayOffset: dayIndex - fromDay, weekday: dayIndex % 7, minutes: best % MINUTES_PER_DAY };
}

function opensPhrase(next: { dayOffset: number; weekday: number; minutes: number } | null): string {
  if (!next) return '';
  const when = next.dayOffset === 0 ? 'today' : next.dayOffset === 1 ? 'tomorrow' : WEEKDAYS[next.weekday];
  return `opens ${when} ${clock12(next.minutes)}`;
}

export function describeOpeningToday(hours: OpeningHoursSchedule | null | undefined, now: Date): OpeningToday {
  if (!hours?.periods) return unknownToday();
  if (hours.periods.length === 0) {
    return { state: 'never_open', label: 'Not open to visitors at the moment', spans: [] };
  }
  // Google's "always open": one period that opens and never closes.
  if (hours.periods.some((period) => period?.open && !period.close)) {
    return { state: 'open_all_day', label: 'Open 24 hours today', spans: [{ start: 0, end: MINUTES_PER_DAY }] };
  }
  const zone = hours.timezone ?? FALLBACK_ZONE;
  const here = dayAndMinutes(now, zone) ?? dayAndMinutes(now, FALLBACK_ZONE);
  if (!here) return unknownToday();
  const intervals = toIntervals(hours.periods);
  if (intervals.length === 0) return unknownToday();

  const spans = spansOnDay(intervals, here.weekday);
  const nowAbs = here.weekday * MINUTES_PER_DAY + here.minutes;

  if (spans.some((s) => s.start <= 0 && s.end >= MINUTES_PER_DAY)) {
    return { state: 'open_all_day', label: 'Open 24 hours today', spans };
  }

  const current = spans.find((s) => s.start <= here.minutes && here.minutes < s.end);
  if (current) {
    // The real closing time, which may be past midnight: a bowling alley open until 00:30 is open at 23:15.
    const remaining = current.realEnd - here.minutes;
    const closes = clock12(current.realEnd);
    return remaining <= 60
      ? { state: 'closing_soon', label: `Closing soon · ${closes}`, opensAt: current.start, closesAt: current.realEnd, spans }
      : { state: 'open_now', label: `Open until ${closes}`, opensAt: current.start, closesAt: current.realEnd, spans };
  }

  const later = spans.find((s) => s.start > here.minutes);
  if (later) {
    return { state: 'opens_later', label: `Opens at ${clock12(later.start)} today`, opensAt: later.start, closesAt: later.end, spans };
  }

  const next = nextOpening(intervals, nowAbs);
  // How many days until it opens again, so a plan made from here can start on a day it is open.
  const opensAgainInDays = next ? next.dayOffset : undefined;
  if (spans.length === 0) {
    return { state: 'closed_today', label: `Closed today${next ? ` · ${opensPhrase(next)}` : ''}`, spans, opensAgainInDays };
  }
  return { state: 'closed_for_today', label: `Closed for today${next ? ` · ${opensPhrase(next)}` : ''}`, spans, opensAgainInDays };
}

/**
 * Whether a family could still visit TODAY. Only a place shut for the whole day (or never open) is out; one that
 * has simply finished for the day stays in the list, labelled, because the evening is when most parents plan
 * tomorrow. Unknown hours stay in: nobody has said it is shut.
 */
export function isVisitableToday(state: OpeningTodayState): boolean {
  return state !== 'closed_today' && state !== 'never_open';
}

/**
 * The `isOpen` a venue carries, from its schedule when it has one and from the provider's flag only while that flag
 * is still a statement about now.
 */
export function resolveOpenNow(
  hours: OpeningHoursSchedule | null | undefined,
  snapshot: boolean | undefined,
  snapshotAt: string | undefined,
  now: Date,
): boolean | undefined {
  const today = describeOpeningToday(hours, now);
  if (today.state !== 'unknown') {
    return today.state === 'open_now' || today.state === 'closing_soon' || today.state === 'open_all_day';
  }
  if (typeof snapshot !== 'boolean' || !snapshotAt) return undefined;
  const age = now.getTime() - Date.parse(snapshotAt);
  return Number.isFinite(age) && age >= 0 && age <= SNAPSHOT_FRESH_MS ? snapshot : undefined;
}

/**
 * Whether a venue belongs in a list meant for visiting today: not shut for the whole day, and, where there is no
 * schedule to say, not known to be shut right now by a flag that is still fresh.
 */
export function isVisitableVenue(
  venue: { structuredOpeningHours?: OpeningHoursSchedule; isOpen?: boolean },
  now: Date = new Date(),
): boolean {
  const today = describeOpeningToday(venue.structuredOpeningHours, now);
  if (today.state === 'unknown') return venue.isOpen !== false;
  return isVisitableToday(today.state);
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // a UK week starts on Monday

/**
 * The week as lines a parent can read ("Monday: 10am to 5pm"), Monday first. Built from the structured schedule so it
 * agrees with what `describeOpeningToday` says; the provider's own display text is the fallback when there is no schedule.
 */
export function weeklyHoursLines(hours: OpeningHoursSchedule | null | undefined): string[] {
  if (!hours) return [];
  if (hours.periods && hours.periods.length > 0) {
    if (hours.periods.some((p) => p?.open && !p.close)) return ['Open 24 hours, every day'];
    const intervals = toIntervals(hours.periods);
    if (intervals.length > 0) {
      return DAY_ORDER.map((weekday) => {
        const spans = spansOnDay(intervals, weekday);
        if (spans.length === 0) return `${DAY_NAMES[weekday]}: Closed`;
        if (spans.some((s) => s.start <= 0 && s.end >= MINUTES_PER_DAY)) return `${DAY_NAMES[weekday]}: Open 24 hours`;
        return `${DAY_NAMES[weekday]}: ${spans.map((s) => `${clock12(s.start)} to ${clock12(s.realEnd)}`).join(', ')}`;
      });
    }
  }
  return (hours.weekdayText ?? []).filter((line) => typeof line === 'string' && line.trim().length > 0);
}
