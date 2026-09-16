/**
 * Family routines as time windows, and the overlap rules a plan has to respect.
 *
 * Extracted from `planVenue`'s scan loop so the day sequencer can apply the same rules to a day
 * with several stops instead of reimplementing them. The comparisons are preserved exactly:
 * every window is half-open, so a routine that ends precisely as the family leaves is not a
 * clash, and `planner-routines-characterization.test.ts` pins that to the minute.
 *
 * Pure, with no clock and no I/O.
 */

export interface Routine {
  id: string;
  label: string;
  kind: 'nap' | 'feed';
  time: string;
  durationMinutes: number;
  atHome: boolean;
}

export interface RoutineWindow extends Routine {
  start: number;
  end: number;
}

/** One span of time somebody is travelling or occupied, as minutes from midnight. */
export interface TimeSpan {
  from: number;
  to: number;
}

const MIN_ROUTINE_MINUTES = 1;
const MAX_ROUTINE_MINUTES = 240;

/** Minutes from midnight for an `HH:MM` time. Lives here so routine parsing and the planner share one parser. */
export function clockMinutes(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Enter times as HH:MM, for example 09:30.');
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

/**
 * Turns routines into windows, rejecting a duration nobody could have meant.
 *
 * Validation happens here, before any scheduling, so a bad routine is reported as itself rather
 * than surfacing later as a day that mysteriously will not fit.
 */
export function routineWindows(routines: Routine[]): RoutineWindow[] {
  return routines.map((routine) => {
    const { durationMinutes } = routine;
    if (
      !Number.isFinite(durationMinutes) ||
      durationMinutes < MIN_ROUTINE_MINUTES ||
      durationMinutes > MAX_ROUTINE_MINUTES
    ) {
      throw new Error('Routine duration must be 1–240 minutes.');
    }
    const start = clockMinutes(routine.time);
    return { ...routine, start, end: start + durationMinutes };
  });
}

/** Half-open overlap: touching at an endpoint is not a clash. */
export function overlaps(window: RoutineWindow, from: number, to: number): boolean {
  return from < window.end && to > window.start;
}

/**
 * A routine that has to happen at home, colliding with the whole time the family is out.
 *
 * Returns the offending routine rather than a boolean, so a caller can say which one it was.
 */
export function homeRoutineConflict(
  windows: RoutineWindow[],
  leavesHome: number,
  backHome: number,
): RoutineWindow | undefined {
  return windows.find((window) => window.atHome && overlaps(window, leavesHome, backHome));
}

/**
 * A routine that happens away from home, colliding with time spent travelling.
 *
 * Sitting in a car is the one place a feed or a nap cannot happen, so travel spans are checked
 * against out-of-home routines while time at a venue is not. Taking the spans as a list is what
 * lets a multi-stop day check every leg, where `planVenue` only ever had two.
 */
export function travelRoutineConflict(
  windows: RoutineWindow[],
  travel: TimeSpan[],
): RoutineWindow | undefined {
  return windows.find(
    (window) => !window.atHome && travel.some((span) => overlaps(window, span.from, span.to)),
  );
}

/** The first at-home routine the family must be back for, if there is one. */
export function nextHomeRoutineAfter(
  windows: RoutineWindow[],
  backHome: number,
): RoutineWindow | undefined {
  return windows
    .filter((window) => window.atHome && window.start >= backHome)
    .sort((a, b) => a.start - b.start)[0];
}

const describe = (routine: RoutineWindow) => routine.label || routine.kind;

/**
 * Notes for routines falling while the family is out.
 *
 * These say what the family will need to handle rather than pretending the plan has handled it —
 * nothing here claims a venue has the facilities for it.
 */
export function outOfHomeNotes(
  windows: RoutineWindow[],
  leavesHome: number,
  backHome: number,
): string[] {
  return windows
    .filter((window) => !window.atHome && window.start >= leavesHome && window.start < backHome)
    .map(
      (window) =>
        `${describe(window)}: ${window.time} while out; allow ${window.durationMinutes} minutes within your visit and check facilities.`,
    );
}

export function homeBeforeNote(routine: RoutineWindow): string {
  return `Home before ${describe(routine)} at ${routine.time}.`;
}
