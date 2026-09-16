import { describe, expect, test } from 'vitest';

import { isOpenOn, venueLocalDate, venueLocalTime } from '../utils/opening-hours';
import { OpeningHoursSchedule } from '../types/opening-hours';
import {
  ALEXANDRA_PARK,
  BABYLON_PARK,
  CHILTERN_OPEN_AIR_MUSEUM,
  GooglePlacePayload,
  LATE_NIGHT_PLACE,
  NEVER_OPEN_PLACE,
  SPLIT_DAY_PLACE,
  STORED_TEXT_ONLY_ROW,
  TEXT_ONLY_PLACE,
  WHITECHAPEL_GALLERY,
} from './fixtures/provider-opening-hours';

const { googlePlaceToRecord } = require('../../../server/places/lib/google-places');

/**
 * Every schedule under test comes through the real provider mapper rather than being written by
 * hand, so these assertions cover the mapping and the evaluation together. A test that fed the
 * evaluator an idealised object would stay green even if the mapper went back to dropping periods
 * — which is exactly the failure this change exists to prevent.
 */
function scheduleFor(payload: GooglePlacePayload): OpeningHoursSchedule {
  const record = googlePlaceToRecord(payload, 'explore');
  expect(record, `${payload.displayName.text} should map to a record`).not.toBeNull();
  return record.openingHours;
}

// 2026-09-21 is a Monday, and the week that follows runs Tue 22nd … Sun 27th.
const MONDAY = '2026-09-21';
const TUESDAY = '2026-09-22';
const WEDNESDAY = '2026-09-23';
const THURSDAY = '2026-09-24';
const FRIDAY = '2026-09-25';
const SATURDAY = '2026-09-26';
const SUNDAY = '2026-09-27';

describe('the mapper preserves what the evaluator needs', () => {
  test('periods, timezone and display text all survive the trip through the mapper', () => {
    const hours = scheduleFor(WHITECHAPEL_GALLERY);

    expect(hours.periods).toHaveLength(6);
    expect(hours.periods?.[0]).toEqual({
      open: { day: 2, hour: 11, minute: 0 },
      close: { day: 2, hour: 18, minute: 0 },
    });
    expect(hours.timezone).toBe('Europe/London');
    expect(hours.utcOffsetMinutes).toBe(60);
    expect(hours.weekdayText?.[0]).toBe('Monday: Closed');
  });

  test('an always-open place keeps its missing close rather than gaining a fabricated one', () => {
    const hours = scheduleFor(ALEXANDRA_PARK);
    expect(hours.periods).toEqual([{ open: { day: 0, hour: 0, minute: 0 } }]);
  });

  test('"never open" survives as an empty list, not as absent hours', () => {
    const hours = scheduleFor(NEVER_OPEN_PLACE);
    expect(hours.periods).toEqual([]);
  });

  test('a production row with only display text yields no periods at all', () => {
    const hours = scheduleFor(TEXT_ONLY_PLACE);
    expect(hours.periods).toBeUndefined();
    expect(hours.weekdayText).toHaveLength(7);
  });

  test('the weekly schedule is taken from regular hours, never the truncated seven-day window', () => {
    // currentOpeningHours covers only the week from the request and is cut off at that boundary,
    // so treating it as the recurring schedule would misreport dates beyond it.
    const record = googlePlaceToRecord(
      {
        ...BABYLON_PARK,
        currentOpeningHours: {
          periods: [{ open: { day: 1, hour: 10, minute: 0 }, close: { day: 1, hour: 12, minute: 0 } }],
          weekdayDescriptions: ['Monday: 10:00 AM – 12:00 PM (holiday hours)'],
        },
      },
      'explore',
    );

    expect(record.openingHours.periods).toHaveLength(7);
    // Display text still prefers the current set, because that is what a visitor should read.
    expect(record.openingHours.weekdayText?.[0]).toContain('holiday hours');
  });
});

