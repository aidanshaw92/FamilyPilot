import type { OpeningHoursReason } from '@/src/utils/opening-hours';
import type { MatchableVenueFacts } from '@/src/types/day-request';
import type { OpeningHoursSchedule } from '@/src/types/opening-hours';

/**
 * A day built from several stops, rather than one venue with a padded visit length.
 *
 * Stops and legs are modelled separately and deliberately. The existing `addMeal` path fakes a
 * two-stop day by inflating the first venue's `visitMinutes` to cover the transfer and the meal,
 * which leaves the drive invisible to routine checks and the meal unschedulable in its own right.
 * Here a leg is a first-class thing with its own departure and arrival, so nothing is hidden
 * inside another stop's duration.
 *
 * Every time is minutes from midnight on the planned date, in the venue's local day — the same
 * convention `planner.ts` already uses, so `clockLabel` renders these unchanged.
 */

/**
 * The time a plan is being made at, already resolved into the timezone the plan is about.
 *
 * A `Date` is read in the host's timezone, which is right for a device planning its own day and
 * wrong for a service planning a venue's: near midnight the two disagree about what day it is,
 * and about how much of today is left. Resolving once, up front, means matrix construction and
 * sequencing cannot reach different conclusions from the same instant.
 *
 * Lives here rather than beside the sequencer because both the sequencer and the day-plan result
 * carry it, and the result types should not have to depend on a service module to name it.
 */
export interface PlanningClock {
  /** YYYY-MM-DD in the planning timezone. */
  today: string;
  /** Wall-clock minutes past midnight in that same timezone. */
  nowMinutes: number;
  timezone: string;
}

/** Lunch is a stop like any other, not an add-on folded into a neighbouring visit. */
export type StopRole = 'activity' | 'meal';

/** Home is per family; a stop is shared by everyone on the day. */
export type LegEndpoint =
  | { kind: 'home'; familyId: string }
  | { kind: 'stop'; index: number; placeId: string };

/** `home:<familyId>` or `stop:<placeId>`. */
export type JourneyNodeKey = string;

export interface JourneyLegEstimate {
  minutes: number;
  /** Estimated journeys are labelled as such wherever they reach a person. */
  source: 'live' | 'estimated';
}

/**
 * Every travel time the sequencer is allowed to use, precomputed by the caller.
 *
 * `sequenceDay` is pure: it never calls a travel provider, Google, or Supabase. Whoever builds
 * this matrix owns that I/O, which keeps sequencing testable against realistic matrices and
 * leaves live-travel integration to its own change.
 *
 * A missing entry means "not known" and fails the leg that needs it, rather than being filled in
 * with a guess.
 */
export interface JourneyMatrix {
  legs: Record<JourneyNodeKey, Record<JourneyNodeKey, JourneyLegEstimate>>;
}

/** What the caller asks for: a candidate stop, before it has a time. */
export interface StopRequest {
  placeId: string;
  name: string;
  role: StopRole;
  /**
   * The venue the day is built around — the one chosen on Home.
   *
   * Exactly one request must be the anchor. It is never dropped, reordered out of the day, or
   * swapped for a different venue: a sequence that cannot include it is a failure, not an
   * opportunity to propose somewhere else.
   */
  anchor: boolean;
  dwellMinutes: number;
  facts: MatchableVenueFacts;
  /** Structured hours where the provider gave them. Absent is unknown, never "closed". */
  openingHours?: OpeningHoursSchedule;
}

/**
 * What the sequencer concluded about a stop's hours.
 *
 * `closed` never appears here — a closed stop fails the sequence instead. `unknown` is carried
 * through as itself and surfaced in the itinerary's unknowns, so it can never be read as a
 * confirmed opening.
 */
export interface StopOpening {
  status: 'open' | 'unknown';
  reason: OpeningHoursReason;
  /** Venue-local `HH:MM`, when the schedule supplied a closing time. */
  closesAt?: string;
}

/** A stop once it has a place in the day. */
export interface SequenceStop {
  /** Position in the day, 0-based. */
  index: number;
  placeId: string;
  name: string;
  role: StopRole;
  anchor: boolean;
  arrive: number;
  depart: number;
  dwellMinutes: number;
  opening: StopOpening;
}

