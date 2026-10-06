import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BASEMAP_AREAS, BASEMAP_SOURCE } from '@/src/data/london-basemap';
import { AREA_RADIUS_M, areaLabel, coarse, halfwayMapModel } from '@/src/services/planning/halfway-map';

/**
 * Meet halfway's map: where your area, their area and the venue are, so a parent can SEE why a place is fair.
 *
 * Pinned here: the families are drawn as approximate AREAS on the ~1 km grid a connection already shares (never a
 * point, never finer than what is shared), the map never zooms in to street level, no route is drawn, and nothing is
 * fetched to draw it (no tiles, no provider, no key, no cost).
 */
const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const SIZE = { width: 360, height: 220 };
// Precise positions, as a phone might hold them for its own home and as a postcode lookup returns for a guest family.
const BUSHEY = { latitude: 51.64321, longitude: -0.36789, label: 'Your family' };
const WALTHAMSTOW = { latitude: 51.58734, longitude: -0.02311, label: 'Hannah’s family' };
const VENUE = { latitude: 51.6098, longitude: -0.2411, name: 'Hendon Fixture Yard' };

describe('families are areas, on the grid a connection already shares', () => {
  const model = halfwayMapModel({ mine: BUSHEY, other: WALTHAMSTOW, venue: VENUE }, SIZE)!;

  it('draws each family at its rounded position, never the precise one', () => {
    const exact = halfwayMapModel(
      { mine: { ...BUSHEY, latitude: coarse(BUSHEY.latitude), longitude: coarse(BUSHEY.longitude) }, other: { ...WALTHAMSTOW, latitude: coarse(WALTHAMSTOW.latitude), longitude: coarse(WALTHAMSTOW.longitude) }, venue: VENUE },
      SIZE,
    )!;
    expect(model.areas.map(({ x, y }) => [x, y])).toEqual(exact.areas.map(({ x, y }) => [x, y]));
    expect(coarse(51.64321)).toBe(51.64);
  });

  it('as soft circles about 1.5 km across, not points', () => {
    const pxPerKm = model.scale.px / model.scale.km;
    for (const area of model.areas) expect(area.r).toBeCloseTo((AREA_RADIUS_M / 1000) * pxPerKm, 5);
    expect(AREA_RADIUS_M).toBeGreaterThanOrEqual(700);
  });

  it('labelled as areas: "Your area" and "Hannah’s area"', () => {
    expect(model.areas.map((a) => a.label)).toEqual(['Your area', 'Hannah’s area']);
    expect(areaLabel('Hannah’s family')).toBe('Hannah’s area');
    expect(areaLabel("Alex's family")).toBe("Alex's area");
    expect(areaLabel('Shaw family')).toBe('Shaw family’s area');
    expect(areaLabel('')).toBe('Their area');
  });

  it('the venue is the one real point, where it is', () => {
    expect(model.venue.label).toBe('Hendon Fixture Yard');
    // Between the two areas on the map, as it is on the ground.
    const [mine, other] = model.areas;
    expect(model.venue.x).toBeGreaterThan(Math.min(mine.x, other.x));
    expect(model.venue.x).toBeLessThan(Math.max(mine.x, other.x));
  });

  it('a screen reader hears what it shows, and that the areas are not addresses', () => {
    expect(model.summary).toMatch(/approximate areas, not addresses/);
  });
});

describe('it never looks like a street plan, and it fits every result', () => {
  it('two families close together: still at least 6 km across', () => {
    const near = halfwayMapModel({ mine: BUSHEY, other: { ...BUSHEY, latitude: 51.6450, label: 'Hannah’s family' }, venue: { ...VENUE, latitude: 51.644, longitude: -0.366 } }, SIZE)!;
    expect(near.width / (near.scale.px / near.scale.km)).toBeGreaterThanOrEqual(6 - 1e-9);
  });

  it('far apart: everything is inside the frame', () => {
    const far = halfwayMapModel({ mine: BUSHEY, other: { latitude: 51.37, longitude: 0.1, label: 'Hannah’s family' }, venue: VENUE }, SIZE)!;
    for (const p of [...far.areas, far.venue]) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(SIZE.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(SIZE.height);
    }
  });

  it('every area label stays inside the frame, on a narrow phone too, wherever the families are', () => {
    const others = [WALTHAMSTOW, { latitude: 51.37, longitude: 0.1, label: 'Hannah’s family' }, { latitude: 51.64, longitude: 0.05, label: 'The Featherstonehaugh family' }];
    for (const width of [300, 328, 361, 398]) {
      for (const other of others) {
        const m = halfwayMapModel({ mine: BUSHEY, other, venue: VENUE }, { width, height: 220 })!;
        for (const a of m.areas) {
          const textPx = a.label.length * 6.6;
          const left = a.labelAnchor === 'start' ? a.labelX : a.labelAnchor === 'end' ? a.labelX - textPx : a.labelX - textPx / 2;
          expect(left, `${a.label} at ${width}`).toBeGreaterThanOrEqual(0);
          expect(left + textPx, `${a.label} at ${width}`).toBeLessThanOrEqual(width);
          expect(a.labelY).toBeGreaterThan(10);
          expect(a.labelY).toBeLessThan(220);
        }
      }
    }
  });

  it('a missing position: no map rather than a wrong one', () => {
    expect(halfwayMapModel({ mine: BUSHEY, other: { ...WALTHAMSTOW, latitude: Number.NaN }, venue: VENUE }, SIZE)).toBeNull();
    expect(halfwayMapModel({ mine: BUSHEY, other: WALTHAMSTOW, venue: { ...VENUE, longitude: Number.POSITIVE_INFINITY } }, SIZE)).toBeNull();
  });

  it('draws a real map behind them: borough outlines and roads that cross the view', () => {
    const model = halfwayMapModel({ mine: BUSHEY, other: WALTHAMSTOW, venue: VENUE }, SIZE)!;
    expect(model.basemap.areas.length).toBeGreaterThan(5);
    expect(model.basemap.motorways.length + model.basemap.roads.length).toBeGreaterThan(0);
    expect(BASEMAP_AREAS.map((a) => a.name)).toEqual(expect.arrayContaining(['Barnet', 'Waltham Forest', 'Hertfordshire']));
  });
});

describe('honest and free', () => {
  const component = read('src/components/planning/HalfwayMap.tsx');
  const geometry = read('src/services/planning/halfway-map.ts');

  it('no route is drawn: there is no line from a family to the venue', () => {
    expect(component).not.toMatch(/<Line\b|<Polyline\b/);
    expect(component).toContain('No routes are drawn');
  });

  it('nothing is fetched: no tiles, no image, no provider, no key', () => {
    // Code only: the comments explain WHY there are no tiles, and are allowed to say the word.
    const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/.*$/gm, '');
    for (const source of [code(component), code(geometry)]) {
      expect(source).not.toMatch(/fetch\(|https?:\/\/|tile|apiKey|GOOGLE|mapbox|maptiler/i);
    }
    expect(BASEMAP_SOURCE).toBe('Natural Earth (public domain)');
    expect(component).toContain('{BASEMAP_SOURCE}');
  });

  it('Meet halfway shows it for the place being looked at, top recommendation first', () => {
    const screen = read('app/(tabs)/halfway.tsx');
    expect(screen).toContain('<HalfwayMap');
    expect(screen).toContain('?? result.options[0]');
    expect(screen).toContain('testID="halfway-show-on-map"');
  });
});
