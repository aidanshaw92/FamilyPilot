/**
 * When a family lunch can sensibly happen, so a day is not given a lunch it has no room for.
 *
 * Lunch used to be added to every day that had a place to eat nearby, whatever the arrival: a 14:35 arrival with a 90-minute
 * visit put lunch at 16:21, which is tea for a toddler, not lunch. A default lunch now has to START inside a realistic family
 * window; a day it cannot fit is built without one and says so (with "Add a 45-minute lunch" still one tap away). A lunch the
 * parent adds themselves is theirs and is never second-guessed.
 *
 * The window is a plain, stated rule, not a guess about this family: nothing here reads a child, a routine or a venue.
 */

/** A lunch that starts before this is a late breakfast or a snack: 10:30. */
export const LUNCH_EARLIEST_START = 10 * 60 + 30;
/** A lunch that starts after this is a late lunch for young children: 14:00. */
export const LUNCH_LATEST_START = 14 * 60;
/** The hop from the visit to the place to eat, before the sequencer measures the real one. */
export const MEAL_HOP_MINUTES = 10;

const clock = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Minutes since midnight for `HH:MM`; null when it cannot be read (so nothing is ever decided from a time that is not there). */
export function minutesOfClock(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export type LunchFit =
  | { fits: true; startsAt: string }
  | { fits: false; reason: 'late' | 'early'; startsAt: string };

/**
 * Whether a lunch after the visit starts inside the family window.
 *
 * `arriveAt` and `visitMinutes` are what the parent chose (or what FamilyPilot assumed and said so). An arrival that cannot be
 * read gives `fits: true`: with nothing to go on, the day keeps the lunch it was going to have.
 */
export function lunchFit(input: { arriveAt: string; visitMinutes: number; hopMinutes?: number }): LunchFit {
  const arrive = minutesOfClock(input.arriveAt);
  if (arrive === null) return { fits: true, startsAt: '' };
  const start = arrive + input.visitMinutes + (input.hopMinutes ?? MEAL_HOP_MINUTES);
  if (start > LUNCH_LATEST_START) return { fits: false, reason: 'late', startsAt: clock(start) };
  if (start < LUNCH_EARLIEST_START) return { fits: false, reason: 'early', startsAt: clock(start) };
  return { fits: true, startsAt: clock(start) };
}

/**
 * Whether an arrival is already too late for lunch to be part of the day, whatever the length of the visit. Used where the
 * length is not known yet (the generating steps), never to decide the day.
 */
export const arrivesAfterLunchtime = (arriveAt: string): boolean => {
  const arrive = minutesOfClock(arriveAt);
  return arrive !== null && arrive + MEAL_HOP_MINUTES > LUNCH_LATEST_START;
};
