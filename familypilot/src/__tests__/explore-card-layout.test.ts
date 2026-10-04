import { describe, expect, it } from 'vitest';

import { exploreCardCtaLabel, exploreCardCtaWidth } from '@/src/utils/explore-card-layout';

describe('Explore card CTA label', () => {
  it('has the room it claims at the three reference widths', () => {
    // 360: 360 - 40 - 100 - 28 = 192. 390: 222. 430: 262.
    expect(exploreCardCtaWidth(360)).toBe(192);
    expect(exploreCardCtaWidth(390)).toBe(222);
    expect(exploreCardCtaWidth(430)).toBe(262);
  });

  it('shortens the scored label at 360 and keeps the long one from 375 up', () => {
    // 192 - 58 = 134 of space for a 128-wide label plus 8 margin: 134 < 136, so 360 shortens.
    expect(exploreCardCtaLabel(360, false)).toBe('View details');
    expect(exploreCardCtaLabel(375, false)).toBe('View family details');
    expect(exploreCardCtaLabel(390, false)).toBe('View family details');
    expect(exploreCardCtaLabel(430, false)).toBe('View family details');
  });

  it('shortens the unreviewed label below 390, where 155pt of Semi Bold 14 would ellipsise', () => {
    expect(exploreCardCtaLabel(360, true)).toBe('Details to check');
    expect(exploreCardCtaLabel(375, true)).toBe('Details to check');
    // 222 - 58 = 164 >= 163.
    expect(exploreCardCtaLabel(390, true)).toBe('Family details to check');
    expect(exploreCardCtaLabel(430, true)).toBe('Family details to check');
  });

  it('never says "family details" are viewable for an unreviewed place', () => {
    for (const width of [320, 360, 390, 430, 768]) {
      expect(exploreCardCtaLabel(width, true)).not.toMatch(/^View/);
    }
  });
});
