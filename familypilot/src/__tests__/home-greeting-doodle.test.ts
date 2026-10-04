import { describe, expect, it } from 'vitest';

import {
  AVATAR_SIZE,
  FIT_MARGIN,
  GREETING_DOODLE_SIZE,
  GREETING_LETTER_SPACING,
  estimateTextWidth,
  greetingDoodleLeft,
  homeGutter,
  homeHeaderLayout,
} from '@/src/utils/home-header-layout';

describe('the strokes after the Home greeting', () => {
  it('is drawn clear of a short greeting at the frame width and wider', () => {
    for (const width of [390, 393, 430]) {
      const greeting = 'Good evening, Aidan';
      const layout = homeHeaderLayout(width, greeting);
      const left = greetingDoodleLeft(width, greeting, layout);
      expect(left).not.toBeNull();
      const text = estimateTextWidth(greeting, layout.fontSize, 'semiBold', GREETING_LETTER_SPACING);
      expect(left!).toBeGreaterThan(text);
      const row = width - homeGutter(width) * 2 - AVATAR_SIZE - layout.gap;
      expect(left! + GREETING_DOODLE_SIZE + FIT_MARGIN).toBeLessThanOrEqual(row);
    }
  });

  it('is dropped, not squeezed, when the line has no room', () => {
    // 360 - 40 - 46 - 12 = 262 for the greeting row; "Good evening, Aidan" at 25.5 leaves under 48.
    const short = 'Good evening, Aidan';
    expect(greetingDoodleLeft(360, short, homeHeaderLayout(360, short))).toBeNull();
    const long = 'Good afternoon, Bartholomew';
    expect(greetingDoodleLeft(393, long, homeHeaderLayout(393, long))).toBeNull();
  });

  it('is never drawn beside a wrapped greeting', () => {
    const greeting = 'Good afternoon, Maximiliana-Josephine';
    const layout = homeHeaderLayout(360, greeting);
    expect(layout.maxLines).toBe(2);
    expect(greetingDoodleLeft(360, greeting, layout)).toBeNull();
  });
});
