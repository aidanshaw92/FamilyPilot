import { VenueCategory } from '@/src/types';
import { OpeningHoursSchedule } from '@/src/types/opening-hours';
import { isOpenOn } from '@/src/utils/opening-hours';

/**
 * How long the family will be at the place, including "I don't know yet".
 *
 * A parent usually does not know how long a farm takes. Forcing a number made them guess, and the guess
 * then decided whether the day fitted. So the length is a choice with three kinds of answer:
 *
 *   a number of minutes   chosen (a preset or a custom length)
 *   'not-sure'            FamilyPilot decides, from what it knows, and says what it assumed
 *   'all-day'             until the place closes (or a stated cap when closing is unknown)
 *
 * What it knows, in order of trust: the venue's own typical visit length where the venue record has one; failing
 * that, a typical length for the KIND of place, which is an assumption about the category and is worded as one
 * ("about 2 hours, typical for a farm"), never as a fact about this venue. Pure; no I/O, no clock.
 */

export type VisitLength = number | 'not-sure' | 'all-day';

export const MIN_VISIT_MINUTES = 15;
export const MAX_VISIT_MINUTES = 480;

/** What an "All day" plan allows when the place's closing time is not known. An assumption, and stated as one. */
export const ALL_DAY_FALLBACK_MINUTES = 360;
/** A visit shorter than this is not worth shortening to for a routine: the journey would outweigh it. */
export const MIN_USEFUL_VISIT_MINUTES = 60;

export interface VisitChoice {
  value: VisitLength;
  label: string;
}

/** The chips the sheet offers, before "Custom". */
export const VISIT_CHOICES: VisitChoice[] = [
  { value: 'not-sure', label: 'Not sure' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 180, label: '3 hours' },
  { value: 240, label: 'Half day' },
  { value: 'all-day', label: 'All day' },
];

/** The length a plan opens on: unless the parent knows, FamilyPilot decides and says what it assumed. */
export const DEFAULT_VISIT_LENGTH: VisitLength = 'not-sure';

/**
 * Typical time at a KIND of place. Planning assumptions, shown as assumptions: never attached to a venue as a fact.
 * A category not listed gets the general default.
 */
const CATEGORY_TYPICAL_MINUTES: Partial<Record<VenueCategory, number>> = {
  park: 90,
  farm: 120,
  zoo: 180,
  museum: 120,
  attraction: 120,
  activity: 90,
  soft_play: 120,
  beach: 150,
  cafe: 60,
  restaurant: 60,
  shop: 45,
  hotel: 120,
};
const GENERAL_TYPICAL_MINUTES = 90;

const CATEGORY_NOUN: Partial<Record<VenueCategory, string>> = {
  park: 'a park',
  farm: 'a farm',
  zoo: 'a zoo',
  museum: 'a museum',
  attraction: 'an attraction',
  activity: 'an activity',
  soft_play: 'soft play',
  beach: 'a beach',
  cafe: 'a café',
  restaurant: 'a restaurant',
  shop: 'a shop',
  hotel: 'a hotel',
};

export const typicalMinutesFor = (category: VenueCategory | string | undefined): number =>
  CATEGORY_TYPICAL_MINUTES[category as VenueCategory] ?? GENERAL_TYPICAL_MINUTES;

export const categoryNoun = (category: VenueCategory | string | undefined): string | null =>
  CATEGORY_NOUN[category as VenueCategory] ?? null;

/** Rounds to the nearest 15 minutes, so an assumed length reads as a length a person would say. */
const toQuarterHour = (minutes: number) => Math.max(MIN_VISIT_MINUTES, Math.round(minutes / 15) * 15);

export type VisitBasis =
  /** The parent chose a length. */
  | 'chosen'
  /** "Not sure", and the venue record carries its own typical visit length. */
  | 'venue-typical'
  /** "Not sure", and the length is a typical one for this kind of place. An assumption. */
  | 'category-typical'
  /** "Not sure", shortened so everyone is home before a routine that has to happen at home. */
  | 'routine-limited'
  /** "All day", ending when the place closes. */
  | 'until-closing'
  /** "All day", with no closing time known: capped at a stated length. An assumption. */
  | 'day-cap';

export interface VisitResolution {
  /** Minutes at the main venue. */
  minutes: number;
  basis: VisitBasis;
  /** `until-closing`: when the place closes (`HH:MM`). */
  closesAt?: string;
  /** `routine-limited`: the routine the visit was shortened for, and whose family. Names are added at render time. */
  routineId?: string;
  familyId?: string;
  /** The length the visit would have been without the routine, so the screen can say what was given up. */
  unshortenedMinutes?: number;
}

export interface VisitResolutionInput {
  length: VisitLength;
  category: VenueCategory | string | undefined;
  /** The venue record's own typical visit length, where it has one. Null/undefined: unknown. */
  venueTypicalMinutes?: number | null;
  /** For "All day": when the day starts at the place, `HH:MM`, and the day, so closing time can be read. */
  arriveAt?: string;
  date?: string;
  openingHours?: OpeningHoursSchedule;
  timezone?: string;
}

const clampVisit = (minutes: number) => Math.min(MAX_VISIT_MINUTES, Math.max(MIN_VISIT_MINUTES, Math.round(minutes)));

