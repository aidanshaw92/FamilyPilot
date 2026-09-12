import { FamilyProfile } from '@/src/types';

/** A generic assumption for how long a family spends at a venue when just browsing — Plans'
 * "Make a plan" flow lets a parent set the real figure once they're actually scheduling a day. */
const ASSUMED_VISIT_MINUTES = 90;

function parseClock(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours24 = Math.floor(m / 60);
  const mins = m % 60;
  const period = hours24 >= 12 ? 'pm' : 'am';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, '0')}${period}`;
}

/**
 * A rough, deliberately conservative heads-up: would leaving now, having a typical visit, and
 * driving home again run into the next nap? This flags risk on a browsing card — it does not
 * compute a departure plan. Plans' "Make a plan" does the real minute-by-minute timing against
 * the day a parent is actually scheduling.
 */
export function buildRoutineCaution(
  profile: FamilyProfile,
  driveMinutes: number,
  now: Date = new Date(),
): string | null {
  const nap = (profile.routines ?? []).find((routine) => routine.kind === 'nap');
  if (!nap) return null;

  const napStart = parseClock(nap.time);
  if (napStart == null) return null;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (napStart <= nowMinutes) return null; // today's nap window has already passed

  const projectedReturn = nowMinutes + driveMinutes * 2 + ASSUMED_VISIT_MINUTES;
  if (projectedReturn <= napStart) return null; // comfortable margin — no need to flag it

  const label = nap.label?.trim() || 'nap';
  return `A visit today may run into ${label} time (around ${formatClock(napStart)})`;
}
