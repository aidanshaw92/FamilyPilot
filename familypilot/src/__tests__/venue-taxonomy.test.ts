import { describe, expect, it } from 'vitest';

import { Venue, VenueCategory } from '@/src/types';
import { EXPLORE_CATEGORIES, exploreCategoriesFor, filterVenues } from '@/src/utils/filter-venues';
import { filterByPlanCategory, PLAN_CATEGORIES, planCategoriesFor } from '@/src/utils/plan-categories';
import {
  categoriesWithInventory,
  environmentOf,
  findEntry,
  MIN_USEFUL_RESULTS,
  TAXONOMY,
} from '@/src/utils/venue-taxonomy';

let n = 0;
function venue(category: VenueCategory, extra: Partial<Venue> = {}): Venue {
  n += 1;
  return {
    id: `fp-${category}-${n}`, name: `${category} ${n}`, category, latitude: 51.5, longitude: -0.1, driveMinutes: 20, imageUrl: '',
    familyScore: { score: 70, factors: {} as never, explanation: [] }, ...extra,
  } as Venue;
}
const many = (category: VenueCategory, count: number, extra: Partial<Venue> = {}) => Array.from({ length: count }, () => venue(category, extra));

describe('one taxonomy for Home and Explore', () => {
  it('gives the same answer to the same question on both screens', () => {
    const venues = [...many('farm', 4), ...many('museum', 4), ...many('park', 4), ...many('zoo', 3), ...many('soft_play', 3), ...many('activity', 2), ...many('attraction', 2)];
    const pairs: Array<[string, string]> = [['park', 'parks'], ['farm', 'farms'], ['museum', 'museums'], ['activity', 'activities'], ['soft_play', 'soft_play'], ['animals', 'animals']];
    for (const [homeId, exploreId] of pairs) {
      const home = filterByPlanCategory(venues, homeId).map((v) => v.id);
      const explore = filterVenues(venues, exploreId, [], 'any', 30, 'any').map((v) => v.id).sort();
      expect(explore, `${homeId} / ${exploreId}`).toEqual([...home].sort());
    }
  });

  it('defines Activity once: activity and attraction, not farms, museums or zoos', () => {
    const venues = [...many('farm', 1), ...many('museum', 1), ...many('zoo', 1), ...many('soft_play', 1), venue('activity'), venue('attraction')];
    const found = filterByPlanCategory(venues, 'activity').map((v) => v.category).sort();
    expect(found).toEqual(['activity', 'attraction']);
  });

  it('resolves either screen\'s id to the same entry', () => {
    expect(findEntry('parks')).toBe(findEntry('park'));
    expect(findEntry('all')).toBe(findEntry('for_you'));
  });

  it('gives Home and Explore different jobs: Home holds situations, Explore holds the categories', () => {
    // Home is the curated answer to "what is best for us right now", so its rail is situations (indoors, a rainy day,
    // short on time, fits the nap). Browsing by kind of place is Explore's job, so two directories do not compete.
    expect(PLAN_CATEGORIES.map((c) => c.label)).toEqual(['For you', 'Indoor', 'Outdoor', 'Fits your day', 'Free', 'Rainy day', 'Under 1 hour']);
    for (const kind of ['farm', 'park', 'museum', 'soft_play', 'activity', 'animals']) {
      expect(PLAN_CATEGORIES.some((c) => c.id === kind), kind).toBe(false);
      expect(findEntry(kind)?.explore, kind).toBe(true);
    }
    expect(EXPLORE_CATEGORIES.some((c) => c.id === 'parks')).toBe(true);
    expect(TAXONOMY.some((e) => e.id === 'restaurant' || e.exploreId === 'restaurants')).toBe(false);
    expect(EXPLORE_CATEGORIES.some((c) => c.id === 'restaurants')).toBe(true); // a separate mode, behind a pilot flag
  });
});

