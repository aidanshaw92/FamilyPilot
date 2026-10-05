/**
 * Responsive layout for the Home header and search bar.
 *
 * The approved Figma frame "01 — Home" is drawn on a 393pt artboard, where the greeting and the
 * search placeholder both fit comfortably. Two things limit the greeting on any phone: the avatar, and
 * the three yellow strokes the frame draws up and to the left of the avatar (they are part of the frame's
 * artwork, so text that runs past them runs behind them). The greeting is therefore measured against
 * the room before the strokes, not the room before the avatar.
 *
 * Within that room it keeps the approved type, steps down by at most two points on a narrow phone, and
 * if the name is still too long it wraps onto a second line at the approved size rather than being
 * clipped or shrunk further. A normal greeting at 393 and wider is the approved composition by
 * construction.
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
 * The greeting at the approved frame's 24.4 (Bold 52.9px at 2.168x), on a 29.5 line, with Inter's
 * own tracking: the approved frames carry no negative letter-spacing.
 */
export const GREETING_FONT_SIZE = 24.4;
const GREETING_LINE_RATIO = 29.5 / 24.4;
export const GREETING_LETTER_SPACING = 0;
export const GREETING_FONT_FAMILY = 'Inter_700Bold';

/** Below this the heading stops reading as the page's primary voice, so we wrap instead. */
export const GREETING_MIN_FONT_SIZE = 22;

/** spacing.md: the approved gap between the greeting block and the avatar. */
export const HEADER_GAP = 12;

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
const WEIGHT_FACTOR = { regular: 1.025, semiBold: 1.09, bold: 1.05, extraBold: 1.115 } as const;
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
  /** The widest the greeting may be: the room before the avatar's strokes. */
  textLimit: number;
  /**
   * Lines the greeting is expected to take, from the estimate (the screen corrects it by measuring). The
   * greeting is allowed two; a name too long even for two is ellipsised rather than run behind the strokes.
   */
  lines: 1 | 2;
  /** Top of the avatar below the header's top edge, so it keeps the frame's place beside a one-line greeting. */
  avatarOffset: number;
}

/** The art's frame width: the Home artwork is drawn from a 852px-wide frame. */
export const ART_FRAME_WIDTH = 852;
/**
 * Left edge of the avatar strokes in that frame (the first stroke, node 268:135, starts at x=647; its
 * round cap adds half the 9px stroke). The header art is drawn at the window's width, so the strokes sit
 * at this fraction of it.
 */
const AVATAR_STROKES_LEFT_PX = 647 - 4.5;
/** Air kept between the greeting and the first stroke. */
export const STROKE_CLEARANCE = 8;

export function avatarStrokesLeft(viewportWidth: number): number {
  return (AVATAR_STROKES_LEFT_PX * viewportWidth) / ART_FRAME_WIDTH;
}

/** The room the greeting has: before the avatar and its strokes, whichever comes first. */
export function greetingTextLimit(viewportWidth: number): number {
  const gutter = homeGutter(viewportWidth);
  const beforeAvatar = viewportWidth - gutter * 2 - AVATAR_SIZE - HEADER_GAP;
  const beforeStrokes = avatarStrokesLeft(viewportWidth) - gutter - STROKE_CLEARANCE;
  return Math.min(beforeAvatar, beforeStrokes);
}

/** Height of the subtitle block under the greeting in the frame (4 gap + 17 line). */
const GREETING_SUB_BLOCK = 4 + 17;

function lineHeightFor(fontSize: number): number {
  return Math.round(fontSize * GREETING_LINE_RATIO);
}

/**
 * The greeting treatment for a given viewport and text. The avatar keeps the place the frame gives it
 * beside a one-line greeting (centred on the greeting and subtitle) however many lines the greeting takes.
 */
export function homeHeaderLayout(viewportWidth: number, greeting: string): HomeHeaderLayout {
  const textLimit = greetingTextLimit(viewportWidth);
  const base = { gap: HEADER_GAP, textLimit };
  const result = (fontSize: number, lines: 1 | 2): HomeHeaderLayout => ({
    ...base,
    fontSize,
    lineHeight: lineHeightFor(fontSize),
    lines,
    avatarOffset: (lineHeightFor(fontSize) + GREETING_SUB_BLOCK - AVATAR_SIZE) / 2,
  });

  for (let step = 0; ; step += 1) {
    const fontSize = Math.max(GREETING_FONT_SIZE - step, GREETING_MIN_FONT_SIZE);
    const width = estimateTextWidth(greeting, fontSize, 'bold', GREETING_LETTER_SPACING);
    if (width <= textLimit) return result(fontSize, 1);
    if (fontSize === GREETING_MIN_FONT_SIZE) break;
  }

  // One line is not possible even at the floor size: wrap at the approved size rather than clip the
  // family's name or shrink the heading further. The estimate decides only the first guess; the screen
  // measures the real height.
  const lines = estimateLineCount(greeting, GREETING_FONT_SIZE, textLimit, 'bold') > 1 ? 2 : 1;
  return result(GREETING_FONT_SIZE, lines);
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

/**
 * How many lines `text` wraps to in `maxWidth` at `fontSize`, by greedy word wrap over the same width
 * estimate the header trusts. A layout that waits on onLayout flashes the wrong composition first, so
 * screens that must move a decoration clear of wrapped text use this instead. It errs wide (a word is
 * judged to need its full estimated width), so it can over-count by a line but not under-count.
 */
export function estimateLineCount(
  text: string,
  fontSize: number,
  maxWidth: number,
  weight: TextWeight = 'regular',
): number {
  const space = estimateTextWidth(' ', fontSize, weight);
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = estimateTextWidth(word, fontSize, weight);
    if (used > 0 && used + space + w > maxWidth) {
      lines += 1;
      used = w;
    } else {
      used += (used > 0 ? space : 0) + w;
    }
  }
  return lines;
}
