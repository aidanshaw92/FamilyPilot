import { describe, expect, it } from 'vitest';

import { OpeningHoursSchedule } from '@/src/types/opening-hours';
import {
  clock12,
  describeOpeningToday,
  isVisitableVenue,
  resolveOpenNow,
} from '@/src/utils/opening-today';

const P = (day: number, oh: number, om: number, ch: number, cm: number, closeDay = day) => ({
  open: { day, hour: oh, minute: om },
  close: { day: closeDay, hour: ch, minute: cm },
});

/** A city farm: open every day but Monday, 10:00 to 16:30. The shape the production cache holds. */
const FARM: OpeningHoursSchedule = {
  timezone: 'Europe/London',
  periods: [0, 2, 3, 4, 5, 6].map((d) => P(d, 10, 0, 16, 30)),
};
const EVERY_DAY_10_17: OpeningHoursSchedule = {
  timezone: 'Europe/London',
  periods: [0, 1, 2, 3, 4, 5, 6].map((d) => P(d, 10, 0, 17, 0)),
};

// 2026-10-05 is a Monday and in British Summer Time (UTC+1 until 25 October).
const at = (local: string) => new Date(`2026-10-${local}:00+01:00`);

describe('what opening hours mean for today', () => {
  it('says open until the closing time while a place is open', () => {
    const today = describeOpeningToday(EVERY_DAY_10_17, at('06T11:00'));
    expect(today.state).toBe('open_now');
    expect(today.label).toBe('Open until 5pm');
  });

  it('warns in the last hour', () => {
    const today = describeOpeningToday(EVERY_DAY_10_17, at('06T16:10'));
    expect(today.state).toBe('closing_soon');
    expect(today.label).toBe('Closing soon · 5pm');
  });

  it('says when a place opens later today', () => {
    const today = describeOpeningToday(EVERY_DAY_10_17, at('06T08:30'));
    expect(today.state).toBe('opens_later');
    expect(today.label).toBe('Opens at 10am today');
  });

  it('says closed for today, and when it opens next, after closing time', () => {
    const today = describeOpeningToday(EVERY_DAY_10_17, at('06T18:00'));
    expect(today.state).toBe('closed_for_today');
    expect(today.label).toBe('Closed for today · opens tomorrow 10am');
  });

  it('says closed today, and which day it opens, for a place shut all day', () => {
    const monday = describeOpeningToday(FARM, at('05T11:00'));
    expect(monday.state).toBe('closed_today');
    expect(monday.label).toBe('Closed today · opens tomorrow 10am');
    // And on a Sunday evening the next opening is Tuesday, named.
    const sunday = describeOpeningToday(FARM, at('04T20:00'));
    expect(sunday.state).toBe('closed_for_today');
    expect(sunday.label).toBe('Closed for today · opens Tue 10am');
  });

  it('reads a place that is always open as open 24 hours', () => {
    const hours: OpeningHoursSchedule = { timezone: 'Europe/London', periods: [{ open: { day: 0, hour: 0, minute: 0 } }] };
    expect(describeOpeningToday(hours, at('06T03:00')).label).toBe('Open 24 hours today');
  });

  it('reads a day-long span as open 24 hours today', () => {
    const hours: OpeningHoursSchedule = { timezone: 'Europe/London', periods: [P(2, 0, 0, 0, 0, 3)] };
    expect(describeOpeningToday(hours, at('06T12:00')).label).toBe('Open 24 hours today');
  });

  it('handles a venue open past midnight (a bowling alley until 00:30)', () => {
    const hours: OpeningHoursSchedule = { timezone: 'Europe/London', periods: [0, 1, 2, 3, 4, 5, 6].map((d) => P(d, 10, 30, 0, 30, (d + 1) % 7)) };
    expect(describeOpeningToday(hours, at('06T23:15')).state).toBe('open_now');
    // 00:10 the next morning is still inside the span that began the evening before.
    expect(describeOpeningToday(hours, at('07T00:10')).state).toBe('closing_soon');
  });

  it('judges the venue clock, not the device clock', () => {
    // 10:30 in London is 09:30 UTC: a device on UTC must still see the place open.
    const utcInstant = new Date('2026-10-06T09:30:00Z');
    expect(describeOpeningToday(EVERY_DAY_10_17, utcInstant).state).toBe('open_now');
    // and 08:30 UTC is 09:30 London, before opening
    expect(describeOpeningToday(EVERY_DAY_10_17, new Date('2026-10-06T08:30:00Z')).state).toBe('opens_later');
  });

  it('leaves unknown hours unknown, and never-open as never open', () => {
    expect(describeOpeningToday(undefined, at('06T11:00')).state).toBe('unknown');
    expect(describeOpeningToday({ weekdayText: ['Mon: 9-5'] }, at('06T11:00')).state).toBe('unknown');
    expect(describeOpeningToday({ periods: [] }, at('06T11:00')).state).toBe('never_open');
  });

  it('formats clock times the way a parent says them', () => {
    expect(clock12(10 * 60)).toBe('10am');
    expect(clock12(16 * 60 + 30)).toBe('4:30pm');
    expect(clock12(12 * 60)).toBe('12pm');
    expect(clock12(0)).toBe('midnight');
  });
});

describe('the stored open-now flag is a snapshot, not a fact about now', () => {
  it('REGRESSION: a night-time snapshot of "closed" no longer hides a farm that is open', () => {
    // The production cache was written at about 01:40 and replayed all day: every place carried isOpen:false.
    const snapshotAt = '2026-10-06T00:40:00Z';
    expect(resolveOpenNow(EVERY_DAY_10_17, false, snapshotAt, at('06T11:00'))).toBe(true);
    expect(isVisitableVenue({ structuredOpeningHours: FARM, isOpen: false }, at('06T11:00'))).toBe(true);
  });

  it('still excludes a place that is shut for the whole day', () => {
    expect(isVisitableVenue({ structuredOpeningHours: FARM, isOpen: false }, at('05T11:00'))).toBe(false);
  });

  it('keeps a place that has finished for the day, labelled, rather than emptying the evening', () => {
    expect(isVisitableVenue({ structuredOpeningHours: EVERY_DAY_10_17 }, at('06T19:00'))).toBe(true);
  });

  it('with no schedule, trusts the provider flag only while it is fresh', () => {
    const now = at('06T12:00');
    expect(resolveOpenNow(undefined, false, '2026-10-06T10:30:00Z', now)).toBe(false); // 30 min old
    expect(resolveOpenNow(undefined, false, '2026-10-06T00:40:00Z', now)).toBeUndefined(); // 10 hours old
    expect(resolveOpenNow(undefined, true, undefined, now)).toBeUndefined();
    expect(isVisitableVenue({ isOpen: undefined }, now)).toBe(true);
    expect(isVisitableVenue({ isOpen: false }, now)).toBe(false);
  });
});
