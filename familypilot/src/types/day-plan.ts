import type { EnrichmentStatus, VenueCategory } from '@/src/types';
import type {
  DayItinerary,
  PlanningClock,
  SequenceFailure,
  StopRole,
} from '@/src/types/day-sequence';
import type { MissingJourneyLeg } from '@/src/types/journey-matrix-build';
import type { OpeningHoursSchedule } from '@/src/types/opening-hours';
import type { VenueFamilyMetadata } from '@/src/types/places';

/**
 * The shape of a generated day, and of every way generating one can fail.
 *
 * Orchestration composes three merged pieces — the journey matrix, the sequencer, and the
 * opening-hours evaluator — and its job is to keep each one's diagnosis intact rather than
 * flattening them. "No plan found" tells a family nothing they can act on; "the gallery shuts at
 * 18:00, before your visit would finish" tells them to go earlier.
 */

/**
 * A stop the caller has already chosen, narrowed to what planning needs.
 *
 * Deliberately not `ExternalPlaceRecord`: the planner has no business knowing about photos,
 * websites, provider ids or fetch timestamps. Coordinates and opening hours travel together in
 * one object, so a location and a schedule cannot drift apart the way a parallel lookup table
 * would allow.
 */
export interface ResolvedStop {
  placeId: string;
  name: string;
  category: VenueCategory;
  role: StopRole;
  dwellMinutes: number;
  latitude: number;
  longitude: number;
  /** Structured hours where the provider gave them. Absent is unknown, never "closed". */
  openingHours?: OpeningHoursSchedule;
  isOpen?: boolean;
  enrichmentStatus?: EnrichmentStatus;
  familyMetadata?: VenueFamilyMetadata;
}

export interface DayPlanOptions {
  leaveAt: string;
  /** `''` for no deadline. */
  returnBy: string;
  bufferMinutes: number;
  environment: 'either' | 'indoor' | 'outdoor';
  /** Overrides the timezone the anchor's own schedule carries. */
  timezone?: string;
}

/**
 * Everything needed to build one day, all of it already resolved.
 *
 * Discovery is a separate concern: nothing here searches for a venue or a restaurant, so the
 * caller has already decided where the day goes.
 */
export interface DayPlanRequest {
  date: string;
  families: import('@/src/services/planning/planner').PlanningFamily[];
  /** The venue the day is built around. Always the first stop. */
  anchor: ResolvedStop;
  /** Always the second stop when present. */
  meal?: ResolvedStop;
  secondActivity?: ResolvedStop;
  options: DayPlanOptions;
}

/**
 * Something true about the day that does not stop it happening.
 *
 * Typed rather than prose, because a screen has to decide what to show and cannot do that by
 * reading sentences. Each kind carries what it would take to render it.
 */
export type PlanCaveat =
  /** Nobody has confirmed this venue's hours, so the visit is scheduled but unverified. */
  | { kind: 'opening-hours-unknown'; placeId: string; name: string }
  /** Some journeys are distance estimates rather than measured road times. */
  | { kind: 'travel-estimated'; legs: number }
  /** The plan is for another day, so current traffic was not treated as predictive. */
  | { kind: 'traffic-not-predictive'; planDate: string };

export interface TravelDiagnostics {
  provenance: { live: number; estimated: number };
  trafficDowngraded: boolean;
  /**
   * Legs the matrix could not supply. Reported on success too: the chosen day did not need them,
   * which is worth knowing rather than hiding.
   */
  missing: MissingJourneyLeg[];
}

export interface DayPlanSuccess {
  itinerary: DayItinerary;
  travel: TravelDiagnostics;
  caveats: PlanCaveat[];
  /** Which clock the day was planned against, so the answer can be explained and audited. */
  clock: PlanningClock;
}

export type PlanGenerationFailure =
  | { kind: 'invalid-request'; message: string; field?: string }
  /**
   * The matrix could not be built at all. Carries no `missing` list, because a builder that threw
   * never produced one and inventing an empty one would read as "nothing was missing".
   */
  | { kind: 'matrix-unavailable'; message: string }
  | {
      kind: 'sequencing-failed';
      /** The sequencer's own verdict, whole. Closed venues, closing times, routines and return times all survive. */
      failure: SequenceFailure;
      travel: TravelDiagnostics;
      /**
       * Set when the sequencer could not find a journey and the matrix knows why it is absent.
       * The sequencer knows a leg was needed; the builder knows whether the probe failed, the
       * coordinates were unusable, or the provider simply returned nothing. Only here do both
       * halves meet.
       */
      blamedLeg?: MissingJourneyLeg;
    };

export type PlanGenerationResult =
  | { ok: true; plan: DayPlanSuccess }
  | { ok: false; failure: PlanGenerationFailure };

/** FamilyPilot is London-only for now; this is the explicit default, never the device's timezone. */
export const PLANNING_TIMEZONE_FALLBACK = 'Europe/London';
