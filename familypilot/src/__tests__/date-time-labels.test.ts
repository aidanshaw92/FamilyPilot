import { describe, expect, it } from 'vitest';

import { formatDateLabel, formatTimeLabel } from '@/src/utils/date-time-labels';

describe('date field label', () => {
  it('spells the day out so no locale can flip the month and day', () => {
    expect(formatDateLabel('2026-10-02')).toBe('Friday 2 October 2026');
    expect(formatDateLabel('2026-02-10')).toBe('Tuesday 10 February 2026');
  });

  it('refuses anything that is not an ISO date', () => {
    expect(formatDateLabel('')).toBeNull();
    expect(formatDateLabel('10/02/2026')).toBeNull();
    expect(formatDateLabel('2026-13-01')).toBeNull();
  });
});

describe('time field label', () => {
  it('prints a 24-hour clock, zero-padded', () => {
    expect(formatTimeLabel('09:00')).toBe('09:00');
    expect(formatTimeLabel('9:05')).toBe('09:05');
    expect(formatTimeLabel('14:21')).toBe('14:21');
    expect(formatTimeLabel('14:21:00')).toBe('14:21');
  });

  it('refuses a non-time', () => {
    expect(formatTimeLabel('')).toBeNull();
    expect(formatTimeLabel('--:--')).toBeNull();
    expect(formatTimeLabel('25:00')).toBeNull();
    expect(formatTimeLabel('9am')).toBeNull();
  });
});
