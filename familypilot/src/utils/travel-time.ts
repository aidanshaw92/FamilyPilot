import { TravelLeg, TravelMode } from '@/src/types/travel';

/**
 * How a travel time is worded, decided by how it was obtained.
 *
 * THE DEFECT THIS EXISTS TO FIX. Every venue card, saved row, restaurant card and detail header
 * printed a bare "14 min away". That number is a Haversine straight line divided by 40 km/h and
 * multiplied by 1.25 (`estimateDriveMinutes`): no road network, no traffic, no routing of any kind.
 * Phrased as "14 min away" it reads as a measurement, and a parent deciding whether a nap will
 * survive the trip is being given a guess in the voice of a fact.
 *
 * The Plan screen already got this right -- it labels each leg `Measured` or
 * `Estimated from distance` and counts how many are which -- so the inconsistency was within the
 * product, not just against the brief.
 *
 * WHICH NUMBERS ARE WHICH. Every `driveMinutes` on a `Venue`, `RestaurantDetail` or `StoreLocation`
 * is an estimate: `mergePlaceToVenue` computes it from coordinates and nothing downstream replaces
 * it (`personaliseVenue` explicitly carries the same value through). The one exception is
 * `FocusedRecommendation`, which may substitute a routed Distance Matrix value and already records
 * which it did in `journeySource`. So the provenance is never guessed here either: callers pass what
 * they know, and a caller that knows nothing gets the cautious wording rather than the confident one.
 */

/**
 * How a travel duration was obtained, in the two words the WORDING depends on.
 *
 * Narrower than the canonical `TravelSource` on purpose: a surface only needs to know whether it may
 * speak plainly, and `routed` and `cached-route` both mean yes. `travelSourceOfLeg` collapses the
 * canonical vocabulary into this one, so there is one place where that judgement is made rather than a
 * comparison repeated in every component.
 */
export type TravelTimeSource = 'measured' | 'estimated';

/** Re-exported rather than redefined: a second TravelMode is how the two drifted apart once already. */
export type { TravelMode } from '@/src/types/travel';

/**
 * Resolves the provider's vocabulary into ours.
 *
 * The journey endpoint says `live` for a routed element and `estimated` for one it fell back on.
 * Anything absent or unrecognised is treated as an estimate, because the failure to avoid is
 * presenting a guess as a measurement, not the reverse.
 */
export function travelSourceOf(source: 'live' | 'estimated' | undefined): TravelTimeSource {
  return source === 'live' ? 'measured' : 'estimated';
}

/**
 * Collapses the canonical `TravelSource` into the only distinction the wording turns on.
 *
 * `routed` and `cached-route` are both measurements over a real network, so both may be stated
 * plainly. `estimated-distance` may not. One place makes that call, rather than every component
 * comparing strings and one of them eventually getting it backwards.
 */
export function travelSourceOfLeg(leg: Pick<TravelLeg, 'source'>): TravelTimeSource {
  return leg.source === 'estimated-distance' ? 'estimated' : 'measured';
}

/**
 * The compact label for a card or a row: `about 14 min` or `14 min`.
 *
 * "about" rather than a tilde, because a tilde is easy to miss at caption size and means nothing to
 * a screen reader. It costs exactly one character more than the " away" it replaces, which the
 * locked Home frame is re-measured against rather than assumed to tolerate.
 */
export function travelTimeLabel(minutes: number, source: TravelTimeSource): string {
  if (!isTravelTimeKnown(minutes)) return UNKNOWN_TRAVEL_LABEL;
  const rounded = Math.max(1, Math.round(minutes));
  return source === 'measured' ? `${rounded} min` : `about ${rounded} min`;
}

/**
 * What to show when nobody has worked the journey out yet.
 *
 * NOT "0 min", AND NOT "about NaN min". A saved place restored from a cloud backup has no travel time by
 * design: the backup deliberately does not carry one, because a distance from the family's home is
 * personal, and because a cached distance is wrong rather than stale once a family moves. The first
 * version of that restore handed `Number.NaN` to this function, which computed
 * `Math.max(1, Math.round(NaN))` and produced the literal string "about NaN min" -- worse than the zero
 * it was avoiding. An unknown has to read as unknown.
 */
export const UNKNOWN_TRAVEL_LABEL = 'Travel time not worked out yet';

/** Whether a travel figure is a number anyone can act on. Guards every label in this module. */
export function isTravelTimeKnown(minutes: number | null | undefined): boolean {
  return typeof minutes === 'number' && Number.isFinite(minutes);
}

/** The same, naming the mode, for somewhere with room: `about 14 min drive`. */
export function travelTimeWithMode(
  minutes: number,
  source: TravelTimeSource,
  mode: TravelMode,
): string {
  // Without this the unknown label would gain a mode noun: "Travel time not worked out yet drive".
  if (!isTravelTimeKnown(minutes)) return UNKNOWN_TRAVEL_LABEL;
  return `${travelTimeLabel(minutes, source)} ${MODE_NOUN[mode]}`;
}

/**
 * Exhaustive over TravelMode, so adding a mode to the canonical type fails the compile here rather
 * than rendering `undefined` beside a duration. A bus says bus; anything else transit-shaped says
 * public transport, because calling a tram or a train "bus" is a claim about the mode.
 */
const MODE_NOUN: Record<TravelMode, string> = {
  drive: 'drive',
  walk: 'walk',
  cycle: 'cycle',
  transit: 'by public transport',
  bus: 'by bus',
};

/**
 * What a screen reader says. Spelled out, because "about 14 min" read aloud mid-sentence can be
 * heard as part of the venue's name, and because the distinction is the point.
 */
export function travelTimeSpoken(
  minutes: number,
  source: TravelTimeSource,
  mode: TravelMode = 'drive',
): string {
  // Guarded for the same reason as the visible label, and separately, because a screen-reader string
  // saying "NaN minutes drive" is the version nobody would ever see in review.
  if (!isTravelTimeKnown(minutes)) return UNKNOWN_TRAVEL_LABEL;
  const rounded = Math.max(1, Math.round(minutes));
  const unit = rounded === 1 ? 'minute' : 'minutes';
  const noun = mode === 'drive' ? 'drive' : MODE_NOUN[mode];
  return source === 'measured'
    ? `${rounded} ${unit} ${noun}`
    : `roughly ${rounded} ${unit} ${noun}, estimated from distance rather than measured`;
}
