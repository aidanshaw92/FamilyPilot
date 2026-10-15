import { describe, expect, it } from 'vitest';

import { exploreMapModel, MAX_MAP_PINS } from '@/src/services/explore/explore-map';

const size = { width: 353, height: 260 };
const anchor = { latitude: 51.5392, longitude: -0.1426 };
const pin = (id: string, latitude: number, longitude: number) => ({ id, name: id, latitude, longitude });

describe('Explore map geometry', () => {
  it('draws the place where you are looking as an approximate area on a ~1 km grid, never a point', () => {
    const exact = exploreMapModel({ anchor, radiusMiles: 5, pins: [] }, size)!;
    const nearby = exploreMapModel({ anchor: { latitude: 51.5439, longitude: -0.1388 }, radiusMiles: 5, pins: [] }, size)!;
    // 51.5392,-0.1426 and 51.5439,-0.1388 are about 0.5 km apart and share a grid cell: the drawing cannot tell them apart.
    expect(Math.round(exact.area.x)).toBe(Math.round(nearby.area.x));
    expect(Math.round(exact.area.y)).toBe(Math.round(nearby.area.y));
    expect(exact.area.r).toBeGreaterThan(0);
  });

  it('shows the whole ring in Nearby and fits to the places in Search all', () => {
    const near = exploreMapModel({ anchor, radiusMiles: 5, pins: [pin('a', 51.542, -0.145)] }, size)!;
    expect(near.ring?.label).toBe('5 miles');
    expect(near.ring!.r * 2).toBeLessThanOrEqual(size.width + 1);
    expect(exploreMapModel({ anchor, radiusMiles: null, pins: [pin('a', 51.542, -0.145)] }, size)!.ring).toBeNull();
  });

  it('numbers the pins in list order and marks the selected one, drawn last', () => {
    const model = exploreMapModel({ anchor, radiusMiles: 5, pins: [pin('a', 51.542, -0.145), pin('b', 51.55, -0.13), pin('c', 51.56, -0.12)], selectedId: 'a' }, size)!;
    expect(model.pins.map((p) => `${p.id}${p.number}`).sort()).toEqual(['a1', 'b2', 'c3']);
    expect(model.pins[model.pins.length - 1].id).toBe('a');
    expect(model.pins[model.pins.length - 1].selected).toBe(true);
  });

  it('sizes every tap target to the room it has: never wider than the distance to its nearest neighbour, down to 16 px', () => {
    const crowd = Array.from({ length: 4 }, (_, i) => pin(`p${i}`, 51.54 + i * 0.004, -0.14));
    const model = exploreMapModel({ anchor, radiusMiles: 2, pins: crowd }, size)!;
    for (const a of model.pins) {
      const nearest = Math.min(...model.pins.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y)));
      expect(a.hit).toBeLessThanOrEqual(Math.max(16, Math.floor(nearest)));
      expect(a.hit).toBeGreaterThanOrEqual(16);
      expect(a.hit).toBeLessThanOrEqual(44);
    }
  });

  it('numbers at most thirty places and says how many it left off', () => {
    const many = Array.from({ length: 45 }, (_, i) => pin(`p${i}`, 51.5 + (i % 9) * 0.01, -0.2 + Math.floor(i / 9) * 0.02));
    const model = exploreMapModel({ anchor, radiusMiles: 10, pins: many }, size)!;
    expect(model.pins).toHaveLength(MAX_MAP_PINS);
    expect(model.omitted).toBe(15);
  });

  it('draws nothing for a position that cannot be used, and describes itself for screen readers without an address', () => {
    expect(exploreMapModel({ anchor: { latitude: Number.NaN, longitude: 0 }, radiusMiles: 5, pins: [] }, size)).toBeNull();
    const summary = exploreMapModel({ anchor, radiusMiles: 5, pins: [pin('a', 51.542, -0.145)] }, size)!.summary;
    expect(summary).toMatch(/approximate area, not an address/);
  });
});
