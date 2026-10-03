import { FoodCandidate } from '@/src/types/nearby-food';
import { TravelLeg } from '@/src/types/travel';
import { travelSourceOfLeg, travelTimeWithMode } from '@/src/utils/travel-time';

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
