import { describe, expect, it } from 'vitest';

import { deckMetrics } from '@/src/utils/home-deck-geometry';
import {
  DECK_CREDITS_ALLOWANCE,
  deckRoom,
  deckTopGap,
  headerShift,
  HEADER_SAVINGS,
  HOME_HEADER_MODES,
  nextHeaderMode,
} from '@/src/utils/home-vertical-layout';
import { floatingTabBarLayout } from '@/src/utils/floating-tab-bar-layout';

/** The header's measured bottom in the approved frame at 393 wide, one greeting line (browser, no inset). */
const HEADER_BOTTOM = 257;

describe('Home vertical fit', () => {
  it('leaves the approved composition alone on the frame’s own phone (393 x 852, inset 34)', () => {
    const clearance = floatingTabBarLayout(5, 34).contentClearance;
    const room = deckRoom({ windowHeight: 852, headerBottom: HEADER_BOTTOM, mode: 'full', navClearance: clearance });
    expect(room).toBeGreaterThanOrEqual(428);
    expect(nextHeaderMode('full', room, 393)).toBe('full');
  });

  it('gives up optional header lines, in order, on a short screen', () => {
    const clearance = floatingTabBarLayout(5, 0).contentClearance;
    const modes: string[] = ['full'];
    let mode = 'full' as (typeof HOME_HEADER_MODES)[number];
    for (let i = 0; i < 4; i += 1) {
      const bottom = HEADER_BOTTOM - headerShift(mode, 'afterTitle');
      const room = deckRoom({ windowHeight: 664, headerBottom: bottom, mode, navClearance: clearance });
      const next = nextHeaderMode(mode, room, 390);
      if (next === mode) break;
      mode = next;
      modes.push(mode);
    }
    expect(modes).toEqual(['full', 'tight', 'compact']);
  });

  it('ends with a card that fits above the navigation at every phone size that matters', () => {
    const clearance = floatingTabBarLayout(5, 0).contentClearance;
    for (const [w, h] of [
      [360, 640], [360, 740], [390, 664], [390, 750], [393, 660], [393, 760], [430, 740], [430, 932],
    ] as const) {
      let mode = 'full' as (typeof HOME_HEADER_MODES)[number];
      let bottom = HEADER_BOTTOM;
      for (let i = 0; i < 3; i += 1) {
        const room = deckRoom({ windowHeight: h, headerBottom: bottom, mode, navClearance: clearance });
        const next = nextHeaderMode(mode, room, w);
        if (next === mode) break;
        mode = next;
        bottom = HEADER_BOTTOM - headerShift(mode, 'afterTitle');
      }
      const room = deckRoom({ windowHeight: h, headerBottom: bottom, mode, navClearance: clearance });
      const { activeHeight } = deckMetrics(w, room);
      const cardBottom = bottom + deckTopGap(mode) + activeHeight;
      const navTop = h - (clearance - 16);
      expect(cardBottom + DECK_CREDITS_ALLOWANCE, `${w}x${h} card bottom vs nav top`).toBeLessThanOrEqual(navTop - 8 + 0.5);
    }
  });

  it('only ever removes optional lines, in the order subtitle, search gap, then the plan heading', () => {
    expect(HEADER_SAVINGS.full.subtitle).toBe(0);
    expect(HEADER_SAVINGS.tight.title).toBe(0);
    expect(HEADER_SAVINGS.compact.title).toBeGreaterThan(0);
    expect(headerShift('compact', 'all')).toBeGreaterThan(headerShift('tight', 'all'));
  });
});
