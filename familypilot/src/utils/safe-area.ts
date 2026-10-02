import { spacing } from '@/src/design-system/tokens';

/**
 * How much room a pinned footer leaves beneath its action.
 *
 * Three surfaces pin an action to the bottom of the screen -- Venue Detail's Create a plan, the Plan
 * screen's Save, and the Create a Plan sheet -- and on a notched phone each has to clear the home
 * indicator. The arithmetic is trivial and was written out three times, which is how two of them
 * drift apart later.
 *
 * It cannot be checked in a desktop browser: `env(safe-area-inset-bottom)` reads 0 there and cannot
 * be injected, so an audit that "simulates" an inset is asserting a number the layout never saw.
 * Pulling the expression out is what makes it testable at all.
 */
export const FOOTER_GUTTER = spacing.md;

export function safeFooterPadding(bottomInset: number | undefined): number {
  // A provider that has not measured yet can hand back undefined, and a negative inset is
  // meaningless. Either would otherwise produce NaN padding and collapse the footer.
  const inset = typeof bottomInset === 'number' && Number.isFinite(bottomInset) && bottomInset > 0
    ? bottomInset
    : 0;
  return inset + FOOTER_GUTTER;
}
