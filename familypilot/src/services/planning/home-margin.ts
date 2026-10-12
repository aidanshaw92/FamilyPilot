import { DayItinerary } from '@/src/types/day-sequence';

/**
 * How much room a day leaves before the next routine at home.
 *
 * The sequencer records a routine the family is home BEFORE (`homeAfter`) whenever home time is at or before the
 * routine's start. "At or before" includes four minutes before: home 12:56 for a 13:00 nap was reported as good news,
 * with a tick, although the only thing between the two was the settling buffer and a journey time estimated from
 * distance. This module measures that margin and names it, so the screen can say "tight" instead of "fine".
 *
 * The margin is the time between getting home (settling buffer included, as the sequencer counts it) and the routine's
 * start. It has to cover whatever the journey estimate was wrong by, so it is wider when the journey is an estimate
 * from distance than when it was measured. Below the threshold the routine is tight; the plan still stands.
 *
 * Pure; no clock, no I/O.
 */

export const TIGHT_HOME_MARGIN_MINUTES = { estimated: 15, live: 10 } as const;

/** The number of minutes "Consider leaving 15 minutes earlier" suggests, and the first offset tried for a verified option. */
export const TIGHT_HOME_EARLIER_MINUTES = 15;

export interface HomeMargin {
  familyId: string;
  routineId: string;
  kind: 'nap' | 'feed';
  /** When the routine starts, minutes from midnight. */
  start: number;
  /** When the family is home, settling buffer included. */
  home: number;
  /** `start - home`, never negative here (a routine missed is a clash, reported elsewhere). */
  marginMinutes: number;
  /** How the journey home was timed. Unknown reads as estimated: the wider margin applies. */
  source: 'live' | 'estimated';
  /** True when the margin is below the threshold for that kind of journey. */
  tight: boolean;
}

/** How the family's journey home was timed, from the leg that ends at their home. */
export function returnJourneySource(itinerary: Pick<DayItinerary, 'legs'>, familyId: string): 'live' | 'estimated' {
  const leg = itinerary.legs.find((candidate) => candidate.to.kind === 'home' && candidate.to.familyId === familyId);
  return leg?.source === 'live' ? 'live' : 'estimated';
}

export function homeMargins(itinerary: Pick<DayItinerary, 'homeAfter' | 'families' | 'legs'>): HomeMargin[] {
  const margins: HomeMargin[] = [];
  for (const after of itinerary.homeAfter ?? []) {
    const family = itinerary.families.find((f) => f.familyId === after.familyId);
    if (!family) continue;
    const source = returnJourneySource(itinerary, after.familyId);
    const marginMinutes = Math.max(0, after.start - family.home);
    margins.push({
      familyId: after.familyId,
      routineId: after.routineId,
      kind: after.kind,
      start: after.start,
      home: family.home,
      marginMinutes,
      source,
      tight: marginMinutes < TIGHT_HOME_MARGIN_MINUTES[source],
    });
  }
  return margins;
}

export const isTightMargin = (margin: Pick<HomeMargin, 'tight'>): boolean => margin.tight;
