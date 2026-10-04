import { describe, expect, it } from 'vitest';

import {
  ACTIVE_INDICATOR,
  fitsViewport,
  floatingTabBarLayout,
  ICON_SIZE,
  MIN_BOTTOM_OFFSET,
  PILL_HEIGHT,
  PILL_PADDING_Y,
  TAB_HEIGHT,
  TAB_SIZE,
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

describe('floating tab bar layout', () => {
  it('reproduces the approved frames: 300 x 60, 35 above the screen edge', () => {
    // Home (229:133) draws the pill 290 wide and Explore (294:133) 310 wide, both 60 tall and
    // centred, with the bottom edge about 35pt above the screen edge (a 34pt iPhone inset plus 1).
    // One width, the mean, is used on every tab.
    const layout = floatingTabBarLayout(5, 34);
    expect(layout.width).toBe(300);
    expect(layout.height).toBe(60);
    expect(layout.bottom).toBe(35);
    expect((393 - layout.width) / 2).toBeCloseTo(46.5, 1);
  });

  it('holds the icon and its active indicator inside the pill', () => {
    // The clipping this layout replaced came from content taller than the bar it sat in.
    expect(ACTIVE_INDICATOR).toBeLessThanOrEqual(TAB_HEIGHT);
    expect(ACTIVE_INDICATOR).toBeLessThanOrEqual(TAB_SIZE);
    expect(ICON_SIZE).toBeLessThan(ACTIVE_INDICATOR);
    expect(TAB_HEIGHT + PILL_PADDING_Y * 2).toBe(PILL_HEIGHT);
  });

  it('keeps every tab at a comfortable touch target', () => {
    expect(TAB_SIZE).toBeGreaterThanOrEqual(44);
    expect(TAB_HEIGHT).toBeGreaterThanOrEqual(44);
  });

  it('fits whole on every device, at every inset', () => {
    for (const device of DEVICES) {
      for (const tabs of [4, 5]) {
        const layout = floatingTabBarLayout(tabs, device.inset);
        expect(
          fitsViewport(layout, device.width, device.height),
          `${device.name} with ${tabs} tabs`,
        ).toBe(true);
      }
    }
  });

  it('never sits flush against the screen edge, even with no reported inset', () => {
    expect(floatingTabBarLayout(5, 0).bottom).toBe(MIN_BOTTOM_OFFSET);
    expect(floatingTabBarLayout(5, 2).bottom).toBe(MIN_BOTTOM_OFFSET);
  });

  it('narrows when a tab is hidden behind a pilot flag', () => {
    // Trips is gated off in the pilot build, so the pill has to hold four tabs, not five.
    const five = floatingTabBarLayout(5, 34);
    const four = floatingTabBarLayout(4, 34);
    expect(four.width).toBe(242);
    expect(five.width - four.width).toBe(TAB_SIZE + 2);
    expect(four.height).toBe(five.height);
  });

  it('asks a screen to leave enough room that content never hides behind the pill', () => {
    for (const device of DEVICES) {
      const layout = floatingTabBarLayout(5, device.inset);
      expect(layout.contentClearance).toBeGreaterThan(layout.bottom + layout.height);
    }
  });
});
