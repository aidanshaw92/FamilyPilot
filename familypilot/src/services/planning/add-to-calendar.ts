import { Platform, Share } from 'react-native';

import { CalendarEvent, calendarFileName, toIcs } from '@/src/services/planning/calendar-event';

/**
 * Hands a saved plan to the phone's own calendar. Only ever called from the parent's own tap on "Add to calendar":
 * nothing is asked for in advance, and FamilyPilot never reads or writes the calendar itself.
 *
 * WEB (how FamilyPilot runs on a phone today): the event is an .ics file. iPhone Safari opens it in Calendar's own "Add"
 * sheet; a desktop browser downloads it for the calendar app. No permission is involved.
 *
 * NATIVE BUILDS: writing an event natively means expo-calendar and a calendar permission prompt (and an App Store usage
 * string): a store-permission decision that has not been taken. Until it is, a native build shares the plan's text, so
 * the parent can still put it somewhere, and says so rather than pretending to add an event.
 */
export type AddToCalendarResult = 'opened' | 'shared' | 'failed';

export async function addToCalendar(event: CalendarEvent): Promise<AddToCalendarResult> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const blob = new Blob([toIcs(event)], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const ios = /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
      if (ios) {
        // Safari hands a text/calendar document to Calendar when it is opened, not when it is downloaded.
        window.location.assign(url);
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = calendarFileName(event);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return 'opened';
    } catch {
      return 'failed';
    }
  }
  try {
    await Share.share({ title: event.title, message: `${event.title}\n${event.description}` });
    return 'shared';
  } catch {
    return 'failed';
  }
}
