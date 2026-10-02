import { EnrichmentStatus, VenueCategory } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import {
  DayPlanRequest,
  PLANNING_TIMEZONE_FALLBACK,
  PlanCaveat,
  PlanGenerationResult,
  ResolvedStop,
  TravelDiagnostics,
} from '@/src/types/day-plan';
import {
  LegEndpoint,
  MAX_SEQUENCE_STOPS,
  PlanningClock,
  SequenceFailure,
  StopRequest,
  StopRole,
} from '@/src/types/day-sequence';
import { ExternalPlaceRecord } from '@/src/types/places';
import {
  JourneyProbeFn,
  MissingJourneyLeg,
  StopLocation,
} from '@/src/types/journey-matrix-build';
import { parseClockTime, venueLocalDate, venueLocalTime } from '@/src/utils/opening-hours';

import { buildJourneyMatrix } from './journey-matrix';
import { homeKey, sequenceDay, stopKey } from './sequencer';
import { FoodCandidate } from '@/src/types/nearby-food';
import { TravelLeg } from '@/src/types/travel';

/**
 * Composes the merged pieces into one day: resolved stops, a journey matrix, a sequence, a result.
 *
 * All I/O happens through the injected matrix builder. The sequencer stays pure, and this module
 * adds no clock of its own — the instant arrives in `deps.now` and is resolved once, in the
 * planning timezone, before anything else runs.
 *
 * What it will not do is decide anything for the family. It does not look for a restaurant,
 * propose a different venue when the chosen one is shut, retry with another meal, or rank
 * alternatives. The caller has already chosen where the day goes; this works out whether it fits.
 */

const MAX_FAMILIES = 6;
const MIN_DWELL_MINUTES = 15;
const MAX_DWELL_MINUTES = 480;
const MAX_BUFFER_MINUTES = 60;

export interface GenerateDayPlanDeps {
  buildMatrix: typeof buildJourneyMatrix;
  probe: JourneyProbeFn;
  /** Injected so a test can prove the matrix and clock reach it untouched. Production: sequenceDay. */
  sequence: typeof sequenceDay;
  /** The only clock. Resolved into the planning timezone before use. */
  now: Date;
}

const invalid = (message: string, field?: string): PlanGenerationResult => ({
  ok: false,
  failure: { kind: 'invalid-request', message, field },
});

/**
 * Narrows a provider record down to what planning needs.
 *
 * Exported so callers do not hand-roll this mapping and quietly disagree about which field is
 * the place id. Everything a plan has no business knowing — photos, website, provider ids, fetch
 * timestamps — is left behind here rather than carried through the planner.
 */
export type PlanStopSource = Omit<ResolvedStop, 'role' | 'dwellMinutes'>;

/**
 * A merged venue as the detail screen holds it, narrowed to the fields planning reads.
 *
 * Structural rather than an import of `VenueDetail`, which `VenueDetail` satisfies: the planner has
 * no business depending on a view type that also carries photos, community tips and display copy.
 */
export interface PlanVenueSource {
  id: string;
  name: string;
  category: VenueCategory;
  latitude: number;
  longitude: number;
  structuredOpeningHours?: OpeningHoursSchedule;
  isOpen?: boolean;
  enrichmentStatus?: EnrichmentStatus;
  trustedFacts?: MatchableVenueFacts;
}

/** Renames a provider record's fields. Nothing is derived, defaulted or dropped silently. */
export function planStopFromRecord(record: ExternalPlaceRecord): PlanStopSource {
  return {
    placeId: record.familypilotId,
    name: record.name,
    category: record.category,
    latitude: record.latitude,
    longitude: record.longitude,
    openingHours: record.openingHours,
    isOpen: record.isOpen,
    enrichmentStatus: record.enrichmentStatus,
    familyMetadata: record.familyMetadata,
  };
}

/**
 * The same, from the venue the detail screen is already showing.
 *
 * Carries `trustedFacts` across as `facts` instead of metadata, because that is what this shape
 * holds — see `ResolvedStop.facts`. An absent one stays absent: the day is then planned against
 * unknowns, which is the honest reading, not a set of assumed facilities.
 */
