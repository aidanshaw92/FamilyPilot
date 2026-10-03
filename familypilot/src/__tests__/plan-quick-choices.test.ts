import { describe, expect, it } from 'vitest';

import { dateQuickChoices, nextWeekendDay, shortDateLabel } from '@/src/utils/plan-quick-choices';

describe('plan quick choices', () => {
  it('offers today and the coming weekend day, labelled like the frame', () => {
    // 2026-10-02 is a Friday.
    expect(dateQuickChoices('2026-10-02')).toEqual([
      { value: '2026-10-02', label: 'Today' },
      { value: '2026-10-03', label: 'Sat 3 Oct' },
    ]);
  });

  it('from a Saturday offers tomorrow, from a Sunday the next Saturday, never today', () => {
    expect(nextWeekendDay('2026-10-03')).toBe('2026-10-04');
    expect(nextWeekendDay('2026-10-04')).toBe('2026-10-10');
    expect(nextWeekendDay('2026-10-07')).toBe('2026-10-10');
  });

  it('crosses a month end without drifting', () => {
    expect(nextWeekendDay('2026-10-30')).toBe('2026-10-31');
    expect(shortDateLabel('2026-11-01')).toBe('Sun 1 Nov');
  });
});
