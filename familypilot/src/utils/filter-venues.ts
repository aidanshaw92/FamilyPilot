import { Venue, VenueCategory } from '@/src/types';
import { ExploreBudgetFilter } from '@/src/stores/filters-store';
import { categoriesWithInventory, environmentOf, matchesTaxonomy, TAXONOMY } from '@/src/utils/venue-taxonomy';
import { isFreeSpend } from '@/src/utils/spend';
import { FOOD_FILTER_IDS, FOOD_FILTER_OPTIONS, FoodFilterId, foodRankBonus, matchesFoodFilter } from '@/src/utils/food-nearby';

export interface ExploreCategory {
  id: string;
  label: string;
}

/**
 * Explore's rail, from the shared taxonomy (`venue-taxonomy.ts`), in its own ids and wording. Restaurants are a
 * separate mode behind a pilot flag and are not part of the venue taxonomy.
 */
export const EXPLORE_CATEGORIES: ExploreCategory[] = [
  ...TAXONOMY.filter((entry) => entry.explore).map((entry) => ({
    id: entry.exploreId ?? entry.id,
    label: entry.exploreLabel ?? entry.label,
  })),
  { id: 'restaurants', label: 'Restaurants' },
];

/** The chips Explore offers for these venues; a category with too little in it is not offered. */
export function exploreCategoriesFor(venues: readonly Venue[]): ExploreCategory[] {
  const offered = categoriesWithInventory(venues, 'explore').map(({ id, label }) => ({ id, label }));
  const restaurants = EXPLORE_CATEGORIES.find((c) => c.id === 'restaurants');
  return restaurants ? [...offered, restaurants] : offered;
}

export const FILTER_SHEET_OPTIONS = [
  { id: 'indoor', label: 'Indoor' },
  { id: 'outdoor', label: 'Outdoor' },
  { id: 'free', label: 'Free' },
  { id: 'open_now', label: 'Open now' },
  { id: 'pushchair', label: 'Pushchair friendly' },
  { id: 'parking', label: 'Parking' },
  { id: 'toilets', label: 'Toilets' },
  { id: 'baby_changing', label: 'Baby changing' },
  { id: 'playground', label: 'Playground' },
  { id: 'wheelchair', label: 'Wheelchair accessible' },
] as const;

/** The "Food nearby" group in the filter sheet: a cafe on site, or food within a short walk. */
export const FOOD_SHEET_OPTIONS = FOOD_FILTER_OPTIONS;

export const DRIVE_FILTER_OPTIONS: { id: number | 'any'; label: string }[] = [
  { id: 10, label: '10 min' },
  { id: 20, label: '20 min' },
  { id: 30, label: '30 min' },
  { id: 45, label: '45 min' },
  { id: 'any', label: 'Any' },
];

export const BUDGET_FILTER_OPTIONS: { id: ExploreBudgetFilter; label: string }[] = [
  { id: 'any', label: 'Any budget' },
  { id: 'free', label: 'Free' },
  { id: 'under_25', label: 'Under £25' },
  { id: 'under_50', label: 'Under £50' },
  { id: 'under_100', label: 'Under £100' },
];

function parseMaxSpend(estimatedSpend?: string): number | null {
  if (!estimatedSpend) return null;
  const trimmed = estimatedSpend.trim();
  if (trimmed.toLowerCase().includes('free') || trimmed.startsWith('£0')) return 0;
  // Trust-pipeline venues carry a £/££/£££ tier symbol (see scoreTrustedBudget), not a numeric
  // price range - map each tier to a representative amount so budget filters still work once
  // real venues use that format, instead of silently excluding every tiered venue (no digits to
  // match below). Check the longest marker first: '£££' also contains '££' as a substring.
  if (trimmed.includes('£££')) return 75;
  if (trimmed.includes('££')) return 35;
  const numericMatch = trimmed.match(/£(\d+)/);
  if (numericMatch) return Number(numericMatch[1]);
  if (trimmed === '£') return 15;
  return null;
}

