import { Venue, VenueCategory } from '@/src/types';
import { ExploreBudgetFilter } from '@/src/stores/filters-store';

export interface ExploreCategory {
  id: string;
  label: string;
}

export const EXPLORE_CATEGORIES: ExploreCategory[] = [
  { id: 'all', label: 'All' },
  { id: 'parks', label: 'Parks' },
  { id: 'restaurants', label: 'Restaurants' },
  { id: 'farms', label: 'Farms' },
  { id: 'museums', label: 'Museums' },
  { id: 'activities', label: 'Activities' },
];

export const FILTER_SHEET_OPTIONS = [
  { id: 'indoor', label: 'Indoor' },
  { id: 'outdoor', label: 'Outdoor' },
  { id: 'free', label: 'Free' },
  { id: 'open_now', label: 'Open now' },
  { id: 'pushchair', label: 'Pushchair friendly' },
  { id: 'parking', label: 'Parking' },
  { id: 'toilets', label: 'Toilets' },
  { id: 'baby_changing', label: 'Baby changing' },
] as const;

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

const INDOOR_CATEGORIES: VenueCategory[] = [
  'museum',
  'soft_play',
  'activity',
  'restaurant',
  'cafe',
];
const OUTDOOR_CATEGORIES: VenueCategory[] = ['park', 'farm', 'beach', 'zoo'];
const ACTIVITY_CATEGORIES: VenueCategory[] = [
  'farm',
  'museum',
  'soft_play',
  'activity',
  'zoo',
  'attraction',
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
  switch (categoryId) {
    case 'all':
      return true;
    case 'parks':
      return venue.category === 'park';
    case 'restaurants':
      return venue.category === 'restaurant' || venue.category === 'cafe';
    case 'farms':
      return venue.category === 'farm';
    case 'museums':
      return venue.category === 'museum';
    case 'activities':
      return ACTIVITY_CATEGORIES.includes(venue.category);
    default:
      return true;
  }
}

function venueHasFacility(venue: Venue, facility: string): boolean {
  const detail = venue as Venue & { facilities?: string[] };
  return detail.facilities?.includes(facility as never) ?? false;
}

export function filterVenues(
  venues: Venue[],
  categoryId: string,
  advancedIds: string[],
  maxDriveMinutes: number | 'any',
  profileMaxDrive: number,
  budgetFilter: ExploreBudgetFilter,
): Venue[] {
  const effectiveMaxDrive =
    maxDriveMinutes === 'any' ? Infinity : maxDriveMinutes;

  let result = venues.filter((venue) => {
    if (venue.driveMinutes > effectiveMaxDrive) return false;
    if (!matchesCategory(venue, categoryId)) return false;
    if (!matchesBudget(venue, budgetFilter)) return false;
    return true;
  });

  for (const filterId of advancedIds) {
    switch (filterId) {
      case 'indoor':
        result = result.filter((v) => INDOOR_CATEGORIES.includes(v.category));
        break;
      case 'outdoor':
        result = result.filter((v) => OUTDOOR_CATEGORIES.includes(v.category));
        break;
      case 'free':
        result = result.filter(
          (v) =>
            v.estimatedSpend?.toLowerCase() === 'free' || v.estimatedSpend?.startsWith('£0'),
        );
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
      default:
        break;
    }
  }

  return result.sort((a, b) => b.familyScore.score - a.familyScore.score);
}

/** @deprecated use EXPLORE_CATEGORIES */
export const PRIMARY_FILTERS = EXPLORE_CATEGORIES.map((c) => ({
  id: c.id,
  label: c.label,
  type: 'primary' as const,
}));

export const ADVANCED_FILTERS = FILTER_SHEET_OPTIONS.map((f) => ({
  id: f.id,
  label: f.label,
  type: 'advanced' as const,
}));
