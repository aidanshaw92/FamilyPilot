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
import { compareItineraries, mostRelevantFailure } from './sequence-ranking';
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
 * Builds a day out of several stops: the chosen venue, lunch, an optional second activity, home.
 *
 * Pure by construction. Every travel time it is allowed to use arrives in the `JourneyMatrix`,
 * precomputed by the caller — this never calls a travel provider, Google or Supabase. Mixing
 * sequencing with I/O would make the interesting logic untestable, and live travel belongs to its
 * own change.
 *
 * Two promises it keeps. The anchor venue — the place chosen on Home — is always the first stop,
 * never reordered behind another activity and never swapped for somewhere else; a day that cannot
 * start there is a failure. And an unconfirmed opening is never read as an open one: unknown
 * hours are scheduled but carried in `unknowns`, because 107 of the 122 live rows still have no
 * structured hours and refusing them would return nothing at all.
 */

/**
 * Times the planner picks for itself land on the clock — :00, :05, :10 — rather than on an offset
 * grid running from whenever the first drive happened to finish. Travel durations are never
 * rounded, so a family's departure is still whatever the journey actually implies.
 */
const CLOCK_GRID_MINUTES = 5;
const MAX_FAMILIES = 6;
const MIN_DWELL_MINUTES = 15;
const MAX_DWELL_MINUTES = 480;
const MAX_BUFFER_MINUTES = 60;
const END_OF_DAY = 1439;

const snapToGrid = (minutes: number): number => Math.ceil(minutes / CLOCK_GRID_MINUTES) * CLOCK_GRID_MINUTES;

export interface SequenceOptions
  extends Pick<PlanningOptions, 'date' | 'leaveAt' | 'returnBy' | 'bufferMinutes' | 'environment'> {
  /** Overrides the timezone each stop's own schedule carries. */
  timezone?: string;
}

export const homeKey = (familyId: string): JourneyNodeKey => `home:${familyId}`;
export const stopKey = (placeId: string): JourneyNodeKey => `stop:${placeId}`;

function leg(matrix: JourneyMatrix, from: JourneyNodeKey, to: JourneyNodeKey): JourneyLegEstimate | undefined {
  return matrix.legs[from]?.[to];
}

/** `HH:MM` on the planned day. Stops never span midnight here, so the value is clamped into the day. */
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

type OpeningOutcome = { ok: true; opening: StopOpening } | { ok: false; failure: SequenceFailure };

/** Checks one stop's hours, turning a closure into a failure and an unknown into a carried caveat. */
function evaluateOpening(
  request: StopRequest,
  index: number,
  arrive: number,
  depart: number,
  options: SequenceOptions,
): OpeningOutcome {
  const verdict = isOpenOn(options.date, hhmm(arrive), hhmm(depart), request.openingHours, options.timezone);

  if (verdict.status === 'closed') {
    if (verdict.closesDuringVisit) {
      return {
        ok: false,
        failure: {
          reason: 'venue-closes-during-visit',
          message: `${request.name} closes at ${verdict.closesAt ?? 'an earlier time'}, before this visit would finish.`,
          stopIndex: index,
          placeId: request.placeId,
          closesAt: verdict.closesAt,
        },
      };
    }
    return {
      ok: false,
      failure: {
        reason: 'venue-closed',
        message: `${request.name} is not open at that time on ${options.date}.`,
        stopIndex: index,
        placeId: request.placeId,
        date: options.date,
      },
    };
  }

  // 'open' and 'unknown' both proceed, and the difference is preserved rather than flattened.
  return { ok: true, opening: { status: verdict.status, reason: verdict.reason, closesAt: verdict.closesAt } };
}

interface OrderOutcome {
  itinerary: DayItinerary | null;
  failures: SequenceFailure[];
}

