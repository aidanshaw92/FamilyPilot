import { ExternalPlaceRecord } from '@/src/types/places';
import { DayPlanRequest, PlanGenerationFailure, ResolvedStop } from '@/src/types/day-plan';
import { SequenceFailure } from '@/src/types/day-sequence';

import { buildJourneyMatrix } from './journey-matrix';
import { journeyProbe } from './journey-probe';
import { generateDayPlan, resolvedStopFromRecord } from './day-plan';
import { sequenceDay } from './sequencer';
import { PlanningFamily } from './planner';
import { PlanDraft } from './plan-draft';
import { PlanViewModel, toPlanViewModel } from './plan-view-model';

/**
 * One call behind the approved Create a Plan button.
 *
 * The route stays a view: it collects a draft, calls this, and renders either the Generating steps or
 * the Plan. Everything that decides what a day is -- which stops, what a failure means, what to
 * suggest when it cannot be built -- lives here where it can be tested without mounting a screen.
 *
 * Lunch is passed IN rather than searched for. A restaurant search is a billable Google call, and
 * Venue Detail has already paid for one through its Eat nearby section, so the caller hands over what
 * it already holds. When there is nothing cached the day is built without a meal and says so, instead
 * of buying a second search inside a button press.
 */

/** 45 minutes at the table, matching the length the existing planner already uses for a meal. */
export const MEAL_DWELL_MINUTES = 45;

export type CreatePlanStepId = 'venue' | 'lunch' | 'travel' | 'timing';

export interface CreatePlanStep {
  id: CreatePlanStepId;
  label: string;
}

export interface MealCandidate {
  record: ExternalPlaceRecord;
  /** Straight-line walking estimate, when the caller knows it. Used only for the progress line. */
  walkMinutes?: number;
}

export interface CreatePlanInput {
  venue: ExternalPlaceRecord;
  draft: PlanDraft;
  /** Already resolved from the draft's party ids, with coordinates. */
  families: PlanningFamily[];
  /** Omitted when nothing is cached: the day is then built without a meal. */
  meal?: MealCandidate;
  returnBy?: string;
  bufferMinutes?: number;
  environment?: 'either' | 'indoor' | 'outdoor';
}

export interface CreatePlanDeps {
  buildMatrix?: typeof buildJourneyMatrix;
  sequence?: typeof sequenceDay;
  probe?: typeof journeyProbe;
  now?: Date;
  onStep?: (id: CreatePlanStepId) => void;
}

export interface CreatePlanSuccess {
  ok: true;
  view: PlanViewModel;
}

export interface CreatePlanFailure {
  ok: false;
  /** Short, specific, and never "something went wrong". */
  title: string;
  message: string;
  /** What the parent can change to get a day. Empty when nothing would help. */
  suggestions: string[];
}

export type CreatePlanOutcome = CreatePlanSuccess | CreatePlanFailure;

/**
 * The Generating steps, in the order the work actually happens.
 *
 * Concrete rather than atmospheric: each line names the thing being worked out, and the lunch line
 * names the restaurant when one is known. Nothing here claims to be thinking.
 */
export function createPlanSteps(input: { venueName: string; meal?: MealCandidate }): CreatePlanStep[] {
  const lunchLabel = input.meal
    ? input.meal.walkMinutes != null
      ? `Finding lunch within a ${input.meal.walkMinutes}-minute walk`
      : `Adding lunch at ${input.meal.record.name}`
    : 'Checking for lunch nearby';
  return [
    { id: 'venue', label: `Checking ${input.venueName} fits your family` },
    { id: 'lunch', label: lunchLabel },
    { id: 'travel', label: 'Working out travel and parking' },
    { id: 'timing', label: 'Fitting the day around your family' },
  ];
}

function minutesToClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * A sequencing failure turned into something a parent can act on.
 *
 * The sequencer already knows precisely what stood in the way -- which venue shut, which routine
 * clashed, whose journey was too long. Collapsing that into "no plan found" throws away the only
 * part that helps, so each reason keeps its detail and carries its own suggestions.
 */
