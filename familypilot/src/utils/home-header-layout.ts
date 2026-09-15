/**
 * Responsive layout for the Home header and search bar.
 *
 * The approved Figma frame "01 — Home" is drawn on a 393pt artboard, where the greeting and the
 * search placeholder both fit comfortably. Narrower phones (360pt is the common floor) are not in
 * the frame, and at that width the greeting clipped to "Good afternoon, Ai…" and the placeholder
 * cut mid-word.
 *
 * Rather than shrink the heading everywhere — which would change the approved composition on every
 * device — this measures the text against the space actually available and gives back the largest
 * treatment that fits. At or above the reference width the answer is the approved one by
 * construction, so 393pt and wider are untouched.
 *
 * Pure maths with no React Native import, so the behaviour can be asserted in tests.
 */

/** The artboard the approved composition was signed off on. */
export const HEADER_REFERENCE_WIDTH = 393;

/**
 * The gutter either side of the screen. The approved frame draws it at 24 — greeting, search,
 * heading and pills all start at x=24 — rather than the shared spacing.screenPadding of 20.
 * Below the reference width that 4px either side is the cheapest thing to give back, so narrow
 * phones fall to 20 and keep a larger heading instead.
 */
export const SCREEN_PADDING = 24;
export const NARROW_SCREEN_PADDING = 20;

export function homeGutter(viewportWidth: number): number {
  return viewportWidth >= HEADER_REFERENCE_WIDTH ? SCREEN_PADDING : NARROW_SCREEN_PADDING;
}

/**
 * The greeting as the frame draws it (node 7:16): Inter Semi Bold at 25.5, not the token
 * heading1's Extra Bold 26 — that extra weight is most of why the header read heavier than the
 * design.
 */
export const GREETING_FONT_SIZE = 25.5;
const GREETING_LINE_RATIO = 31 / 25.5;
export const GREETING_LETTER_SPACING = -0.6375;
export const GREETING_FONT_FAMILY = 'Inter_600SemiBold';

/** Below this the heading stops reading as the page's primary voice, so we wrap instead. */
export const GREETING_MIN_FONT_SIZE = 22;

/** spacing.md, and the tightest the avatar may crowd the greeting (spacing.sm). */
export const HEADER_GAP = 12;
export const HEADER_MIN_GAP = 8;

export const AVATAR_SIZE = 46;

/**
 * Search bar geometry, from the approved frame: the field runs the full width inside the gutter,
 * with the filter disc tucked inside its right edge rather than sitting beside it.
 */
const FIELD_PADDING_LEFT = 21;
const FILTER_SIZE = 46;
const FILTER_INSET = 5;
const FILTER_CLEARANCE = 8; // spacing.sm between the placeholder and the disc
const FIELD_BORDERS = 2;
const SEARCH_ICON = 22;
const SEARCH_ICON_GAP = 12; // spacing.md
export const SEARCH_FONT_SIZE = 15.5;

/** Placeholder copy, longest first. The first one that fits is used. */
export const SEARCH_PLACEHOLDERS = [
  'Search places and activities',
  'Search places nearby',
  'Search places',
] as const;

/**
 * Text is never allowed to end flush against its container. This is also the tolerance the
 * estimate below is trusted to within — a string judged to fit with this much room to spare has
 * been checked against the real render at 360, 393 and 430.
 */
export const FIT_MARGIN = 8;

/**
 * Advance widths as a fraction of the font size, for Inter Regular. Good enough to decide whether
 * a string fits a container — this is a layout guard, not a typesetter.
 */
const NARROW = 0.26;
const SEMI_NARROW = 0.36;
const ADVANCE: Record<string, number> = {
  ' ': NARROW,
  i: NARROW,
  j: NARROW,
  l: NARROW,
  I: NARROW,
  '.': NARROW,
  ',': NARROW,
  "'": NARROW,
  '’': NARROW,
  '!': NARROW,
  f: SEMI_NARROW,
  t: SEMI_NARROW,
  r: SEMI_NARROW,
  '(': SEMI_NARROW,
  ')': SEMI_NARROW,
  m: 0.87,
  w: 0.72,
  M: 0.85,
  W: 0.85,
};
const UPPERCASE = 0.66;
const DEFAULT_ADVANCE = 0.55;

