import { VenueCategory } from '@/src/types';

const CATEGORY_LABELS: Record<VenueCategory, string> = {
  park: 'Park',
  farm: 'Farm',
  museum: 'Museum',
  zoo: 'Zoo',
  attraction: 'Attraction',
  activity: 'Activity',
  soft_play: 'Soft play',
  cafe: 'Café',
  restaurant: 'Restaurant',
  hotel: 'Hotel',
  shop: 'Shop',
  beach: 'Beach',
};

export function formatCategory(category: string): string {
  return CATEGORY_LABELS[category as VenueCategory] ?? category.replace(/_/g, ' ');
}
