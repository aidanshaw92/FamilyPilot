/**
 * Geometry for the floating bottom navigation, measured on the approved Figma frame
 * "01 — Home" (node "Bottom navigation") against its 393 x 852 artboard.
 *
 * The frame draws a 270 x 58 pill centred on the screen, holding five 50 x 44 icon-only tabs
 * with a 44px circular indicator behind the active one. Sizes are fixed rather than scaled with
 * the viewport: 44pt is the minimum comfortable touch target, and shrinking it on a narrow phone
 * would make the bar harder to hit exactly where it is already tightest.
 *
 * Pure maths with no React Native import, so the layout can be asserted at real device insets
 * rather than only eyeballed on a web export where every inset is zero.
 */

/** Pill interior, from the frame: tabs start 6px in and 7px down. */
export const TAB_SIZE = 50;
export const TAB_HEIGHT = 44;
export const TAB_GAP = 2;
export const PILL_PADDING_X = 6;
export const PILL_PADDING_Y = 7;
export const PILL_HEIGHT = TAB_HEIGHT + PILL_PADDING_Y * 2;
export const ICON_SIZE = 22;
export const ACTIVE_INDICATOR = 44;

/**
 * The frame's pill sits 30px above the screen edge on an 852pt artboard, which is the 34pt
 * iPhone home-indicator inset less 4. Devices without a gesture bar report 0, and there the pill
 * still needs to clear the physical edge, so it never sits closer than 8.
 */
export const MIN_BOTTOM_OFFSET = 8;
const INSET_RELIEF = 4;

/** Breathing room between the pill and the last of a screen's scrolling content. */
const CONTENT_GAP = 16;

export interface FloatingTabBarLayout {
  /** Pill width, which follows the number of tabs actually shown. */
  width: number;
  height: number;
  /** Distance from the bottom of the screen to the bottom of the pill. */
  bottom: number;
  /** How much space a scrolling screen must leave below its content to clear the pill. */
  contentClearance: number;
}

/**
 * The pill for `tabCount` visible tabs at a given bottom safe-area inset. Five tabs at inset 34
 * reproduce the frame: 270 wide, 58 tall, 30 above the screen edge.
 */
export function floatingTabBarLayout(tabCount: number, bottomInset: number): FloatingTabBarLayout {
  const tabs = Math.max(1, tabCount);
  const width = PILL_PADDING_X * 2 + tabs * TAB_SIZE + (tabs - 1) * TAB_GAP;
  const bottom = Math.max(MIN_BOTTOM_OFFSET, bottomInset - INSET_RELIEF);

  return {
    width,
    height: PILL_HEIGHT,
    bottom,
    contentClearance: bottom + PILL_HEIGHT + CONTENT_GAP,
  };
}

/**
 * Whether the whole pill fits on screen with room to spare either side. A pill that has to be
 * clipped or squeezed is the bug this layout exists to prevent, so it is worth asserting rather
 * than assuming.
 */
export function fitsViewport(
  layout: FloatingTabBarLayout,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  const horizontal = layout.width + MIN_BOTTOM_OFFSET * 2 <= viewportWidth;
  const vertical = layout.bottom + layout.height <= viewportHeight;
  return horizontal && vertical;
}
