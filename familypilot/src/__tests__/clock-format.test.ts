import { describe, expect, it } from 'vitest';

import { formatArrivalTime, formatClock } from '@/src/utils/clock-format';

describe('formatClock', () => {
  it('formats morning, noon, afternoon and midnight correctly', () => {
    expect(formatClock(0)).toBe('12:00am');
    expect(formatClock(9 * 60 + 5)).toBe('9:05am');
    expect(formatClock(12 * 60)).toBe('12:00pm');
    expect(formatClock(13 * 60 + 30)).toBe('1:30pm');
    expect(formatClock(23 * 60 + 59)).toBe('11:59pm');
  });

  it('wraps values past midnight', () => {
    expect(formatClock(1440 + 30)).toBe('12:30am');
  });
});

describe('formatArrivalTime', () => {
  it('adds the drive time to the current clock time', () => {
    const now = new Date(2026, 0, 1, 9, 0);
    expect(formatArrivalTime(45, now)).toBe('9:45am');
  });

  it('crosses into the next hour and period correctly', () => {
    const now = new Date(2026, 0, 1, 11, 40);
    expect(formatArrivalTime(30, now)).toBe('12:10pm');
  });
});
