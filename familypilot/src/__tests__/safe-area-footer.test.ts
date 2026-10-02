import { describe, expect, it } from 'vitest';

import { FOOTER_GUTTER, safeFooterPadding } from '@/src/utils/safe-area';

/**
 * The home-indicator arithmetic, tested where it lives.
 *
 * A browser cannot help here: `env(safe-area-inset-bottom)` is 0 in a desktop browser and cannot be
 * set, so a viewport that claims to have insets proves nothing either way. An earlier version of the
 * Phase 2 audit injected a CSS custom property and then asserted against it, which could only ever
 * produce a false failure or false confidence.
 */
describe('a pinned footer clears the home indicator', () => {
  it('adds the inset to the gutter', () => {
    expect(safeFooterPadding(34)).toBe(34 + FOOTER_GUTTER);
    expect(safeFooterPadding(21)).toBe(21 + FOOTER_GUTTER);
  });

  it('keeps the gutter on a device with no inset', () => {
    expect(safeFooterPadding(0)).toBe(FOOTER_GUTTER);
  });

  it('never produces NaN from a provider that has not measured yet', () => {
    // Undefined padding collapses the footer and puts the action under the indicator.
    for (const value of [undefined, Number.NaN, -10, Number.POSITIVE_INFINITY]) {
      const padding = safeFooterPadding(value as number | undefined);
      expect(Number.isFinite(padding), String(value)).toBe(true);
      expect(padding, String(value)).toBeGreaterThanOrEqual(FOOTER_GUTTER);
    }
  });
});
