import { weekdayOf } from '@/src/services/planning/plan-view-model';

/**
 * What a date or time field SHOWS. The value underneath stays ISO ("2026-10-02", "09:00") because
 * that is what the planner and the native pickers speak; this is the layer a parent reads.
 *
 * A native `<input type="date">` prints the browser's locale, so the same Friday read 10/02/2026 on
 * one phone and 02/10/2026 on another. Spelling the day out removes the ambiguity entirely. Times
 * are 24-hour because the plan's own timeline ("10:00–14:21") already is, and one convention per
 * app is the rule.
 */
const MONTHS: Record<string, string> = {
  Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June',
  Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
};

export function formatDateLabel(iso: string): string | null {
  const parts = weekdayOf(iso);
  if (!parts) return null;
  const year = iso.slice(0, 4);
  return `${parts.long} ${parts.day} ${MONTHS[parts.month] ?? parts.month} ${year}`;
}

/** "09:00" for "09:00" or "9:00"; null for anything that is not a clock time. */
export function formatTimeLabel(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