describe('a category is offered only if it can fill a list', () => {
  const venues = [...many('park', 10), ...many('museum', 6), ...many('farm', 2), ...many('soft_play', 1), ...many('zoo', 1)];

  it('hides a category with fewer than the useful minimum, and always offers the whole list', () => {
    const explore = exploreCategoriesFor(venues).map((c) => c.id);
    expect(explore).toContain('all');
    expect(explore).toContain('parks');
    expect(explore).toContain('museums');
    expect(explore).not.toContain('farms'); // 2 < 3
    expect(explore).not.toContain('soft_play'); // 1
    expect(planCategoriesFor(venues).map((c) => c.id)).toContain('for_you');
  });

  it('offers a Home situation only when enough places can fill it', () => {
    const home = planCategoriesFor(venues).map((c) => c.id);
    expect(home).toContain('outdoor'); // parks
    expect(home).toContain('indoor'); // museums
    // Nobody has given a routine, so no place can say it fits the day: the lens is simply not there.
    expect(home).not.toContain('routine');
    const fitting = many('park', 3, { familyMatch: { reasons: [{ key: 'routine', text: 'Leave by 12:00 to be home in time for Ozzie’s nap' }] } as never });
    expect(planCategoriesFor([...venues, ...fitting]).map((c) => c.id)).toContain('routine');
  });

  it('counts overlapping categories once per venue they contain (Animals is farm + zoo)', () => {
    expect(exploreCategoriesFor([...venues, ...many('zoo', 2)]).map((c) => c.id)).toContain('animals');
  });

  it('offers the same categories on Explore, in Explore\'s own ids and wording', () => {
    const explore = exploreCategoriesFor(venues);
    expect(explore.map((c) => c.id)).toEqual(expect.arrayContaining(['all', 'parks', 'museums']));
    expect(explore.map((c) => c.id)).not.toContain('farms');
    expect(explore.find((c) => c.id === 'parks')?.label).toBe('Parks');
  });

  it('reports the real count behind each offer', () => {
    const offered = categoriesWithInventory(venues, 'explore');
    expect(offered.find((c) => c.id === 'parks')?.count).toBe(10);
    expect(offered.find((c) => c.id === 'all')?.count).toBe(venues.length);
    expect(MIN_USEFUL_RESULTS).toBeGreaterThanOrEqual(2);
  });

  it('REGRESSION: with the real London mix (2 farms in 79) Farm is not offered; with the catalogue (8) it is', () => {
    const live = [...many('park', 34), ...many('museum', 28), ...many('attraction', 7), ...many('activity', 4), ...many('soft_play', 2), ...many('zoo', 2), ...many('farm', 2)];
    expect(exploreCategoriesFor(live).map((c) => c.id)).not.toContain('farms');
    const withCatalogue = [...live, ...many('farm', 6), ...many('soft_play', 3)];
    const ids = exploreCategoriesFor(withCatalogue).map((c) => c.id);
    expect(ids).toContain('farms');
    expect(ids).toContain('soft_play');
    expect(filterByPlanCategory(withCatalogue, 'farm')).toHaveLength(8);
  });
});

describe('indoor and outdoor mean one thing everywhere', () => {
  it('reads a reviewed environment fact first, and the category only when there is none', () => {
    expect(environmentOf(venue('museum'))).toEqual({ environment: 'indoor', confirmed: false });
    expect(environmentOf(venue('park'))).toEqual({ environment: 'outdoor', confirmed: false });
    expect(environmentOf(venue('activity'))).toEqual({ environment: 'unknown', confirmed: false });
    const outdoorMuseum = venue('museum', { trustedFacts: { environment: 'outdoor' } as never });
    expect(environmentOf(outdoorMuseum)).toEqual({ environment: 'outdoor', confirmed: true });
  });

  it('Home\'s Indoor and Explore\'s Indoor filter agree', () => {
    const venues = [...many('museum', 3), ...many('park', 3), venue('museum', { trustedFacts: { environment: 'outdoor' } as never })];
    const home = filterByPlanCategory(venues, 'indoor').map((v) => v.id).sort();
    const explore = filterVenues(venues, 'all', ['indoor'], 'any', 30, 'any').map((v) => v.id).sort();
    expect(explore).toEqual(home);
    expect(home).toHaveLength(3); // the outdoor museum is not indoor
  });

  it('Rainy day is indoor or mixed, never a plain outdoor place', () => {
    const venues = [venue('park'), venue('museum'), venue('zoo'), venue('farm')];
    expect(filterByPlanCategory(venues, 'rainy_day').map((v) => v.category).sort()).toEqual(['museum', 'zoo']);
  });
});