export function planStopFromVenueDetail(venue: PlanVenueSource): PlanStopSource {
  return {
    placeId: venue.id,
    name: venue.name,
    category: venue.category,
    latitude: venue.latitude,
    longitude: venue.longitude,
    openingHours: venue.structuredOpeningHours,
    isOpen: venue.isOpen,
    enrichmentStatus: venue.enrichmentStatus,
    facts: venue.trustedFacts,
  };
}

/**
 * A real OpenStreetMap restaurant, as the planner needs it.
 *
 * The adapter that makes Section 12 possible: a candidate discovered from Overpass becomes a stop the
 * sequencer can place, without the planner learning anything about OpenStreetMap.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM. No `facts`, so no family requirement is reported as met by this
 * stop: OpenStreetMap cannot confirm toilets, baby changing or parking, and a stop that silently
 * asserted them would make a day look suitable on evidence nobody has. Unknown stays unknown, and a
 * household whose must-haves cannot be confirmed at lunch is told so rather than reassured.
 *
 * `isOpen` is likewise never asserted. OSM's `opening_hours` is a raw expression this layer does not
 * parse, so the stop carries no opening claim at all -- which the sequencer already handles as unknown
 * rather than as closed.
 */
export function planStopFromFoodCandidate(candidate: FoodCandidate): PlanStopSource {
  return {
    placeId: candidate.familypilotId,
    name: candidate.name,
    // 'restaurant' and 'cafe' are venue categories the planner already knows; fast_food is not, and a
    // quick-service place is a restaurant for every purpose the planner has.
    category: candidate.category === 'cafe' ? 'cafe' : 'restaurant',
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    // Deliberately absent: openingHours (unparsed), isOpen (unknown), facts (unconfirmable), and
    // familyMetadata (nobody has reviewed this place).
  };
}

/**
 * The meal a plan is built around, from a discovered candidate.
 *
 * Carries the candidate's own travel legs, so the Plan can word the hop to lunch from the provenance
 * the discovery layer recorded rather than from an assumption made here.
 */
export function mealFromFoodCandidate(candidate: FoodCandidate): {
  place: PlanStopSource;
  travel: TravelLeg[];
} {
  return { place: planStopFromFoodCandidate(candidate), travel: candidate.travel };
}

/** Gives a source its part in the day. `role` and `dwellMinutes` belong to the day, not the place. */
export function resolvedStop(
  source: PlanStopSource,
  role: StopRole,
  dwellMinutes: number,
): ResolvedStop {
  return { ...source, role, dwellMinutes };
}

export function resolvedStopFromRecord(
  record: ExternalPlaceRecord,
  role: StopRole,
  dwellMinutes: number,
): ResolvedStop {
  return resolvedStop(planStopFromRecord(record), role, dwellMinutes);
}

const stopsOf = (request: DayPlanRequest): ResolvedStop[] =>
  [request.anchor, request.meal, request.secondActivity].filter(
    (stop): stop is ResolvedStop => stop !== undefined,
  );

/**
 * A real day on the calendar, not merely eight digits and two dashes.
 *
 * The sequencer checks this too and keeps doing so, but by then a matrix has already been built:
 * a date like 2026-02-30 would cost a round of provider calls before anything noticed.
 */
function isRealCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.getFullYear() === Number(date.slice(0, 4)) &&
    parsed.getMonth() + 1 === Number(date.slice(5, 7)) &&
    parsed.getDate() === Number(date.slice(8, 10))
  );
}

