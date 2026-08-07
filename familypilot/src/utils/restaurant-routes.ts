import { mockRestaurantSeeds } from '@/src/data/mock-restaurants';

/** All restaurant IDs used for static export deep linking. */
export const RESTAURANT_IDS = mockRestaurantSeeds.map((r) => r.id);

export function generateRestaurantStaticParams() {
  return RESTAURANT_IDS.map((id) => ({ id }));
}
