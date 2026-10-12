import { HalfwayFit, HalfwayJourney, HalfwayOption, CLOSE_GAP_MINUTES, topCardLabel } from './meet-halfway';
import { familyDisplayName } from '@/src/utils/family-title';
import { formatCategory } from '@/src/utils/format-category';
import { travelTimeLabel } from '@/src/utils/travel-time';

/**
 * What the Meet halfway screen says, as plain functions so the wording is tested rather than eyeballed. Nothing here
 * decides anything: the engine ranks, grades and words; these only arrange its output for the card, the sheet and the list.
 */

/** "Kevin’s family" → "Kevin’s": the chip's name for the other family. Yours is "You". */
export function shortFamilyName(label: string): string {
  const full = familyDisplayName(label);
  const short = full.replace(/\s+family$/i, '');
  return short || full;
}

/** The chip's name for a family. */
export const chipName = (role: 'mine' | 'other', label: string): string => (role === 'mine' ? 'You' : shortFamilyName(label));

/**
 * The bars of the journey comparison: each family's estimated one-way journey as a share of the longer of the two, so the bars
 * are proportional to each other and the longer one is always full. Not to scale with anything else, and not a route.
 * A journey that could not be worked out (defensive: the engine never offers such an option) is `missing`, not zero.
 */
export interface JourneyBar {
  journey: HalfwayJourney;
  share: number;
  time: string;
  who: string;
  missing: boolean;
}

export function journeyBars(journeys: readonly HalfwayJourney[]): JourneyBar[] {
  const known = journeys.filter((journey) => Number.isFinite(journey.minutes) && journey.minutes >= 0);
  const longest = Math.max(1, ...known.map((journey) => journey.minutes));
  return journeys.map((journey) => {
    const missing = !(Number.isFinite(journey.minutes) && journey.minutes >= 0);
    return {
      journey,
      missing,
      share: missing ? 0 : Math.max(0.04, Math.min(1, journey.minutes / longest)),
      time: missing ? 'not worked out yet' : travelTimeLabel(journey.minutes, 'estimated'),
      who: journey.role === 'mine' ? 'Your family' : familyDisplayName(journey.label),
    };
  });
}

/** Whether every journey is known: the fairness sentence is only said, and the places only compared, when both are. */
export const journeysKnown = (option: Pick<HalfwayOption, 'journeys'>): boolean => journeyBars(option.journeys).every((bar) => !bar.missing);

/** The notice under a comparison that cannot be made: names the family, says what to do, claims no fairness. */
export function missingJourneyNotice(option: Pick<HalfwayOption, 'journeys'>): { title: string; body: string } | null {
  const bar = journeyBars(option.journeys).find((entry) => entry.missing);
  if (!bar) return null;
  return {
    title: `We couldn’t work out ${bar.journey.role === 'mine' ? 'your' : `${shortFamilyName(bar.journey.label)}`} journey`,
    body: 'Check the postcode you added, then try again. No fairness is claimed until both are known.',
  };
}

/** The fairness line is a warning (not just a note) once the journeys differ by more than the engine calls close. */
export const journeysUneven = (option: Pick<HalfwayOption, 'gap'>): boolean => option.gap > CLOSE_GAP_MINUTES;

/** The label at the head of a card and the sheet: the engine's own wording, a claim only where it is supported. */
export const optionLabel = (option: Pick<HalfwayOption, 'checks' | 'supported'>): string => topCardLabel(option);

/** "Farm · 2 things to check" on a list card: the place's kind, then how much is open. */
export function listCardMeta(option: Pick<HalfwayOption, 'venue' | 'checks'>): string {
  const kind = formatCategory(option.venue.category);
  if (option.checks <= 0) return kind;
  return `${kind} · ${option.checks} ${option.checks === 1 ? 'thing' : 'things'} to check`;
}

/** "Farm · 1 of 5" under the name on the expanded sheet. */
export const positionLine = (option: Pick<HalfwayOption, 'venue'>, index: number, total: number): string =>
  `${formatCategory(option.venue.category)} · ${index + 1} of ${total}`;

/**
 * The words under the other family's grade. They name no attribute of that family: what is true is only that the grade rests
 * on what they chose to share. Whether they shared a child's age, a need or a pushchair is not said, and neither is what
 * they did not share.
 */
export function otherFitProvenance(fit: HalfwayFit, label: string): { headline: string; note: string } {
  const who = familyDisplayName(label);
  if (fit.verdict === 'not_assessed') {
    return {
      headline: 'Not assessed',
      note: `${who} hasn’t shared enough for a Family Fit. Only their journey is checked.`,
    };
  }
  const note = `Based only on what ${who} chose to share. Nothing else is shown or known about them.`;
  switch (fit.verdict) {
    case 'excellent':
    case 'good':
      return { headline: fit.qualified ? `Looks practical for ${who}` : `Family Fit is ${fit.verdict} for ${who}`, note };
    case 'possible':
      return { headline: `Family Fit is only a possible match for ${who}`, note };
    case 'poor':
      return { headline: `Family Fit says this probably isn’t right for ${who}`, note };
    default:
      return { headline: 'We haven’t reviewed this place for families yet', note };
  }
}

const POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})?$/i;

/**
 * What a starting point is called on this screen: the outward part of a postcode ("NW5 2AB" and "NW52AB" are both "NW5"),
 * or a place name as given ("Camden, London" is "Camden"). Never the inward part of a postcode, which narrows it to a street.
 */
export function outwardCode(area: string): string {
  const text = area.trim();
  if (!text) return '';
  const postcode = POSTCODE.exec(text);
  if (postcode) return postcode[1].toUpperCase();
  return text.split(',')[0].trim();
}

