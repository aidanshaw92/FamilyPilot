import { describe, expect, it } from 'vitest';

import { exploreCardCtaLabel, exploreCardCtaWidth } from '@/src/utils/explore-card-layout';

describe('Explore card CTA label', () => {
  it('has the room it claims at the three reference widths', () => {
    // width - 40 (screen padding) - 111 (photo) - 14 (left) - 10 (right): 360 -> 185, 390 -> 215, 430 -> 255.
    expect(exploreCardCtaWidth(360)).toBe(185);
    expect(exploreCardCtaWidth(390)).toBe(215);
    expect(exploreCardCtaWidth(430)).toBe(255);
  });

  it('keeps the long scored label from 384 up and shortens it on a narrower phone', () => {
    // The label needs 133 + 6 plus the CTA's 70 of inset: a 209pt CTA, so a 384pt phone.
    expect(exploreCardCtaLabel(340, false)).toBe('View details');
    expect(exploreCardCtaLabel(360, false)).toBe('View details');
    expect(exploreCardCtaLabel(375, false)).toBe('View details');
    expect(exploreCardCtaLabel(390, false)).toBe('View family details');
    expect(exploreCardCtaLabel(430, false)).toBe('View family details');
  });

  it('shortens the unreviewed label below 405, where 154pt of Semi Bold 13 would ellipsise', () => {
    // 154 + 6 plus 70 of inset: a 230pt CTA, so a 405pt phone.
    expect(exploreCardCtaLabel(375, true)).toBe('Details to check');
    expect(exploreCardCtaLabel(390, true)).toBe('Details to check');
    expect(exploreCardCtaLabel(430, true)).toBe('Family details to check');
  });

  it('uses the shortest unreviewed label where even "Details to check" would ellipsise (360)', () => {
    // 360: a 185pt CTA leaves 115 for the label; "Details to check →" needs 124.
    expect(exploreCardCtaLabel(360, true)).toBe('Check details');
    expect(exploreCardCtaLabel(340, true)).toBe('Check details');
  });

  it('never says "family details" are viewable for an unreviewed place', () => {
    for (const width of [320, 360, 390, 430, 768]) {
      expect(exploreCardCtaLabel(width, true)).not.toMatch(/^View/);
    }
  });
});
