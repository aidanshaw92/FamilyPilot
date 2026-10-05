import { describe, expect, it } from 'vitest';

import {
  ART_FRAME_WIDTH,
  AVATAR_SIZE,
  avatarStrokesLeft,
  estimateLineCount,
  estimateTextWidth,
  FIT_MARGIN,
  GREETING_FONT_SIZE,
  GREETING_LETTER_SPACING,
  GREETING_MIN_FONT_SIZE,
  greetingTextLimit,
  HEADER_GAP,
  homeGutter,
  homeHeaderLayout,
  NARROW_SCREEN_PADDING,
  SCREEN_PADDING,
  SEARCH_FONT_SIZE,
  SEARCH_PLACEHOLDERS,
  searchPlaceholder,
  searchTextWidth,
  STROKE_CLEARANCE,
} from '@/src/utils/home-header-layout';

const GREETING = 'Good afternoon, Aidan';
/** The greetings the closeout names, plus a deliberately long (but real) first name. */
const GREETINGS = [
  'Good morning, Jo',
  'Good afternoon, Aidan',
  'Good evening, Alexandra',
  'Good afternoon, Christopher',
  'Good afternoon, Maximilian-James',
];
const WIDTHS = [360, 393, 430];

function greetingWidth(text: string, fontSize: number) {
  return estimateTextWidth(text, fontSize, 'bold', GREETING_LETTER_SPACING);
}