function tryOrder(
  order: StopRequest[],
  families: PlanningFamily[],
  windows: RoutineWindow[][],
  matrix: JourneyMatrix,
  options: SequenceOptions,
  earliest: number,
  deadline: number,
): OrderOutcome {
  const buffer = options.bufferMinutes;
  const first = order[0];
  const last = order[order.length - 1];
  const failures: SequenceFailure[] = [];

  // Rendezvous and return legs belong to one family each, and are checked against that family's
  // own driving limit.
  const outbound: Record<string, JourneyLegEstimate> = {};
  const inbound: Record<string, JourneyLegEstimate> = {};
  for (const family of families) {
    const out = leg(matrix, homeKey(family.id), stopKey(first.placeId));
    const back = leg(matrix, stopKey(last.placeId), homeKey(family.id));
    const homeEnd: LegEndpoint = { kind: 'home', familyId: family.id };
    const firstStop: LegEndpoint = { kind: 'stop', index: 0, placeId: first.placeId };
    const lastStop: LegEndpoint = { kind: 'stop', index: order.length - 1, placeId: last.placeId };

    for (const [estimate, from, to] of [
      [out, homeEnd, firstStop],
      [back, lastStop, homeEnd],
    ] as const) {
      if (!estimate || !Number.isFinite(estimate.minutes) || estimate.minutes < 0) {
        failures.push({
          reason: 'travel-infeasible',
          message: `No travel time is known between ${family.label} and ${to.kind === 'stop' ? first.name : 'home'}.`,
          from,
          to,
          familyId: family.id,
        });
        return { itinerary: null, failures };
      }
      if (estimate.minutes > family.maxDriveMinutes) {
        failures.push({
          reason: 'travel-infeasible',
          message: `That journey is ${estimate.minutes} minutes, beyond ${family.label}'s ${family.maxDriveMinutes} minute limit.`,
          from,
          to,
          familyId: family.id,
          travelMinutes: estimate.minutes,
          limitMinutes: family.maxDriveMinutes,
        });
        return { itinerary: null, failures };
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
      failures.push({
        reason: 'travel-infeasible',
        message: `No travel time is known between ${order[i].name} and ${order[i + 1].name}.`,
        from: { kind: 'stop', index: i, placeId: order[i].placeId },
        to: { kind: 'stop', index: i + 1, placeId: order[i + 1].placeId },
      });
      return { itinerary: null, failures };
    }
    transfers.push(estimate);
  }

  const maxOutbound = Math.max(...families.map((f) => outbound[f.id].minutes));
  const totalDwell = order.reduce((sum, stop) => sum + stop.dwellMinutes, 0);
  const totalTransfer = transfers.reduce((sum, t) => sum + t.minutes + buffer, 0);
  // The first arrival is the planner's own choice, so it sits on the clock rather than wherever
  // the longest drive plus a buffer happens to land.
  const firstPossible = snapToGrid(earliest + maxOutbound + buffer);

  for (
    let firstArrival = firstPossible;
    firstArrival + totalDwell + totalTransfer <= deadline;
    firstArrival += CLOCK_GRID_MINUTES
  ) {
    const stops: SequenceStop[] = [];
    const openingUnknowns: string[] = [];
    let cursor = firstArrival;
    let closedOut = false;

    for (let i = 0; i < order.length; i += 1) {
      const request = order[i];
      const arrive = cursor;
      const depart = arrive + request.dwellMinutes;
      const outcome = evaluateOpening(request, i, arrive, depart, options);
      if (!outcome.ok) {
        failures.push(outcome.failure);
        closedOut = true;
        break;
      }
      if (outcome.opening.status === 'unknown') {
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
        opening: outcome.opening,
      });
      cursor = depart + (transfers[i] ? transfers[i].minutes + buffer : 0);
    }
    if (closedOut) continue;

    const lastDeparture = stops[stops.length - 1].depart;
    const legs: SequenceLeg[] = [];
    const timings: SequenceFamilyTiming[] = [];
    let blocked = false;

    for (let i = 0; i < families.length && !blocked; i += 1) {
      const family = families[i];
      const out = outbound[family.id];
      const back = inbound[family.id];
      // Derived from this family's own journey, so it is exact rather than snapped: the grid is
      // for times the planner chooses, not for times travel dictates.
      const leavesHome = firstArrival - out.minutes - buffer;
      const backHome = lastDeparture + back.minutes + buffer;

      if (leavesHome < earliest) {
        failures.push({
          reason: 'travel-infeasible',
          message: `${family.label} would have to leave at ${hhmm(leavesHome)}, before the earliest departure.`,
          from: { kind: 'home', familyId: family.id },
          to: { kind: 'stop', index: 0, placeId: first.placeId },
          familyId: family.id,
          travelMinutes: out.minutes,
        });
        blocked = true;
        break;
      }
      if (backHome > deadline) {
        failures.push({
          reason: 'return-by-exceeded',
          message: `${family.label} would get home at ${hhmm(backHome)}, after the time you asked to be back.`,
          familyId: family.id,
          homeAt: backHome,
          returnBy: deadline,
        });
        blocked = true;
        break;
      }

      const travelSpans: TimeSpan[] = [{ from: leavesHome, to: firstArrival }];
      stops.forEach((stop, index) => {
        if (transfers[index]) travelSpans.push({ from: stop.depart, to: stops[index + 1].arrive });
      });
      travelSpans.push({ from: lastDeparture, to: backHome });

      const homeClash = homeRoutineConflict(windows[i], leavesHome, backHome);
      if (homeClash) {
        failures.push({
          reason: 'routine-conflict',
          message: `${homeClash.label || homeClash.kind} at ${homeClash.time} has to happen at home, and the day would be out then.`,
          familyId: family.id,
          routineLabel: homeClash.label || homeClash.kind,
        });
        blocked = true;
        break;
      }
      const travelClash = travelRoutineConflict(windows[i], travelSpans);
      if (travelClash) {
        failures.push({
          reason: 'routine-conflict',
          message: `${travelClash.label || travelClash.kind} at ${travelClash.time} would fall while travelling.`,
          familyId: family.id,
          routineLabel: travelClash.label || travelClash.kind,
        });
        blocked = true;
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
        kind: 'rendezvous',
        familyId: family.id,
        from: { kind: 'home', familyId: family.id },
        to: { kind: 'stop', index: 0, placeId: first.placeId },
        depart: leavesHome,
        arrive: firstArrival,
        travelMinutes: out.minutes,
        bufferMinutes: buffer,
        source: out.source,
      });
      legs.push({
        kind: 'return',
        familyId: family.id,
        from: { kind: 'stop', index: order.length - 1, placeId: last.placeId },
        to: { kind: 'home', familyId: family.id },
        depart: lastDeparture,
        arrive: backHome,
        travelMinutes: back.minutes,
        bufferMinutes: buffer,
        source: back.source,
      });
    }
    if (blocked) continue;

    const familyIds = families.map((f) => f.id);
    transfers.forEach((transfer, index) => {
      legs.push({
        kind: 'transfer',
        familyIds,
        from: { kind: 'stop', index, placeId: stops[index].placeId },
        to: { kind: 'stop', index: index + 1, placeId: stops[index + 1].placeId },
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
    let ineligible: SequenceFailure | null = null;
    for (const family of families) {
      for (let i = 0; i < order.length && !ineligible; i += 1) {
        const request = order[i];
        if (family.ages.length && ageRangeExcludes(request.facts, family.ages)) {
          ineligible = {
            reason: 'no-feasible-sequence',
            message: `${request.name} publishes an age range that excludes a child in ${family.label}.`,
            attempts: 1,
          };
          break;
        }
        const driveMinutes = i === 0 ? outbound[family.id].minutes : transfers[i - 1].minutes;
        const match = matchVenueToDayRequest(
          { ...request.facts, driveMinutes },
          familyRequest(family, options.environment),
        );
        if (!match.eligible) {
          ineligible = {
            reason: 'no-feasible-sequence',
            message: `${request.name} does not meet what ${family.label} requires.`,
            attempts: 1,
          };
          break;
        }
        match.evaluations
          .filter((evaluation) => evaluation.outcome === 'unknown')
          .forEach((evaluation) => factUnknowns.add(`${evaluation.field}: not confirmed`));
      }
    }
    if (ineligible) {
      failures.push(ineligible);
      return { itinerary: null, failures };
    }

    const drives = families.map((f) => outbound[f.id].minutes);
    const fairnessGap = Math.max(...drives) - Math.min(...drives);
    const unknownHours = stops.filter((stop) => stop.opening.status === 'unknown').length;

    return {
      failures,
      itinerary: {
        date: options.date,
        stops,
        legs,
        families: timings,
        unknowns: [...openingUnknowns, ...factUnknowns],
        openingConfidence: { confirmed: stops.length - unknownHours, unknown: unknownHours },
        reasons: [
          `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}, built around ${stops[0].name}.`,
          families.length > 1
            ? `${fairnessGap} minute difference between outbound journeys.`
            : 'Fits your selected travel limit.',
          'Fits the home routines you entered.',
        ],
        fairnessGap,
        // Scheduling quality only. Whether hours are confirmed is compared separately and first,
        // in compareItineraries, so it never depends on the magnitude of these terms.
        score: 1000 - fairnessGap - Math.max(...drives) * 0.25 - (firstArrival - earliest) * 0.05,
      },
    };
  }

  return { itinerary: null, failures };
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
  if (anchors.length !== 1) return invalid('A day is built around exactly one chosen place.');
  if (
    requests.some(
      (r) => !Number.isFinite(r.dwellMinutes) || r.dwellMinutes < MIN_DWELL_MINUTES || r.dwellMinutes > MAX_DWELL_MINUTES,
    )
  ) {
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

  // v1 shape: home → anchor activity → meal → optional activity → home.
  //
  // The anchor is always the first non-home stop, so no other activity is ever placed ahead of
  // the venue the day was chosen for. A meal takes second place whenever there is one, which is
  // what makes the day a lunch in the middle rather than an afterthought at the end — so
  // activity → activity → meal is not a shape this version will produce. Only when there is no
  // meal do the remaining activities have any freedom, and then the comparator picks between
  // them.
  const anchor = anchors[0];
  const rest = requests.filter((request) => request !== anchor);
  const meals = rest.filter((request) => request.role === 'meal');
  if (meals.length > 1) return invalid('A day can include only one meal stop.');
  const activities = rest.filter((request) => request.role !== 'meal');
  const orders = meals.length
    ? [[anchor, ...meals, ...activities]]
    : permutations(activities).map((tail) => [anchor, ...tail]);

  const candidates: DayItinerary[] = [];
  const failures: SequenceFailure[] = [];
  for (const order of orders) {
    const outcome = tryOrder(order, families, windows, matrix, options, earliest, deadline);
    if (outcome.itinerary) candidates.push(outcome.itinerary);
    failures.push(...outcome.failures);
  }

  if (candidates.length) {
    const [best] = candidates.sort(compareItineraries);
    if (best.stops[0]?.placeId !== anchor.placeId) {
      // Holds by construction; asserted so a future change to ordering cannot quietly break the
      // promise that the chosen venue leads the day.
      return invalid('The chosen place was lost while building the day.');
    }
    return { ok: true, itinerary: best };
  }

  return {
    ok: false,
    failure: {
      reason: 'no-feasible-sequence',
      message: 'No arrangement of these stops fits the day you described.',
      attempts: orders.length,
      nearest: mostRelevantFailure(failures, anchor.placeId),
    },
  };
}