describe('ordinary same-day hours', () => {
  test('a visit inside opening hours is open', () => {
    const hours = scheduleFor(BABYLON_PARK);
    expect(isOpenOn(TUESDAY, '11:00', '15:00', hours)).toMatchObject({
      status: 'open',
      reason: 'within-opening-period',
      closesDuringVisit: false,
    });
  });

  test('a visit wholly before opening is closed, and says the day was not the problem', () => {
    const hours = scheduleFor(BABYLON_PARK);
    expect(isOpenOn(TUESDAY, '07:00', '09:00', hours)).toMatchObject({
      status: 'closed',
      reason: 'outside-opening-period',
      closesDuringVisit: false,
    });
  });

  test('a visit ending exactly at closing time still counts as open', () => {
    const hours = scheduleFor(BABYLON_PARK);
    expect(isOpenOn(TUESDAY, '19:00', '21:00', hours).status).toBe('open');
  });

  test('the later Saturday closing time is honoured', () => {
    const hours = scheduleFor(BABYLON_PARK);
    expect(isOpenOn(SATURDAY, '21:00', '22:00', hours).status).toBe('open');
    expect(isOpenOn(FRIDAY, '21:00', '22:00', hours).status).toBe('closed');
  });
});

describe('venues closed on the requested day', () => {
  test('Whitechapel Gallery is shut on Mondays', () => {
    const hours = scheduleFor(WHITECHAPEL_GALLERY);
    expect(isOpenOn(MONDAY, '12:00', '14:00', hours)).toMatchObject({
      status: 'closed',
      reason: 'closed-that-day',
      closesDuringVisit: false,
    });
  });

  test('the same venue is open on the Thursday it stays late', () => {
    const hours = scheduleFor(WHITECHAPEL_GALLERY);
    expect(isOpenOn(THURSDAY, '18:30', '20:30', hours).status).toBe('open');
    // Tuesday shuts at six, so the identical window is not available.
    expect(isOpenOn(TUESDAY, '18:30', '20:30', hours).status).toBe('closed');
  });

  test('a three-day midweek closure reads as closed on each of those days', () => {
    const hours = scheduleFor(CHILTERN_OPEN_AIR_MUSEUM);
    for (const day of [TUESDAY, WEDNESDAY, THURSDAY]) {
      expect(isOpenOn(day, '11:00', '13:00', hours).reason).toBe('closed-that-day');
    }
    expect(isOpenOn(MONDAY, '11:00', '13:00', hours).status).toBe('open');
    expect(isOpenOn(FRIDAY, '11:00', '13:00', hours).status).toBe('open');
  });

  test('an empty period list is a confirmed closure, not an unknown', () => {
    const hours = scheduleFor(NEVER_OPEN_PLACE);
    expect(isOpenOn(SATURDAY, '11:00', '13:00', hours)).toMatchObject({
      status: 'closed',
      reason: 'never-open',
    });
  });
});

describe('multiple opening periods in one day', () => {
  test('a visit falling in the lunchtime gap is closed', () => {
    const hours = scheduleFor(SPLIT_DAY_PLACE);
    expect(isOpenOn(WEDNESDAY, '12:30', '13:30', hours)).toMatchObject({
      status: 'closed',
      reason: 'outside-opening-period',
    });
  });

  test('each side of the gap is open on its own', () => {
    const hours = scheduleFor(SPLIT_DAY_PLACE);
    expect(isOpenOn(WEDNESDAY, '10:00', '11:30', hours).status).toBe('open');
    expect(isOpenOn(WEDNESDAY, '14:30', '16:30', hours).status).toBe('open');
  });

  test('a visit spanning the gap is closed and reports the time it shuts', () => {
    const hours = scheduleFor(SPLIT_DAY_PLACE);
    expect(isOpenOn(WEDNESDAY, '11:00', '15:00', hours)).toMatchObject({
      status: 'closed',
      reason: 'closes-during-visit',
      closesDuringVisit: true,
      closesAt: '12:00',
    });
  });

  test('two touching periods read as one continuous opening', () => {
    // Saturday is listed as 09:00-12:00 and 12:00-17:00. Nobody is turned out at noon, so a visit
    // across the boundary must not be reported as a closure.
    const hours = scheduleFor(SPLIT_DAY_PLACE);
    expect(isOpenOn(SATURDAY, '11:00', '15:00', hours).status).toBe('open');
  });
});

