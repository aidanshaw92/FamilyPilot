import { describe, expect, it } from 'vitest';

import {
  ACTIVE_HEIGHT,
  ACTIVE_WIDTH,
  BACK_OFFSET_Y,
  BACK_REVEAL,
  BACK_SCALE,
  deckMetrics,
  NEXT_OFFSET_Y,
  NEXT_REVEAL,
  NEXT_SCALE,
  rearLayerOffsetX,
} from '@/src/utils/home-deck-geometry';

/**
 * The Home deck is a faithful build of the locked Figma frame "01 — Home". These pin the
 * numbers that frame was approved on, so a later refactor cannot quietly drift the
 * composition. Measured on the 393pt artboard: active card 312 x 428 centred, rear layers at
 * 76% and 71% revealing 25px on the left and 27px on the right.
 */
describe('home recommendation deck geometry', () => {
  it('matches the locked frame exactly at the 393pt reference width', () => {
    const { scale, activeWidth, activeHeight } = deckMetrics(393);
    expect(scale).toBe(1);
    expect(activeWidth).toBe(312);
    expect(activeHeight).toBe(428);
  });

  it('reveals 25px of the next layer past the active card’s left edge', () => {
    const { activeWidth, scale } = deckMetrics(393);
    const nextWidth = activeWidth * NEXT_SCALE;
    const offset = rearLayerOffsetX(activeWidth, nextWidth, NEXT_REVEAL, scale);

    // The layer sits left of centre, so its rendered translateX is the negated offset.
    const rearLeftEdge = -offset - nextWidth / 2;
    const activeLeftEdge = -activeWidth / 2;
    expect(activeLeftEdge - rearLeftEdge).toBeCloseTo(25, 5);
  });

  it('reveals 27px of the back layer past the active card’s right edge', () => {
    const { activeWidth, scale } = deckMetrics(393);
    const backWidth = activeWidth * BACK_SCALE;
    const offset = rearLayerOffsetX(activeWidth, backWidth, BACK_REVEAL, scale);

    const rearRightEdge = offset + backWidth / 2;
    const activeRightEdge = activeWidth / 2;
    expect(rearRightEdge - activeRightEdge).toBeCloseTo(27, 5);
  });

  it('reproduces the three card boxes the frame actually draws', () => {
    // Measured on the locked component "Recommendation deck" (node 38:43), whose own origin sits
    // at x=15.5, y=307 on the artboard:
    //   active  x=25,       y=0,  312      x 428
    //   next    x=0,        y=32, 237.6449 x 326
    //   back    x=140.9346, y=40, 223.0654 x 306
    const { activeWidth, activeHeight, scale } = deckMetrics(393);
    expect([activeWidth, activeHeight]).toEqual([ACTIVE_WIDTH, ACTIVE_HEIGHT]);

    expect(activeWidth * NEXT_SCALE).toBeCloseTo(237.6449, 3);
    expect(activeHeight * NEXT_SCALE).toBeCloseTo(326, 1);
    expect(NEXT_OFFSET_Y * scale).toBe(32);

    expect(activeWidth * BACK_SCALE).toBeCloseTo(223.0654, 3);
    expect(activeHeight * BACK_SCALE).toBeCloseTo(306, 1);
    expect(BACK_OFFSET_Y * scale).toBe(40);
  });

  it('centres the active card on the screen, as the frame does', () => {
    // Frame: active card spans x=40.5..352.5 of 393, so its centre is the artboard's own.
    const { activeWidth } = deckMetrics(393);
    const left = (393 - activeWidth) / 2;
    expect(left).toBe(40.5);
    expect(left + activeWidth / 2).toBe(393 / 2);
  });

  it('keeps every rear layer narrower than the active card so it reads as behind it', () => {
    const { activeWidth } = deckMetrics(393);
    expect(activeWidth * NEXT_SCALE).toBeLessThan(activeWidth);
    expect(activeWidth * BACK_SCALE).toBeLessThan(
      activeWidth * NEXT_SCALE,
    );
  });

  it('scales the composition proportionally on narrower and wider phones', () => {
    for (const width of [360, 430]) {
      const { scale, activeWidth, activeHeight } = deckMetrics(width);
      expect(scale).toBeCloseTo(width / 393, 5);
      // Proportions are what carry over, not the absolute 312 x 428.
      expect(activeWidth / width).toBeCloseTo(312 / 393, 5);
      expect(activeHeight / activeWidth).toBeCloseTo(428 / 312, 5);
    }
  });

  it('keeps the revealed strip proportional to the viewport', () => {
    const { activeWidth, scale } = deckMetrics(430);
    const nextWidth = activeWidth * NEXT_SCALE;
    const offset = rearLayerOffsetX(activeWidth, nextWidth, NEXT_REVEAL, scale);

    const rearLeftEdge = -offset - nextWidth / 2;
    const activeLeftEdge = -activeWidth / 2;
    expect(activeLeftEdge - rearLeftEdge).toBeCloseTo(25 * (430 / 393), 5);
  });
});
