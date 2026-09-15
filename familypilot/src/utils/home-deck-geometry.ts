/**
 * Geometry for the Home recommendation deck, taken from the approved Figma frame
 * "01 — Home" (component "Recommendation deck") and measured on its 393pt artboard.
 *
 * Pure maths, deliberately free of any React Native import, so the approved composition can
 * be asserted in tests rather than only eyeballed in a screenshot.
 */

/** The artboard the approved frame was designed and signed off on. */
export const REFERENCE_WIDTH = 393;
export const ACTIVE_WIDTH = 312;
export const ACTIVE_HEIGHT = 428;

/** Rear layers are scaled down and pushed down so they end above the active card's CTA. */
export const NEXT_SCALE = 0.76;
export const BACK_SCALE = 0.71;
export const NEXT_OFFSET_Y = 32;
export const BACK_OFFSET_Y = 40;

/** How much rear photography shows beyond each edge of the active card. */
export const NEXT_REVEAL = 25;
export const BACK_REVEAL = 27;

export const NEXT_OPACITY = 0.94;
export const BACK_OPACITY = 0.86;

export interface DeckMetrics {
  scale: number;
  activeWidth: number;
  activeHeight: number;
  deckHeight: number;
}

/**
 * Scales the approved composition from the 393pt reference. A 393pt device is exact; other
 * widths keep the same proportions rather than pinning the card to 312 x 428 and letting the
 * side reveals drift.
 */
export function deckMetrics(viewportWidth: number): DeckMetrics {
  const scale = viewportWidth / REFERENCE_WIDTH;
  return {
    scale,
    activeWidth: ACTIVE_WIDTH * scale,
    activeHeight: ACTIVE_HEIGHT * scale,
    deckHeight: ACTIVE_HEIGHT * scale,
  };
}

/**
 * How far a rear layer must move sideways from centre so exactly `reveal` reference pixels of
 * it sit beyond the active card's edge. Positive moves right; negate it for the layer that
 * protrudes left.
 */
export function rearLayerOffsetX(
  activeWidth: number,
  rearWidth: number,
  reveal: number,
  scale: number,
): number {
  return activeWidth / 2 + reveal * scale - rearWidth / 2;
}
