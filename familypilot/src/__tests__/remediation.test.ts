import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  FAMILY_MATCH_LABEL,
  formatFamilyMatchLabel,
} from '@/src/components/ui/family-match-label';
import {
  getExpectedRestaurantPaths,
  getExpectedStackPaths,
  getExpectedVenuePaths,
  STACK_ROUTES,
} from '@/src/utils/deep-link-routes';
import { RESTAURANT_IDS, generateRestaurantStaticParams } from '@/src/utils/restaurant-routes';
import { VENUE_IDS, generateVenueStaticParams } from '@/src/utils/venue-routes';

const DIST = join(process.cwd(), 'dist');

describe('venue static params', () => {
  it('exports all mock venue ids', () => {
    const params = generateVenueStaticParams();
    expect(params).toHaveLength(VENUE_IDS.length);
    expect(params.map((p: { id: string }) => p.id).sort()).toEqual([...VENUE_IDS].sort());
  });
});

describe('saved store behaviour', () => {
  it('toggles saved state', async () => {
    const { useSavedStore } = await import('@/src/stores/saved-store');
    const id = 'venue-test-toggle';
    if (useSavedStore.getState().isSaved(id)) {
      useSavedStore.getState().toggleSaved(id);
    }
    expect(useSavedStore.getState().isSaved(id)).toBe(false);
    useSavedStore.getState().toggleSaved(id);
    expect(useSavedStore.getState().isSaved(id)).toBe(true);
    useSavedStore.getState().toggleSaved(id);
    expect(useSavedStore.getState().isSaved(id)).toBe(false);
  });
});

describe('Family Match consistency', () => {
  it('uses consistent label wording across variants', () => {
    expect(FAMILY_MATCH_LABEL).toBe('Family Match');
    expect(formatFamilyMatchLabel(98)).toBe('98% Family Match');
    expect(formatFamilyMatchLabel(91)).toContain('Family Match');
  });

  it('classifies scores for human-readable presentation', async () => {
    const { getMatchClassification } = await import('@/src/utils/family-match-classification');
    expect(getMatchClassification(91)).toBe('Excellent match');
    expect(getMatchClassification(72)).toBe('Good match');
  });
});

describe('restaurant static params', () => {
  it('exports all mock restaurant ids', () => {
    const params = generateRestaurantStaticParams();
    expect(params).toHaveLength(RESTAURANT_IDS.length);
    expect(params.map((p: { id: string }) => p.id).sort()).toEqual([...RESTAURANT_IDS].sort());
  });
});

describe('web static routes', () => {
  it('generates per-venue html files after build', () => {
    expect(existsSync(DIST)).toBe(true);
    for (const path of getExpectedVenuePaths()) {
      expect(existsSync(join(DIST, path))).toBe(true);
    }
  });

  it('generates per-restaurant html files after build', () => {
    for (const path of getExpectedRestaurantPaths()) {
      expect(existsSync(join(DIST, path))).toBe(true);
    }
  });

  it('generates stack route html files after build', () => {
    for (const path of getExpectedStackPaths()) {
      expect(existsSync(join(DIST, path))).toBe(true);
    }
    for (const route of STACK_ROUTES) {
      expect(existsSync(join(DIST, `${route}.html`))).toBe(true);
    }
  });
});
