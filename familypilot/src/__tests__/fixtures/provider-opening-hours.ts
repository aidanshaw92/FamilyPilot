/**
 * Provider-shaped opening-hours payloads for the structured-hours tests.
 *
 * Provenance, because it matters for what these tests actually prove:
 *
 * - The place ids, names, Google types and every `weekdayDescriptions` line are **captured from
 *   production** (`place_records`, Supabase project uuolfuebwimrsjfgffsm) — the real rows the app
 *   serves today.
 * - The `regularOpeningHours.periods` blocks are **constructed to Google's published schema**
 *   (`GoogleMapsPlacesV1PlaceOpeningHours`, places v1 discovery revision 20260914) and made
 *   consistent with each venue's captured `weekdayDescriptions`. They are not captured, because
 *   no production row has periods: the mapper dropped them, which is the bug this change fixes.
 *
 * So these exercise the real provider contract against real venues' real schedules, while being
 * honest that the periods themselves were written from the schema rather than sniffed off the
 * wire. `LATE_NIGHT_PLACE` goes further and is wholly schema-shaped: no venue in the current
 * catalogue closes after midnight, so nothing real was available to copy.
 */

import { OpeningHoursSchedule } from '../../types/opening-hours';

/** Google's `Point`: day 0-6 with 0 = Sunday. */
export interface GooglePoint {
  day: number;
  hour: number;
  minute: number;
}

export interface GooglePeriod {
  open: GooglePoint;
  close?: GooglePoint;
}

export interface GooglePlacePayload {
  id: string;
  displayName: { text: string };
  location: { latitude: number; longitude: number };
  primaryType: string;
  types: string[];
  businessStatus: string;
  formattedAddress?: string;
  timeZone?: { id: string };
  utcOffsetMinutes?: number;
  regularOpeningHours?: {
    openNow?: boolean;
    periods?: GooglePeriod[];
    weekdayDescriptions?: string[];
  };
  currentOpeningHours?: {
    openNow?: boolean;
    periods?: GooglePeriod[];
    weekdayDescriptions?: string[];
  };
  photos?: unknown[];
}

const LONDON = { id: 'Europe/London' };

const at = (day: number, hour: number, minute = 0): GooglePoint => ({ day, hour, minute });
const span = (day: number, openHour: number, closeHour: number): GooglePeriod => ({
  open: at(day, openHour),
  close: at(day, closeHour),
});

/**
 * Whitechapel Gallery — shut on Mondays, late on Thursdays.
 *
 * The period list deliberately starts on Tuesday, because Google documents that the first day of
 * `periods` is not fixed and must not be assumed to be Sunday.
 */
export const WHITECHAPEL_GALLERY: GooglePlacePayload = {
  id: 'ChIJzZtNX7UcdkgRzycysU2TrhM',
  displayName: { text: 'Whitechapel Gallery' },
  location: { latitude: 51.5159, longitude: -0.0698 },
  primaryType: 'art_gallery',
  types: ['art_gallery', 'museum', 'tourist_attraction'],
  businessStatus: 'OPERATIONAL',
  timeZone: LONDON,
  utcOffsetMinutes: 60,
  regularOpeningHours: {
    periods: [
      span(2, 11, 18),
      span(3, 11, 18),
      span(4, 11, 21),
      span(5, 11, 18),
      span(6, 11, 18),
      span(0, 11, 18),
    ],
    weekdayDescriptions: [
      'Monday: Closed',
      'Tuesday: 11:00 AM – 6:00 PM',
      'Wednesday: 11:00 AM – 6:00 PM',
      'Thursday: 11:00 AM – 9:00 PM',
      'Friday: 11:00 AM – 6:00 PM',
      'Saturday: 11:00 AM – 6:00 PM',
      'Sunday: 11:00 AM – 6:00 PM',
    ],
  },
};

