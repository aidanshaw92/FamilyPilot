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

/** Which part of the family's outing a routine falls in. */
export type RoutinePhase = 'outbound' | 'visit' | 'transfer' | 'return';

/**
 * A routine (a nap or a feed) falling inside the time a family is out, as the sequencer found it.
 *
 * Structural on purpose. It says WHICH routine, WHEN and DURING WHAT; it carries no child's name and no judgement.
 * Whether an overlap is a worry is decided later, with what the venue offers in front of it (buggy access, food on
 * site, a café nearby), by `routine-advice.ts`. Keeping names out of here is also what keeps the saved plan, which
 * can be backed up, free of children's names: the screen resolves `routineId` against the local profile.
 *
 * A routine overlapping the outing is never a reason to refuse the day. See `DayItinerary.routineInsights`.
 */
export interface RoutineInsight {
  familyId: string;
  routineId: string;
  kind: 'nap' | 'feed';
  /** The family's own flag: this routine normally happens at home. A preference, not a gate. */
  atHome: boolean;
  /** The routine's usual window, minutes from midnight. */
  start: number;
  end: number;
  phase: RoutinePhase;
  /** For `visit`, the stop index; for `transfer`, the index of the stop the leg leaves. */
  stopIndex?: number;
  /** The span of the outing the routine overlaps, so advice can say "your drive home, 12:10 to 12:40". */
  span: { from: number; to: number };
  overlapMinutes: number;
}

/** The next routine that falls after a family is home again: good news to say ("home before his nap"). */
export interface HomeAfterRoutine {
  familyId: string;
  routineId: string;
  kind: 'nap' | 'feed';
  start: number;
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
  /**
   * Every routine that falls while a family is out, by where in the day it falls. Never a failure: a routine
   * overlapping the outing is something to advise on (see routine-advice.ts), not a reason to refuse the day.
   */
  routineInsights: RoutineInsight[];
  /** The next routine after each family is home, if any. */
  homeAfter: HomeAfterRoutine[];
  /**
   * Must-haves a family stated that nobody has confirmed at a stop. The day is built regardless; the screen says plainly
   * what needs checking. A must-have confirmed MISSING is a failure (`requirement-unmet`), never an entry here.
   */
  unresolvedMustHaves: UnresolvedMustHave[];
}

export type SequenceFailureReason =
  | 'requirement-unmet'
  | 'venue-closed'
  | 'venue-closes-during-visit'
  | 'start-too-soon'
  | 'routine-conflict'
  | 'travel-unknown'
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
/** A required constraint that stood in the way, and whether the venue failed it or nobody knows. */
export interface UnmetRequirement {
  /** The matcher's own field name, e.g. `babyChanging`, `journey`, `ageAdmission`. */
  field: string;
  /** `unsuitable` is a fact that fails; `unknown` is a fact nobody has confirmed. */
  outcome: 'unsuitable' | 'unknown';
  /** The venue's own reviewed sentence, when the requirement failed because of a recorded venue rule. */
  detail?: string;
}

/**
 * A must-have a family named that nobody has confirmed at a stop. NOT a reason to refuse the day: only a must-have that is
 * confirmed missing does that. The plan is built and this is carried as a prominent warning, with what needs checking.
 */
export interface UnresolvedMustHave {
  familyId: string;
  familyLabel: string;
  stopIndex: number;
  placeId: string;
  stopName: string;
  /** The matcher's own field name, e.g. `familyFacilities.babyChanging`. */
  field: string;
}

export type SequenceFailure =
  | {
      /**
       * The day schedules perfectly and the venue still does not suit the family.
       *
       * Its own reason rather than a `no-feasible-sequence`, because nothing about the ordering or
       * the times would fix it and a parent needs to be told which requirement it was. An unmet
       * requirement that nobody has confirmed is reported as unconfirmed, never as an absence.
       */
      reason: 'requirement-unmet';
      message: string;
      stopIndex: number;
      placeId: string;
      familyId: string;
      familyLabel: string;
      unmet: UnmetRequirement[];
    }
  | {
      reason: 'venue-closed';
      message: string;
      stopIndex: number;
      placeId: string;
      date: string;
      /**
       * Shut for the whole day, or open that day but not at the time asked. The words differ ("closed that day" against
       * "isn’t open then") and so does what to try.
       */
      why?: 'closed-that-day' | 'outside-opening-period';
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
      /**
       * Retained for old callers and tests; the sequencer no longer produces it. A routine overlapping the day is
       * advice (`DayItinerary.routineInsights`), never a refusal.
       */
      reason: 'routine-conflict';
      message: string;
      familyId: string;
      routineLabel: string;
      stopIndex?: number;
    }
  | {
      /**
       * The start the parent chose cannot be reached: leaving home on time would have to happen in the past (or
       * before the earliest the family can leave). Carries the first arrival that WOULD work, so the screen can offer
       * it as one tap rather than a lecture.
       */
      reason: 'start-too-soon';
      message: string;
      familyId: string;
      /** Minutes from midnight: the earliest arrival at the first stop that every family could make. */
      earliestArrival: number;
    }
  | {
      /**
       * A leg nobody could measure OR estimate. Its own reason, deliberately apart from
       * `travel-infeasible`.
       *
       * It used to be reported as infeasible, and the screen then said "The journey is too long" and
       * advised raising the travel limit -- about a journey that had never been timed. That mislabels
       * unknown as a fact, which is the one thing this product's provenance rules exist to prevent. An
       * unknown journey is a lookup problem to retry or a home location to check; it is not a parent's
       * limit being too small, and the suggestions have to follow the real cause.
       */
      reason: 'travel-unknown';
      message: string;
      from: LegEndpoint;
      to: LegEndpoint;
      familyId?: string;
    }
  | {
      reason: 'travel-infeasible';
      message: string;
      from: LegEndpoint;
      to: LegEndpoint;
      familyId?: string;
      travelMinutes?: number;
      limitMinutes?: number;
      /**
       * Where `travelMinutes` came from, carried so the presentation layer can word it honestly.
       *
       * Without this, `create-plan` had to guess, and it guessed one way for every failure: it said
       * "about N minutes" even when the matrix leg was routed. Hedging a measurement is the same
       * class of error as stating an estimate exactly, and this is the message that stops a plan, so
       * it is the last place to be vague about which one we have. Absent means unknown, which is
       * worded as an estimate.
       */
      travelSource?: 'live' | 'estimated';
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
