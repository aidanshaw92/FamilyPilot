import type { JourneyMatrix, StopRequest } from '@/src/types/day-sequence';
import type { PlanningFamily } from '@/src/services/planning/planner';

/**
 * Turning family homes and a day's stops into the matrix `sequenceDay` consumes.
 *
 * The split matters: the builder owns every network call, and `sequenceDay` owns none. Keeping
 * the provider behind one injected function is what lets the whole of matrix construction be
 * tested against recorded provider responses, including the ones that come back degraded.
 *
 * PR 4 deliberately does not change the provider contract. The endpoint asks Google for current
 * traffic and nothing here pretends otherwise: a plan for another date is recorded as estimated
 * whatever the provider said, because traffic measured now is not traffic on the day.
 *
 * Follow-up, not this change: time-aware refinement — departure times per leg, predictive traffic
 * — belongs on Google's Routes API (Compute Route Matrix), not on a wider integration with the
 * legacy Distance Matrix endpoint this builder calls.
 */

/** One origin and its destinations, exactly as the journey endpoint accepts them. */
export interface JourneyProbe {
  origin: { latitude: number; longitude: number };
  destinations: Array<{
    /**
     * Echoed back untouched by the provider, so the sequencer's own node keys travel as the
     * correlation id and responses map home with no lookup table.
     */
    placeId: string;
    latitude: number;
    longitude: number;
  }>;
}

/** What one probe came back with, per destination. */
export interface JourneyProbeResult {
  journeys: Array<{
    placeId: string;
    driveMinutes: number;
    /**
     * This element's own provenance. Never the batch's: the endpoint reports the batch as `live`
     * when any single element was live, which would launder estimates into measurements.
     */
    source: 'live' | 'estimated';
  }>;
}

/**
 * The only way the builder reaches the network.
 *
 * A single function rather than the client class, so tests supply recorded responses — including
 * partial ones — without a transport, and so nothing else can quietly acquire I/O.
 */
export type JourneyProbeFn = (probe: JourneyProbe) => Promise<JourneyProbeResult>;

export interface BuildJourneyMatrixDeps {
  probe: JourneyProbeFn;
  /**
   * The date the day is planned for, `YYYY-MM-DD`. Compared against `today` to decide whether a
   * traffic-derived timing may keep its `live` provenance.
   */
  planDate: string;
  /** Venue-local today, injected so the decision is testable and the builder keeps no clock. */
  today: string;
}

/** Where a leg could not be obtained, and why — carried alongside the matrix rather than thrown. */
export interface MissingJourneyLeg {
  from: string;
  to: string;
  reason: 'no-element-returned' | 'invalid-coordinates' | 'probe-failed';
}

export interface JourneyMatrixBuild {
  /**
   * Legs that were obtained. A leg the provider estimated is **present and labelled**; only a leg
   * that never came back is absent, and `sequenceDay` already reports an absent leg as
   * `travel-infeasible` naming both endpoints.
   */
  matrix: JourneyMatrix;
  /** Legs that could not be obtained, so a caller can say what is unknown rather than guess. */
  missing: MissingJourneyLeg[];
  /** Per-leg counts, for reporting how much of a day rests on estimates. */
  provenance: { live: number; estimated: number };
  /**
   * True when the plan is for another date, in which case no leg carries `live` however the
   * provider answered.
   */
  trafficDowngraded: boolean;
}

export interface BuildJourneyMatrixInput {
  families: PlanningFamily[];
  /** Exactly the stops the day may contain; the anchor is identified by `StopRequest.anchor`. */
  stops: StopRequest[];
}

/**
 * The provider truncates a destination list past this silently, returning fewer elements with no
 * error. The builder asserts against it rather than relying on that behaviour, so a fourth family
 * or a raised cap cannot become a day with mysteriously missing legs.
 *
 * Mirrors `MAX_DESTINATIONS` in `server/context/lib/journey-provider.js`.
 */
export const PROVIDER_MAX_DESTINATIONS = 25;

/**
 * Stop coordinates, which `StopRequest` does not carry — its `facts` are matching facts, not a
 * location. Supplied beside the stops rather than bolted onto the sequencer's own type.
 */
export interface StopLocation {
  placeId: string;
  latitude: number;
  longitude: number;
}
