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

/**
 * Rear layers are scaled down and pushed down so they end above the active card's CTA. Taken
 * from the frame's own card widths rather than rounded: the next card is 237.6449 wide and the
 * back card 223.0654, against the active card's 312.
 */
export const NEXT_SCALE = 237.6449 / ACTIVE_WIDTH;
export const BACK_SCALE = 223.0654 / ACTIVE_WIDTH;
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
 * The smallest the composition is allowed to shrink to when the screen is too short for it. Below this the
 * card would be too small to read, so the page scrolls instead and the navigation clearance keeps the CTA
 * reachable.
 */
export const MIN_DECK_SCALE = 0.74;

/**
 * Scales the approved composition from the 393pt reference. A 393pt device is exact; other
 * widths keep the same proportions rather than pinning the card to 312 x 428 and letting the
 * side reveals drift.
 *
 * `maxHeight` is the room the screen really has for the deck (what is left between the header and the floating
 * navigation). When the width-derived card would not fit, the whole composition scales down together, so the
 * card, its rear strips and its CTA stay in the approved proportions and nothing runs under the navigation.
 */
export function deckMetrics(viewportWidth: number, maxHeight?: number): DeckMetrics {
  const byWidth = viewportWidth / REFERENCE_WIDTH;
  const byHeight =
    typeof maxHeight === 'number' && Number.isFinite(maxHeight) && maxHeight > 0
      ? maxHeight / ACTIVE_HEIGHT
      : Infinity;
  const scale = Math.min(byWidth, Math.max(byHeight, MIN_DECK_SCALE * byWidth));
  return {
    scale,
    activeWidth: ACTIVE_WIDTH * scale,
    activeHeight: ACTIVE_HEIGHT * scale,
    deckHeight: ACTIVE_HEIGHT * scale,
  };
}

/**
 * Where a card sits, as a function of its distance `d` from the front of the deck (a card's index minus the
 * deck's fractional position). d = 0 is the foreground card, d = 1 the next one (its strip shows on the left),
 * d = 2 the one after (right), d = 3 is waiting out of sight so its photograph is already loaded when it arrives,
 * and d < 0 is a card that has been swiped away to the left, which a swipe right brings back.
 *
 * Because every card is placed by this one continuous function, the foreground card, its text and its scrim move
 * as a single piece, and a card changing role (rear strip to foreground) travels there instead of being swapped.
 *
 * Pure arithmetic with a worklet marker, so it runs on the UI thread and is asserted in plain unit tests.
 */
export interface DeckSlot {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  zIndex: number;
  /** 1 for the foreground card, 0 for a rear strip: drives the text, the save control and the scrim. */
  emphasis: number;
}

export function deckSlot(d: number, active: { width: number; height: number; scale: number; stride: number }): DeckSlot {
  'worklet';
  const { width, height, scale, stride } = active;
  const nextW = width * NEXT_SCALE;
  const backW = width * BACK_SCALE;
  const nextX = -(width / 2 + NEXT_REVEAL * scale - nextW / 2);
  const backX = width / 2 + BACK_REVEAL * scale - backW / 2;
  // A rear layer keeps its TOP edge where the frame draws it (offset down from the foreground's), so the
  // translate compensates for scaling about the centre.
  const nextY = NEXT_OFFSET_Y * scale - ((1 - NEXT_SCALE) * height) / 2;
  const backY = BACK_OFFSET_Y * scale - ((1 - BACK_SCALE) * height) / 2;

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const at = (v0: number, v1: number, v2: number, v3: number): number => {
    if (d <= 0) return v0;
    if (d <= 1) return lerp(v0, v1, d);
    if (d <= 2) return lerp(v1, v2, d - 1);
    if (d <= 3) return lerp(v2, v3, d - 2);
    return v3;
  };

  if (d < 0) {
    // Swiped away. Fully off the left edge by d = -1, and not drawn beyond it.
    const t = Math.max(d, -1.25);
    return {
      x: t * stride,
      y: 0,
      scale: 1,
      opacity: d <= -1.25 ? 0 : 1,
      zIndex: 30,
      emphasis: 1,
    };
  }
  return {
    x: at(0, nextX, backX, backX),
    y: at(0, nextY, backY, backY),
    scale: at(1, NEXT_SCALE, BACK_SCALE, BACK_SCALE * 0.94),
    opacity: at(1, NEXT_OPACITY, BACK_OPACITY, 0),
    zIndex: Math.round(20 - d * 4),
    emphasis: Math.max(0, 1 - d * 2.5),
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
