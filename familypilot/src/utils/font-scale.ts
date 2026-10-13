/**
 * How much larger than normal this person has asked text to be, and what the layout does about it. Pure, so it is tested without
 * React Native; the hook that reads the scale is `src/hooks/use-font-scale.ts`.
 */
export const LARGE_TEXT_SCALE = 1.35;
/** From here the screen stops trying to be a map with a card on it: the list is the way in, and its cards reflow to one column. */
export const isLargeText = (scale: number): boolean => scale >= LARGE_TEXT_SCALE;

/** The browser's text size as a multiple of its 16 px default, kept sane (no smaller than normal, no larger than the largest iOS size). */
export function scaleFromRootFontSize(rootPx: number): number {
  if (!Number.isFinite(rootPx) || rootPx <= 0) return 1;
  return Math.min(3.1, Math.max(1, rootPx / 16));
}
