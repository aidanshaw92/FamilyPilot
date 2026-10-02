/**
 * How FamilyPilot describes a journey between two points.
 *
 * WHY THIS IS AN OBJECT AND NOT A NUMBER. The product grew up around `driveMinutes`: a bare integer,
 * one mode, one origin, no record of where it came from. Every honesty defect in the travel surfaces
 * traced back to that shape -- a Haversine estimate and a routed journey are the same `number`, so
 * nothing downstream could tell them apart and every screen printed the estimate as a measurement.
 *
 * A bare number also silently assumes one origin, which makes the multi-household case ("two families
 * leave from different homes and meet at one venue") a rewrite rather than an addition.
 *
 * So a journey carries its mode, its duration, how it was obtained, and optionally who it was
 * measured between. Nothing here commits to a provider, and nothing here is a UI decision.
 */

/** The modes the product can describe. */
export type TravelMode = 'walk' | 'drive' | 'transit' | 'bus' | 'cycle';

/**
 * How a duration was obtained. The distinction a parent is entitled to.
 *
 * - `routed` — a route provider computed it over a real network. Shown plainly: `8 min`.
 * - `cached-route` — a previously routed value, re-read rather than re-bought. Still a routed figure,
 *   but it may be older than now, which matters for anything traffic-aware.
 * - `estimated-distance` — straight-line distance over an assumed speed. Shown hedged:
 *   `about 8 min`. Never presented as routed.
 */
export type TravelSource = 'routed' | 'cached-route' | 'estimated-distance';

/**
 * How much weight the number deserves.
 *
 * Deliberately coarse. A finer scale would imply a calibration nobody has done, and the only decision
 * it drives today is whether a surface shows the figure at all.
 */
export type TravelConfidence = 'high' | 'medium' | 'low';

/**
 * One journey, one mode.
 *
 * `from` and `to` are optional and exist for the multi-origin future: a leg between a named household
 * and a named stop is expressible now, so adding a second household later does not require this type
 * to change. Nothing populates them for the single-origin case, which keeps today's code unchanged.
 */
export interface TravelLeg {
  mode: TravelMode;
  durationMinutes: number;
  source: TravelSource;
  confidence: TravelConfidence;
  /** Identifier of the origin, where more than one is possible. */
  from?: string;
  /** Identifier of the destination, where it is worth stating. */
  to?: string;
}

/** Whether a leg may be presented as a measured journey. The one question every surface asks. */
export function isRouted(leg: Pick<TravelLeg, 'source'>): boolean {
  return leg.source === 'routed' || leg.source === 'cached-route';
}

/**
 * A straight-line estimate, built in one place so the assumptions are stated once.
 *
 * `confidence` is 'low' for walking and 'medium' for driving, for a concrete reason: a detour factor
 * applied to a straight line is a much worse model of a walk than of a drive. A pedestrian route bends
 * around blocks, crossings, rivers and railways, and a river in the way can double the real journey
 * while leaving the straight line untouched. Roads at least roughly follow the direction of travel.
 */
export function estimatedLeg(
  mode: TravelMode,
  durationMinutes: number,
  over: Partial<TravelLeg> = {},
): TravelLeg {
  return {
    mode,
    durationMinutes: Math.max(1, Math.round(durationMinutes)),
    source: 'estimated-distance',
    confidence: mode === 'walk' ? 'low' : 'medium',
    ...over,
  };
}

/** A routed leg, from a provider that actually computed it over a network. */
export function routedLeg(
  mode: TravelMode,
  durationMinutes: number,
  over: Partial<TravelLeg> = {},
): TravelLeg {
  return {
    mode,
    durationMinutes: Math.max(1, Math.round(durationMinutes)),
    source: 'routed',
    confidence: 'high',
    ...over,
  };
}
