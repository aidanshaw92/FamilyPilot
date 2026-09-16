import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';
import {
  DayItinerary,
  JourneyLegEstimate,
  JourneyMatrix,
  JourneyNodeKey,
  LegEndpoint,
  MAX_SEQUENCE_STOPS,
  SequenceFailure,
  SequenceFamilyTiming,
  SequenceLeg,
  SequenceResult,
  SequenceStop,
  StopOpening,
  StopRequest,
} from '@/src/types/day-sequence';
import { isOpenOn } from '@/src/utils/opening-hours';

import { PlanningFamily, PlanningOptions, ageRangeExcludes, familyRequest } from './planner';
import {
  RoutineWindow,
  TimeSpan,
  clockMinutes,
  homeBeforeNote,
  homeRoutineConflict,
  nextHomeRoutineAfter,
  outOfHomeNotes,
  routineWindows,
  travelRoutineConflict,
} from './routine-windows';

/**
 * Builds a day out of several stops: activity, lunch, optional second activity, home.
 *
 * Pure by construction. Every travel time it is allowed to use arrives in the `JourneyMatrix`,
 * precomputed by the caller — this never calls a travel provider, Google or Supabase. Mixing
 * sequencing with I/O would make the interesting logic untestable and is left to the travel-legs
 * change.
 *
 * Two things it will not do. It never substitutes the anchor venue: the place chosen on Home is
 * what the day is built around, so a day that cannot include it is a failure rather than an
 * invitation to propose somewhere else. And it never reads an unconfirmed opening as an open one;
 * unknown hours are scheduled but carried in `unknowns`, because 107 of the 122 live rows have no
 * structured hours yet and refusing them would return nothing at all.
 */

const SCAN_STEP_MINUTES = 5;
const MAX_FAMILIES = 6;
const MIN_DWELL_MINUTES = 15;
const MAX_DWELL_MINUTES = 480;
const MAX_BUFFER_MINUTES = 60;
const END_OF_DAY = 1439;
/**
 * A stop whose hours nobody has confirmed costs more than any scheduling term can win back.
 *
 * Deliberately dominant. The timing terms below reach roughly 45 across a day, so a smaller
 * penalty lets an unverified venue outrank a confirmed one purely by being schedulable earlier —
 * which is the opposite of the intended preference. Making it lexicographic keeps "confirmed open
 * beats unknown" true regardless of how the rest of the day falls.
 */
const UNKNOWN_HOURS_PENALTY = 100;

export interface SequenceOptions extends Pick<PlanningOptions, 'date' | 'leaveAt' | 'returnBy' | 'bufferMinutes' | 'environment'> {
  /** Overrides the timezone each stop's own schedule carries. */
  timezone?: string;
}

export const homeKey = (familyId: string): JourneyNodeKey => `home:${familyId}`;
export const stopKey = (placeId: string): JourneyNodeKey => `stop:${placeId}`;

function leg(matrix: JourneyMatrix, from: JourneyNodeKey, to: JourneyNodeKey): JourneyLegEstimate | undefined {
  return matrix.legs[from]?.[to];
}

