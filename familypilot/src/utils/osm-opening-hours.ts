import { OpeningHoursPeriod, OpeningHoursSchedule } from '@/src/types/opening-hours';

/**
 * A deliberately small reader for OpenStreetMap's `opening_hours` tag.
 *
 * OSM's grammar is large (public holidays, sunrise, months, week numbers, comments). This understands only the
 * common, unambiguous core, which covers most cafes and restaurants:
 *
 *     Mo-Fr 08:00-17:00; Sa,Su 09:00-16:00        24/7        Mo-Su 11:00-22:00        Mo off        Tu-Su 10:00-14:00,17:00-22:00
 *
 * and returns null for anything else, so a place with an expression this cannot read stays "hours not listed as a
 * schedule" and the raw text is shown, rather than being read wrongly. Later rules override earlier ones for the days
 * they name, as OSM specifies. Pure, no clock: the caller evaluates the schedule against a time.
 */
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function parseDays(selector: string): number[] | null {
  const out = new Set<number>();
  for (const part of selector.split(',')) {
    const range = /^([A-Z][a-z])(?:-([A-Z][a-z]))?$/.exec(part.trim());
    if (!range) return null;
    const from = DAYS.indexOf(range[1]);
    const to = range[2] ? DAYS.indexOf(range[2]) : from;
    if (from === -1 || to === -1) return null;
    // A range runs forward from the first named day, wrapping the week (Sa-Mo is Sa, Su, Mo).
    for (let d = from; ; d = (d + 1) % 7) {
      out.add(d);
      if (d === to) break;
    }
  }
  return [...out];
}

function parseSpans(text: string): Array<{ start: number; end: number }> | 'off' | null {
  const t = text.trim();
  if (t === 'off' || t === 'closed') return 'off';
  const spans: Array<{ start: number; end: number }> = [];
  for (const part of t.split(',')) {
    const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(part.trim());
    if (!m || !TIME.test(m[1]) || !TIME.test(m[2])) return null;
    const [sh, sm] = m[1].split(':').map(Number);
    const [eh, em] = m[2].split(':').map(Number);
    spans.push({ start: sh * 60 + sm, end: eh * 60 + em });
  }
  return spans.length > 0 ? spans : null;
}

export function parseOsmOpeningHours(expression: string | null | undefined): OpeningHoursSchedule | null {
  const raw = expression?.trim();
  if (!raw) return null;
  if (raw === '24/7') return { timezone: 'Europe/London', periods: [{ open: { day: 0, hour: 0, minute: 0 } }] };

  const perDay: Array<Array<{ start: number; end: number }> | undefined> = new Array(7).fill(undefined);
  for (const rule of raw.split(';')) {
    const text = rule.trim();
    if (!text) continue;
    // Optional day selector first, then the times: "Mo-Fr 08:00-17:00", "Sa,Su off", or just "09:00-17:00".
    const m = /^((?:[A-Z][a-z](?:-[A-Z][a-z])?)(?:\s*,\s*[A-Z][a-z](?:-[A-Z][a-z])?)*)?\s*(.*)$/.exec(text);
    if (!m) return null;
    const days = m[1] ? parseDays(m[1].replace(/\s+/g, '')) : [0, 1, 2, 3, 4, 5, 6];
    const spans = parseSpans(m[2]);
    if (!days || spans === null) return null;
    for (const day of days) perDay[day] = spans === 'off' ? [] : spans;
  }
  if (perDay.every((d) => d === undefined)) return null;

  const periods: OpeningHoursPeriod[] = [];
  perDay.forEach((spans, day) => {
    for (const span of spans ?? []) {
      const overnight = span.end <= span.start;
      periods.push({
        open: { day, hour: Math.floor(span.start / 60), minute: span.start % 60 },
        close: {
          day: overnight ? (day + 1) % 7 : day,
          hour: Math.floor((span.end % 1440) / 60),
          minute: span.end % 60,
        },
      });
    }
  });
  // Every day named off or unnamed: a schedule with no periods would read as "never open", which is a stronger
  // claim than the text makes (an unnamed day is unknown), so only a schedule with at least one period is returned.
  return periods.length > 0 ? { timezone: 'Europe/London', periods } : null;
}
