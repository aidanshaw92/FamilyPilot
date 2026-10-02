import { DayPlanRequest, PlanGenerationFailure, ResolvedStop } from '@/src/types/day-plan';
import { SequenceFailure, UnmetRequirement } from '@/src/types/day-sequence';

import { buildJourneyMatrix } from './journey-matrix';
import { journeyProbe } from './journey-probe';
import { PlanStopSource, generateDayPlan, resolvedStop, stopFacts } from './day-plan';
import { sequenceDay } from './sequencer';
import { PlanningFamily } from './planner';
import { PlanDraft } from './plan-draft';
import { PlanViewModel, PlanViewModelInput, toPlanViewModel } from './plan-view-model';
import { TravelLeg } from '@/src/types/travel';
import { travelSourceOf } from '@/src/utils/travel-time';

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
  place: PlanStopSource;
  /**
   * How the parent would get from the anchor to lunch, with the provenance of each figure.
   *
   * Was `walkMinutes?: number`. A bare integer could not say whether it had been routed or guessed,
   * which is how an estimate reaches a screen dressed as a measurement -- and it assumed walking, and
   * one origin. A leg carries its own mode, source and confidence, so the Plan can word each one
   * honestly and a routed value needs no new field when it arrives.
   */
  travel?: TravelLeg[];
}

export interface CreatePlanInput {
  /**
   * The venue the day is built around, already narrowed by one of day-plan's adapters —
   * `planStopFromVenueDetail` from the detail screen, `planStopFromRecord` from a provider record.
   * Taking the narrowed shape rather than either source keeps the field renaming in one place.
   */
  venue: PlanStopSource;
  draft: PlanDraft;
  /** Already resolved from the draft's party ids, with coordinates. */
  families: PlanningFamily[];
  /** Omitted when nothing is cached: the day is then built without a meal. */
  meal?: MealCandidate;
  /**
   * The venue's reviewed free-text parking detail, where it has one. Claim-backed facts come from
   * the venue itself, so only this prose needs passing in.
   */
  parkingInfo?: string;
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
  /**
   * What the view was derived from, so a saved day stores the planner's answer rather than its
   * presentation. Re-rendering a saved day runs the same adapter over the same input and therefore
   * produces the same screen, and a later change to how a day reads reaches saved days too instead
   * of leaving them frozen in an old vocabulary.
   */
  source: PlanViewModelInput;
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
  const steps: CreatePlanStep[] = [
    { id: 'venue', label: `Checking ${input.venueName} fits your family` },
  ];
  // No step for work that will not happen. With nothing cached, no restaurant is looked at -- a
  // search is a billable call this button does not make -- so a line saying lunch is being checked
  // would be a progress bar for nothing.
  if (input.meal) {
    const walk = input.meal.travel?.find((leg) => leg.mode === 'walk');
    steps.push({
      id: 'lunch',
      label: walk
        // Hedged even here, because the number is a straight-line estimate and a progress line that
        // says "within a 6-minute walk" is making the same promise the Plan refuses to make.
        ? `Finding lunch about a ${walk.durationMinutes}-minute walk away`
        : `Adding lunch at ${input.meal.place.name}`,
    });
  }
  steps.push(
    { id: 'travel', label: 'Working out travel and parking' },
    { id: 'timing', label: 'Fitting the day around your family' },
  );
  return steps;
}

/**
 * What each required constraint is called when a parent reads about it.
 *
 * Only the fields the matcher can actually fail at `required` strength appear. A field with no entry
 * falls back to the sequencer's own sentence rather than being rendered as a raw key.
 */
const REQUIREMENT_LABELS: Record<string, string> = {
  // Namespaced exactly as the matcher emits them. A bare `toilets` here would silently never match,
  // and every unmet requirement would fall through to the generic sentence.
  'familyFacilities.toilets': 'toilets',
  'familyFacilities.babyChanging': 'baby changing',
  'familyFacilities.parking': 'parking',
  pushchairSuitability: 'pushchair access',
};

/**
 * An unmet requirement in a parent's words, keeping "has none" and "nobody checked" apart.
 *
 * The difference is the whole point. Telling a parent a venue has no baby changing when the truth is
 * that nobody has confirmed it is a claim FamilyPilot has no evidence for, and it is the kind of
 * claim that stops a family going somewhere perfectly suitable.
 */
