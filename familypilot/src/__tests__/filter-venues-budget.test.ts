import { describe, expect, it } from 'vitest';

import { filterVenues } from '../utils/filter-venues';
import { Venue } from '../types';

function venue(id: string, estimatedSpend: string | undefined): Venue {
  return {
    id,
    name: id,
    category: 'museum',
    latitude: 51.6,
    longitude: -0.3,
    driveMinutes: 10,
    imageUrl: '',
    familyScore: { score: 80, factors: {} as never, explanation: [] },
    estimatedSpend,
  };
}

describe('Explore budget filter against the real £/££/£££ tier format', () => {
  const venues: Venue[] = [
    venue('free', 'Free'),
    venue('cheap', '£'),
    venue('moderate', '££'),
    venue('expensive', '£££'),
    venue('unknown-spend', undefined),
  ];

  it('"Under £25" keeps Free and £ venues, excludes ££ and £££', () => {
    const ids = filterVenues(venues, 'all', [], 'any', 30, 'under_25').map((v) => v.id);
    expect(ids).toContain('free');
    expect(ids).toContain('cheap');
    expect(ids).not.toContain('moderate');
    expect(ids).not.toContain('expensive');
  });

  it('"Under £50" keeps Free, £ and ££, excludes £££', () => {
    const ids = filterVenues(venues, 'all', [], 'any', 30, 'under_50').map((v) => v.id);
    expect(ids).toContain('cheap');
    expect(ids).toContain('moderate');
    expect(ids).not.toContain('expensive');
  });

  it('does not silently exclude every tiered venue (the bug being fixed)', () => {
    // Before the fix, parseMaxSpend only matched a digit after £, so '£', '££' and '£££' all
    // returned null and every one of them was excluded from every budget filter except 'any'.
    const ids = filterVenues(venues, 'all', [], 'any', 30, 'under_100').map((v) => v.id);
    expect(ids).toContain('cheap');
    expect(ids).toContain('moderate');
    expect(ids).toContain('expensive');
  });

  it('excludes venues with no estimated spend at all from a specific budget filter (unknown is not free)', () => {
    const ids = filterVenues(venues, 'all', [], 'any', 30, 'under_25').map((v) => v.id);
    expect(ids).not.toContain('unknown-spend');
  });

  it('"Any budget" includes everything regardless of spend data', () => {
    const ids = filterVenues(venues, 'all', [], 'any', 30, 'any').map((v) => v.id);
    expect(ids).toHaveLength(venues.length);
  });
});