/** `HH:MM` on the planned day. Times are clamped into the day because a stop never spans midnight here. */
function hhmm(minutes: number): string {
  const within = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(within / 60)).padStart(2, '0')}:${String(within % 60).padStart(2, '0')}`;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]),
  );
}

const invalid = (message: string): SequenceResult => ({
  ok: false,
  failure: { reason: 'invalid-request', message },
});

/**
 * How far into the day an attempt got before it failed.
 *
 * Used to pick which near-miss to report: the attempt that scheduled the most stops is the one
 * whose reason is most likely to be actionable, and "no feasible sequence" on its own tells a
 * person nothing they can do something about.
 */
function failureDepth(failure: SequenceFailure): number {
  // Ordered by how far the attempt got, which is the order the checks actually run in: travel is
  // ruled out first, then each stop's hours, then whether the families themselves can make it.
  // A routine clash means every stop already passed its opening check, so it is a later and more
  // useful thing to report than a closure.
  switch (failure.reason) {
    case 'travel-infeasible':
      return 10;
    case 'venue-closed':
      return 40 + failure.stopIndex;
    // More actionable than a flat closure: it names a time the visit could be moved before.
    case 'venue-closes-during-visit':
      return 50 + failure.stopIndex;
    case 'return-by-exceeded':
      return 85;
    case 'routine-conflict':
      return 90;
    default:
      return 0;
  }
}

/**
 * Enough of a lift to prefer a problem with the anchor over the same kind of problem elsewhere,
 * without letting it outrank a failure that got further into the day. The day is built around the
 * anchor, so "the gallery is shut on Mondays" is the useful thing to say — not that the lunch
 * stop it was paired with happens to close at nine.
 */
const ANCHOR_FAILURE_BONUS = 15;

function rankFailure(failure: SequenceFailure, anchorPlaceId: string): number {
  const aboutAnchor = 'placeId' in failure && failure.placeId === anchorPlaceId;
  return failureDepth(failure) + (aboutAnchor ? ANCHOR_FAILURE_BONUS : 0);
}

/** Checks one stop's hours, turning a closure into a failure and an unknown into a carried caveat. */
function evaluateOpening(
  request: StopRequest,
  index: number,
  arrive: number,
  depart: number,
  options: SequenceOptions,
): StopOpening | SequenceFailure {
  const verdict = isOpenOn(
    options.date,
    hhmm(arrive),
    hhmm(depart),
    request.openingHours,
    options.timezone,
  );

  if (verdict.status === 'closed') {
    if (verdict.closesDuringVisit) {
      return {
        reason: 'venue-closes-during-visit',
        message: `${request.name} closes at ${verdict.closesAt ?? 'an earlier time'}, before this visit would finish.`,
        stopIndex: index,
        placeId: request.placeId,
        closesAt: verdict.closesAt,
      };
    }
    return {
      reason: 'venue-closed',
      message: `${request.name} is not open at that time on ${options.date}.`,
      stopIndex: index,
      placeId: request.placeId,
      date: options.date,
    };
  }

  // 'open' and 'unknown' both proceed, and the difference is preserved rather than flattened.
  return { status: verdict.status, reason: verdict.reason, closesAt: verdict.closesAt };
}

interface Attempt {
  itinerary: DayItinerary;
}

function tryOrder(
  order: StopRequest[],
  families: PlanningFamily[],
  windows: RoutineWindow[][],
  matrix: JourneyMatrix,
  options: SequenceOptions,
  earliest: number,
  deadline: number,
): Attempt | SequenceFailure {
  const buffer = options.bufferMinutes;
  const first = order[0];
  const last = order[order.length - 1];
  const anchorPlaceId = order.find((stop) => stop.anchor)!.placeId;
  let worst: SequenceFailure | null = null;
  const note = (failure: SequenceFailure) => {
    if (!worst || rankFailure(failure, anchorPlaceId) > rankFailure(worst, anchorPlaceId)) worst = failure;
    return failure;
  };

  // Outbound and return legs are per family and must be inside each family's own driving limit.
  const outbound: Record<string, JourneyLegEstimate> = {};
  const inbound: Record<string, JourneyLegEstimate> = {};
  for (const family of families) {
    const out = leg(matrix, homeKey(family.id), stopKey(first.placeId));
    const back = leg(matrix, stopKey(last.placeId), homeKey(family.id));
    for (const [estimate, to, from] of [
      [out, { kind: 'stop', index: 0, placeId: first.placeId } as LegEndpoint, { kind: 'home', familyId: family.id } as LegEndpoint],
      [back, { kind: 'home', familyId: family.id } as LegEndpoint, { kind: 'stop', index: order.length - 1, placeId: last.placeId } as LegEndpoint],
    ] as const) {
      if (!estimate || !Number.isFinite(estimate.minutes) || estimate.minutes < 0) {
        return note({
          reason: 'travel-infeasible',
          message: `No travel time is known between ${family.label} and ${first.name}.`,
          from,
          to,
          familyId: family.id,
        });
      }
      if (estimate.minutes > family.maxDriveMinutes) {
        return note({
          reason: 'travel-infeasible',
          message: `That journey is ${estimate.minutes} minutes, beyond ${family.label}'s ${family.maxDriveMinutes} minute limit.`,
          from,
          to,
          familyId: family.id,
          travelMinutes: estimate.minutes,
          limitMinutes: family.maxDriveMinutes,
        });
      }
    }
    outbound[family.id] = out!;
    inbound[family.id] = back!;
  }

  // Legs between stops are shared: everyone travels together once the day has begun.
  const transfers: JourneyLegEstimate[] = [];
  for (let i = 0; i < order.length - 1; i += 1) {
    const estimate = leg(matrix, stopKey(order[i].placeId), stopKey(order[i + 1].placeId));
    if (!estimate || !Number.isFinite(estimate.minutes) || estimate.minutes < 0) {
      return note({
        reason: 'travel-infeasible',
        message: `No travel time is known between ${order[i].name} and ${order[i + 1].name}.`,
        from: { kind: 'stop', index: i, placeId: order[i].placeId },
        to: { kind: 'stop', index: i + 1, placeId: order[i + 1].placeId },
      });
    }
    transfers.push(estimate);
  }

  const maxOutbound = Math.max(...families.map((f) => outbound[f.id].minutes));
  const totalDwell = order.reduce((sum, stop) => sum + stop.dwellMinutes, 0);
  const totalTransfer = transfers.reduce((sum, t) => sum + t.minutes + buffer, 0);

  for (
    let firstArrival = earliest + maxOutbound + buffer;
    firstArrival + totalDwell + totalTransfer <= deadline;
    firstArrival += SCAN_STEP_MINUTES
  ) {
    const stops: SequenceStop[] = [];
    const openingUnknowns: string[] = [];
    let cursor = firstArrival;
    let closedOut: SequenceFailure | null = null;

    for (let i = 0; i < order.length; i += 1) {
      const request = order[i];
      const arrive = cursor;
      const depart = arrive + request.dwellMinutes;
      const opening = evaluateOpening(request, i, arrive, depart, options);
      if ('reason' in opening && 'message' in opening) {
        closedOut = note(opening as SequenceFailure);
        break;
      }
      const resolved = opening as StopOpening;
      if (resolved.status === 'unknown') {
        openingUnknowns.push(`${request.name}: opening hours not confirmed`);
      }
      stops.push({
        index: i,
        placeId: request.placeId,
        name: request.name,
        role: request.role,
        anchor: request.anchor,
        arrive,
        depart,
        dwellMinutes: request.dwellMinutes,
        opening: resolved,
      });
      cursor = depart + (transfers[i] ? transfers[i].minutes + buffer : 0);
    }
    if (closedOut) continue;

    const lastDeparture = stops[stops.length - 1].depart;
    const legs: SequenceLeg[] = [];
    const timings: SequenceFamilyTiming[] = [];
    let blocked: SequenceFailure | null = null;

    for (let i = 0; i < families.length && !blocked; i += 1) {
      const family = families[i];
      const out = outbound[family.id];
      const back = inbound[family.id];
      const leavesHome = firstArrival - out.minutes - buffer;
      const backHome = lastDeparture + back.minutes + buffer;

      if (leavesHome < earliest) {
        blocked = note({
          reason: 'travel-infeasible',
          message: `${family.label} would have to leave at ${hhmm(leavesHome)}, before the earliest departure.`,
          from: { kind: 'home', familyId: family.id },
          to: { kind: 'stop', index: 0, placeId: first.placeId },
          familyId: family.id,
          travelMinutes: out.minutes,
        });
        break;
      }
      if (backHome > deadline) {
        blocked = note({
          reason: 'return-by-exceeded',
          message: `${family.label} would get home at ${hhmm(backHome)}, after the time you asked to be back.`,
          familyId: family.id,
          homeAt: backHome,
          returnBy: deadline,
        });
        break;
      }

      const travelSpans: TimeSpan[] = [{ from: leavesHome, to: firstArrival }];
      stops.forEach((stop, index) => {
        const transfer = transfers[index];
        if (transfer) travelSpans.push({ from: stop.depart, to: stops[index + 1].arrive });
      });
      travelSpans.push({ from: lastDeparture, to: backHome });

      const homeClash = homeRoutineConflict(windows[i], leavesHome, backHome);
      if (homeClash) {
        blocked = note({
          reason: 'routine-conflict',
          message: `${homeClash.label || homeClash.kind} at ${homeClash.time} has to happen at home, and the day would be out then.`,
          familyId: family.id,
          routineLabel: homeClash.label || homeClash.kind,
        });
        break;
      }
      const travelClash = travelRoutineConflict(windows[i], travelSpans);
      if (travelClash) {
        blocked = note({
          reason: 'routine-conflict',
          message: `${travelClash.label || travelClash.kind} at ${travelClash.time} would fall while travelling.`,
          familyId: family.id,
          routineLabel: travelClash.label || travelClash.kind,
        });
        break;
      }

      const nextHome = nextHomeRoutineAfter(windows[i], backHome);
      const bound = Math.min(deadline, nextHome?.start ?? deadline);
      const notes = outOfHomeNotes(windows[i], leavesHome, backHome);
      if (nextHome) notes.push(homeBeforeNote(nextHome));

      timings.push({
        familyId: family.id,
        label: family.label,
        depart: leavesHome,
        home: backHome,
        latestDeparture: bound - back.minutes - out.minutes - buffer * 2 - totalDwell - totalTransfer,
        notes,
      });

      legs.push({
        from: { kind: 'home', familyId: family.id },
        to: { kind: 'stop', index: 0, placeId: first.placeId },
        familyIds: [family.id],
        depart: leavesHome,
        arrive: firstArrival,
        travelMinutes: out.minutes,
        bufferMinutes: buffer,
        source: out.source,
      });
      legs.push({
        from: { kind: 'stop', index: order.length - 1, placeId: last.placeId },
        to: { kind: 'home', familyId: family.id },
        familyIds: [family.id],
        depart: lastDeparture,
        arrive: backHome,
        travelMinutes: back.minutes,
        bufferMinutes: buffer,
        source: back.source,
      });
    }
    if (blocked) continue;

    // Shared transfers, recorded once with everyone on them.
    const familyIds = families.map((f) => f.id);
    transfers.forEach((transfer, index) => {
      legs.push({
        from: { kind: 'stop', index, placeId: stops[index].placeId },
        to: { kind: 'stop', index: index + 1, placeId: stops[index + 1].placeId },
        familyIds,
        depart: stops[index].depart,
        arrive: stops[index + 1].arrive,
        travelMinutes: transfer.minutes,
        bufferMinutes: buffer,
        source: transfer.source,
      });
    });
    legs.sort((a, b) => a.depart - b.depart || a.arrive - b.arrive);

    // Eligibility per stop, reusing the matcher the single-venue planner uses so there is one
    // definition of what suits a family. The drive a constraint is judged against is the leg the
    // family actually took to reach that stop.
    const factUnknowns = new Set<string>();
    for (const family of families) {
      for (let i = 0; i < order.length; i += 1) {
        const request = order[i];
        if (family.ages.length && ageRangeExcludes(request.facts, family.ages)) {
          return note({
            reason: 'no-feasible-sequence',
            message: `${request.name} publishes an age range that excludes a child in ${family.label}.`,
            attempts: 1,
          });
        }
        const driveMinutes = i === 0 ? outbound[family.id].minutes : transfers[i - 1].minutes;
        const match = matchVenueToDayRequest(
          { ...request.facts, driveMinutes },
          familyRequest(family, options.environment),
        );
        if (!match.eligible) {
          return note({
            reason: 'no-feasible-sequence',
            message: `${request.name} does not meet what ${family.label} requires.`,
            attempts: 1,
          });
        }
        match.evaluations
          .filter((evaluation) => evaluation.outcome === 'unknown')
          .forEach((evaluation) => factUnknowns.add(`${evaluation.field}: not confirmed`));
      }
    }

    const drives = families.map((f) => outbound[f.id].minutes);
    const fairnessGap = Math.max(...drives) - Math.min(...drives);
    const unknownHours = stops.filter((stop) => stop.opening.status === 'unknown').length;

    return {
      itinerary: {
        date: options.date,
        stops,
        legs,
        families: timings,
        unknowns: [...openingUnknowns, ...factUnknowns],
        openingConfidence: { confirmed: stops.length - unknownHours, unknown: unknownHours },
        reasons: [
          `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}, built around ${order.find((s) => s.anchor)!.name}.`,
          families.length > 1
            ? `${fairnessGap} minute difference between outbound journeys.`
            : 'Fits your selected travel limit.',
          'Fits the home routines you entered.',
        ],
        fairnessGap,
        // Unknown hours cost the day something, so a caller choosing between candidates prefers
        // a venue confirmed open over one nobody has checked.
        score:
          1000 -
          fairnessGap -
          Math.max(...drives) * 0.25 -
          (firstArrival - earliest) * 0.05 -
          unknownHours * UNKNOWN_HOURS_PENALTY,
      },
    };
  }

  return (
    worst ?? {
      reason: 'no-feasible-sequence',
      message: 'No start time in the day fits this order of stops.',
      attempts: 1,
    }
  );
}