describe('periods crossing midnight', () => {
  test('a late visit on the opening day is open', () => {
    const hours = scheduleFor(LATE_NIGHT_PLACE);
    expect(isOpenOn(FRIDAY, '20:00', '23:00', hours).status).toBe('open');
  });

  test('a visit running past midnight is open across the boundary', () => {
    const hours = scheduleFor(LATE_NIGHT_PLACE);
    expect(isOpenOn(FRIDAY, '23:00', '01:00', hours).status).toBe('open');
  });

  test('the small hours of the following morning are covered by the previous evening', () => {
    const hours = scheduleFor(LATE_NIGHT_PLACE);
    expect(isOpenOn(SATURDAY, '00:30', '01:30', hours).status).toBe('open');
  });

  test('a period wrapping the end of the week covers early Sunday', () => {
    // Saturday 18:00 to Sunday 02:00 closes on day 0, earlier in the week than it opens.
    const hours = scheduleFor(LATE_NIGHT_PLACE);
    expect(isOpenOn(SUNDAY, '00:30', '01:30', hours).status).toBe('open');
  });

  test('after the small hours end, Sunday is shut', () => {
    const hours = scheduleFor(LATE_NIGHT_PLACE);
    expect(isOpenOn(SUNDAY, '12:00', '14:00', hours).status).toBe('closed');
  });

  test('a visit overrunning the 2am close is closed and names the closing time', () => {
    const hours = scheduleFor(LATE_NIGHT_PLACE);
    expect(isOpenOn(SATURDAY, '01:00', '03:00', hours)).toMatchObject({
      status: 'closed',
      closesDuringVisit: true,
      closesAt: '02:00',
    });
  });
});

describe('a visit that starts while open but ends after closing', () => {
  test('is closed, flagged, and reports when the venue shuts', () => {
    const hours = scheduleFor(WHITECHAPEL_GALLERY);
    const verdict = isOpenOn(TUESDAY, '17:00', '19:00', hours);

    expect(verdict.status).toBe('closed');
    expect(verdict.reason).toBe('closes-during-visit');
    expect(verdict.closesDuringVisit).toBe(true);
    expect(verdict.closesAt).toBe('18:00');
  });

  test('is never reported as open, however small the overrun', () => {
    const hours = scheduleFor(WHITECHAPEL_GALLERY);
    expect(isOpenOn(TUESDAY, '17:00', '18:01', hours).status).toBe('closed');
  });
});

describe('missing or unknown structured hours', () => {
  const unknownCases: Array<[string, OpeningHoursSchedule | null | undefined]> = [
    ['no hours object at all', undefined],
    ['an explicit null', null],
    ['an empty object', {}],
    ['display text with no periods', { weekdayText: STORED_TEXT_ONLY_ROW.weekdayText }],
  ];

  test.each(unknownCases)('%s evaluates to unknown', (_label, hours) => {
    const verdict = isOpenOn(SATURDAY, '11:00', '13:00', hours);
    expect(verdict.status).toBe('unknown');
    expect(verdict.closesDuringVisit).toBe(false);
  });

  test('unknown is neither a confirmed open nor a confirmed closed', () => {
    const hours = scheduleFor(TEXT_ONLY_PLACE);
    const verdict = isOpenOn(SATURDAY, '11:00', '13:00', hours);

    expect(verdict.status).toBe('unknown');
    expect(verdict.status).not.toBe('open');
    expect(verdict.status).not.toBe('closed');
    expect(verdict.reason).toBe('no-structured-hours');
  });

  test('every production row today takes the unknown path', () => {
    // 107 of 122 rows carry weekdayText and none carry periods, so this is the live behaviour
    // until the backfill runs — and it must not be a confident "closed".
    expect(isOpenOn(SATURDAY, '11:00', '13:00', STORED_TEXT_ONLY_ROW).status).toBe('unknown');
  });

  test('an unreadable date or visit window makes no claim either way', () => {
    const hours = scheduleFor(BABYLON_PARK);
    expect(isOpenOn('not-a-date', '11:00', '13:00', hours).status).toBe('unknown');
    expect(isOpenOn('2026-02-30', '11:00', '13:00', hours).reason).toBe('invalid-input');
    expect(isOpenOn(SATURDAY, '25:00', '13:00', hours).reason).toBe('invalid-input');
    expect(isOpenOn(SATURDAY, '11:00', 'noon', hours).reason).toBe('invalid-input');
  });
});

