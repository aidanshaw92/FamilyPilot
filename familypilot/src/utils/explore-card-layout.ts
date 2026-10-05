import { spacing } from '@/src/design-system/tokens';

/**
 * Geometry of the Explore result card (Figma "Explore card", node 90:106): a photograph down the left,
 * then the content column with the title, Family Fit, the reason, the metadata and a compact arrow
 * CTA that fills the column.
 *
 * The CTA's label has to fit on one line or it ellipsises into "View family detail…", which the
 * v2 frame itself showed at 393 wide. So the label is chosen from the width the card actually has:
 * the long form where it fits with a margin, a shorter form that says the same thing where it does
 * not. The widths below are Inter Semi Bold 14 as Figma measured them (137 and 166 at 15pt, scaled),
 * padded by 8 for the browsers' differences.
 */
export const EXPLORE_CARD_PHOTO_WIDTH = 111;
/** Left of the title 13.8, right of the CTA 9.7 (frame 294:133: 30px and 21px at 2.17x). */
export const EXPLORE_CARD_PADDING_LEFT = 14;
export const EXPLORE_CARD_PADDING_RIGHT = 10;
export const EXPLORE_CARD_CONTENT_PADDING = 12;
/** The compact Arrow CTA's own insets: 20 left, then the 36 disc 6 in from the right and 8 clear of the label. */
const CTA_LABEL_INSET = 20 + 36 + 6 + 8;

/** Inter SemiBold 13 with its trailing arrow, from the frame ("View family details →" is 133 wide), padded for browser differences. */
const LONG_LABEL_WIDTH = { scored: 133 + 6, unreviewed: 154 + 6 } as const;
/** "Details to check →" at the same size (about 118 wide), padded the same way. */
const SHORT_UNREVIEWED_LABEL_WIDTH = 118 + 6;

export function exploreCardCtaWidth(windowWidth: number): number {
  return windowWidth - spacing.screenPadding * 2 - EXPLORE_CARD_PHOTO_WIDTH - EXPLORE_CARD_PADDING_LEFT - EXPLORE_CARD_PADDING_RIGHT;
}

export function exploreCardCtaLabel(windowWidth: number, unreviewed: boolean): string {
  const space = exploreCardCtaWidth(windowWidth) - CTA_LABEL_INSET;
  if (unreviewed) {
    if (space >= LONG_LABEL_WIDTH.unreviewed) return 'Family details to check';
    return space >= SHORT_UNREVIEWED_LABEL_WIDTH ? 'Details to check' : 'Check details';
  }
  return space >= LONG_LABEL_WIDTH.scored ? 'View family details' : 'View details';
}
