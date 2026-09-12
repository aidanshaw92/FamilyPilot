/** Formats a minutes-since-midnight value as a 12-hour clock string, e.g. 810 -> "1:30pm". */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours24 = Math.floor(m / 60);
  const mins = m % 60;
  const period = hours24 >= 12 ? 'pm' : 'am';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, '0')}${period}`;
}

/** "Arrive by 1:45pm" if leaving right now and driving driveMinutes — a plain reformatting of a
 * duration into a clock time, not a scheduled plan. Plans' "Make a plan" computes real departure
 * and return times against the day a parent is actually scheduling. */
export function formatArrivalTime(driveMinutes: number, now: Date = new Date()): string {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return formatClock(nowMinutes + driveMinutes);
}
