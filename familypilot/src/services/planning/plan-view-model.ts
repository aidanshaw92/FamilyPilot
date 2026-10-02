import { DayItinerary, SequenceLeg, SequenceStop } from '@/src/types/day-sequence';
import { PlanCaveat, TravelDiagnostics } from '@/src/types/day-plan';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { TravelMode } from '@/src/types/travel';
import { travelTimeWithMode } from '@/src/utils/travel-time';

/**
 * The boundary between the planner and the approved Plan screen.
 *
 * `generateDayPlan` answers a scheduling question: which stops, in which order, at what times, and
 * what nobody has confirmed. The approved design asks a different question -- what does a parent
 * read, in what order, and what is a heading rather than a detail. Mapping one onto the other inside
 * a component would tie the approved layout to the sequencer's shape, so the next design change
 * would mean editing planning logic to move a label.
 *
 * Everything here is pure and synchronous. No React, no stores, no fetching: give it an itinerary
 * and it returns what to render, which is what makes the approved surfaces testable without a
 * browser.
 *
 * It deliberately cannot invent. Every string below is derived from the itinerary or from a fixed
 * vocabulary; where the planner says a fact is unconfirmed, this says so too rather than omitting it.
 */

/** Which part of the day a stop occupies. The spine of the Day plan section. */
export type PlanPeriod = 'Morning' | 'Lunch' | 'Afternoon' | 'Evening';

export interface PlanStopRow {
  label: string;
  value: string;
  /** True where the planner could not confirm the underlying fact. */
  unconfirmed?: boolean;
}

export interface PlanStopView {
  index: number;
  placeId: string;
  name: string;
  /** Morning / Lunch / Afternoon, from the time the stop starts and what kind of stop it is. */
  period: PlanPeriod;
  timeRange: string;
  dwellLabel: string;
  anchor: boolean;
  role: 'activity' | 'meal';
  /** Shown when the stop is expanded. */
  rows: PlanStopRow[];
  /** The journey from the previous stop. Absent on the first stop, which is arrived at from home. */
  arrivalTravel?: PlanArrivalTravelView;
}

export interface PlanPartyView {
  familyId: string;
  label: string;
  departLabel: string;
  homeLabel: string;
  latestDepartureLabel: string;
  notes: string[];
}

/**
 * The journey into one stop, for the line the Day plan draws between stops.
 *
 * The MODE is the one the plan's arithmetic actually used, not the one a parent might prefer. The
 * sequencer times the day from driving estimates, so a stop 240m away reads as a short drive even
 * though most families would walk it. Showing a walk here would misdescribe what the schedule was
 * computed from, and the walking option is already offered on Venue Detail where it costs nothing to
 * state. Section 13's "present the mode actually used", taken literally.
 */
export interface PlanArrivalTravelView {
  /** 🚶 / 🚗 / 🚇 / 🚌, by the mode. */
  symbol: string;
  /** `about 6 min drive` or `6 min drive`, worded from the leg's provenance. */
  label: string;
}

export interface PlanTravelLegView {
  label: string;
  minutesLabel: string;
  /** "Measured" or "Estimated from distance" -- never presented as the same thing. */
  sourceLabel: string;
}

export interface PlanSectionView {
  id: 'day' | 'who' | 'travel';
  label: string;
}