describe('timezone-safe evaluation', () => {
  test('a calendar date resolves to the same weekday wherever the code runs', () => {
    const hours = scheduleFor(WHITECHAPEL_GALLERY);
    const original = process.env.TZ;

    try {
      for (const zone of ['UTC', 'Pacific/Kiritimati', 'Pacific/Midway', 'Asia/Tokyo']) {
        process.env.TZ = zone;
        expect(isOpenOn(MONDAY, '12:00', '14:00', hours).reason, zone).toBe('closed-that-day');
        expect(isOpenOn(THURSDAY, '18:30', '20:30', hours).status, zone).toBe('open');
      }
    } finally {
      process.env.TZ = original;
    }
  });

  test('an instant is resolved against the venue timezone, not the device', () => {
    const hours = scheduleFor(WHITECHAPEL_GALLERY);
    // 23:30 UTC on Sunday is already Monday in Tokyo — but the gallery is in London, where it is
    // still Sunday evening, and Sunday is a day it opens.
    const instant = new Date('2026-09-27T23:30:00Z');

    expect(venueLocalDate(instant, 'Europe/London')).toBe('2026-09-28');
    expect(venueLocalDate(instant, 'Asia/Tokyo')).toBe('2026-09-28');
    expect(venueLocalDate(instant, 'America/New_York')).toBe('2026-09-27');

    // Evaluated in New York's calendar the visit lands on Sunday, when the gallery is open.
    expect(isOpenOn(instant, '12:00', '14:00', hours, 'America/New_York').status).toBe('open');
    // In London the same instant is already Monday, when it is shut.
    expect(isOpenOn(instant, '12:00', '14:00', hours, 'Europe/London').status).toBe('closed');
  });

  test('the schedule supplies its own timezone when the caller gives none', () => {
    const hours = scheduleFor(WHITECHAPEL_GALLERY);
    expect(hours.timezone).toBe('Europe/London');
    const instant = new Date('2026-09-21T12:00:00Z');
    expect(isOpenOn(instant, '12:00', '14:00', hours).reason).toBe('closed-that-day');
  });

  test('an instant with no timezone anywhere makes no claim, rather than guessing', () => {
    const hours = scheduleFor(WHITECHAPEL_GALLERY);
    const withoutZone: OpeningHoursSchedule = { periods: hours.periods };
    expect(isOpenOn(new Date('2026-09-21T12:00:00Z'), '12:00', '14:00', withoutZone).status).toBe(
      'unknown',
    );
  });

  test('daylight saving transitions do not shift the evaluated day', () => {
    const hours = scheduleFor(BABYLON_PARK);
    // The UK clocks go forward on 2026-03-29 and back on 2026-10-25, both Sundays.
    expect(isOpenOn('2026-03-29', '11:00', '13:00', hours).status).toBe('open');
    expect(isOpenOn('2026-10-25', '11:00', '13:00', hours).status).toBe('open');

    // 00:30 UTC on the spring-forward Sunday is 00:30 local; by 01:30 UTC London is on BST.
    expect(venueLocalTime(new Date('2026-03-29T00:30:00Z'), 'Europe/London')).toBe('00:30');
    expect(venueLocalTime(new Date('2026-03-29T01:30:00Z'), 'Europe/London')).toBe('02:30');
  });

  test('an unrecognised timezone is refused rather than silently falling back', () => {
    expect(venueLocalDate(new Date('2026-09-21T12:00:00Z'), 'Mars/Olympus_Mons')).toBeNull();
    expect(venueLocalTime(new Date('2026-09-21T12:00:00Z'), 'Mars/Olympus_Mons')).toBeNull();
  });
});

describe('always-open venues', () => {
  test('a park with no closing time is open at any hour, on any day', () => {
    const hours = scheduleFor(ALEXANDRA_PARK);
    for (const day of [MONDAY, WEDNESDAY, SATURDAY, SUNDAY]) {
      expect(isOpenOn(day, '05:00', '23:30', hours), day).toMatchObject({
        status: 'open',
        reason: 'open-24h',
      });
    }
    expect(isOpenOn(SATURDAY, '22:00', '02:00', hours).status).toBe('open');
  });
});
