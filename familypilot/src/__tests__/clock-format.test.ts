import { describe, expect, it } from 'vitest';

import { formatArrivalTime, formatClock } from '@/src/utils/clock-format';

describe('formatClock', () => {
  it('formats morning, noon, afternoon and midnight correctly', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(9 * 60 + 5)).toBe('09:05');
    expect(formatClock(12 * 60)).toBe('12:00');
    expect(formatClock(13 * 60 + 30)).toBe('13:30');
    expect(formatClock(23 * 60 + 59)).toBe('23:59');
  });

  it('wraps values past midnight', () => {
    expect(formatClock(1440 + 30)).toBe('00:30');
  });
});

describe('formatArrivalTime', () => {
  it('adds the drive time to the current clock time', () => {
    const now = new Date(2026, 0, 1, 9, 0);
    expect(formatArrivalTime(45, now)).toBe('09:45');
  });

  it('crosses into the next hour and period correctly', () => {
    const now = new Date(2026, 0, 1, 11, 40);
    expect(formatArrivalTime(30, now)).toBe('12:10');
  });
});
