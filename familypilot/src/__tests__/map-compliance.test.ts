import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAPPABLE_PROVIDERS, MAP_OFF_MESSAGE, canPlotOnOwnMap, mapAllowedFor } from '@/src/utils/map-compliance';

/**
 * Google's Places terms do not allow Places content to be used with a map that is not a Google map. FamilyPilot's maps are drawn on
 * the device from Natural Earth, so they are not Google maps, and every place Explore and Meet halfway serve today is a Google Places
 * row. These tests lock down the correction: a Google place is never plotted, the map and Google content are never offered together,
 * and no screen can draw the app's own map without going through the rule.
 */
describe('which places may be drawn on the app\'s own map', () => {
  it('never a Google place', () => {
    expect(canPlotOnOwnMap({ provider: 'google' })).toBe(false);
  });

  it('never a place of unknown origin: nothing is guessed', () => {
    expect(canPlotOnOwnMap({})).toBe(false);
    expect(canPlotOnOwnMap({ provider: undefined })).toBe(false);
  });

  it('not our own rows either, until a position states its origin', () => {
    expect(canPlotOnOwnMap({ provider: 'familypilot' })).toBe(false);
  });

  it('an OpenStreetMap place, and the synthetic demo catalogue', () => {
    expect(canPlotOnOwnMap({ provider: 'osm' })).toBe(true);
    expect(canPlotOnOwnMap({ provider: 'mock' })).toBe(true);
  });

  it('the list of plottable providers is short and says no Google', () => {
    // Each joined with its credit (services/places/attribution.ts): OpenStreetMap, OS Open Greenspace and the FSA's FHRS owe one; Wikidata (CC0) owes none.
    expect([...MAPPABLE_PROVIDERS]).toEqual(['osm', 'wikidata', 'os-greenspace', 'fhrs', 'mock']);
    expect(MAPPABLE_PROVIDERS).not.toContain('google');
    expect(MAPPABLE_PROVIDERS).not.toContain('familypilot');
  });
});

describe('when a screen may offer its map', () => {
  it('with no places the map shows only what the family entered, which is not Places content', () => {
    expect(mapAllowedFor([])).toBe(true);
  });

  it('only when every place can be plotted', () => {
    expect(mapAllowedFor([{ provider: 'osm' }, { provider: 'osm' }])).toBe(true);
    expect(mapAllowedFor([{ provider: 'google' }])).toBe(false);
  });

  it('one Google place among independent ones switches the map off: Google content is never beside the map', () => {
    expect(mapAllowedFor([{ provider: 'osm' }, { provider: 'google' }, { provider: 'osm' }])).toBe(false);
  });

  it('one place of unknown origin switches it off', () => {
    expect(mapAllowedFor([{ provider: 'osm' }, {}])).toBe(false);
  });

  it('the message to a parent is short and not about contracts', () => {
    expect(MAP_OFF_MESSAGE).toMatch(/list/i);
    expect(MAP_OFF_MESSAGE).not.toMatch(/google|licen|terms/i);
  });
});

/** Every .ts and .tsx file under a folder. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === 'node_modules' || name === '__tests__') return [];
    return statSync(full).isDirectory() ? sources(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('no screen can draw the app\'s own map without going through the rule', () => {
  const root = join(__dirname, '../..');
  const files = [...sources(join(root, 'src')), ...sources(join(root, 'app'))];
  const MAP_COMPONENTS = ['HalfwayMap', 'ExploreMap'];

  it('every file that renders a map component also decides with mapAllowedFor', () => {
    const offenders = files
      .filter((file) => !/components\/(planning\/HalfwayMap|explore\/ExploreMap)\.tsx$/.test(file))
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return MAP_COMPONENTS.some((name) => new RegExp(`<${name}[\\s>]`).test(text)) && !/mapAllowedFor\(/.test(text);
      })
      .map((file) => relative(root, file));
    expect(offenders).toEqual([]);
  });

  it('Meet halfway offers no map and no toggle for Google places, and says why', () => {
    const view = readFileSync(join(root, 'src/components/together/MeetHalfwayView.tsx'), 'utf8');
    expect(view).toContain('const canMap = mapAllowedFor(options.map((option) => option.venue));');
    expect(view).toContain("const shownMode: 'map' | 'list' = canMap ? mode : 'list';");
    expect(view).toContain('halfway-map-off');
    // The map branches read the gated mode, never the raw one.
    expect(view).not.toMatch(/\bmode === 'map'/);
  });

  it('a card tapped in the list does not switch to a map that is off', () => {
    const view = readFileSync(join(root, 'src/components/together/MeetHalfwayView.tsx'), 'utf8');
    expect(view).toContain("if (canMap) setMode('map');");
  });

  it('the only code that sends a venue name to Google Maps is an outbound link the parent taps', () => {
    const linkers = files.filter((file) => /google\.com\/maps/.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file));
    // These open Google Maps itself. They draw nothing, and they are allowed: Places content on a Google map.
    expect(linkers.sort()).toEqual([
      'app/restaurant/[id].tsx',
      'app/venue/[id].tsx',
      'src/components/shared/StoreCard.tsx',
      'src/components/venue/RestaurantCloseByCard.tsx',
    ]);
  });
});