describe('home header layout', () => {
  it('leaves the approved 393pt composition untouched for a normal name', () => {
    for (const greeting of ['Good morning, Jo', GREETING]) {
      const layout = homeHeaderLayout(393, greeting);
      expect(layout.fontSize).toBe(GREETING_FONT_SIZE);
      expect(layout.lineHeight).toBe(30);
      expect(layout.gap).toBe(HEADER_GAP);
      expect(layout.lines).toBe(1);
      // The avatar sits where it did when it was centred on the greeting and its subtitle.
      expect(layout.avatarOffset).toBe(2.5);
    }
    expect(searchPlaceholder(393)).toBe(SEARCH_PLACEHOLDERS[0]);
  });

  it('uses the frame gutter at the reference width and gives it back on narrow phones', () => {
    expect(homeGutter(393)).toBe(SCREEN_PADDING);
    expect(homeGutter(430)).toBe(SCREEN_PADDING);
    expect(homeGutter(360)).toBe(NARROW_SCREEN_PADDING);
    expect(NARROW_SCREEN_PADDING).toBeLessThan(SCREEN_PADDING);
  });

  it('does not grow the heading on wider phones', () => {
    for (const width of [412, 430, 480]) {
      expect(homeHeaderLayout(width, GREETING).fontSize).toBe(GREETING_FONT_SIZE);
      expect(homeHeaderLayout(width, GREETING).gap).toBe(HEADER_GAP);
      expect(searchPlaceholder(width)).toBe(SEARCH_PLACEHOLDERS[0]);
    }
  });

  describe('against the avatar strokes baked into the frame art', () => {
    it('puts the strokes where the frame does, scaled with the window', () => {
      // Frame 229:133: the first stroke starts at x=647 of 852 (a 4.5px round cap beyond it).
      expect(avatarStrokesLeft(852)).toBeCloseTo(642.5, 5);
      expect(avatarStrokesLeft(393)).toBeCloseTo((642.5 * 393) / ART_FRAME_WIDTH, 5);
      expect(avatarStrokesLeft(393)).toBeGreaterThan(296);
      expect(avatarStrokesLeft(393)).toBeLessThan(297);
    });

    it('limits the greeting to the room before the strokes, not before the avatar', () => {
      for (const width of WIDTHS) {
        const gutter = homeGutter(width);
        const beforeAvatar = width - gutter * 2 - AVATAR_SIZE - HEADER_GAP;
        expect(greetingTextLimit(width)).toBeLessThan(beforeAvatar);
        expect(gutter + greetingTextLimit(width) + STROKE_CLEARANCE).toBeCloseTo(avatarStrokesLeft(width), 5);
      }
    });

    it('never lets a one-line greeting reach the strokes, at any width, for any of the named greetings', () => {
      for (const width of WIDTHS) {
        for (const greeting of GREETINGS) {
          const layout = homeHeaderLayout(width, greeting);
          if (layout.lines === 1) {
            expect(greetingWidth(greeting, layout.fontSize)).toBeLessThanOrEqual(layout.textLimit);
            expect(homeGutter(width) + greetingWidth(greeting, layout.fontSize) + STROKE_CLEARANCE).toBeLessThanOrEqual(
              avatarStrokesLeft(width) + 1e-9,
            );
          }
        }
      }
    });

    it('wraps a long name at the approved size instead of shrinking it or running it behind the strokes', () => {
      for (const width of WIDTHS) {
        const layout = homeHeaderLayout(width, 'Good afternoon, Maximilian-James');
        expect(layout.lines).toBe(2);
        expect(layout.fontSize).toBe(GREETING_FONT_SIZE);
      }
    });

    it('keeps the approved single line for Jo and Aidan at 393 and 430', () => {
      for (const width of [393, 430]) {
        expect(homeHeaderLayout(width, 'Good morning, Jo').lines).toBe(1);
        expect(homeHeaderLayout(width, GREETING).lines).toBe(1);
        expect(homeHeaderLayout(width, GREETING).fontSize).toBe(GREETING_FONT_SIZE);
      }
    });
  });

  it('steps the heading down at most slightly, and only when it has to', () => {
    const layout = homeHeaderLayout(360, GREETING);
    expect(layout.fontSize).toBeGreaterThanOrEqual(GREETING_FONT_SIZE - 2);
    if (layout.fontSize < GREETING_FONT_SIZE) {
      // The next size up would not have fitted before the strokes.
      expect(greetingWidth(GREETING, layout.fontSize + 1)).toBeGreaterThan(layout.textLimit);
    }
  });

  it('never shrinks the heading past the floor', () => {
    for (const greeting of GREETINGS) {
      for (const width of [320, ...WIDTHS]) {
        expect(homeHeaderLayout(width, greeting).fontSize).toBeGreaterThanOrEqual(GREETING_MIN_FONT_SIZE);
      }
    }
  });

  it('keeps a short name at the approved size on a narrow phone', () => {
    const layout = homeHeaderLayout(360, 'Good morning, Al');
    expect(layout.fontSize).toBe(GREETING_FONT_SIZE);
    expect(layout.lines).toBe(1);
  });

  it('shortens the placeholder rather than cutting it mid-word at 360pt', () => {
    const placeholder = searchPlaceholder(360);
    expect(SEARCH_PLACEHOLDERS).toContain(placeholder);
    expect(estimateTextWidth(placeholder, SEARCH_FONT_SIZE) + FIT_MARGIN).toBeLessThanOrEqual(
      searchTextWidth(360),
    );
  });

  it('proves the full placeholder really is what runs out of room at 360pt', () => {
    // Guards the fix itself: if this stops being true the shortened copy is no longer earning its
    // place and the full string should come back. At 360 it clears the raw box by only a few
    // pixels, which is inside the estimate's own tolerance — not enough to ship.
    const full = estimateTextWidth(SEARCH_PLACEHOLDERS[0], SEARCH_FONT_SIZE);
    expect(full + FIT_MARGIN).toBeGreaterThan(searchTextWidth(360));
    expect(full + FIT_MARGIN).toBeLessThanOrEqual(searchTextWidth(393));
  });

  it('estimates a shade wide of what the browser actually renders', () => {
    // Measured in Chromium against the real Inter Bold on the web export (scripts/verify-home-greeting.mjs):
    // "Good afternoon, Aidan" at the frame's 24.4pt is 255.0px, "Good evening, Alexandra" 284.2, "Good
    // morning, Jo" 201.1; the placeholder at 15.5pt Regular is 204.78px. The estimate must sit just
    // above each, never below, or text will overflow.
    for (const [text, measured] of [
      [GREETING, 255.0],
      ['Good evening, Alexandra', 284.2],
      ['Good morning, Jo', 201.1],
    ] as const) {
      const estimate = greetingWidth(text, GREETING_FONT_SIZE);
      expect(estimate).toBeGreaterThanOrEqual(measured);
      expect(estimate).toBeLessThan(measured * 1.04);
    }

    const search = estimateTextWidth(SEARCH_PLACEHOLDERS[0], SEARCH_FONT_SIZE);
    expect(search).toBeGreaterThanOrEqual(204.78);
    expect(search).toBeLessThan(204.78 * 1.04);
  });

  it('measures narrow and wide glyphs differently', () => {
    expect(estimateTextWidth('lll', 16)).toBeLessThan(estimateTextWidth('mmm', 16));
    expect(estimateTextWidth('aaa', 16, 'extraBold')).toBeGreaterThan(
      estimateTextWidth('aaa', 16, 'regular'),
    );
  });
});

describe('estimateLineCount', () => {
  const SUBTITLE = 'Personalised days out, activities and recommendations for your family.';

  it('keeps a short line on one line and a long one on several', () => {
    expect(estimateLineCount('Explore', 14.8, 300)).toBe(1);
    expect(estimateLineCount(SUBTITLE, 14.8, 600)).toBe(1);
    expect(estimateLineCount(SUBTITLE, 14.8, 200)).toBeGreaterThanOrEqual(3);
  });

  it('wraps Welcome\'s subtitle to the frame\'s two lines at the frame width and three on a narrow phone', () => {
    // 393pt: the subtitle has 259pt (the ice-cream sticker is the limit); 360pt has 233.
    expect(estimateLineCount(SUBTITLE, 14.8, 259)).toBe(2);
    expect(estimateLineCount(SUBTITLE, 14.8, 233)).toBe(3);
  });

  it('counts a single word wider than the box as one line, not zero', () => {
    expect(estimateLineCount('Supercalifragilisticexpialidocious', 14.8, 40)).toBe(1);
  });

  it('is never less than one line, even for empty text', () => {
    expect(estimateLineCount('', 14.8, 100)).toBe(1);
  });
});