export interface PlanViewModel {
  title: string;
  /** "Sat 11 Oct · 09:45–14:30" */
  dateSummary: string;
  /** "A 5-hour Saturday" */
  summary: string;
  sections: PlanSectionView[];
  stops: PlanStopView[];
  party: PlanPartyView[];
  travel: {
    legs: PlanTravelLegView[];
    provenanceNote: string;
    missingNote?: string;
    /** What is known about parking at the venue the day is built around. Never assumed. */
    parking: PlanStopRow[];
  };
  /** Facts the day rests on that nobody has confirmed. Rendered, never hidden. */
  unknowns: string[];
  caveats: string[];
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `HH:MM` from minutes past midnight, with the next-day case kept visible. */
export function planClock(minutes: number): string {
  const day = Math.floor(minutes / 1440);
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const label = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return day > 0 ? `${label} next day` : label;
}

/**
 * "5-hour", for the summary line only.
 *
 * Adjectival and hyphenated, because it sits in front of a weekday: "A 5-hour Saturday". The precise
 * span is in `dateSummary` and every stop carries its own clock, so rounding to the nearest hour here
 * is the right altitude for a headline rather than a loss of information.
 */
function summaryHours(minutes: number): string | null {
  const hours = Math.round(minutes / 60);
  if (hours < 1) return null;
  return `${hours}-hour`;
}

function durationLabel(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${hours}h ${mins}m`;
}

/**
 * `2026-10-11` to a weekday, without `Date` parsing.
 *
 * `new Date('2026-10-11')` is UTC midnight, which in a negative-offset timezone is the previous
 * day -- a plan for Saturday would read "Friday" to a parent in New York. The arithmetic below has
 * no timezone in it at all.
 */
export function weekdayOf(date: string): { long: string; short: string; day: number; month: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Sakamoto's algorithm.
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  let y = year;
  if (month < 3) y -= 1;
  const index = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + offsets[month - 1] + day) % 7;
  return { long: WEEKDAYS[index], short: SHORT_WEEKDAYS[index], day, month: MONTHS[month - 1] };
}

function periodOf(stop: SequenceStop): PlanPeriod {
  const hour = Math.floor((((stop.arrive % 1440) + 1440) % 1440) / 60);
  if (stop.role === 'meal') return hour >= 11 && hour < 16 ? 'Lunch' : 'Afternoon';
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function openingRow(stop: SequenceStop): PlanStopRow {
  if (stop.opening.status === 'open') {
    return {
      label: 'Opening',
      value: stop.opening.closesAt ? `Open, closes ${stop.opening.closesAt}` : 'Open',
    };
  }
  // The planner scheduled it without confirmation, and the parent is told exactly that.
  return { label: 'Opening', value: 'Hours not confirmed — check before you go', unconfirmed: true };
}

/**
 * The stop-to-stop journey line, from the leg the sequencer actually timed.
 *
 * Returns nothing for the first stop: that hop comes from a household's home, and which home differs
 * per family, so it belongs in the Travel & parking section where each household is named rather than
 * on a single line in a shared timeline.
 *
 * Worded from the leg's own `source`, so a routed leg will read `6 min drive` and an estimated one
 * `about 6 min drive` with no change here. 🚗 because the planner times the day from driving
 * estimates; see PlanArrivalTravelView for why that is the honest symbol rather than 🚶.
 */
function arrivalTravelFor(
  stop: SequenceStop,
  legs: SequenceLeg[],
): PlanArrivalTravelView | undefined {
  const leg = legs.find(
    (candidate) =>
      candidate.to.kind === 'stop' &&
      candidate.to.index === stop.index &&
      candidate.from.kind === 'stop',
  );
  if (!leg) return undefined;

  return {
    symbol: MODE_SYMBOL.drive,
    label: travelTimeWithMode(
      leg.travelMinutes,
      leg.source === 'live' ? 'measured' : 'estimated',
      'drive',
    ),
  };
}

/**
 * One symbol per mode. 🚌 is reserved for a genuinely bus-based route; anything else transit-shaped
 * uses 🚇, because calling a tram or a train "bus" is a claim about the mode rather than a shorthand.
 */
const MODE_SYMBOL: Record<TravelMode, string> = {
  walk: '🚶',
  drive: '🚗',
  cycle: '🚲',
  transit: '🚇',
  bus: '🚌',
};

function travelLegLabel(leg: SequenceLeg, stops: SequenceStop[]): string {
  const nameOf = (endpoint: SequenceLeg['from']): string => {
    if (endpoint.kind === 'home') return 'Home';
    const stop = stops.find((s) => s.index === endpoint.index);
    return stop ? stop.name : `Stop ${endpoint.index + 1}`;
  };
  return `${nameOf(leg.from)} to ${nameOf(leg.to)}`;
}

/**
 * Parking as the caller already knows it, for the approved Travel & parking section.
 *
 * Not derived from the itinerary, because the sequencer has no opinion on parking: these are the
 * anchor's own claim-backed facts, passed in by whoever holds them. Omitting the whole object means
 * nobody checked, which reads as unconfirmed rather than as an absence of parking.
 */
export interface PlanParkingInput {
  parking: MatchableVenueFacts['parking'];
  freeParking?: MatchableVenueFacts['freeParking'];
  /** The venue's own free-text detail, where it has been reviewed. Shown verbatim. */
  info?: string;
}

export interface PlanViewModelInput {
  itinerary: DayItinerary;
  travel: TravelDiagnostics;
  caveats: PlanCaveat[];
  /** The venue the day was built around, used for the plan's name. */
  anchorName: string;
  /** The anchor's parking facts. Absent means nobody confirmed them. */
  parking?: PlanParkingInput;
}

/**
 * Parking rows, which say only what the evidence says.
 *
 * A confirmed yes with no cost evidence stays silent about cost rather than implying free parking,
 * and no evidence at all says so outright: a parent driving somewhere with nowhere to park is worse
 * off for having read a reassuring blank.
 */
function parkingRows(parking: PlanParkingInput | undefined): PlanStopRow[] {
  const unconfirmed: PlanStopRow[] = [
    { label: 'Parking', value: 'Not confirmed — check before you go', unconfirmed: true },
  ];
  if (!parking) return unconfirmed;

  const rows: PlanStopRow[] = [];
  if (parking.parking === 'yes') {
    const cost =
      parking.freeParking === 'yes' ? ', free' : parking.freeParking === 'no' ? ', paid' : '';
    rows.push({ label: 'Parking', value: `On site${cost}` });
  } else if (parking.parking === 'no') {
    rows.push({ label: 'Parking', value: 'None on site' });
  } else {
    rows.push(...unconfirmed);
  }

  if (parking.info) rows.push({ label: 'Details', value: parking.info });
  return rows;
}

function caveatLine(caveat: PlanCaveat): string {
  switch (caveat.kind) {
    case 'opening-hours-unknown':
      return `${caveat.name} has not published hours for this day.`;
    case 'travel-estimated':
      return caveat.legs === 1
        ? 'One journey is estimated from distance rather than measured.'
        : `${caveat.legs} journeys are estimated from distance rather than measured.`;
    case 'traffic-not-predictive':
      return 'Planned for a future date, so today’s traffic was not used.';
    case 'meal-lookup-failed':
      // Says the failure is ours, in the same terms RestaurantsCloseBy already uses on Venue Detail,
      // so a parent is not left inferring that the area has nowhere to eat.
      return 'We could not check what is nearby, so this day has no lunch stop. This is about our lookup, not about the area.';
    default:
      return '';
  }
}

export function toPlanViewModel(input: PlanViewModelInput): PlanViewModel {
  const { itinerary, travel, caveats, anchorName } = input;
  const date = weekdayOf(itinerary.date);

  const primary = itinerary.families[0];
  const dayStart = primary ? primary.depart : itinerary.stops[0]?.arrive ?? 0;
  const dayEnd = primary ? primary.home : itinerary.stops[itinerary.stops.length - 1]?.depart ?? 0;

  const stops: PlanStopView[] = itinerary.stops.map((stop) => {
    const rows: PlanStopRow[] = [
      { label: 'Arrive', value: planClock(stop.arrive) },
      { label: 'Time there', value: durationLabel(stop.dwellMinutes) },
      openingRow(stop),
    ];
    return {
      index: stop.index,
      placeId: stop.placeId,
      name: stop.name,
      period: periodOf(stop),
      timeRange: `${planClock(stop.arrive)}–${planClock(stop.depart)}`,
      dwellLabel: durationLabel(stop.dwellMinutes),
      anchor: stop.anchor,
      role: stop.role,
      rows,
      arrivalTravel: arrivalTravelFor(stop, itinerary.legs),
    };
  });

  const party: PlanPartyView[] = itinerary.families.map((family) => ({
    familyId: family.familyId,
    label: family.label,
    departLabel: planClock(family.depart),
    homeLabel: planClock(family.home),
    latestDepartureLabel: planClock(family.latestDeparture),
    notes: family.notes,
  }));

  const legs: PlanTravelLegView[] = itinerary.legs.map((leg) => ({
    label: travelLegLabel(leg, itinerary.stops),
    minutesLabel: leg.bufferMinutes > 0
      ? `${leg.travelMinutes} min travel + ${leg.bufferMinutes} min settling`
      : `${leg.travelMinutes} min travel`,
    sourceLabel: leg.source === 'live' ? 'Measured' : 'Estimated from distance',
  }));

  const { live, estimated } = travel.provenance;
  const provenanceNote = estimated === 0
    ? 'Every journey time is measured.'
    : live === 0
      ? 'All journey times are estimated from distance.'
      : `${live} journey time${live === 1 ? '' : 's'} measured, ${estimated} estimated from distance.`;

  return {
    title: `A day at ${anchorName}`,
    dateSummary: date
      ? `${date.short} ${date.day} ${date.month} · ${planClock(dayStart)}–${planClock(dayEnd)}`
      : `${planClock(dayStart)}–${planClock(dayEnd)}`,
    summary: ((): string => {
      const hours = summaryHours(dayEnd - dayStart);
      if (date) return hours ? `A ${hours} ${date.long}` : `A short ${date.long} out`;
      return hours ? `A ${hours} day out` : 'A short day out';
    })(),
    sections: [
      { id: 'day', label: 'Day plan' },
      { id: 'who', label: 'Who’s coming' },
      { id: 'travel', label: 'Travel & parking' },
    ],
    stops,
    party,
    travel: {
      legs,
      provenanceNote,
      missingNote: travel.missing.length
        ? `${travel.missing.length} journey${travel.missing.length === 1 ? '' : 's'} could not be looked up.`
        : undefined,
      parking: parkingRows(input.parking),
    },
    unknowns: itinerary.unknowns,
    caveats: caveats.map(caveatLine).filter(Boolean),
  };
}
