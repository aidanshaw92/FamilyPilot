import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildCalendarEvent, calendarFileName, londonTimeToUtc, toIcs } from '@/src/services/planning/calendar-event';
import type { PlanViewModelInput } from '@/src/services/planning/plan-view-model';

/**
 * A saved plan, as a calendar event. Tested as a model, separately from the phone's calendar (which a test cannot drive):
 * what the event says, when it starts and ends, and above all what it never says.
 */
const day = (over: Partial<{ date: string; stops: unknown[]; families: unknown[] }> = {}) => ({
  id: 'day-1760000000000',
  source: {
    itinerary: {
      date: over.date ?? '2026-10-07',
      stops: over.stops ?? [
        { name: 'RAF Museum', arrive: 10 * 60, depart: 12 * 60 + 30, role: 'activity' },
        { name: 'The Mapped Kitchen', arrive: 12 * 60 + 45, depart: 13 * 60 + 30, role: 'meal' },
      ],
      families: over.families ?? [
        {
          familyId: 'mine', label: 'Our family', depart: 9 * 60 + 35, home: 14 * 60 + 5, latestDeparture: 600,
          notes: ['Home before Ozzie’s nap at 14:30.', 'Feed due at 12:00'],
        },
      ],
      legs: [],
      unknowns: ['Baby changing is not confirmed at The Mapped Kitchen'],
    },
    travel: {},
    caveats: [],
    anchorName: 'RAF Museum',
  } as unknown as PlanViewModelInput,
});

describe('what the event says', () => {
  it('title, place, and the stops with their times', () => {
    const event = buildCalendarEvent(day());
    expect(event.title).toBe('Day out: RAF Museum');
    expect(event.location).toBe('RAF Museum');
    expect(event.description).toContain('10:00–12:30 RAF Museum');
    expect(event.description).toContain('12:45–13:30 Lunch at The Mapped Kitchen');
    expect(event.description).toContain('Leave home about 09:35, home about 14:05.');
    expect(event.description).toContain('Times are estimates');
  });

  it('runs from leaving home to getting back, in London time', () => {
    const event = buildCalendarEvent(day());
    // 7 October is British Summer Time (UTC+1).
    expect(event.start.toISOString()).toBe('2026-10-07T08:35:00.000Z');
    expect(event.end.toISOString()).toBe('2026-10-07T13:05:00.000Z');
  });

  it('a winter date is GMT, and a plan past midnight rolls into the next day', () => {
    expect(londonTimeToUtc('2026-12-12', 9 * 60).toISOString()).toBe('2026-12-12T09:00:00.000Z');
    expect(londonTimeToUtc('2026-12-12', 24 * 60 + 30).toISOString()).toBe('2026-12-13T00:30:00.000Z');
    // Across the clocks going back (25 Oct 2026): 10:00 is GMT that day.
    expect(londonTimeToUtc('2026-10-25', 10 * 60).toISOString()).toBe('2026-10-25T10:00:00.000Z');
  });

  it('a day with no timed journey for us uses the time at the places', () => {
    const event = buildCalendarEvent(day({ families: [] }));
    expect(event.start.toISOString()).toBe('2026-10-07T09:00:00.000Z');
    expect(event.end.toISOString()).toBe('2026-10-07T12:30:00.000Z');
  });

  it('the same saved plan always has the same event id, so adding it again updates rather than duplicates', () => {
    expect(buildCalendarEvent(day()).uid).toBe('day-1760000000000@familypilot.app');
  });
});

describe('what the event never says', () => {
  const connected = day({
    families: [
      { familyId: 'mine', label: 'Our family', depart: 575, home: 845, latestDeparture: 600, notes: ['Home before Ozzie’s nap at 14:30.'] },
      { familyId: 'connected-abc', label: 'Hannah’s family', depart: 560, home: 870, latestDeparture: 590, notes: ['Home before their nap at 13:15.'] },
    ],
  });
  const event = buildCalendarEvent(connected);
  const ics = toIcs(event);

  it('no routine, nap or feed, and no child’s name', () => {
    expect(ics).not.toMatch(/nap|feed|Ozzie/i);
  });

  it('no other family’s timings or area: only the label they chose to share', () => {
    expect(event.description).toContain('With Hannah’s family.');
    expect(event.description).not.toMatch(/09:20|14:30|13:15/);
    expect(ics).not.toMatch(/connected-abc|latitude|longitude|E17|Walthamstow/i);
  });

  it('no evidence, provenance or unknowns from the plan', () => {
    expect(ics).not.toMatch(/not confirmed|Baby changing/i);
  });
});

describe('the file the phone opens', () => {
  const ics = toIcs(buildCalendarEvent(day()), new Date('2026-10-06T12:00:00Z'));

  it('is a valid calendar with one timed event', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART:20261007T083500Z');
    expect(ics).toContain('DTEND:20261007T130500Z');
    expect(ics).toContain('DTSTAMP:20261006T120000Z');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });

  it('escapes text and folds long lines as the format requires', () => {
    const long = toIcs({ ...buildCalendarEvent(day()), title: 'Day out: A, B; C — '.padEnd(120, 'x') });
    expect(long).toContain('SUMMARY:Day out: A\\, B\\; C');
    for (const line of long.split('\r\n')) expect(encodeURIComponent(line).replace(/%[0-9A-F]{2}/gi, 'x').length).toBeLessThanOrEqual(75);
  });

  it('has a plain file name', () => {
    expect(calendarFileName(buildCalendarEvent(day()))).toBe('familypilot-raf-museum.ics');
  });
});

describe('asking for nothing in advance', () => {
  const root = join(__dirname, '..', '..');
  const add = readFileSync(join(root, 'src/services/planning/add-to-calendar.ts'), 'utf8');
  const pkg = readFileSync(join(root, 'package.json'), 'utf8');

  it('uses no calendar permission and no calendar module: the phone’s own calendar does the adding', () => {
    const code = add.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(/requestCalendarPermissions|expo-calendar/);
    expect(pkg).not.toContain('expo-calendar');
  });

  it('is offered after a save and on a saved plan, never before saving', () => {
    const screen = readFileSync(join(root, 'src/components/planning/PlanScreenView.tsx'), 'utf8');
    const saved = readFileSync(join(root, 'app/saved-plan.tsx'), 'utf8');
    expect(screen).toMatch(/saveState === 'saved' \|\| saveState === 'already' \?/);
    expect(saved).toContain('onAddToCalendar={() => void addPlanToCalendar()}');
  });
});
