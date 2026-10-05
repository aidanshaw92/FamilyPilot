import { describe, expect, it } from 'vitest';

import { parseOsmOpeningHours } from '@/src/utils/osm-opening-hours';
import { describeOpeningToday } from '@/src/utils/opening-today';

// 2026-10-06 is a Tuesday, in British Summer Time.
const at = (day: number, hhmm: string) => new Date(`2026-10-${String(day).padStart(2, '0')}T${hhmm}:00+01:00`);

describe('reading OpenStreetMap opening hours', () => {
  it('reads the common patterns and evaluates them against the clock', () => {
    const hours = parseOsmOpeningHours('Mo-Fr 08:00-17:00; Sa,Su 09:00-16:00');
    expect(describeOpeningToday(hours, at(6, '11:00')).label).toBe('Open until 5pm');
    expect(describeOpeningToday(hours, at(10, '10:00')).label).toBe('Open until 4pm'); // Saturday
    expect(describeOpeningToday(hours, at(6, '18:00')).state).toBe('closed_for_today');
  });

  it('reads daily hours, 24/7, a day off, and split hours', () => {
    expect(describeOpeningToday(parseOsmOpeningHours('Mo-Su 11:00-22:00'), at(6, '12:00')).label).toBe('Open until 10pm');
    expect(describeOpeningToday(parseOsmOpeningHours('24/7'), at(6, '03:00')).label).toBe('Open 24 hours today');
    const off = parseOsmOpeningHours('Mo-Su 10:00-17:00; Tu off');
    expect(describeOpeningToday(off, at(6, '12:00')).state).toBe('closed_today');
    const split = parseOsmOpeningHours('Tu-Su 10:00-14:00,17:00-22:00');
    expect(describeOpeningToday(split, at(6, '15:00')).label).toBe('Opens at 5pm today');
  });

  it('lets a later rule override an earlier one for the days it names', () => {
    const hours = parseOsmOpeningHours('Mo-Su 09:00-17:00; Su 10:00-16:00');
    expect(describeOpeningToday(hours, at(11, '16:30')).state).toBe('closed_for_today'); // Sunday closes at 4
    expect(describeOpeningToday(hours, at(6, '16:30')).state).toBe('closing_soon');
  });

  it('handles a late close past midnight', () => {
    const hours = parseOsmOpeningHours('Fr,Sa 18:00-02:00');
    expect(describeOpeningToday(hours, at(9, '19:00')).state).toBe('open_now'); // Friday evening
    expect(describeOpeningToday(hours, at(10, '00:30')).state).toBe('open_now'); // after midnight, still Friday's span
  });

  it('returns null, never a guess, for anything it cannot read', () => {
    for (const unreadable of ['Mo-Fr sunrise-sunset', 'PH off', 'Jan-Mar Mo-Fr 09:00-17:00', 'by appointment', 'Mo-Fr 9am-5pm', '', null, undefined, 'Mo-Fr']) {
      expect(parseOsmOpeningHours(unreadable as never), String(unreadable)).toBeNull();
    }
  });
});
