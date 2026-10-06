import type { EnrichmentStatus, VenueCategory } from '@/src/types';
import type {
  DayItinerary,
  PlanningClock,
  SequenceFailure,
  StopRole,
} from '@/src/types/day-sequence';
import type { MatchableVenueFacts } from '@/src/types/day-request';
import type { MissingJourneyLeg } from '@/src/types/journey-matrix-build';
import type { OpeningHoursSchedule } from '@/src/types/opening-hours';
import type { VenueFamilyMetadata } from '@/src/types/places';
import type { VisitResolution } from '@/src/services/planning/visit-duration';

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
  /**
   * Facts the caller has already extracted, where it holds those rather than the metadata.
   *
   * The venue detail screen is the case this exists for: it carries what `extractMatchableFacts`
   * produced for the same venue and does not keep the projected metadata that went into it. Asking
   * the planner to rebuild the facts from metadata it would find absent turns every confirmed
   * facility into an unknown, and a required facility that reads unknown fails the day closed —
   * so a venue with confirmed toilets would silently yield no plan at all.
   *
   * Set this or `familyMetadata`, never both halves of the same venue from different sources. Both
   * paths end at the same extractor; only where it ran differs.
   */
  facts?: MatchableVenueFacts;
}

export interface DayPlanOptions {
  /** The earliest the family could leave home. With `arriveAt` set it is only a floor, and `'00:00'` is the usual floor. */
  leaveAt: string;
  /**
   * When the family wants to arrive at the first stop (`HH:MM`): the parent's chosen start. Leaving home is worked
   * back from it. Omitted, the sequencer scans forward from `leaveAt` for the earliest arrival that fits.
   */
  arriveAt?: string;
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
  /**
   * How the anchor's length was settled, so the day can say it. When its basis is an assumption ('venue-typical',
   * 'category-typical') the planner may shorten it to get everyone home before a routine that has to happen at
   * home; a length the parent chose is never changed.
   */
  visit?: VisitResolution;
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
  | { kind: 'traffic-not-predictive'; planDate: string }
  /**
   * The nearby-food lookup failed, so the day has no lunch stop for a reason that is ours.
   *
   * Without this, a broken lookup and a genuinely empty neighbourhood produce the same plan: a day
   * with no lunch and no explanation, from which a parent can only conclude there is nowhere to eat
   * near the venue. That is a false impression created by omission, which is the one thing this
   * whole surface exists to avoid. Venue Detail already makes the distinction; the plan did not.
   *
   * Not derivable from the itinerary, so it is passed in by the screen that ran the lookup.
   */
  | { kind: 'meal-lookup-failed' };

export interface TravelDiagnostics {
  provenance: { live: number; estimated: number };
  trafficDowngraded: boolean;
  /**
   * Legs the matrix could not supply. Reported on success too: the chosen day did not need them,
   * which is worth knowing rather than hiding.
   */
  missing: MissingJourneyLeg[];
}

/**
 * A different way to run the same day that clears a routine overlap, worked out by actually re-sequencing it.
 *
 * Never a guess: each one was built with the same matrix and checked against opening hours and every limit, and it is
 * only offered if it removes at least one routine overlap without adding another. The screen turns one into a single
 * tap that changes the plan's start or length.
 */
export interface PlanAlternative {
  kind: 'earlier' | 'later' | 'shorter';
  /** When the family would arrive at the first stop, `HH:MM`. */
  arriveAt: string;
  /** Time at the main venue. */
  visitMinutes: number;
  /** Routine overlaps this removes. */
  resolves: { familyId: string; routineId: string }[];
}

export interface DayPlanSuccess {
  itinerary: DayItinerary;
  /** How long at the main venue, and why. */
  visit: VisitResolution;
  alternatives: PlanAlternative[];
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