function describeSequenceFailure(failure: SequenceFailure, venueName: string): CreatePlanFailure {
  switch (failure.reason) {
    case 'venue-closed':
      return {
        ok: false,
        title: `${venueName} is closed that day`,
        message: failure.message,
        suggestions: ['Try another date', 'Pick a different place'],
      };
    case 'venue-closes-during-visit':
      return {
        ok: false,
        title: 'The visit would run past closing',
        message: failure.closesAt
          ? `${venueName} closes at ${failure.closesAt}, which is before the visit would finish.`
          : failure.message,
        suggestions: ['Start earlier', 'Choose a shorter visit'],
      };
    case 'routine-conflict':
      return {
        ok: false,
        title: 'It clashes with your family’s routine',
        message: `This day would run into ${failure.routineLabel}.`,
        suggestions: ['Start earlier', 'Choose a shorter visit', 'Try another date'],
      };
    case 'travel-infeasible':
      return {
        ok: false,
        title: 'The journey is too long',
        message:
          failure.travelMinutes != null && failure.limitMinutes != null
            ? `That leg is about ${failure.travelMinutes} minutes, and your limit is ${failure.limitMinutes}.`
            : failure.message,
        suggestions: ['Raise your travel limit in your profile', 'Pick somewhere closer'],
      };
    case 'return-by-exceeded':
      return {
        ok: false,
        title: 'You would get home too late',
        message: `This day gets you home about ${minutesToClock(failure.homeAt)}, after the ${minutesToClock(failure.returnBy)} you asked for.`,
        suggestions: ['Start earlier', 'Choose a shorter visit', 'Allow a later return'],
      };
    case 'no-feasible-sequence': {
      // The closest miss is the useful part: it names what actually blocked the best attempt.
      if (failure.nearest) {
        const nearest = describeSequenceFailure(failure.nearest, venueName);
        return { ...nearest, title: nearest.title };
      }
      return {
        ok: false,
        title: 'No day fits yet',
        message: 'Every order and start time tried ran into one of your limits.',
        suggestions: ['Start earlier', 'Choose a shorter visit', 'Try another date'],
      };
    }
    case 'invalid-request':
    default:
      return {
        ok: false,
        title: 'Something in the plan does not add up',
        message: failure.message,
        suggestions: [],
      };
  }
}

function describeGenerationFailure(failure: PlanGenerationFailure, venueName: string): CreatePlanFailure {
  switch (failure.kind) {
    case 'invalid-request':
      return { ok: false, title: 'Check the plan details', message: failure.message, suggestions: [] };
    case 'matrix-unavailable':
      return {
        ok: false,
        title: 'Travel times are unavailable',
        message: 'We could not work out journey times just now, so the day has not been timed.',
        suggestions: ['Try again in a moment'],
      };
    case 'sequencing-failed':
      return describeSequenceFailure(failure.failure, venueName);
    default:
      return { ok: false, title: 'No day fits yet', message: '', suggestions: [] };
  }
}

export async function createPlan(
  input: CreatePlanInput,
  deps: CreatePlanDeps = {},
): Promise<CreatePlanOutcome> {
  const { venue, draft, families, meal } = input;
  const step = deps.onStep ?? (() => {});

  step('venue');
  if (!families.length) {
    return { ok: false, title: 'Nobody is coming yet', message: 'Choose at least one family for this day.', suggestions: [] };
  }

  const anchor: ResolvedStop = resolvedStopFromRecord(venue, 'activity', draft.visitMinutes);

  step('lunch');
  const mealStop: ResolvedStop | undefined = meal
    ? resolvedStopFromRecord(meal.record, 'meal', MEAL_DWELL_MINUTES)
    : undefined;

  const request: DayPlanRequest = {
    date: draft.date,
    families,
    anchor,
    meal: mealStop,
    options: {
      leaveAt: draft.leaveAt,
      returnBy: input.returnBy ?? '',
      bufferMinutes: input.bufferMinutes ?? 15,
      environment: input.environment ?? 'either',
    },
  };

  step('travel');
  const result = await generateDayPlan(request, {
    buildMatrix: deps.buildMatrix ?? buildJourneyMatrix,
    sequence: deps.sequence ?? sequenceDay,
    probe: deps.probe ?? journeyProbe,
    now: deps.now ?? new Date(),
  });

  step('timing');
  if (!result.ok) return describeGenerationFailure(result.failure, venue.name);

  return {
    ok: true,
    view: toPlanViewModel({
      itinerary: result.plan.itinerary,
      travel: result.plan.travel,
      caveats: result.plan.caveats,
      anchorName: venue.name,
    }),
  };
}
