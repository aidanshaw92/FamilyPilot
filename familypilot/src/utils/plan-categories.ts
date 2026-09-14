import { Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';

export interface PlanCategory {
  id: string;
  label: string;
}

/** The Home rail. Deliberately longer than the screen so it reads as scrollable, and
 * ordered so the most-used filters sit first. */
export const PLAN_CATEGORIES: PlanCategory[] = [
  { id: 'for_you', label: 'For you' },
  { id: 'indoor', label: 'Indoor' },
  { id: 'outdoor', label: 'Outdoor' },
  { id: 'soft_play', label: 'Soft play' },
  { id: 'farm', label: 'Farm' },
  { id: 'museum', label: 'Museum' },
  { id: 'park', label: 'Park' },
  { id: 'animals', label: 'Animals' },
  { id: 'free', label: 'Free' },
  { id: 'rainy_day', label: 'Rainy day' },
  { id: 'under_hour', label: 'Under 1 hour' },
];

function isFree(venue: Venue): boolean {
  const spend = venue.estimatedSpend?.toLowerCase() ?? '';
  return spend.includes('free') || spend.startsWith('£0');
}

function environment(facts?: MatchableVenueFacts): string | undefined {
  return facts?.environment;
}

/**
 * Filters the already-scored venue list. Every rule reads a real fact: nothing is inferred
 * from a category name where a reviewed fact exists, and a venue with no evidence either
 * way is left out of a facilities-based filter rather than guessed into it.
 */
export function filterByPlanCategory(venues: Venue[], categoryId: string): Venue[] {
  switch (categoryId) {
    case 'for_you':
      return venues;
    case 'indoor':
      return venues.filter((v) => environment(v.trustedFacts) === 'indoor');
    case 'outdoor':
      return venues.filter((v) => environment(v.trustedFacts) === 'outdoor');
    case 'rainy_day':
      // Indoor or mixed: somewhere the weather cannot spoil the day.
      return venues.filter((v) => ['indoor', 'mixed'].includes(environment(v.trustedFacts) ?? ''));
    case 'soft_play':
      return venues.filter((v) => v.category === 'soft_play');
    case 'farm':
      return venues.filter((v) => v.category === 'farm');
    case 'museum':
      return venues.filter((v) => v.category === 'museum');
    case 'park':
      return venues.filter((v) => v.category === 'park' || v.category === 'beach');
    case 'animals':
      return venues.filter((v) => v.category === 'zoo' || v.category === 'farm');
    case 'free':
      return venues.filter(isFree);
    case 'under_hour':
      return venues.filter((v) => v.driveMinutes <= 60);
    default:
      return venues;
  }
}
