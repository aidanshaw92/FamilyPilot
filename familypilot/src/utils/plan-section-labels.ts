import { spacing } from '@/src/design-system/tokens';

import { estimateTextWidth, FIT_MARGIN } from './home-header-layout';

/**
 * The Plan's three section controls (Day plan · Who's coming · Travel & parking) are primary
 * navigation, so all three must be visible at once, never half off the edge. With the full labels
 * the row is 376pt (16 side padding, 8 gaps), which fits a 430 phone and not a 393, 390 or 360 one.
 * Where it does not fit, the travel control takes its short label "Travel"; the section heading
 * inside still reads "Travel & parking", and nothing else changes.
 *
 * Widths are Chrome's own measurements of Inter Semi Bold 14 (the active weight, so the row fits
 * whichever control is active); unknown labels fall back to the shared estimate, which errs wide.
 */
const SHORT_LABELS: Record<string, string> = { travel: 'Travel' };
const MEASURED_SEMIBOLD_14: Record<string, number> = {
  'Day plan': 58.7,
  'Who’s coming': 95.7,
  'Travel & parking': 109.6,
  Travel: 41.6,
};
export const PLAN_SECTION_CONTROL_PADDING = 16;
const CONTROL_GAP = spacing.sm;
const LABEL_SIZE = 14;

interface Section { id: string; label: string }

export function planSectionLabelWidth(label: string): number {
  return MEASURED_SEMIBOLD_14[label] ?? estimateTextWidth(label, LABEL_SIZE, 'semiBold');
}

export function planSectionRowWidth(labels: string[]): number {
  return labels.reduce((sum, label) => sum + planSectionLabelWidth(label) + PLAN_SECTION_CONTROL_PADDING * 2, 0) + CONTROL_GAP * (labels.length - 1);
}

export function planSectionLabels(viewportWidth: number, sections: readonly Section[]): Record<string, string> {
  const available = viewportWidth - spacing.screenPadding * 2;
  const full = Object.fromEntries(sections.map((s) => [s.id, s.label]));
  if (planSectionRowWidth(Object.values(full)) + FIT_MARGIN <= available) return full;
  return Object.fromEntries(sections.map((s) => [s.id, SHORT_LABELS[s.id] ?? s.label]));
}
