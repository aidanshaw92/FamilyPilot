import { DayPlanRequest, PlanGenerationFailure, ResolvedStop } from '@/src/types/day-plan';
import { SequenceFailure, UnmetRequirement } from '@/src/types/day-sequence';

import { buildJourneyMatrix } from './journey-matrix';
import { journeyProbe } from './journey-probe';
import { PlanStopSource, generateDayPlan, resolvedStop, stopFacts } from './day-plan';
import { sequenceDay } from './sequencer';
import { PlanningFamily } from './planner';
import { PlanDraft } from './plan-draft';
import { PlanViewContext, PlanViewModel, PlanViewModelInput, toPlanViewModel } from './plan-view-model';
import { VisitLength, resolveVisit } from './visit-duration';
import { buggyFamilyIds } from './routine-subjects';
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
  /**
   * Omitted when nothing is cached, or when the parent took lunch out of the plan: the day is then built without
   * a meal.
   */
  meal?: MealCandidate;
  /**
   * A place to eat is known near the venue, whether or not it is in this day. Lets the plan offer "Add a 45-minute
   * lunch and recheck the timings" when a feed falls in the middle of the visit.
   */
  lunchAvailable?: boolean;
  /** Names and the household title, added only when a screen draws the day. Never saved. */
  viewContext?: PlanViewContext;
  /**
   * Whether the absent meal is an absent meal or a broken lookup.
   *
   * `meal` being undefined covers both, and they are not the same thing to a parent. Passing this
   * lets the finished plan say which, rather than omitting lunch silently in both cases.
   */
  mealLookupFailed?: boolean;
  /** The anchor's photograph for frame 03's stop thumbnail. Absent, the card draws a placeholder. */
  anchorImageUrl?: string;
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

/**
 * One tap that changes the plan and builds it again: a different start, or a different length. Only offered where
 * the planner knows the exact value that would work, never as a guess.
 */
export interface CreatePlanFailureAction {
  kind: 'start' | 'visit';
  label: string;
  startAt?: string;
  visit?: VisitLength;
}

