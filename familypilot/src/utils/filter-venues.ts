import { Venue, VenueCategory } from '@/src/types';

const INDOOR_CATEGORIES: VenueCategory[] = ['museum', 'soft_play', 'restaurant', 'cafe'];
const OUTDOOR_CATEGORIES: VenueCategory[] = ['park', 'farm', 'beach'];

export interface ExploreFilterId {
  id: string;
  label: string;
  type: 'primary' | 'advanced';
}

export const PRIMARY_FILTERS: ExploreFilterId[] = [
  { id: 'popular', label: 'Popular', type: 'primary' },
  { id: 'nearby', label: 'Nearby', type: 'primary' },
  { id: 'indoor', label: 'Indoor', type: 'primary' },
  { id: 'outdoor', label: 'Outdoor', type: 'primary' },
  { id: 'free', label: 'Free', type: 'primary' },
  { id: 'today', label: 'Today', type: 'primary' },
];

export const ADVANCED_FILTERS: ExploreFilterId[] = [
  { id: 'parks', label: 'Parks', type: 'advanced' },
  { id: 'cafes', label: 'Cafés', type: 'advanced' },
  { id: 'playgrounds', label: 'Playgrounds', type: 'advanced' },
  { id: 'baby_changing', label: 'Baby changing', type: 'advanced' },
  { id: 'toilets', label: 'Toilets', type: 'advanced' },
  { id: 'pushchair', label: 'Pushchair OK', type: 'advanced' },
  { id: 'parking', label: 'Parking', type: 'advanced' },
  { id: 'dog_friendly', label: 'Dog friendly', type: 'advanced' },
];

export function filterVenues(
  venues: Venue[],
  primaryId: string,
  advancedIds: string[],
): Venue[] {
  let result = [...venues];

  switch (primaryId) {
    case 'popular':
      result.sort((a, b) => b.familyScore.score - a.familyScore.score);
      break;
    case 'nearby':
      result.sort((a, b) => a.driveMinutes - b.driveMinutes);
      break;
    case 'indoor':
      result = result.filter((v) => INDOOR_CATEGORIES.includes(v.category));
      break;
    case 'outdoor':
      result = result.filter((v) => OUTDOOR_CATEGORIES.includes(v.category));
      break;
    case 'free':
      result = result.filter(
        (v) => v.estimatedSpend?.toLowerCase() === 'free' || v.estimatedSpend?.startsWith('£0'),
      );
      break;
    case 'today':
      result = result.filter((v) => v.isOpen !== false);
      break;
    default:
      break;
  }

  for (const filterId of advancedIds) {
    switch (filterId) {
      case 'parks':
        result = result.filter((v) => v.category === 'park');
        break;
      case 'cafes':
        result = result.filter((v) => v.category === 'cafe' || v.category === 'restaurant');
        break;
      case 'playgrounds':
        result = result.filter((v) => v.category === 'park' || v.category === 'farm');
        break;
      default:
        break;
    }
  }

  return result;
}