/** Chiltern Open Air Museum — shut Tuesday, Wednesday and Thursday. */
export const CHILTERN_OPEN_AIR_MUSEUM: GooglePlacePayload = {
  id: 'ChIJZz8_wPNodkgRQrQBE23io9I',
  displayName: { text: 'Chiltern Open Air Museum' },
  location: { latitude: 51.6402, longitude: -0.5543 },
  primaryType: 'museum',
  types: ['museum', 'tourist_attraction'],
  businessStatus: 'OPERATIONAL',
  timeZone: LONDON,
  regularOpeningHours: {
    periods: [span(0, 10, 17), span(1, 10, 17), span(5, 10, 17), span(6, 10, 17)],
    weekdayDescriptions: [
      'Monday: 10:00 AM – 5:00 PM',
      'Tuesday: Closed',
      'Wednesday: Closed',
      'Thursday: Closed',
      'Friday: 10:00 AM – 5:00 PM',
      'Saturday: 10:00 AM – 5:00 PM',
      'Sunday: 10:00 AM – 5:00 PM',
    ],
  },
};

/**
 * Alexandra Park — always open.
 *
 * Google's documented representation: one period opening at day 0, 00:00, with no `close` at all.
 */
export const ALEXANDRA_PARK: GooglePlacePayload = {
  id: 'ChIJG5FG-NUbdkgRLUU1g4e7xp4',
  displayName: { text: 'Alexandra Park' },
  location: { latitude: 51.5945, longitude: -0.1197 },
  primaryType: 'park',
  types: ['park', 'tourist_attraction'],
  businessStatus: 'OPERATIONAL',
  timeZone: LONDON,
  regularOpeningHours: {
    periods: [{ open: at(0, 0, 0) }],
    weekdayDescriptions: [
      'Monday: Open 24 hours',
      'Tuesday: Open 24 hours',
      'Wednesday: Open 24 hours',
      'Thursday: Open 24 hours',
      'Friday: Open 24 hours',
      'Saturday: Open 24 hours',
      'Sunday: Open 24 hours',
    ],
  },
};

/** Babylon Park London — open daily, an hour later on Saturdays. */
export const BABYLON_PARK: GooglePlacePayload = {
  id: 'ChIJ7_PV980bdkgROekbwOVWVfo',
  displayName: { text: 'Babylon Park London' },
  location: { latitude: 51.5101, longitude: -0.1337 },
  primaryType: 'amusement_center',
  types: ['amusement_center', 'tourist_attraction'],
  businessStatus: 'OPERATIONAL',
  timeZone: LONDON,
  regularOpeningHours: {
    periods: [
      span(0, 10, 21),
      span(1, 10, 21),
      span(2, 10, 21),
      span(3, 10, 21),
      span(4, 10, 21),
      span(5, 10, 21),
      span(6, 10, 22),
    ],
    weekdayDescriptions: [
      'Monday: 10:00 AM – 9:00 PM',
      'Tuesday: 10:00 AM – 9:00 PM',
      'Wednesday: 10:00 AM – 9:00 PM',
      'Thursday: 10:00 AM – 9:00 PM',
      'Friday: 10:00 AM – 9:00 PM',
      'Saturday: 10:00 AM – 10:00 PM',
      'Sunday: 10:00 AM – 9:00 PM',
    ],
  },
};

/**
 * A venue with a split day — open in the morning, shut over lunch, open again after.
 *
 * Schema-shaped rather than captured: the catalogue's museums and parks all run one continuous
 * span, but the provider contract allows several periods on one day and the evaluator has to
 * handle both the gap and the contiguous case.
 */
export const SPLIT_DAY_PLACE: GooglePlacePayload = {
  id: 'ChIJsplitday00000000000000',
  displayName: { text: 'Split Day Heritage Centre' },
  location: { latitude: 51.5, longitude: -0.12 },
  primaryType: 'museum',
  types: ['museum'],
  businessStatus: 'OPERATIONAL',
  timeZone: LONDON,
  regularOpeningHours: {
    // Saturday runs 09:00-12:00 and 12:00-17:00: two periods, no actual closure between them.
    periods: [span(3, 9, 12), span(3, 14, 17), span(6, 9, 12), span(6, 12, 17)],
    weekdayDescriptions: [
      'Monday: Closed',
      'Tuesday: Closed',
      'Wednesday: 9:00 AM – 12:00 PM, 2:00 – 5:00 PM',
      'Thursday: Closed',
      'Friday: Closed',
      'Saturday: 9:00 AM – 5:00 PM',
      'Sunday: Closed',
    ],
  },
};

