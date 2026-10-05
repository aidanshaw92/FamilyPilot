import { Venue } from '@/src/types';

/**
 * Food, as a thing a parent can filter and rank on: a cafe on site, or somewhere to eat within a short walk.
 *
 * Both answers come only from evidence. "On site" is true when the venue's confirmed facilities include a cafe; it is
 * never inferred from the category. "Within N minutes" comes from a stored OpenStreetMap lookup (`Venue.foodNearby`).
 * A venue with neither answer is UNKNOWN, not "no food": a filter keeps only the places known to have it, and the
 * screen says how many it could not check, so a missing lookup never reads as a missing cafe.
 */
export type FoodFilterId = 'food_onsite' | 'food_5' | 'food_10';

export const FOOD_FILTER_OPTIONS: { id: FoodFilterId; label: string }[] = [
  { id: 'food_onsite', label: 'Café on site' },
  { id: 'food_5', label: 'Food within 5 min walk' },
  { id: 'food_10', label: 'Food within 10 min walk' },
];

export const FOOD_FILTER_IDS: readonly string[] = FOOD_FILTER_OPTIONS.map((o) => o.id);

export function hasOnSiteCafe(venue: Venue): boolean {
  return (venue.facilities ?? []).includes('cafe' as never);
}

/** True/false when a lookup exists, null when nobody has looked. */
export function foodWithinWalk(venue: Venue, minutes: 5 | 10): boolean | null {
  const food = venue.foodNearby;
  if (!food) return null;
  return (minutes === 5 ? food.within5 : food.within10) > 0;
}

/** Whether the venue is KNOWN to satisfy the filter. Unknown is not a match. */
export function matchesFoodFilter(venue: Venue, id: FoodFilterId): boolean {
  switch (id) {
    case 'food_onsite':
      return hasOnSiteCafe(venue);
    case 'food_5':
      return hasOnSiteCafe(venue) || foodWithinWalk(venue, 5) === true;
    case 'food_10':
      return hasOnSiteCafe(venue) || foodWithinWalk(venue, 10) === true;
  }
}

/** Neither a cafe on site nor a lookup: this venue cannot be checked for the filter either way. */
export function foodIsUnknown(venue: Venue): boolean {
  return !hasOnSiteCafe(venue) && !venue.foodNearby;
}

/**
 * A small nudge in family-score points for places known to have food close by, used only while a food filter is on, so
 * the ordering among the places that pass puts the easiest lunch first. It never lifts a place that failed the filter
 * and never penalises an unknown one outside the filter.
 */
export function foodRankBonus(venue: Venue): number {
  if (hasOnSiteCafe(venue)) return 6;
  const nearest = venue.foodNearby?.nearestWalkMinutes;
  if (nearest == null) return 0;
  if (nearest <= 5) return 5;
  if (nearest <= 10) return 3;
  return 0;
}

/** The one line a card or sheet can show: only what is known. Null when nothing is. */
export function foodNearbyLine(venue: Venue): string | null {
  if (hasOnSiteCafe(venue)) return 'Café on site';
  const nearest = venue.foodNearby?.nearestWalkMinutes;
  if (nearest != null) return `Food about ${nearest} min walk`;
  return null;
}

/** How many of these venues could not be checked, for the sentence under a food-filtered list. */
export function countFoodUnknown(venues: readonly Venue[]): number {
  return venues.filter(foodIsUnknown).length;
}