function matchesBudget(venue: Venue, budget: ExploreBudgetFilter): boolean {
  if (budget === 'any') return true;
  const spend = parseMaxSpend(venue.estimatedSpend);
  if (spend === null) return false;
  if (budget === 'free') return spend === 0;
  if (budget === 'under_25') return spend <= 25;
  if (budget === 'under_50') return spend <= 50;
  if (budget === 'under_100') return spend <= 100;
  return true;
}

function matchesCategory(venue: Venue, categoryId: string): boolean {
  if (categoryId === 'restaurants') return venue.category === 'restaurant' || venue.category === 'cafe';
  return matchesTaxonomy(venue, categoryId);
}

function venueHasFacility(venue: Venue, facility: string): boolean {
  const detail = venue as Venue & { facilities?: string[] };
  return detail.facilities?.includes(facility as never) ?? false;
}

export function applyAdvancedFilters(venues: Venue[], advancedIds: string[]): Venue[] {
  let result = venues;
  for (const filterId of advancedIds) {
    switch (filterId) {
      case 'indoor':
        result = result.filter((v) => environmentOf(v).environment === 'indoor');
        break;
      case 'outdoor':
        result = result.filter((v) => environmentOf(v).environment === 'outdoor');
        break;
      case 'free':
        result = result.filter((v) => isFreeSpend(v.estimatedSpend));
        break;
      case 'open_now':
        // isOpen is undefined when opening status isn't confirmed - only keep venues we know
        // are open right now, not "assume open" for ones we simply haven't checked.
        result = result.filter((v) => v.isOpen === true);
        break;
      case 'pushchair':
        result = result.filter((v) => venueHasFacility(v, 'pushchair_friendly'));
        break;
      case 'parking':
        result = result.filter((v) => venueHasFacility(v, 'parking'));
        break;
      case 'toilets':
        result = result.filter((v) => venueHasFacility(v, 'toilets'));
        break;
      case 'baby_changing':
        result = result.filter((v) => venueHasFacility(v, 'baby_changing'));
        break;
      case 'playground':
        // A confirmed playground, nothing about whom it suits.
        result = result.filter((v) => venueHasFacility(v, 'playground'));
        break;
      case 'wheelchair':
        result = result.filter((v) => v.trustedFacts?.wheelchairAccessible === 'yes');
        break;
      case 'food_onsite':
      case 'food_5':
      case 'food_10':
        result = result.filter((v) => matchesFoodFilter(v, filterId as FoodFilterId));
        break;
      default:
        break;
    }
  }
  return result;
}

export function filterVenues(
  venues: Venue[],
  categoryId: string,
  advancedIds: string[],
  maxDriveMinutes: number | 'any',
  budgetFilter: ExploreBudgetFilter,
): Venue[] {
  const effectiveMaxDrive =
    maxDriveMinutes === 'any' ? Infinity : maxDriveMinutes;

  let result = venues.filter((venue) => {
    // `!(<=)`, not `>`: a journey that could not be worked out (NaN) is not known to be within a limit. With
    // no limit ("any") there is nothing to be outside of, so the venue stays.
    if (effectiveMaxDrive !== Infinity && !(venue.driveMinutes <= effectiveMaxDrive)) return false;
    if (!matchesCategory(venue, categoryId)) return false;
    if (!matchesBudget(venue, budgetFilter)) return false;
    return true;
  });

  result = applyAdvancedFilters(result, advancedIds);

  // While a food filter is on, the easiest lunch breaks ties and small gaps: a few points, never a leap over a much
  // better fit. Without one, ranking is the family score alone.
  const foodOn = advancedIds.some((id) => FOOD_FILTER_IDS.includes(id));
  const rank = (v: Venue) => v.familyScore.score + (foodOn ? foodRankBonus(v) : 0);
  return result.sort((a, b) => rank(b) - rank(a));
}

/** @deprecated use EXPLORE_CATEGORIES */
export const PRIMARY_FILTERS = EXPLORE_CATEGORIES.map((c) => ({
  id: c.id,
  label: c.label,
  type: 'primary' as const,
}));

export const ADVANCED_FILTERS = [...FILTER_SHEET_OPTIONS, ...FOOD_FILTER_OPTIONS].map((f) => ({
  id: f.id,
  label: f.label,
  type: 'advanced' as const,
}));