interface SequenceLegBase {
  from: LegEndpoint;
  to: LegEndpoint;
  depart: number;
  arrive: number;
  travelMinutes: number;
  /** Settling time held either side of a drive, kept visible rather than absorbed into travel. */
  bufferMinutes: number;
  source: 'live' | 'estimated';
}

/**
 * A journey between two points in the day, scheduled in its own right.
 *
 * Split by kind rather than carrying a list of family ids, because households start and finish at
 * their own homes and so have their own travel times. One duration shared across several families
 * cannot represent that, and a single shape would let it be written by accident: a rendezvous or
 * return leg belongs to exactly one family, and only the transfers between stops — where everyone
 * is already travelling together — are shared.
 */
export type SequenceLeg =
  /** One family leaving home for the first stop, at their own pace. */
  | (SequenceLegBase & { kind: 'rendezvous'; familyId: string })
  /** Everyone moving between two stops together. */
  | (SequenceLegBase & { kind: 'transfer'; familyIds: string[] })
  /** One family heading home from the last stop. */
  | (SequenceLegBase & { kind: 'return'; familyId: string });

export interface SequenceFamilyTiming {
  familyId: string;
  label: string;
  /** Leaves home. */
  depart: number;
  /** Back home. */
  home: number;
  /** Latest this family could have left and still made the day work. */
  latestDeparture: number;
  notes: string[];
}

export interface DayItinerary {
  date: string;
  /** In visit order. */
  stops: SequenceStop[];
  /** In chronological order. Travel is never folded into a stop's duration. */
  legs: SequenceLeg[];
  families: SequenceFamilyTiming[];
  /** Everything the day rests on that nobody has confirmed, including unknown opening hours. */
  unknowns: string[];
  /**
   * How many stops have confirmed hours against how many nobody has checked.
   *
   * Exposed as counts rather than left to be inferred from `score`, so candidate selection can
   * prefer confirmed-open venues explicitly instead of depending on the weighting of a scalar.
   */
  openingConfidence: { confirmed: number; unknown: number };
  reasons: string[];
  fairnessGap: number;
  score: number;
}

export type SequenceFailureReason =
  | 'venue-closed'
  | 'venue-closes-during-visit'
  | 'routine-conflict'
  | 'travel-infeasible'
  | 'return-by-exceeded'
  | 'no-feasible-sequence'
  | 'invalid-request';

/**
 * Why a day could not be built, in enough detail to say something useful to a person.
 *
 * `planVenue` returns null for a dozen distinct reasons and the caller cannot tell them apart.
 * Here the reason survives, along with which stop and — for the most fixable case — the time the
 * venue shuts.
 */
export type SequenceFailure =
  | {
      reason: 'venue-closed';
      message: string;
      stopIndex: number;
      placeId: string;
      date: string;
    }
  | {
      reason: 'venue-closes-during-visit';
      message: string;
      stopIndex: number;
      placeId: string;
      /** Venue-local `HH:MM` the stop would have had to end by. */
      closesAt?: string;
    }
  | {
      reason: 'routine-conflict';
      message: string;
      familyId: string;
      routineLabel: string;
      stopIndex?: number;
    }
  | {
      reason: 'travel-infeasible';
      message: string;
      from: LegEndpoint;
      to: LegEndpoint;
      familyId?: string;
      travelMinutes?: number;
      limitMinutes?: number;
    }
  | {
      reason: 'return-by-exceeded';
      message: string;
      familyId: string;
      homeAt: number;
      returnBy: number;
    }
  | {
      reason: 'no-feasible-sequence';
      message: string;
      /** How many orderings and start times were tried before giving up. */
      attempts: number;
      /** The closest miss, so the caller can say what actually stood in the way. */
      nearest?: SequenceFailure;
    }
  | {
      reason: 'invalid-request';
      message: string;
    };

export type SequenceResult =
  | { ok: true; itinerary: DayItinerary }
  | { ok: false; failure: SequenceFailure };

/** Three non-home stops. Home origin and the return leg are not stops. */
export const MAX_SEQUENCE_STOPS = 3;
