import { RestaurantDetail, RestaurantFeatures } from '@/src/types';
import { ExploreBudgetFilter } from '@/src/stores/filters-store';

export const RESTAURANT_FILTER_OPTIONS = [
  { id: 'kids_menu', label: 'Kids menu' },
  { id: 'high_chairs', label: 'High chairs' },
  { id: 'baby_changing', label: 'Baby changing' },
  { id: 'pushchair', label: 'Pushchair friendly' },
  { id: 'play_area', label: 'Play area' },
  { id: 'outdoor', label: 'Outdoor seating' },
  { id: 'accessible_toilet', label: 'Accessible toilet' },
  { id: 'step_free', label: 'Step-free' },
  { id: 'parking', label: 'Parking' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'gluten_free', label: 'Gluten-free' },
] as const;

function parseMaxSpend(spend?: string): number | null {
  if (!spend) return null;
  const match = spend.match(/£(\d+)/);
  return match ? Number(match[1]) : null;
}

function matchesBudget(restaurant: RestaurantDetail, budget: ExploreBudgetFilter): boolean {
  if (budget === 'any') return true;
  const spend = parseMaxSpend(restaurant.estimatedFamilySpend ?? restaurant.estimatedSpend);
  if (spend === null) return true;
  if (budget === 'free') return spend === 0;
  if (budget === 'under_25') return spend <= 25;
  if (budget === 'under_50') return spend <= 50;
  if (budget === 'under_100') return spend <= 100;
  return true;
}

function featureConfirmed(
  features: RestaurantFeatures,
  filterId: string,
): boolean {
  switch (filterId) {
    case 'kids_menu':
      return features.kidsMenu === 'confirmed';
    case 'high_chairs':
      return features.highChairs === 'confirmed';
    case 'baby_changing':
      return features.babyChanging === 'confirmed';
    case 'pushchair':
      return features.pushchairSpace === 'confirmed';
    case 'play_area':
      return features.playArea === 'confirmed';
    case 'outdoor':
      return features.outdoorSeating === 'confirmed';
    case 'accessible_toilet':
      return features.accessibleToilet === 'confirmed';
    case 'step_free':
      return features.stepFreeAccess === 'confirmed';
    case 'parking':
      return features.parking === 'confirmed';
    case 'vegetarian':
      return features.dietaryOptions?.some((d) => d.toLowerCase().includes('vegetarian')) ?? false;
    case 'vegan':
      return features.dietaryOptions?.some((d) => d.toLowerCase().includes('vegan')) ?? false;
    case 'gluten_free':
      return features.dietaryOptions?.some((d) => d.toLowerCase().includes('gluten')) ?? false;
    default:
      return true;
  }
}

export function filterRestaurants(
  restaurants: RestaurantDetail[],
  advancedIds: string[],
  maxDriveMinutes: number | 'any',
  profileMaxDrive: number,
  budgetFilter: ExploreBudgetFilter,
): RestaurantDetail[] {
  const effectiveMaxDrive =
    maxDriveMinutes === 'any' ? profileMaxDrive + 10 : maxDriveMinutes;

  let result = restaurants.filter(
    (r) => r.driveMinutes <= effectiveMaxDrive && matchesBudget(r, budgetFilter),
  );

  for (const filterId of advancedIds) {
    result = result.filter((r) => featureConfirmed(r.restaurantFeatures, filterId));
  }

  return result.sort((a, b) => b.familyScore.score - a.familyScore.score);
}
