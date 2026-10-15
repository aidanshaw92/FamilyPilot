import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAP_OFF_MESSAGE, canPlotOnOwnMap, mapAllowedFor } from '@/src/utils/map-compliance';

/**
 * Explore's Map draws places on the app's own map, which is not a Google map. Google's Places terms do not allow Places content on a
 * map that is not Google's, and every place Explore is served today is a Google Places row. So the Map (and the List | Map control) is
 * offered only when every place in the results is independently located. The rule itself lives in utils/map-compliance.ts (its own tests
 * ship with the Meet halfway correction); these pin that Explore goes through it.
 */
const screen = readFileSync(join(__dirname, '../../app/(tabs)/explore.tsx'), 'utf8');

describe('Explore offers its Map only for independently located places', () => {
  it('the rule: Google, unknown and our own unlocated rows are never drawn; one of them among others switches the Map off', () => {
    expect(canPlotOnOwnMap({ provider: 'google' })).toBe(false);
    expect(canPlotOnOwnMap({})).toBe(false);
    expect(canPlotOnOwnMap({ provider: 'familypilot' })).toBe(false);
    expect(canPlotOnOwnMap({ provider: 'osm' })).toBe(true);
    expect(mapAllowedFor([{ provider: 'osm' }, { provider: 'google' }])).toBe(false);
    expect(mapAllowedFor([{ provider: 'osm' }, { provider: 'osm' }])).toBe(true);
  });

  it('the screen decides from the places it would draw, and shows a list when the Map is off', () => {
    expect(screen).toContain('const canMap = mapAllowedFor(mapRows.map((r) => r.venue));');
    expect(screen).toContain("const shownView: 'list' | 'map' = canMap ? exploreView : 'list';");
    // Every branch that draws the map reads the gated view, never the remembered choice.
    expect(screen).toContain("shownView === 'map' && result && !isLoading");
    expect(screen).not.toMatch(/exploreView === 'map'/);
  });

  it('there is no List | Map control for places that cannot be drawn, and the list says why', () => {
    expect(screen).toMatch(/\{canMap \? \(\s*<View style=\{styles\.viewToggle\}/);
    expect(screen).toContain('testID="explore-map-off"');
    expect(screen).toContain('{MAP_OFF_MESSAGE}');
    expect(MAP_OFF_MESSAGE).not.toMatch(/google|licen|terms/i);
  });

  it('the map component is rendered only inside that gated branch', () => {
    const uses = screen.match(/<ExploreMap[\s>]/g) ?? [];
    expect(uses).toHaveLength(1);
    expect(screen.indexOf('<ExploreMap')).toBeGreaterThan(screen.indexOf("shownView === 'map'"));
  });
});