function hhmmToMinutes(value: string | undefined): number | null {
  const match = value ? /^(\d{2}):(\d{2})$/.exec(value) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Whether a stored/route value is a usable length. A bad value is rejected rather than quietly replaced. */
export function isVisitLength(value: unknown): value is VisitLength {
  if (value === 'not-sure' || value === 'all-day') return true;
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_VISIT_MINUTES && value <= MAX_VISIT_MINUTES;
}

/** The text a route parameter carries: `90`, `not-sure`, `all-day`. */
export const visitLengthToParam = (length: VisitLength): string => String(length);

export function visitLengthFromParam(value: string | undefined): VisitLength {
  if (value === 'not-sure' || value === 'all-day') return value;
  const minutes = Number(value);
  if (value && Number.isFinite(minutes) && minutes >= MIN_VISIT_MINUTES && minutes <= MAX_VISIT_MINUTES) return minutes;
  // An unreadable length is "not sure", which is honest, rather than a number the parent never chose.
  return DEFAULT_VISIT_LENGTH;
}

/** A length as the sheet's chip reads. Custom lengths read as time. */
export function visitLengthLabel(length: VisitLength): string {
  if (length === 'not-sure') return 'Not sure';
  if (length === 'all-day') return 'All day';
  const preset = VISIT_CHOICES.find((choice) => choice.value === length);
  if (preset) return preset.label;
  if (length < 60) return `${length} min`;
  const hours = Math.floor(length / 60);
  const rest = length % 60;
  return rest === 0 ? `${hours} hour${hours === 1 ? '' : 's'}` : `${hours}h ${rest}m`;
}

/** Whether a length is one of the chips, or a custom number of minutes. */
export const isPresetLength = (length: VisitLength): boolean =>
  VISIT_CHOICES.some((choice) => choice.value === length);

/**
 * The first answer to "how long", before routines are considered. See `fitVisitToRoutine` in day-plan.ts for the
 * second step, which only ever applies to 'not-sure'.
 */
export function resolveVisit(input: VisitResolutionInput): VisitResolution {
  const { length } = input;
  if (typeof length === 'number') return { minutes: clampVisit(length), basis: 'chosen' };

  if (length === 'all-day') {
    const arrive = hhmmToMinutes(input.arriveAt);
    if (arrive !== null && input.date) {
      // Ask when the place shuts by asking whether it is open for the rest of the day: the verdict names the
      // closing time of the period the arrival falls in, and says nothing where hours are unknown.
      const verdict = isOpenOn(input.date, input.arriveAt as string, '23:59', input.openingHours, input.timezone);
      if (verdict.status === 'closed' && verdict.closesDuringVisit && verdict.closesAt) {
        const closes = hhmmToMinutes(verdict.closesAt);
        if (closes !== null && closes > arrive) {
          return {
            minutes: clampVisit(closes - arrive),
            basis: 'until-closing',
            closesAt: verdict.closesAt,
          };
        }
      }
      if (verdict.status === 'open') {
        // Open all day: capped, because eight hours at one place is the most the sequencer will plan.
        return { minutes: clampVisit(ALL_DAY_FALLBACK_MINUTES), basis: 'day-cap' };
      }
    }
    return { minutes: clampVisit(ALL_DAY_FALLBACK_MINUTES), basis: 'day-cap' };
  }

  // 'not-sure'
  const venue = input.venueTypicalMinutes;
  if (typeof venue === 'number' && Number.isFinite(venue) && venue >= 30 && venue <= 360) {
    return { minutes: toQuarterHour(venue), basis: 'venue-typical' };
  }
  return { minutes: toQuarterHour(typicalMinutesFor(input.category)), basis: 'category-typical' };
}

/** "2 hours", "1h 30m", "45 min": the length as a sentence reads it. */
export function spokenMinutes(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} minutes`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (rest === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  if (rest === 30) return hours === 1 ? 'an hour and a half' : `${hours} and a half hours`;
  return `${hours}h ${rest}m`;
}

/**
 * One line saying how long the plan allowed and why, for the plan screen.
 *
 * Only for a length FamilyPilot chose. A length the parent chose is theirs and needs no explaining. The wording
 * keeps an assumption an assumption ("typical for a farm") and a venue's own figure a venue's figure.
 */
export function visitNote(
  resolution: VisitResolution | undefined,
  category: VenueCategory | string | undefined,
  routineSentence?: string | null,
): string | null {
  if (!resolution) return null;
  const spoken = spokenMinutes(resolution.minutes);
  switch (resolution.basis) {
    case 'chosen':
      return null;
    case 'venue-typical':
      return `You weren’t sure how long, so we allowed about ${spoken}. That is the usual visit length recorded for this place.`;
    case 'category-typical': {
      const noun = categoryNoun(category);
      return `You weren’t sure how long, so we allowed about ${spoken}${noun ? `, which is typical for ${noun}` : ''}. It is a planning assumption, not something we know about this place.`;
    }
    case 'routine-limited':
      return routineSentence
        ? `You weren’t sure how long, so we kept it to about ${spoken}, ${routineSentence}`
        : `You weren’t sure how long, so we shortened it to ${spoken} to fit your routines.`;
    case 'until-closing':
      return `All day here means until it closes at ${resolution.closesAt}: ${spoken} from your arrival.`;
    case 'day-cap':
      return `All day is planned as ${spoken} here, because we don’t know when it closes. It is a planning assumption: check the hours.`;
    default:
      return null;
  }
}
