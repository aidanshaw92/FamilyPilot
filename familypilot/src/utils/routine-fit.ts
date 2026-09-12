import { FamilyProfile } from '@/src/types';
import { formatClock } from './clock-format';

function parseClock(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export interface RoutineFit {
  /** A bespoke, positive "why this suits your family" line — there's still time to leave, visit,
   * and be home for the next nap or feed. */
  reason: string | null;
  /** A heads-up that leaving now would already cut it close for the next nap or feed. */
  caution: string | null;
}

/**
 * Turns the family's nap/feed routine times plus this venue's drive time into a concrete,
 * bespoke statement — "leave by 12:00 to be home in time for lunch" — rather than a generic
 * caution. Looks at whichever routine (nap or feed) comes soonest today; if there's still time
 * to leave by driveMinutes before it, that's a positive reason. If leaving right now would
 * already miss that window, it's a caution instead.
 */
export function evaluateRoutineFit(
  profile: FamilyProfile,
  driveMinutes: number,
  now: Date = new Date(),
): RoutineFit {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const upcoming = (profile.routines ?? [])
    .map((routine) => ({ routine, minutes: parseClock(routine.time) }))
    .filter((entry): entry is { routine: typeof entry.routine; minutes: number } => entry.minutes != null)
    .filter((entry) => entry.minutes > nowMinutes)
    .sort((a, b) => a.minutes - b.minutes)[0];

  if (!upcoming) return { reason: null, caution: null };

  const { routine, minutes: routineTime } = upcoming;
  const label = routine.label?.trim() || (routine.kind === 'nap' ? 'nap' : 'feed');
  const leaveBy = routineTime - driveMinutes;

  if (leaveBy > nowMinutes) {
    return {
      reason: `Leave by ${formatClock(leaveBy)} to be home in time for ${label}`,
      caution: null,
    };
  }

  return {
    reason: null,
    caution: `A visit today may run into ${label} time (around ${formatClock(routineTime)})`,
  };
}
