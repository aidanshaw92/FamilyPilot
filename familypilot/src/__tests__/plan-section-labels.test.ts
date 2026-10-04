import { describe, expect, it } from 'vitest';

import { planSectionLabels, planSectionRowWidth } from '@/src/utils/plan-section-labels';

const SECTIONS = [
  { id: 'day', label: 'Day plan' },
  { id: 'who', label: 'Who’s coming' },
  { id: 'travel', label: 'Travel & parking' },
];
const FULL = { day: 'Day plan', who: 'Who’s coming', travel: 'Travel & parking' };
const SHORT = { day: 'Day plan', who: 'Who’s coming', travel: 'Travel' };

describe('Plan section control labels', () => {
  it('keeps the full labels where the row fits inside the gutters with the fit margin (430)', () => {
    expect(planSectionLabels(430, SECTIONS)).toEqual(FULL);
    expect(planSectionRowWidth(Object.values(FULL)) + 8).toBeLessThanOrEqual(430 - 40);
  });

  it('shortens only the travel control where the full row would clip (393, 390, 360)', () => {
    for (const width of [360, 390, 393]) {
      const labels = planSectionLabels(width, SECTIONS);
      expect(labels).toEqual(SHORT);
      expect(planSectionRowWidth(Object.values(labels)) + 8).toBeLessThanOrEqual(width - 40);
    }
  });

  it('never changes the section ids or the other two labels, even on a tiny screen', () => {
    const labels = planSectionLabels(320, SECTIONS);
    expect(Object.keys(labels)).toEqual(['day', 'who', 'travel']);
    expect(labels.day).toBe('Day plan');
    expect(labels.who).toBe('Who’s coming');
  });
});
