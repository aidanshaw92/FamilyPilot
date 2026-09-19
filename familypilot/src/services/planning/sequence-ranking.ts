import { DayItinerary, SequenceFailure, SequenceFailureReason } from '@/src/types/day-sequence';

/**
 * How candidate days and candidate failures are ordered.
 *
 * Both are comparators rather than weights. A weighted score has to be tuned so that one concern
 * outranks another, which means the ordering silently depends on the magnitude of unrelated
 * terms: an unconfirmed venue once beat a confirmed one because it happened to be schedulable 85
 * minutes earlier, and the only fix available was to make its penalty big enough to drown the
 * timing terms out. Comparing criteria in order says what is actually meant, and stays correct
 * when the scheduling score is retuned.
 */

/** Ascending: the better candidate sorts first. */
export function compareItineraries(a: DayItinerary, b: DayItinerary): number {
  // 1. A day nobody has had to guess about beats one built on unconfirmed hours, whatever else
  //    is true of it.
  if (a.openingConfidence.unknown !== b.openingConfidence.unknown) {
    return a.openingConfidence.unknown - b.openingConfidence.unknown;
  }
  // 2. Then the ordinary schedule and fairness score.
  if (a.score !== b.score) return b.score - a.score;
  // 3. Then deterministic tie-breakers, so the same inputs always give the same day.
  const startA = a.stops[0]?.arrive ?? 0;
  const startB = b.stops[0]?.arrive ?? 0;
  if (startA !== startB) return startA - startB;
  return a.stops.map((s) => s.placeId).join('>').localeCompare(b.stops.map((s) => s.placeId).join('>'));
}

/**
 * Which failure is worth reporting, most useful first.
 *
 * Ordered by how far into the day the attempt got before it stopped, because a later failure
 * means everything before it already worked and is the thing a person can actually act on. A
 * routine clash means every stop passed its opening check; a travel problem means nothing was
 * ever scheduled.
 */
const STAGE_ORDER: SequenceFailureReason[] = [
  'routine-conflict',
  'return-by-exceeded',
  'venue-closes-during-visit',
  'venue-closed',
  'travel-infeasible',
  'no-feasible-sequence',
  'invalid-request',
];

const stage = (failure: SequenceFailure): number => {
  const index = STAGE_ORDER.indexOf(failure.reason);
  return index === -1 ? STAGE_ORDER.length : index;
};

const stopPlaceId = (failure: SequenceFailure): string | null =>
  'placeId' in failure ? failure.placeId : null;

const stopIndexOf = (failure: SequenceFailure): number | null =>
  'stopIndex' in failure && typeof failure.stopIndex === 'number' ? failure.stopIndex : null;

/** A stable string for breaking ties, so an arbitrary choice is at least a repeatable one. */
const identity = (failure: SequenceFailure): string =>
  [failure.reason, stopPlaceId(failure) ?? '', 'familyId' in failure ? failure.familyId ?? '' : ''].join('|');

/**
 * Ascending: the failure worth reporting sorts first.
 *
 * The anchor rule applies only between two failures that are both about a stop. A routine clash
 * is not "a failure on an optional stop", so it is compared on how far it got rather than being
 * pushed behind anything that happens to name the anchor.
 */
export function compareFailures(a: SequenceFailure, b: SequenceFailure, anchorPlaceId: string): number {
  const placeA = stopPlaceId(a);
  const placeB = stopPlaceId(b);

  // 1. Between two stop failures, the one about the venue the day is built around.
  if (placeA !== null && placeB !== null) {
    const anchorA = placeA === anchorPlaceId ? 0 : 1;
    const anchorB = placeB === anchorPlaceId ? 0 : 1;
    if (anchorA !== anchorB) return anchorA - anchorB;
  }

  // 2. Then the deepest, most actionable stage reached.
  if (stage(a) !== stage(b)) return stage(a) - stage(b);

  // 3. Then the later stop, for the same reason.
  const indexA = stopIndexOf(a);
  const indexB = stopIndexOf(b);
  if (indexA !== null && indexB !== null && indexA !== indexB) return indexB - indexA;

  // 4. Then something stable.
  return identity(a).localeCompare(identity(b));
}

/** The failure worth reporting out of everything an attempt collected. */
export function mostRelevantFailure(
  failures: SequenceFailure[],
  anchorPlaceId: string,
): SequenceFailure | undefined {
  return [...failures].sort((a, b) => compareFailures(a, b, anchorPlaceId))[0];
}