function validate(request: DayPlanRequest, stops: ResolvedStop[]): PlanGenerationResult | null {
  if (!isRealCalendarDate(request.date)) return invalid('Choose a valid date.', 'date');

  // The slot a stop occupies is a claim about what it is, and the sequencer orders the day by
  // `role`. A meal sitting in the activity slot would quietly move lunch to the end of the day,
  // so a contradiction between the two is rejected rather than silently honoured.
  if (request.anchor.role !== 'activity') {
    return invalid('The venue a day is built around must be an activity.', 'anchor.role');
  }
  if (request.meal && request.meal.role !== 'meal') {
    return invalid(`${request.meal.name} is in the meal slot but is not a meal.`, 'meal.role');
  }
  if (request.secondActivity && request.secondActivity.role !== 'activity') {
    return invalid(
      `${request.secondActivity.name} is in the second activity slot but is not an activity.`,
      'secondActivity.role',
    );
  }
  if (!request.families.length || request.families.length > MAX_FAMILIES) {
    return invalid(`Choose between one and ${MAX_FAMILIES} families.`, 'families');
  }
  if (request.families.some((family) => !Number.isFinite(family.latitude) || !Number.isFinite(family.longitude))) {
    return invalid('Confirm an area for every family.', 'families');
  }
  if (stops.length > MAX_SEQUENCE_STOPS) {
    return invalid(`A day can hold at most ${MAX_SEQUENCE_STOPS} stops.`, 'stops');
  }
  if (new Set(stops.map((stop) => stop.placeId)).size !== stops.length) {
    return invalid('The same place cannot appear twice in one day.', 'stops');
  }
  for (const stop of stops) {
    if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) {
      return invalid(`${stop.name} has no usable location.`, 'stops');
    }
    if (
      !Number.isFinite(stop.dwellMinutes) ||
      stop.dwellMinutes < MIN_DWELL_MINUTES ||
      stop.dwellMinutes > MAX_DWELL_MINUTES
    ) {
      return invalid(
        `Time at each place must be between ${MIN_DWELL_MINUTES} and ${MAX_DWELL_MINUTES} minutes.`,
        'stops',
      );
    }
  }
  const { bufferMinutes } = request.options;
  if (!Number.isFinite(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > MAX_BUFFER_MINUTES) {
    return invalid('Choose a travel buffer between 0 and 60 minutes.', 'options.bufferMinutes');
  }
  return null;
}

/**
 * Settles which timezone the plan is about, then reads the instant in it.
 *
 * A supplied timezone that the platform cannot interpret is an error rather than a cue to fall
 * back: falling back would quietly plan in a different timezone than the caller asked for. The
 * fallback exists for a timezone nobody gave, not for one that was given and is wrong.
 */
function resolvePlanningClock(
  now: Date,
  request: DayPlanRequest,
): { clock: PlanningClock } | { error: PlanGenerationResult } {
  const supplied = request.options.timezone ?? request.anchor.openingHours?.timezone;
  const timezone = supplied ?? PLANNING_TIMEZONE_FALLBACK;

  const today = venueLocalDate(now, timezone);
  const localTime = venueLocalTime(now, timezone);
  const nowMinutes = localTime === null ? null : parseClockTime(localTime);

  if (today === null || nowMinutes === null) {
    return {
      error: invalid(
        `"${timezone}" is not a timezone this device can interpret, so the day cannot be planned in it.`,
        'options.timezone',
      ),
    };
  }
  return { clock: { today, nowMinutes, timezone } };
}

/**
 * The facts the sequencer matches on, from whichever half of the stop carries them.
 *
 * Both branches end at `extractMatchableFacts`; a caller that already ran it hands the answer over
 * rather than having it re-derived from metadata it does not keep. Identity and drive time are
 * taken from the stop either way: `driveMinutes` is 0 because the sequencer substitutes the leg the
 * family actually took before matching, and a stored estimate from a home this day may not start
 * at is not that leg.
 */
export function stopFacts(stop: PlanStopSource): MatchableVenueFacts {
  if (stop.facts) {
    return { ...stop.facts, placeId: stop.placeId, name: stop.name, driveMinutes: 0 };
  }
  return extractMatchableFacts(
    stop.placeId,
    stop.name,
    stop.category,
    0,
    stop.enrichmentStatus,
    stop.familyMetadata ?? null,
    stop.isOpen,
  );
}

/** Narrow stop to what the sequencer matches on. Hours pass straight through, never fabricated. */
function toStopRequest(stop: ResolvedStop, anchor: boolean): StopRequest {
  return {
    placeId: stop.placeId,
    name: stop.name,
    role: stop.role,
    anchor,
    dwellMinutes: stop.dwellMinutes,
    facts: stopFacts(stop),
    openingHours: stop.openingHours,
  };
}

const toLocation = (stop: ResolvedStop): StopLocation => ({
  placeId: stop.placeId,
  latitude: stop.latitude,
  longitude: stop.longitude,
});

