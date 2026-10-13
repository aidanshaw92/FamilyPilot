/**
 * Geometry for the floating bottom navigation, measured on the approved Figma frames (Home 229:133,
 * node 267:165; Explore 294:133, node 298:135). A frame is a 393pt phone drawn at ~2.17x.
 *
 * The two frames draw the navigation DIFFERENTLY, and both are approved, so both are reproduced as
 * variants of one component rather than averaged into one:
 *
 * | variant | pill        | tab pitch | active disc | icons | bottom edge above the screen edge |
 * | ------- | ----------- | --------- | ----------- | ----- | --------------------------------- |
 * | home    | 289.7 x 60  | 55.0      | 46.1        | ~18   | 35.1 (a 34pt inset plus 1)        |
 * | explore | 310.1 x 59.4| 60.5      | 47.0        | ~25   | 38.7 (a 34pt inset plus 4.7)      |
 *
 * Home's variant also serves the tabs that have no frame of their own (Plans, Saved, Profile). The
 * pill resizes between variants as the focused tab changes.
 *
 * FIVE TABS. Home, Explore, Together, Plans, Profile are the frames' five. Drawn as the frames do, they fit every supported
 * iPhone. The bar's labelled form (below) is 314pt wide with 62pt tabs (`FIVE_TAB_LABELLED`). More than five tabs (the six
 * the app had until Halfway and Families became Together) would not fit at the frames' pitch on the narrowest iPhone, so
 * the pitch still tightens to `SIX_TAB_METRICS` (51pt) for any caller that asks for six.
 *
 * Sizes are fixed rather than scaled with the viewport: every tab is at least 55 x 59, which clears
 * the 44pt minimum touch target, and shrinking it on a narrow phone would make the bar harder to hit
 * exactly where it is already tightest.
 *
 * Pure maths with no React Native import, so the layout can be asserted at real device insets rather
 * than only eyeballed on a web export where every inset is zero.
 */
export type NavVariant = 'home' | 'explore';

export interface NavVariantMetrics {
  /** Width of one tab; the pill is `padX * 2 + tabs * tabWidth` wide. */
  tabWidth: number;
  padX: number;
  height: number;
  /** The circle behind the active tab. */
  indicator: number;
  /** Nominal size of the frame's ~18 / ~25pt glyph (NavGlyph draws it in a larger box around the tab centre). */
  icon: number;
  /** Lift of the pill's bottom edge above the bottom safe-area inset. */
  lift: number;
}

export const NAV_VARIANTS: Record<NavVariant, NavVariantMetrics> = {
  home: { tabWidth: 55, padX: 7.35, height: 60, indicator: 46, icon: 21, lift: 1.1 },
  explore: { tabWidth: 60.5, padX: 3.8, height: 59.4, indicator: 47, icon: 27, lift: 4.7 },
};

/** What changes when the bar holds more tabs than the frames drew (see SIX TABS above). Nothing else moves. */
export const FRAME_TAB_COUNT = 5;
export const SIX_TAB_METRICS = { tabWidth: 51, padX: 6, indicator: 45 } as const;
/**
 * The labelled bar with its five tabs (Home, Explore, Together, Plans, Profile): the same 314pt pill the six-tab bar was, so
 * each tab is 62pt wide instead of 51 (approved Figma page 09, "Option B: five tabs"). The extra width is what lets the label be
 * 11pt, and still grow to 13pt at the largest text, without being cut.
 */
export const FIVE_TAB_LABELLED = { tabWidth: 62, padX: 2 } as const;

/**
 * LABELLED. The frames draw icons alone, which is not enough for tabs a new parent has never seen (Together and Profile are
 * both "people"). The bar therefore carries a short word under each icon. The pill keeps its shape, colour, glyphs and mint
 * disc; it is 66pt tall instead of 60 to hold the word, the disc shrinks to sit behind the icon alone, and the icon is lifted
 * to make room. Five tabs are 62 x 66 with an 11pt word; the 44pt touch minimum is cleared with room to spare.
 */
export const LABELLED_METRICS = { height: 66, indicator: { home: 34, explore: 38 } as Record<NavVariant, number>, labelSize: 11 } as const;

/** Which variant a route draws. Explore has its own frame; everything else uses Home's. */
export function navVariantForRoute(routeName: string | undefined): NavVariant {
  return routeName === 'explore' ? 'explore' : 'home';
}

/** Kept for callers that want the default (Home) figures. */
export const TAB_SIZE = NAV_VARIANTS.home.tabWidth;
export const TAB_HEIGHT = NAV_VARIANTS.home.height;
export const PILL_PADDING_X = NAV_VARIANTS.home.padX;
export const PILL_HEIGHT = NAV_VARIANTS.home.height;
export const ICON_SIZE = NAV_VARIANTS.home.icon;
export const ACTIVE_INDICATOR = NAV_VARIANTS.home.indicator;

/**
 * Devices without a gesture bar report an inset of 0, and there the pill still needs to clear the
 * physical edge, so it never sits closer than 8.
 */
export const MIN_BOTTOM_OFFSET = 8;

/** Breathing room between the pill and the last of a screen's scrolling content. */
const CONTENT_GAP = 16;

export interface FloatingTabBarLayout {
  variant: NavVariant;
  /** Pill width, which follows the number of tabs actually shown. */
  width: number;
  height: number;
  tabWidth: number;
  padX: number;
  indicator: number;
  icon: number;
  /** Distance from the bottom of the screen to the bottom of the pill. */
  bottom: number;
  /** How much space a scrolling screen must leave below its content to clear the pill. */
  contentClearance: number;
}

/**
 * The pill for `tabCount` visible tabs at a given bottom safe-area inset. Five tabs at inset 34
 * reproduce the frames: Home 289 x 60, 35 above the screen edge; Explore 310 x 59.4, 38.7 above it.
 *
 * `contentClearance` is the same for both variants (the taller of the two), because a screen does not
 * know which variant is showing and must clear either.
 */
export function floatingTabBarLayout(
  tabCount: number,
  bottomInset: number,
  variant: NavVariant = 'home',
  labelled = false,
): FloatingTabBarLayout {
  const tabs = Math.max(1, tabCount);
  const frame = NAV_VARIANTS[variant];
  const m = labelled && tabCount <= FRAME_TAB_COUNT
    ? { ...frame, tabWidth: FIVE_TAB_LABELLED.tabWidth, padX: FIVE_TAB_LABELLED.padX }
    : tabCount > FRAME_TAB_COUNT
    ? { ...frame, tabWidth: Math.min(frame.tabWidth, SIX_TAB_METRICS.tabWidth), padX: Math.min(frame.padX, SIX_TAB_METRICS.padX), indicator: Math.min(frame.indicator, SIX_TAB_METRICS.indicator) }
    : frame;
  const bottomFor = (v: NavVariant) => Math.max(MIN_BOTTOM_OFFSET, bottomInset + NAV_VARIANTS[v].lift);
  const heightOf = (v: NavVariant) => (labelled ? LABELLED_METRICS.height : NAV_VARIANTS[v].height);
  const clearance = Math.max(
    ...(Object.keys(NAV_VARIANTS) as NavVariant[]).map((v) => bottomFor(v) + heightOf(v) + CONTENT_GAP),
  );

  return {
    variant,
    width: m.padX * 2 + tabs * m.tabWidth,
    height: heightOf(variant),
    tabWidth: m.tabWidth,
    padX: m.padX,
    indicator: labelled ? LABELLED_METRICS.indicator[variant] : m.indicator,
    icon: m.icon,
    bottom: bottomFor(variant),
    contentClearance: clearance,
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
