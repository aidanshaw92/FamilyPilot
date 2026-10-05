import { FoodCandidate } from '@/src/types/nearby-food';
import { TravelLeg } from '@/src/types/travel';
import { travelSourceOfLeg, travelTimeWithMode } from '@/src/utils/travel-time';
import { describeOpeningToday, OpeningTodayState } from '@/src/utils/opening-today';
import { parseOsmOpeningHours } from '@/src/utils/osm-opening-hours';

/** The text lines of frame 02's restaurant card, kept pure so they can be tested without native modules. */
export const CATEGORY_NOUN: Record<FoodCandidate['category'], string> = {
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  fast_food: 'Quick bite',
};

/** Walk first, like the frame's "5 min walk"; the label keeps the source honest ("about"). */
export function restaurantTravelLine(travel: TravelLeg[]): string | null {
  const order: TravelLeg['mode'][] = ['walk', 'drive', 'transit', 'bus', 'cycle'];
  const leg = order.map((mode) => travel.find((l) => l.mode === mode)).find(Boolean);
  return leg ? travelTimeWithMode(leg.durationMinutes, travelSourceOfLeg(leg), leg.mode) : null;
}

/** Only what OpenStreetMap actually tagged yes. Nothing tagged is said out loud, never left blank. */
export function restaurantFactsLine(candidate: FoodCandidate): { text: string; recorded: boolean } {
  const notes: string[] = [];
  if (candidate.tagged.highchair) notes.push('Highchairs');
  if (candidate.tagged.changingTable) notes.push('Baby changing');
  if (candidate.tagged.outdoorSeating) notes.push('Outdoor seating');
  if (candidate.tagged.wheelchair) notes.push('Step-free entrance');
  return notes.length ? { text: notes.join(' · '), recorded: true } : { text: 'Nobody has recorded facilities for children here', recorded: false };
}

/** The opening hours OpenStreetMap carries, or the plain statement that it carries none. */
export function restaurantHoursLine(candidate: FoodCandidate): { text: string; recorded: boolean } {
  return candidate.openingHours
    ? { text: `Hours: ${candidate.openingHours}`, recorded: true }
    : { text: 'Hours not listed', recorded: false };
}

/** The tags OpenStreetMap said yes to, one short label each, for chips. Empty when nothing was recorded. */
export function restaurantFacilityChips(candidate: FoodCandidate): string[] {
  const chips: string[] = [];
  if (candidate.tagged.highchair) chips.push('Highchairs');
  if (candidate.tagged.changingTable) chips.push('Baby changing');
  if (candidate.tagged.outdoorSeating) chips.push('Outdoor seating');
  if (candidate.tagged.wheelchair) chips.push('Step-free entrance');
  return chips;
}

export interface RestaurantOpenLine {
  text: string;
  state: OpeningTodayState | 'listed' | 'not_listed';
}

/**
 * Whether the place is open, worked out from OpenStreetMap's own hours when they are in a form this can read
 * (`parseOsmOpeningHours`), and shown as the raw text when they are not. Never "open" or "closed" from a guess: a
 * place with no hours says "Hours not listed", which is different from shut.
 */
export function restaurantOpenLine(candidate: FoodCandidate, now: Date = new Date()): RestaurantOpenLine {
  const raw = candidate.openingHours?.trim();
  if (!raw) return { text: 'Hours not listed', state: 'not_listed' };
  const schedule = parseOsmOpeningHours(raw);
  if (!schedule) return { text: `Hours: ${raw}`, state: 'listed' };
  const today = describeOpeningToday(schedule, now);
  return { text: today.label, state: today.state };
}