function requirementLine(requirement: UnmetRequirement, venueName: string): string | null {
  if (requirement.field === 'pushchairSuitability') {
    return requirement.outcome === 'unsuitable'
      ? `${venueName} is recorded as difficult with a pushchair, and your family needs it to work.`
      : `Nobody has confirmed whether ${venueName} works with a pushchair, and your family needs it to.`;
  }
  const label = REQUIREMENT_LABELS[requirement.field];
  if (label) {
    return requirement.outcome === 'unsuitable'
      ? `${venueName} does not have ${label}, and your family needs it.`
      : `Nobody has confirmed ${label} at ${venueName}, and your family needs it.`;
  }
  switch (requirement.field) {
    case 'journey':
      return `${venueName} is further away than your travel limit allows.`;
    case 'ageAdmission':
      return `${venueName} has an age policy that would turn one of your children away.`;
    case 'environment':
      return `${venueName} is not the kind of place you asked for today.`;
    default:
      return null;
  }
}

/**
 * The household, as it belongs in a sentence.
 *
 * "Our family" is the label the signed-in household carries in lists and chips, where it reads
 * correctly. Dropped into prose it does not: "does not fit Our family yet". Any other household has
 * a name the parent gave it, which does belong there as written.
 */
function readableFamily(label: string): string {
  return label.trim().toLowerCase() === 'our family' ? 'your family' : label;
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
    case 'requirement-unmet': {
      const lines = failure.unmet
        .map((requirement) => requirementLine(requirement, venueName))
        .filter((line): line is string => line !== null);
      // Only unconfirmed requirements can be settled by checking; a requirement the venue genuinely
      // fails cannot, so that suggestion is offered only where it would help.
      const anyUnknown = failure.unmet.some((requirement) => requirement.outcome === 'unknown');
      return {
        ok: false,
        title: `${venueName} does not fit ${readableFamily(failure.familyLabel)} yet`,
        // The sequencer's own sentence is the fallback, never a bare field name.
        message: lines.length ? lines.join(' ') : failure.message,
        suggestions: anyUnknown
          ? ['Check with the venue before you go', 'Pick a different place', 'Change your must-haves in your profile']
          : ['Pick a different place', 'Change your must-haves in your profile'],
      };
    }
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
    case 'travel-infeasible': {
      // Worded from the leg's own provenance. This used to say "about" unconditionally, which was
      // wrong in the one direction nobody checks for: a routed 47 minutes was presented as a guess.
      // Both units stay "minutes" rather than borrowing the card-sized "min", because this sentence
      // is read next to the limit the parent typed in minutes.
      const hedge = travelSourceOf(failure.travelSource) === 'measured' ? '' : 'about ';
      return {
        ok: false,
        title: 'The journey is too long',
        message:
          failure.travelMinutes != null && failure.limitMinutes != null
            ? `That leg is ${hedge}${failure.travelMinutes} minutes, and your limit is ${failure.limitMinutes}.`
            : failure.message,
        suggestions: ['Raise your travel limit in your profile', 'Pick somewhere closer'],
      };
    }
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

  const anchor: ResolvedStop = resolvedStop(venue, 'activity', draft.visitMinutes);

  // Reported only when there is a meal to add, matching the steps `createPlanSteps` offered.
  if (meal) step('lunch');
  const mealStop: ResolvedStop | undefined = meal
    ? resolvedStop(meal.place, 'meal', MEAL_DWELL_MINUTES)
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

  // From the anchor's own facts, through the same extractor the sequencer matched on, so the
  // Travel & parking section cannot disagree with the day it describes.
  const anchorFacts = stopFacts(venue);
  const source: PlanViewModelInput = {
    itinerary: result.plan.itinerary,
    travel: result.plan.travel,
    caveats: result.plan.caveats,
    anchorName: venue.name,
    parking: {
      parking: anchorFacts.parking,
      freeParking: anchorFacts.freeParking,
      info: input.parkingInfo,
    },
  };

  return { ok: true, view: toPlanViewModel(source), source };
}