/**
 * A venue whose Friday and Saturday sessions run past midnight.
 *
 * Wholly schema-shaped. Nothing in the current catalogue closes after midnight, so there was no
 * production row to copy — but the provider expresses this by giving `close` a different (and
 * earlier, when it wraps the week) day than `open`, and the evaluator must not read that as a
 * negative-length period.
 */
export const LATE_NIGHT_PLACE: GooglePlacePayload = {
  id: 'ChIJlatenight0000000000000',
  displayName: { text: 'Late Night Lanes' },
  location: { latitude: 51.5, longitude: -0.12 },
  primaryType: 'bowling_alley',
  types: ['bowling_alley', 'amusement_center'],
  businessStatus: 'OPERATIONAL',
  timeZone: LONDON,
  regularOpeningHours: {
    periods: [
      // Friday 18:00 through to Saturday 02:00.
      { open: at(5, 18), close: at(6, 2) },
      // Saturday 18:00 through to Sunday 02:00 — wraps the end of the week.
      { open: at(6, 18), close: at(0, 2) },
    ],
    weekdayDescriptions: [
      'Monday: Closed',
      'Tuesday: Closed',
      'Wednesday: Closed',
      'Thursday: Closed',
      'Friday: 6:00 PM – 2:00 AM',
      'Saturday: 6:00 PM – 2:00 AM',
      'Sunday: Closed',
    ],
  },
};

/**
 * Google's "never open" — an empty but present period list, used for a place shut indefinitely.
 * Distinct from absent hours, and must not collapse into them.
 */
export const NEVER_OPEN_PLACE: GooglePlacePayload = {
  id: 'ChIJneveropen000000000000',
  displayName: { text: 'Closed For Renovation Museum' },
  location: { latitude: 51.5, longitude: -0.12 },
  primaryType: 'museum',
  types: ['museum'],
  businessStatus: 'OPERATIONAL',
  timeZone: LONDON,
  regularOpeningHours: { periods: [], weekdayDescriptions: [] },
};

/**
 * What all 107 photo-bearing production rows look like today: display text, no periods.
 *
 * Captured verbatim from Alexandra Palace Ice Rink. Every venue in the catalogue currently
 * evaluates through this path, which is why it must resolve to `unknown` rather than `closed`.
 */
export const TEXT_ONLY_PLACE: GooglePlacePayload = {
  id: 'ChIJV0tnSdcbdkgRBOMTTP6eLHg',
  displayName: { text: 'Alexandra Palace Ice Rink' },
  location: { latitude: 51.5945, longitude: -0.1297 },
  primaryType: 'ice_skating_rink',
  types: ['ice_skating_rink', 'sports_complex'],
  businessStatus: 'OPERATIONAL',
  currentOpeningHours: {
    weekdayDescriptions: [
      'Monday: 11:00 AM – 5:00 PM',
      'Tuesday: 11:00 AM – 5:00 PM',
      'Wednesday: 11:00 AM – 5:00 PM',
      'Thursday: 11:00 AM – 5:00 PM',
      'Friday: 11:00 AM – 5:00 PM',
      'Saturday: 11:00 AM – 5:00 PM',
      'Sunday: 11:00 AM – 5:00 PM',
    ],
  },
};

/**
 * The exact JSON currently stored in `place_records.opening_hours`, copied from Alexandra Palace
 * Ice Rink. This is the shape the backfill has to start from.
 */
export const STORED_TEXT_ONLY_ROW: OpeningHoursSchedule & { source: string } = {
  source: 'google',
  weekdayText: [
    'Monday: 11:00 AM – 5:00 PM',
    'Tuesday: 11:00 AM – 5:00 PM',
    'Wednesday: 11:00 AM – 5:00 PM',
    'Thursday: 11:00 AM – 5:00 PM',
    'Friday: 11:00 AM – 5:00 PM',
    'Saturday: 11:00 AM – 5:00 PM',
    'Sunday: 11:00 AM – 5:00 PM',
  ],
};
