/**
 * The machine-readable half of a place's opening hours.
 *
 * This lives in its own module because both the provider record (`types/places.ts`) and the
 * consumer domain model (`types/index.ts`) carry it, and those two already import in one
 * direction. Nothing here imports anything, so neither side gains a cycle.
 *
 * The shape mirrors Google Places v1 (`GoogleMapsPlacesV1PlaceOpeningHours`, discovery revision
 * 20260914) because that is the provider FamilyPilot actually syncs from. Keeping the provider's
 * own shape means the mapper stores facts rather than an interpretation of them.
 */

/**
 * One end of an opening period, on the weekly clock.
 *
 * `day` is 0-6 with **0 = Sunday** — the same convention as `Date.prototype.getDay`.
 */
export interface OpeningHoursPoint {
  /** 0-6, 0 = Sunday. */
  day: number;
  /** 0-23. */
  hour: number;
  /** 0-59. */
  minute: number;
}

/**
 * A continuous span during which the place is open.
 *
 * `close` is optional, and its absence is meaningful: Google omits it for a place that is always
 * open, represented as a single period opening at day 0, 00:00. A `close` that falls earlier in
 * the week than its `open` means the span runs past midnight, and possibly past the week's end.
 */
export interface OpeningHoursPeriod {
  open: OpeningHoursPoint;
  close?: OpeningHoursPoint;
}

export interface OpeningHoursSchedule {
  /**
   * The weekly schedule, expressed in the place's own timezone.
   *
   * Absent means the provider gave us nothing machine-readable. An **empty array** is Google's
   * way of saying the place is never open (shut for renovations, say), so the two are not
   * interchangeable and must not be collapsed into one another.
   *
   * The array is not guaranteed to start on Sunday, and its order is independent of
   * `weekdayText` — read the day off each point rather than trusting the index.
   */
  periods?: OpeningHoursPeriod[];
  /** Provider-localised display lines. Shown to people, never parsed back into periods. */
  weekdayText?: string[];
  /** IANA timezone id of the place itself, e.g. "Europe/London". */
  timezone?: string;
  /** The place's UTC offset when it was fetched. A weak fallback for `timezone`, since it does not survive a DST change. */
  utcOffsetMinutes?: number;
}
