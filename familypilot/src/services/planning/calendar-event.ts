import type { PlanViewModelInput } from '@/src/services/planning/plan-view-model';
import { familyDisplayName } from '@/src/utils/family-title';

/**
 * A saved plan as a calendar event, and as the .ics file the phone's own calendar opens.
 *
 * WHY A FILE. Writing into the calendar directly needs a native calendar permission, a native module and, on iOS, a
 * usage string; asking a parent for calendar access to add one day out is out of proportion. An .ics file needs none of
 * that: the parent taps "Add to calendar", the phone's own calendar shows its own "Add" sheet, and FamilyPilot never
 * sees or touches their calendar. No permission, no third party, no cost.
 *
 * WHAT GOES IN, and what never does. A calendar is synced and often shared, so the event carries only what the parent
 * would write themselves: the day's title, when they leave and get home, where they are going, and the stops with
 * their times. Never a child's name or date of birth, never a routine or a feed, never another family's home, area or
 * timings, never evidence or provenance. Another family appears, if at all, as the label they chose to share.
 */

export interface CalendarEvent {
  uid: string;
  title: string;
  /** UTC instants. */
  start: Date;
  end: Date;
  location: string;
  description: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (minutes: number) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

/**
 * A London wall-clock time on a date, as the UTC instant it is. The planner's times are London times (the family's own
 * clock); a calendar needs an instant so the event is right wherever the phone is set. Minutes past 1440 roll into the
 * next day, as the planner's do.
 */
export function londonTimeToUtc(date: string, minutes: number): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, 0, Math.round(minutes));
  // London's offset at that moment (0 or +60), found by asking what London's clock reads at the guess.
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess))
    .reduce<Record<string, number>>((acc, part) => (part.type === 'literal' ? acc : { ...acc, [part.type]: Number(part.value) }), {});
  const londonAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute);
  const offset = londonAsUtc - guess;
  return new Date(guess - offset);
}

export function buildCalendarEvent(day: { id: string; source: PlanViewModelInput }): CalendarEvent {
  const { itinerary, anchorName } = day.source;
  const stops = itinerary.stops;
  const mine = itinerary.families.find((family) => family.familyId === 'mine') ?? itinerary.families[0];
  const first = stops[0];
  const last = stops[stops.length - 1];
  // From leaving home to getting back, when the planner timed our journey; otherwise the time at the places.
  const startMinutes = mine ? mine.depart : first.arrive;
  const endMinutes = mine ? mine.home : last.depart;

  const lines = stops.map((stop) => `${clock(stop.arrive)}–${clock(stop.depart)} ${stop.role === 'meal' ? `Lunch at ${stop.name}` : stop.name}`);
  if (mine) lines.push(`Leave home about ${clock(mine.depart)}, home about ${clock(mine.home)}.`);
  const others = itinerary.families.filter((family) => family !== mine && family.familyId !== 'mine');
  if (others.length) lines.push(`With ${others.map((family) => familyDisplayName(family.label)).join(' and ')}.`);
  lines.push('Planned with FamilyPilot. Times are estimates: check opening hours and travel before you go.');

  return {
    uid: `${day.id}@familypilot.app`,
    title: `Day out: ${anchorName}`,
    start: londonTimeToUtc(itinerary.date, startMinutes),
    end: londonTimeToUtc(itinerary.date, endMinutes),
    location: anchorName,
    description: lines.join('\n'),
  };
}

/** RFC 5545 text escaping. */
const escapeText = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (date: Date) => `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;

/** UTF-8 length without Buffer or TextEncoder, which not every runtime the app ships to provides. */
const utf8Bytes = (text: string) => {
  try {
    return encodeURIComponent(text).replace(/%[0-9A-F]{2}/gi, 'x').length;
  } catch {
    // A cut through the middle of an emoji: count it as too long, so the fold steps back off it.
    return Number.POSITIVE_INFINITY;
  }
};

/** Lines longer than 75 octets are folded, as the format requires. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (utf8Bytes(rest) > 75) {
    let cut = 75;
    while (utf8Bytes(rest.slice(0, cut)) > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

export function toIcs(event: CalendarEvent, now: Date = new Date()): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FamilyPilot//Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `LOCATION:${escapeText(event.location)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .map(fold)
    .join('\r\n')
    .concat('\r\n');
}

export function calendarFileName(event: CalendarEvent): string {
  const slug = event.title.replace(/^Day out: /, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'plan';
  return `familypilot-${slug}.ics`;
}
