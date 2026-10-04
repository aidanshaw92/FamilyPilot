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
export const EXPLORE_CARD_PHOTO_WIDTH = 100;
export const EXPLORE_CARD_CONTENT_PADDING = 14;
/** The compact Arrow CTA's own insets: 10 left, then a 36 disc with 6 either side. */
const CTA_LABEL_INSET = 10 + 36 + 12;

const LONG_LABEL_WIDTH = { scored: 128 + 8, unreviewed: 155 + 8 } as const;

export function exploreCardCtaWidth(windowWidth: number): number {
  return windowWidth - spacing.screenPadding * 2 - EXPLORE_CARD_PHOTO_WIDTH - EXPLORE_CARD_CONTENT_PADDING * 2;
}

export function exploreCardCtaLabel(windowWidth: number, unreviewed: boolean): string {
  const space = exploreCardCtaWidth(windowWidth) - CTA_LABEL_INSET;
  if (unreviewed) return space >= LONG_LABEL_WIDTH.unreviewed ? 'Family details to check' : 'Details to check';
  return space >= LONG_LABEL_WIDTH.scored ? 'View family details' : 'View details';
}
