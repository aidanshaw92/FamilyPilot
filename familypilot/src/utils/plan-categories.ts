import { Venue } from '@/src/types';
import { categoriesWithInventory, matchesTaxonomy, TAXONOMY } from '@/src/utils/venue-taxonomy';

export interface PlanCategory {
  id: string;
  label: string;
}

/**
 * The Home rail, from the one taxonomy Home and Explore share (`venue-taxonomy.ts`). The full list, in the
 * approved order; what a screen actually offers is `planCategoriesFor(venues)`, which leaves out a category the
 * venues in hand cannot fill.
 */
export const PLAN_CATEGORIES: PlanCategory[] = TAXONOMY.filter((entry) => entry.home).map(({ id, label }) => ({ id, label }));

/** The chips Home offers for these venues: every category that has enough in it to be a real list. */
export function planCategoriesFor(venues: readonly Venue[]): PlanCategory[] {
  return categoriesWithInventory(venues, 'home').map(({ id, label }) => ({ id, label }));
}

/**
 * Filters the already-scored venue list by a category on the rail. The rules are the shared taxonomy's: every one
 * reads a venue's category or a reviewed fact, and a venue with no evidence either way is left out of a facts-based
 * filter rather than guessed into it.
 */
export function filterByPlanCategory(venues: Venue[], categoryId: string): Venue[] {
  return venues.filter((venue) => matchesTaxonomy(venue, categoryId));
}