const endpointKey = (endpoint: LegEndpoint): string =>
  endpoint.kind === 'home' ? homeKey(endpoint.familyId) : stopKey(endpoint.placeId);

/**
 * Finds the matrix's explanation for a journey the sequencer could not make.
 *
 * Checks the nearest miss too, because a day that failed everywhere reports
 * `no-feasible-sequence` with the most informative attempt attached.
 */
function blameLeg(
  failure: SequenceFailure,
  missing: MissingJourneyLeg[],
): MissingJourneyLeg | undefined {
  const candidates: SequenceFailure[] = [failure];
  if (failure.reason === 'no-feasible-sequence' && failure.nearest) candidates.push(failure.nearest);

  for (const candidate of candidates) {
    if (candidate.reason !== 'travel-infeasible') continue;
    const from = endpointKey(candidate.from);
    const to = endpointKey(candidate.to);
    const match = missing.find((leg) => leg.from === from && leg.to === to);
    if (match) return match;
  }
  return undefined;
}

export async function generateDayPlan(
  request: DayPlanRequest,
  deps: GenerateDayPlanDeps,
): Promise<PlanGenerationResult> {
  const stops = stopsOf(request);
  const invalidRequest = validate(request, stops);
  if (invalidRequest) return invalidRequest;

  const resolved = resolvePlanningClock(deps.now, request);
  if ('error' in resolved) return resolved.error;
  const { clock } = resolved;

  const stopRequests = stops.map((stop) => toStopRequest(stop, stop === request.anchor));

  let build;
  try {
    build = await deps.buildMatrix(
      { families: request.families, stops: stopRequests, locations: stops.map(toLocation) },
      { probe: deps.probe, planDate: request.date, today: clock.today },
    );
  } catch (error) {
    // A builder that threw produced no `missing` list, and inventing an empty one would read as
    // "nothing was missing" when in truth nothing was even attempted.
    return {
      ok: false,
      failure: {
        kind: 'matrix-unavailable',
        message: error instanceof Error ? error.message : 'Travel times could not be worked out.',
      },
    };
  }

  const travel: TravelDiagnostics = {
    provenance: build.provenance,
    trafficDowngraded: build.trafficDowngraded,
    missing: build.missing,
  };

  // A degraded matrix still goes to the sequencer. Whether a missing leg matters depends on the
  // order it settles on, and only it can decide that — rejecting here on `missing` alone would
  // throw away days that are perfectly workable.
  const sequenced = deps.sequence(
    stopRequests,
    request.families,
    build.matrix,
    {
      date: request.date,
      leaveAt: request.options.leaveAt,
      returnBy: request.options.returnBy,
      bufferMinutes: request.options.bufferMinutes,
      environment: request.options.environment,
      timezone: clock.timezone,
    },
    clock,
  );

  if (!sequenced.ok) {
    return {
      ok: false,
      failure: {
        kind: 'sequencing-failed',
        failure: sequenced.failure,
        travel,
        blamedLeg: blameLeg(sequenced.failure, build.missing),
      },
    };
  }

  const caveats: PlanCaveat[] = [
    // Read off the structured verdict rather than the prose in `unknowns`, so the screen never
    // has to parse a sentence to find out what it is showing.
    ...sequenced.itinerary.stops
      .filter((stop) => stop.opening.status === 'unknown')
      .map((stop): PlanCaveat => ({
        kind: 'opening-hours-unknown',
        placeId: stop.placeId,
        name: stop.name,
      })),
  ];
  // Counted off the journeys the day actually makes, not the matrix. The matrix holds legs for
  // orders that were considered and dropped, and telling a family their travel times are
  // estimated because of a journey they are not taking would be untrue. The full matrix
  // provenance stays in `travel.provenance` for debugging.
  const estimatedLegsInPlan = sequenced.itinerary.legs.filter((leg) => leg.source === 'estimated').length;
  if (estimatedLegsInPlan > 0) {
    caveats.push({ kind: 'travel-estimated', legs: estimatedLegsInPlan });
  }
  if (build.trafficDowngraded) {
    caveats.push({ kind: 'traffic-not-predictive', planDate: request.date });
  }

  return { ok: true, plan: { itinerary: sequenced.itinerary, travel, caveats, clock } };
}
