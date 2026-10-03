/**
 * Formats a minutes-since-midnight value as a 24-hour clock string, e.g. 810 -> "13:30".
 *
 * 24-hour because the plan timeline ("10:00–14:21"), the date and time fields and the saved-plan
 * summaries already are; "Arrive around 1:30pm" beside "12:46–13:31" was the one 12-hour clock in
 * the app, and one convention per app is the rule.
 */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours24 = Math.floor(m / 60);
  const mins = m % 60;
  return `${String(hours24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** "Arrive by 1:45pm" if leaving right now and driving driveMinutes — a plain reformatting of a
 * duration into a clock time, not a scheduled plan. Plans' "Make a plan" computes real departure
 * and return times against the day a parent is actually scheduling. */
export function formatArrivalTime(driveMinutes: number, now: Date = new Date()): string {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return formatClock(nowMinutes + driveMinutes);
}