/**
 * Inter's heavier cuts run wider than Regular at the same size. Both factors are calibrated
 * against the browser's own measurement of the strings this screen actually renders, and rounded
 * up, so the estimate errs towards judging text too wide rather than too narrow.
 */
const WEIGHT_FACTOR = { regular: 1.025, semiBold: 1.09, extraBold: 1.115 } as const;
export type TextWeight = keyof typeof WEIGHT_FACTOR;

/**
 * Approximate rendered width of `text`. Deliberately an estimate: React Native gives no
 * synchronous measurement, and a layout that waits on onLayout flashes the wrong size first.
 */
export function estimateTextWidth(
  text: string,
  fontSize: number,
  weight: TextWeight = 'regular',
  letterSpacing = 0,
): number {
  let em = 0;
  for (const char of text) {
    em += ADVANCE[char] ?? (char >= 'A' && char <= 'Z' ? UPPERCASE : DEFAULT_ADVANCE);
  }
  return em * fontSize * WEIGHT_FACTOR[weight] + letterSpacing * text.length;
}

export interface HomeHeaderLayout {
  /** Horizontal gap between the greeting block and the avatar. */
  gap: number;
  fontSize: number;
  lineHeight: number;
  /** Two lines only as a last resort, so an unusually long name is never clipped. */
  maxLines: 1 | 2;
}

/**
 * The greeting treatment for a given viewport. At the reference width and above this always
 * returns the approved values without measuring, so wider phones cannot drift.
 */
export function homeHeaderLayout(viewportWidth: number, greeting: string): HomeHeaderLayout {
  const approved: HomeHeaderLayout = {
    gap: HEADER_GAP,
    fontSize: GREETING_FONT_SIZE,
    lineHeight: Math.round(GREETING_FONT_SIZE * GREETING_LINE_RATIO),
    maxLines: 1,
  };

  if (viewportWidth >= HEADER_REFERENCE_WIDTH) return approved;

  const row = viewportWidth - homeGutter(viewportWidth) * 2 - AVATAR_SIZE;

  // Closing the gap costs the composition almost nothing, so spend that first at each size and
  // only step the type down once the tightest gap still will not do.
  for (let fontSize = GREETING_FONT_SIZE; fontSize >= GREETING_MIN_FONT_SIZE; fontSize -= 1) {
    const width = estimateTextWidth(greeting, fontSize, 'semiBold', GREETING_LETTER_SPACING);
    for (const gap of [HEADER_GAP, HEADER_MIN_GAP]) {
      if (width + FIT_MARGIN <= row - gap) {
        return {
          gap,
          fontSize,
          lineHeight: Math.round(fontSize * GREETING_LINE_RATIO),
          maxLines: 1,
        };
      }
    }
  }

  // Nothing fits on one line even at the floor size: wrap rather than truncate the family's name.
  return {
    gap: HEADER_MIN_GAP,
    fontSize: GREETING_MIN_FONT_SIZE,
    lineHeight: Math.round(GREETING_MIN_FONT_SIZE * GREETING_LINE_RATIO),
    maxLines: 2,
  };
}

/** Width left for placeholder text inside the search field, after icon, padding and filter disc. */
export function searchTextWidth(viewportWidth: number): number {
  const field = viewportWidth - homeGutter(viewportWidth) * 2;
  const rightChrome = FILTER_INSET + FILTER_SIZE + FILTER_CLEARANCE;
  return (
    field - FIELD_BORDERS - FIELD_PADDING_LEFT - SEARCH_ICON - SEARCH_ICON_GAP - rightChrome
  );
}

/**
 * The longest placeholder that fits whole. Shortened copy reads as intentional; copy clipped
 * mid-word reads as a bug.
 */
export function searchPlaceholder(viewportWidth: number): string {
  if (viewportWidth >= HEADER_REFERENCE_WIDTH) return SEARCH_PLACEHOLDERS[0];

  const available = searchTextWidth(viewportWidth);
  for (const candidate of SEARCH_PLACEHOLDERS) {
    if (estimateTextWidth(candidate, SEARCH_FONT_SIZE) + FIT_MARGIN <= available) return candidate;
  }
  return SEARCH_PLACEHOLDERS[SEARCH_PLACEHOLDERS.length - 1];
}