export interface CreatePlanFailure {
  ok: false;
  /** Short, specific, and never "something went wrong". */
  title: string;
  message: string;
  /** What the parent can change to get a day. Empty when nothing would help. */
  suggestions: string[];
  /** One-tap fixes with the exact value filled in. */
  actions?: CreatePlanFailureAction[];
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

function minutesOfClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
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
function describeSequenceFailure(failure: SequenceFailure, venueName: string, startAt?: string): CreatePlanFailure {
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
    case 'venue-closes-during-visit': {
      // With the closing time and the start in hand, the exact length that fits is known: offer it.
      const closes = failure.closesAt ? minutesOfClock(failure.closesAt) : null;
      const from = startAt ? minutesOfClock(startAt) : null;
      const actions: CreatePlanFailureAction[] =
        closes !== null && from !== null && closes - from >= 30
          ? [{ kind: 'visit', label: `Stay until it closes at ${failure.closesAt}`, visit: Math.min(480, closes - from) }]
          : [];
      return {
        ok: false,
        title: 'The visit would run past closing',
        message: failure.closesAt
          ? `${venueName} closes at ${failure.closesAt}, which is before the visit would finish.`
          : failure.message,
        suggestions: ['Start earlier', 'Choose a shorter visit'],
        actions,
      };
    }
    case 'start-too-soon':
      // A start nobody could reach is the parent's to move, and the answer is a time, so it is offered as one.
      return {
        ok: false,
        title: 'That start is a little too soon',
        message: `Getting everyone there by ${startAt ?? 'then'} would mean leaving before you can. The earliest everyone could arrive is ${minutesToClock(failure.earliestArrival)}.`,
        suggestions: ['Pick a later start', 'Try another date'],
        actions: [{ kind: 'start', label: `Start at ${minutesToClock(failure.earliestArrival)}`, startAt: minutesToClock(failure.earliestArrival) }],
      };
    case 'routine-conflict':
      // No longer produced: a routine overlapping the day is advice on the plan, not a reason to refuse it. Kept so a
      // saved failure from an older build still words itself.
      return {
        ok: false,
        title: 'It overlaps one of your routines',
        message: `This day would run into ${failure.routineLabel}.`,
        suggestions: ['Start earlier', 'Choose a shorter visit', 'Try another date'],
      };
    case 'travel-unknown':
      // NOT "too long", and NOT "raise your limit". Nobody timed this journey, so no claim about its
      // length is available and the parent's limit is not the obstacle. The sequencer's sentence names
      // the two ends; the household label is turned into prose the same way as everywhere else.
      return {
        ok: false,
        title: 'We could not work out the journey',
        message: failure.message.replace(/\bOur family\b/, 'your family'),
        suggestions: ['Try again in a moment', 'Check your home location in your profile'],
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
        const nearest = describeSequenceFailure(failure.nearest, venueName, startAt);
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

function describeGenerationFailure(failure: PlanGenerationFailure, venueName: string, startAt?: string): CreatePlanFailure {
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
      return describeSequenceFailure(failure.failure, venueName, startAt);
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

  // The venue's own facts, through the same extractor the sequencer matches on, so the length FamilyPilot assumes, the
  // Travel & parking section and the day cannot disagree about the place.
  const anchorFacts = stopFacts(venue);
  // How long at the venue: a chosen length, or one FamilyPilot works out and will say it assumed.
  const visit = resolveVisit({
    length: draft.visit,
    category: venue.category,
    venueTypicalMinutes: anchorFacts.visitDurationMinutes,
    arriveAt: draft.startAt,
    date: draft.date,
    openingHours: venue.openingHours,
  });
  const anchor: ResolvedStop = resolvedStop(venue, 'activity', visit.minutes);

  // An all-day visit has no lunch bolted onto the end of it: food is part of the day there, and a stop after eight hours
  // would be a meal at teatime. A shorter day still gets the lunch that is already known.
  const withMeal = meal && draft.visit !== 'all-day' ? meal : undefined;

  // Reported only when there is a meal to add, matching the steps `createPlanSteps` offered.
  if (withMeal) step('lunch');
  const mealStop: ResolvedStop | undefined = withMeal
    ? resolvedStop(withMeal.place, 'meal', MEAL_DWELL_MINUTES)
    : undefined;

  const request: DayPlanRequest = {
    date: draft.date,
    families,
    anchor,
    meal: mealStop,
    visit,
    options: {
      // Leaving home is worked back from the arrival the parent named. The floor is midnight; on today the
      // sequencer also floors it at the current time, which is what makes a start in the past "too soon".
      leaveAt: '00:00',
      arriveAt: draft.startAt,
      returnBy: input.returnBy ?? draft.returnBy ?? '',
      bufferMinutes: input.bufferMinutes ?? draft.bufferMinutes ?? 15,
      environment: input.environment ?? draft.environment ?? 'either',
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
  if (!result.ok) return describeGenerationFailure(result.failure, venue.name, draft.startAt);

  const source: PlanViewModelInput = {
    itinerary: result.plan.itinerary,
    travel: result.plan.travel,
    // Appended rather than produced by `generateDayPlan`: the sequencer never saw the food lookup, so
    // only the caller knows whether a missing meal was an empty neighbourhood or a failed request.
    caveats:
      input.mealLookupFailed && !meal
        ? [...result.plan.caveats, { kind: 'meal-lookup-failed' as const }]
        : result.plan.caveats,
    anchorName: venue.name,
    parking: {
      parking: anchorFacts.parking,
      freeParking: anchorFacts.freeParking,
      info: input.parkingInfo,
    },
    // Frame 03's stop thumbnails: the anchor's own photograph; a lunch stop from OpenStreetMap has
    // none, so it draws the restaurant placeholder rather than borrowing a picture.
    media: {
      [anchor.placeId]: { imageUrl: input.anchorImageUrl, category: venue.category },
      ...(mealStop ? { [mealStop.placeId]: { category: 'restaurant' } } : {}),
    },
    // What the advice on the plan is worked from. Facts about the venue and the day, and the family ids that use a
    // pushchair: no child's name, age or routine detail is saved here.
    visit: result.plan.visit,
    alternatives: result.plan.alternatives,
    pushchair: anchorFacts.pushchairSuitability,
    buggyFamilyIds: buggyFamilyIds(families),
    lunchAvailable: Boolean(input.lunchAvailable ?? meal),
    hasRoutines: families.some((family) => family.routines.length > 0),
    anchorCategory: venue.category,
  };

  return { ok: true, view: toPlanViewModel(source, input.viewContext), source };
}
