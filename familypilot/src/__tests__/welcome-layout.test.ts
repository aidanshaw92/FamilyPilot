import { describe, expect, it } from 'vitest';

import { estimateLineCount } from '@/src/utils/home-header-layout';
import {
  WELCOME_COLLAGE_TOP_STAGE_PT,
  WELCOME_FRAME_WIDTH,
  WELCOME_GIRAFFE_MIN_LEFT,
  WELCOME_HEADLINE,
  WELCOME_PX,
  WELCOME_SUBTITLE,
  welcomeLineShift,
  welcomeSubtitleWidth,
} from '@/src/utils/welcome-layout';

const SUBTITLE = 'Personalised days out, activities and recommendations for your family.';
const HEADLINE = 'The everyday app for family life';
const scaleAt = (width: number) => width / WELCOME_FRAME_WIDTH;

describe('welcome type layout', () => {
  it('moves the collage by nothing while the type keeps the frame\'s two lines', () => {
    expect(welcomeLineShift(2, 2)).toEqual({ headline: 0, subtitle: 0, collage: 0 });
    // Fewer lines than the frame never pull the collage up into the stickers.
    expect(welcomeLineShift(1, 1).collage).toBe(0);
  });

  it('gives each extra line its own line height, and the subtitle follows only the headline', () => {
    const shift = welcomeLineShift(3, 3);
    expect(shift.headline).toBeCloseTo(WELCOME_HEADLINE.lineHeight, 5);
    expect(shift.subtitle).toBeCloseTo(WELCOME_SUBTITLE.lineHeight, 5);
    expect(shift.collage).toBeCloseTo(WELCOME_HEADLINE.lineHeight + WELCOME_SUBTITLE.lineHeight, 5);
  });

  it('gives back the clearance a narrower phone loses when extra text lines push the type down to the collage', () => {
    // The collage scales with the phone and the type does not: at k the collage's top has risen by (1 - k) of its
    // distance from the top, so a third line needs that much more room, and only then.
    const k = 360 / 393;
    const withLine = welcomeLineShift(2, 3, k);
    expect(withLine.collage).toBeCloseTo(WELCOME_SUBTITLE.lineHeight + (1 - k) * WELCOME_COLLAGE_TOP_STAGE_PT, 5);
    expect(welcomeLineShift(2, 2, k).collage).toBe(0);
    expect(welcomeLineShift(2, 3, 1).collage).toBeCloseTo(WELCOME_SUBTITLE.lineHeight, 5);
    expect(welcomeLineShift(2, 3, 1.3).collage).toBeCloseTo(WELCOME_SUBTITLE.lineHeight, 5); // never negative on a wide stage
  });

  it('wraps the subtitle before the ice-cream sticker and never past its own cap', () => {
    expect(welcomeSubtitleWidth(scaleAt(393))).toBeLessThanOrEqual(WELCOME_SUBTITLE.maxWidth);
    expect(welcomeSubtitleWidth(scaleAt(360))).toBeLessThan(welcomeSubtitleWidth(scaleAt(393)));
    expect(welcomeSubtitleWidth(scaleAt(480))).toBe(WELCOME_SUBTITLE.maxWidth);
  });

  it('expects the frame\'s two subtitle lines at 393 and a third on a narrow phone', () => {
    expect(estimateLineCount(SUBTITLE, WELCOME_SUBTITLE.fontSize, welcomeSubtitleWidth(scaleAt(393)))).toBe(2);
    expect(estimateLineCount(SUBTITLE, WELCOME_SUBTITLE.fontSize, welcomeSubtitleWidth(scaleAt(360)))).toBe(3);
  });

  it('expects the frame\'s two headline lines in its measure', () => {
    expect(estimateLineCount(HEADLINE, WELCOME_HEADLINE.fontSize, WELCOME_HEADLINE.maxWidth, 'bold')).toBe(2);
  });

  it('keeps the giraffe clear of the headline\'s first line', () => {
    expect(WELCOME_GIRAFFE_MIN_LEFT).toBeGreaterThan(WELCOME_HEADLINE.leftPx * WELCOME_PX + 260);
    expect(WELCOME_GIRAFFE_MIN_LEFT).toBeLessThan(393);
  });
});
