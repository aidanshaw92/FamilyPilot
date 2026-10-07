import { Venue, VenueCategory } from '@/src/types';
import { isFreeSpend } from '@/src/utils/spend';

/**
 * ONE taxonomy for Home's plan rail and Explore's category rail.
 *
 * THE DEFECT THIS EXISTS TO FIX. Home and Explore each had their own list, with their own rules for the same
 * words. "Activity" on Home meant activity and attraction; "Activities" on Explore also swallowed farms, museums,
 * soft play and zoos. "Indoor" on Home read a reviewed environment fact (so it matched 5 places in the whole
 * catalogue); "Indoor" in Explore's filter sheet read the category. A parent moving between the two screens was
 * shown different answers to the same question, and both rails offered categories that came back empty.
 *
 * Home and Explore have DIFFERENT jobs, and the chips say so. Explore is for browsing: it carries the categories (farm,
 * park, museum...). Home is the curated answer to "what is best for my family right now", so its rail holds only the
 * situations a parent is actually in (indoors, outdoors, a rainy day, short on time, free, fits the nap). The two
 * share rules and never disagree about a word; they do not offer the same list.
 *
 * Each entry here is a name, a rule and nothing else. Both screens render from this list and filter with these
 * rules, and a category is offered only when the venues in hand can fill it (`categoriesWithInventory`).
 */
export type TaxonomyKind = 'all' | 'type' | 'condition';

export interface TaxonomyEntry {
  /** The id Home uses. */
  id: string;
  /** The id Explore has always used, where it differs. Either resolves to this entry. */
  exploreId?: string;
  /** The wording on Home's rail (the approved frame's own). */
  label: string;
  /** The wording on Explore's rail. */
  exploreLabel?: string;
  kind: TaxonomyKind;
  matches: (venue: Venue) => boolean;
  /** Where this appears as a chip. A condition on Explore lives in the filter sheet instead. */
  home: boolean;
  explore: boolean;
}

export type Environment = 'indoor' | 'outdoor' | 'mixed' | 'unknown';

/**
 * Where a visit happens. A reviewed fact wins. Without one, the CATEGORY says what is usual (a soft play centre is
 * indoors, a park is outdoors), and `confirmed` stays false so no screen presents it as a checked fact. A category
 * with no usual answer (an activity, an attraction) is `unknown` and matches neither Indoor nor Outdoor.
 */
const CATEGORY_ENVIRONMENT: Partial<Record<VenueCategory, Environment>> = {
  museum: 'indoor',
  soft_play: 'indoor',
  park: 'outdoor',
  farm: 'outdoor',
  beach: 'outdoor',
  zoo: 'mixed',
  attraction: 'mixed',
  activity: 'unknown',
};

export function environmentOf(venue: Pick<Venue, 'category' | 'trustedFacts'>): { environment: Environment; confirmed: boolean } {
  const fact = venue.trustedFacts?.environment;
  if (fact === 'indoor' || fact === 'outdoor' || fact === 'mixed') return { environment: fact, confirmed: true };
  return { environment: CATEGORY_ENVIRONMENT[venue.category] ?? 'unknown', confirmed: false };
}

const isCategory = (...categories: VenueCategory[]) => (venue: Venue) => categories.includes(venue.category);

export const TAXONOMY: readonly TaxonomyEntry[] = [
  { id: 'for_you', exploreId: 'all', label: 'For you', exploreLabel: 'All', kind: 'all', matches: () => true, home: true, explore: true },
  {
    id: 'indoor', label: 'Indoor', kind: 'condition', home: true, explore: false,
    matches: (v) => environmentOf(v).environment === 'indoor',
  },
  {
    id: 'outdoor', label: 'Outdoor', kind: 'condition', home: true, explore: false,
    matches: (v) => environmentOf(v).environment === 'outdoor',
  },
  { id: 'soft_play', label: 'Soft play', kind: 'type', matches: isCategory('soft_play'), home: false, explore: true },
  { id: 'farm', exploreId: 'farms', label: 'Farm', exploreLabel: 'Farms', kind: 'type', matches: isCategory('farm'), home: false, explore: true },
  { id: 'park', exploreId: 'parks', label: 'Park', exploreLabel: 'Parks', kind: 'type', matches: isCategory('park', 'beach'), home: false, explore: true },
  {
    id: 'activity', exploreId: 'activities', label: 'Activity', exploreLabel: 'Activities', kind: 'type',
    // Somewhere the family does something, rather than somewhere they walk around.
    matches: isCategory('activity', 'attraction'), home: false, explore: true,
  },
  { id: 'museum', exploreId: 'museums', label: 'Museum', exploreLabel: 'Museums', kind: 'type', matches: isCategory('museum'), home: false, explore: true },
  { id: 'animals', label: 'Animals', kind: 'type', matches: isCategory('zoo', 'farm'), home: false, explore: true },
  // "Fits your day" (places where the next nap or feed left time to go now) was removed: browsing does not assume the
  // family is leaving now. Whether a chosen day works around naps and feeds is answered by the planner.
  { id: 'free', label: 'Free', kind: 'condition', matches: (v) => isFreeSpend(v.estimatedSpend), home: true, explore: false },
  {
    id: 'rainy_day', label: 'Rainy day', kind: 'condition', home: true, explore: false,
    // Indoor or mixed: somewhere the weather cannot spoil the day.
    matches: (v) => ['indoor', 'mixed'].includes(environmentOf(v).environment),
  },
  {
    id: 'under_hour', label: 'Under 1 hour', kind: 'condition', home: true, explore: false,
    matches: (v) => v.driveMinutes <= 60, // an unknown journey (NaN) is not under an hour
  },
];

export function findEntry(id: string): TaxonomyEntry | undefined {
  return TAXONOMY.find((entry) => entry.id === id || entry.exploreId === id);
}

/** Whether a venue belongs to a category, by either screen's id. An unknown id matches everything. */
export function matchesTaxonomy(venue: Venue, id: string): boolean {
  const entry = findEntry(id);
  return entry ? entry.matches(venue) : true;
}

/** Fewer results than this is not a list a parent can choose from, so the category is not offered. */
export const MIN_USEFUL_RESULTS = 3;

export type Surface = 'home' | 'explore';

export interface OfferedCategory {
  id: string;
  label: string;
  count: number;
}

/**
 * The chips a screen should show for the venues it actually has. "All" is always offered; any other category is
 * offered only if enough venues match it. The id is the screen's own (`exploreId` on Explore).
 */
export function categoriesWithInventory(venues: readonly Venue[], surface: Surface): OfferedCategory[] {
  const offered: OfferedCategory[] = [];
  for (const entry of TAXONOMY) {
    if (!(surface === 'home' ? entry.home : entry.explore)) continue;
    const count = entry.kind === 'all' ? venues.length : venues.filter(entry.matches).length;
    if (entry.kind !== 'all' && count < MIN_USEFUL_RESULTS) continue;
    offered.push({
      id: surface === 'explore' ? entry.exploreId ?? entry.id : entry.id,
      label: surface === 'explore' ? entry.exploreLabel ?? entry.label : entry.label,
      count,
    });
  }
  return offered;
}
