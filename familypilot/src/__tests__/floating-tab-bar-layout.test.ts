import { describe, expect, it } from 'vitest';

import {
  fitsViewport,
  floatingTabBarLayout,
  MIN_BOTTOM_OFFSET,
  NAV_VARIANTS,
  navVariantForRoute,
  NavVariant,
} from '@/src/utils/floating-tab-bar-layout';

/** Phones the bar is judged on, with the bottom inset each really reports. */
const DEVICES = [
  { name: 'iPhone 15 Pro Max', width: 430, height: 932, inset: 34 },
  { name: 'iPhone 15 / 14 Pro', width: 393, height: 852, inset: 34 },
  { name: 'iPhone SE (3rd gen)', width: 375, height: 667, inset: 0 },
  { name: 'Android, gesture bar', width: 360, height: 800, inset: 24 },
  { name: 'Android, button nav', width: 360, height: 780, inset: 0 },
  { name: 'web export, no insets', width: 393, height: 852, inset: 0 },
];
const VARIANTS: NavVariant[] = ['home', 'explore'];

describe('floating tab bar layout', () => {
  it('reproduces the approved Home frame (229:133, node 267:165): 289.7 x 60, 35 above the edge', () => {
    // 628 x 130 px at 2.168x; its bottom edge is 76px from the frame's bottom; tab pitch 119px.
    const layout = floatingTabBarLayout(5, 34, 'home');
    expect(layout.width).toBeCloseTo(289.7, 0);
    expect(layout.height).toBeCloseTo(60, 0);
    expect(layout.bottom).toBeCloseTo(35.1, 1);
    expect(layout.tabWidth).toBeCloseTo(119.25 / 2.168, 0);
    expect(layout.indicator).toBeCloseTo(100 / 2.168, 0);
  });

  it('reproduces the approved Explore frame (294:133, node 298:135): 310 x 59.4, 38.7 above the edge', () => {
    // 673 x 129 px at 2.1705x; its bottom edge is 84px from the frame's bottom; tab pitch 131.25px;
    // the Explore disc is 102px. This is deliberately NOT Home's pill: the frames differ.
    const layout = floatingTabBarLayout(5, 34, 'explore');
    expect(layout.width).toBeCloseTo(310.1, 0);
    expect(layout.height).toBeCloseTo(59.4, 0);
    expect(layout.bottom).toBeCloseTo(38.7, 1);
    expect(layout.tabWidth).toBeCloseTo(131.25 / 2.1705, 0);
    expect(layout.indicator).toBeCloseTo(102 / 2.1705, 0);
  });

  it('draws Explore with the larger icon its frame shows, and the other tabs with Home\'s', () => {
    expect(NAV_VARIANTS.explore.icon).toBeGreaterThan(NAV_VARIANTS.home.icon);
    expect(navVariantForRoute('explore')).toBe('explore');
    for (const route of ['index', 'trips', 'saved', 'profile', undefined]) {
      expect(navVariantForRoute(route)).toBe('home');
    }
  });

  it('holds the icon and its active disc inside the pill', () => {
    for (const v of VARIANTS) {
      const m = NAV_VARIANTS[v];
      expect(m.indicator).toBeLessThanOrEqual(m.height);
      expect(m.indicator).toBeLessThanOrEqual(m.tabWidth);
      expect(m.icon).toBeLessThan(m.indicator);
    }
  });

  it('keeps every tab at a comfortable touch target', () => {
    for (const v of VARIANTS) {
      expect(NAV_VARIANTS[v].tabWidth).toBeGreaterThanOrEqual(44);
      expect(NAV_VARIANTS[v].height).toBeGreaterThanOrEqual(44);
    }
  });

  it('fits whole on every device, at every inset, in both variants', () => {
    for (const device of DEVICES) {
      for (const tabs of [4, 5]) {
        for (const v of VARIANTS) {
          const layout = floatingTabBarLayout(tabs, device.inset, v);
          expect(fitsViewport(layout, device.width, device.height), `${device.name}, ${tabs} tabs, ${v}`).toBe(true);
        }
      }
    }
  });

  it('never sits flush against the screen edge, even with no reported inset', () => {
    for (const v of VARIANTS) {
      expect(floatingTabBarLayout(5, 0, v).bottom).toBeGreaterThanOrEqual(MIN_BOTTOM_OFFSET);
    }
    expect(floatingTabBarLayout(5, 2, 'home').bottom).toBe(MIN_BOTTOM_OFFSET);
  });

  it('narrows when a tab is hidden behind a pilot flag', () => {
    // Trips is gated off in the pilot build, so the pill has to hold four tabs, not five.
    for (const v of VARIANTS) {
      const five = floatingTabBarLayout(5, 34, v);
      const four = floatingTabBarLayout(4, 34, v);
      expect(five.width - four.width).toBeCloseTo(NAV_VARIANTS[v].tabWidth, 5);
      expect(four.height).toBe(five.height);
    }
  });

  it('asks a screen to leave enough room that content clears either variant', () => {
    for (const device of DEVICES) {
      const clearance = floatingTabBarLayout(5, device.inset, 'home').contentClearance;
      expect(floatingTabBarLayout(5, device.inset, 'explore').contentClearance).toBe(clearance);
      for (const v of VARIANTS) {
        const layout = floatingTabBarLayout(5, device.inset, v);
        expect(clearance).toBeGreaterThan(layout.bottom + layout.height);
      }
    }
  });
});
