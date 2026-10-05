/**
 * Home's vertical fit: whether the whole foreground card, with its "See more" button, fits between the header
 * and the floating navigation on THIS screen.
 *
 * The approved frame is a 393 x 852 phone. A real phone browser leaves much less: with its toolbars showing, an
 * iPhone has about 660 to 750 points of height, and the floating navigation is pinned to the bottom of whatever
 * height there is. At the frame's own proportions the card's button then sat under the navigation. So the header
 * gives up its optional lines in two steps, and if the card still would not fit it scales down as a whole
 * (`deckMetrics`) before the page ever falls back to scrolling.
 *
 * Pure arithmetic, no React Native import, so the plan is asserted in unit tests and again against a real
 * browser at real phone sizes (`scripts/verify-home-fit.mjs`).
 */
import { ACTIVE_HEIGHT, REFERENCE_WIDTH } from './home-deck-geometry';

export type HomeHeaderMode = 'full' | 'tight' | 'compact';
export const HOME_HEADER_MODES: readonly HomeHeaderMode[] = ['full', 'tight', 'compact'];

/** Height the one-line credit under the deck takes, including the gap above it. */
export const DECK_CREDITS_ALLOWANCE = 24;

/**
 * What each mode removes from the header, in points. `subtitle` is "What shall we do today?" (a 17 line plus the 4
 * above it), `searchGap` trims the space above the search field, `title` is the "Select your plan" heading with its
 * margins, and `deckGap` is the space between the category chips and the deck.
 */
export interface HeaderSavings {
  subtitle: number;
  searchGap: number;
  title: number;
  deckGap: number;
}

export const HEADER_SAVINGS: Record<HomeHeaderMode, HeaderSavings> = {
  full: { subtitle: 0, searchGap: 0, title: 0, deckGap: 0 },
  tight: { subtitle: 21, searchGap: 5, title: 0, deckGap: 9 },
  compact: { subtitle: 21, searchGap: 5, title: 51, deckGap: 9 },
};

/** The gap between the chips and the deck in the approved frame (frame 278 -> 307). */
export const DECK_TOP_GAP = 27;

export function deckTopGap(mode: HomeHeaderMode): number {
  return DECK_TOP_GAP - HEADER_SAVINGS[mode].deckGap;
}

/** Total the header has given up, which the marks drawn beside it move up by. */
export function headerShift(mode: HomeHeaderMode, part: 'beforeTitle' | 'afterTitle' | 'all'): number {
  const s = HEADER_SAVINGS[mode];
  if (part === 'beforeTitle') return s.subtitle + s.searchGap;
  if (part === 'afterTitle') return s.subtitle + s.searchGap + s.title;
  return s.subtitle + s.searchGap + s.title + s.deckGap;
}

export interface DeckRoomInput {
  windowHeight: number;
  /** Where the header (greeting, search, plan heading, chips) ends, measured, in the scroll content's own space. */
  headerBottom: number;
  mode: HomeHeaderMode;
  /** What a screen must leave below its content to clear the floating navigation (`useTabBarClearance`). */
  navClearance: number;
}

/** The height left for the deck: everything below the header, minus the navigation and the credit line. */
export function deckRoom({ windowHeight, headerBottom, mode, navClearance }: DeckRoomInput): number {
  return windowHeight - (headerBottom + deckTopGap(mode)) - navClearance - DECK_CREDITS_ALLOWANCE;
}

/** The card is left at the frame's own proportions while it keeps at least this share of its natural height. */
export const FIT_THRESHOLD = 0.9;

/** The next, more compact mode if the card would be squeezed below the threshold, otherwise the same one. */
export function nextHeaderMode(mode: HomeHeaderMode, room: number, viewportWidth: number): HomeHeaderMode {
  const natural = ACTIVE_HEIGHT * (viewportWidth / REFERENCE_WIDTH);
  if (room >= natural * FIT_THRESHOLD) return mode;
  const index = HOME_HEADER_MODES.indexOf(mode);
  return HOME_HEADER_MODES[Math.min(HOME_HEADER_MODES.length - 1, index + 1)];
}
