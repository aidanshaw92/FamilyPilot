import { describe, expect, it } from 'vitest';

import { mockVenues } from '@/src/data/mock-data';
import { buildExploreEditorialSections } from '@/src/utils/explore-editorial-sections';

describe('explore editorial sections', () => {
  it('groups venues into curated sections without duplicating entries', () => {
    const sections = buildExploreEditorialSections(mockVenues);
    expect(sections.length).toBeGreaterThan(0);

    const ids = sections.flatMap((s) => s.venues.map((v) => v.id));
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('includes a best-for-your-family section for high-scoring venues', () => {
    const sections = buildExploreEditorialSections(mockVenues);
    const best = sections.find((s) => s.id === 'best');
    expect(best).toBeDefined();
    expect(best!.venues.length).toBeGreaterThan(0);
    expect(best!.venues.every((v) => v.familyScore.score >= 88)).toBe(true);
  });
});
