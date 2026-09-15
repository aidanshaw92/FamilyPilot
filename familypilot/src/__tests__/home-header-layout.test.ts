import { describe, expect, it } from 'vitest';

import {
  estimateTextWidth,
  FIT_MARGIN,
  GREETING_FONT_SIZE,
  GREETING_LETTER_SPACING,
  GREETING_MIN_FONT_SIZE,
  HEADER_GAP,
  HEADER_MIN_GAP,
  homeHeaderLayout,
  SEARCH_FONT_SIZE,
  SEARCH_PLACEHOLDERS,
  searchPlaceholder,
  searchTextWidth,
} from '@/src/utils/home-header-layout';

const GREETING = 'Good afternoon, Aidan';

function greetingWidth(text: string, fontSize: number) {
  return estimateTextWidth(text, fontSize, 'extraBold', GREETING_LETTER_SPACING);
}

/** Header space left for the greeting once the gutters, avatar and gap are taken out. */
function greetingSpace(viewportWidth: number, gap: number) {
  return viewportWidth - 20 * 2 - 46 - gap;
}

describe('home header layout', () => {
  it('leaves the approved 393pt composition untouched', () => {
    const layout = homeHeaderLayout(393, GREETING);
    expect(layout).toEqual({
      gap: HEADER_GAP,
      fontSize: GREETING_FONT_SIZE,
      lineHeight: 32,
      maxLines: 1,
    });
    expect(searchPlaceholder(393)).toBe(SEARCH_PLACEHOLDERS[0]);
  });

  it('does not grow the heading on wider phones', () => {
    for (const width of [412, 430, 480]) {
      expect(homeHeaderLayout(width, GREETING).fontSize).toBe(GREETING_FONT_SIZE);
      expect(homeHeaderLayout(width, GREETING).gap).toBe(HEADER_GAP);
      expect(searchPlaceholder(width)).toBe(SEARCH_PLACEHOLDERS[0]);
    }
  });

  it('fits the whole greeting, name included, at 360pt', () => {
    const layout = homeHeaderLayout(360, GREETING);
    expect(layout.maxLines).toBe(1);
    expect(greetingWidth(GREETING, layout.fontSize) + FIT_MARGIN).toBeLessThanOrEqual(
      greetingSpace(360, layout.gap),
    );
  });

  it('steps the heading down at most slightly, and only when it has to', () => {
    const layout = homeHeaderLayout(360, GREETING);
    expect(layout.fontSize).toBeGreaterThanOrEqual(GREETING_FONT_SIZE - 2);
    // A smaller size is only justified if even the tightest gap could not hold the larger one.
    if (layout.fontSize < GREETING_FONT_SIZE) {
      expect(greetingWidth(GREETING, layout.fontSize + 1) + FIT_MARGIN).toBeGreaterThan(
        greetingSpace(360, HEADER_MIN_GAP),
      );
    }
  });

  it('tightens the avatar gap only where that buys a larger heading', () => {
    // 26pt needs every pixel, so the gap closes; at a size the approved gap can hold, it stays.
    const tight = homeHeaderLayout(360, 'Good morning, Madeleine');
    const roomy = homeHeaderLayout(360, 'Good morning, Al');
    expect(roomy.gap).toBe(HEADER_GAP);
    expect(tight.gap === HEADER_GAP || tight.gap === HEADER_MIN_GAP).toBe(true);
    if (tight.gap === HEADER_MIN_GAP) {
      expect(greetingWidth('Good morning, Madeleine', tight.fontSize) + FIT_MARGIN).toBeGreaterThan(
        greetingSpace(360, HEADER_GAP),
      );
    }
  });

  it('never shrinks the heading past the floor, wrapping a very long name instead', () => {
    const layout = homeHeaderLayout(320, 'Good afternoon, Bartholomew');
    expect(layout.fontSize).toBe(GREETING_MIN_FONT_SIZE);
    expect(layout.maxLines).toBe(2);
  });

  it('keeps a short name at the approved size on a narrow phone', () => {
    const layout = homeHeaderLayout(360, 'Good morning, Al');
    expect(layout.fontSize).toBe(GREETING_FONT_SIZE);
    expect(layout.maxLines).toBe(1);
  });

  it('shortens the placeholder rather than cutting it mid-word at 360pt', () => {
    const placeholder = searchPlaceholder(360);
    expect(SEARCH_PLACEHOLDERS).toContain(placeholder);
    expect(estimateTextWidth(placeholder, SEARCH_FONT_SIZE) + FIT_MARGIN).toBeLessThanOrEqual(
      searchTextWidth(360),
    );
  });

  it('proves the full placeholder really is what overflows at 360pt', () => {
    // Guards the fix itself: if this stops being true the shortened copy is no longer earning its
    // place and the full string should come back.
    expect(estimateTextWidth(SEARCH_PLACEHOLDERS[0], SEARCH_FONT_SIZE)).toBeGreaterThan(
      searchTextWidth(360),
    );
    expect(estimateTextWidth(SEARCH_PLACEHOLDERS[0], SEARCH_FONT_SIZE)).toBeLessThanOrEqual(
      searchTextWidth(393),
    );
  });

  it('estimates a shade wide of what the browser actually renders', () => {
    // Measured in Chromium against the real Inter faces on the web export: the greeting at 26pt
    // ExtraBold with -0.6 tracking comes out at 277.38px, and the placeholder at 15pt Regular at
    // 198.17px. The estimate must sit just above each, never below, or text will overflow.
    const greeting = greetingWidth(GREETING, GREETING_FONT_SIZE);
    expect(greeting).toBeGreaterThanOrEqual(277.38);
    expect(greeting).toBeLessThan(277.38 * 1.04);

    const search = estimateTextWidth(SEARCH_PLACEHOLDERS[0], SEARCH_FONT_SIZE);
    expect(search).toBeGreaterThanOrEqual(198.17);
    expect(search).toBeLessThan(198.17 * 1.04);
  });

  it('measures narrow and wide glyphs differently', () => {
    expect(estimateTextWidth('lll', 16)).toBeLessThan(estimateTextWidth('mmm', 16));
    expect(estimateTextWidth('aaa', 16, 'extraBold')).toBeGreaterThan(
      estimateTextWidth('aaa', 16, 'regular'),
    );
  });
});