export function sequenceDay(
  requests: StopRequest[],
  families: PlanningFamily[],
  matrix: JourneyMatrix,
  options: SequenceOptions,
  now: Date = new Date(),
): SequenceResult {
  if (!requests.length) return invalid('Choose at least one place to visit.');
  if (requests.length > MAX_SEQUENCE_STOPS) {
    return invalid(`A day can hold at most ${MAX_SEQUENCE_STOPS} stops.`);
  }
  if (new Set(requests.map((r) => r.placeId)).size !== requests.length) {
    return invalid('The same place cannot appear twice in one day.');
  }
  const anchors = requests.filter((r) => r.anchor);
  if (anchors.length !== 1) {
    return invalid('A day is built around exactly one chosen place.');
  }
  if (requests.some((r) => !Number.isFinite(r.dwellMinutes) || r.dwellMinutes < MIN_DWELL_MINUTES || r.dwellMinutes > MAX_DWELL_MINUTES)) {
    return invalid(`Time at each place must be between ${MIN_DWELL_MINUTES} and ${MAX_DWELL_MINUTES} minutes.`);
  }
  if (!families.length || families.length > MAX_FAMILIES) {
    return invalid(`Choose between one and ${MAX_FAMILIES} families.`);
  }
  if (!Number.isFinite(options.bufferMinutes) || options.bufferMinutes < 0 || options.bufferMinutes > MAX_BUFFER_MINUTES) {
    return invalid('Choose a travel buffer between 0 and 60 minutes.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) return invalid('Choose a valid date.');

  const selected = new Date(`${options.date}T00:00:00`);
  if (
    !Number.isFinite(selected.getTime()) ||
    selected.getFullYear() !== Number(options.date.slice(0, 4)) ||
    selected.getMonth() + 1 !== Number(options.date.slice(5, 7)) ||
    selected.getDate() !== Number(options.date.slice(8, 10))
  ) {
    return invalid('Choose a valid date.');
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (selected < today) return invalid('Choose today or a future date.');

  let windows: RoutineWindow[][];
  let earliest: number;
  let deadline: number;
  try {
    windows = families.map((family) => routineWindows(family.routines));
    earliest = Math.max(
      clockMinutes(options.leaveAt),
      selected.getTime() === today.getTime() ? now.getHours() * 60 + now.getMinutes() : 0,
    );
    deadline = options.returnBy ? clockMinutes(options.returnBy) : END_OF_DAY;
  } catch (error) {
    return invalid(error instanceof Error ? error.message : 'Check the times you entered.');
  }

  const orders = permutations(requests);
  let nearest: SequenceFailure | null = null;
  let attempts = 0;

  for (const order of orders) {
    attempts += 1;
    const outcome = tryOrder(order, families, windows, matrix, options, earliest, deadline);
    if ('itinerary' in outcome) {
      // The anchor is never dropped or swapped, so this holds by construction; asserting it keeps
      // a future change to the ordering from quietly breaking the promise.
      if (!outcome.itinerary.stops.some((stop) => stop.anchor && stop.placeId === anchors[0].placeId)) {
        return invalid('The chosen place was lost while building the day.');
      }
      return { ok: true, itinerary: outcome.itinerary };
    }
    if (!nearest || rankFailure(outcome, anchors[0].placeId) > rankFailure(nearest, anchors[0].placeId)) {
      nearest = outcome;
    }
  }

  return {
    ok: false,
    failure: {
      reason: 'no-feasible-sequence',
      message: 'No order of these stops fits the day you described.',
      attempts,
      nearest: nearest ?? undefined,
    },
  };
}
