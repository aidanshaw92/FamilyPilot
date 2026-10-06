import { DayItinerary, SequenceLeg, SequenceStop } from '@/src/types/day-sequence';
import { PlanAlternative, PlanCaveat, TravelDiagnostics } from '@/src/types/day-plan';
import { PushchairSuitability } from '@/src/types/enrichment';
import { RoutineAdviceContext, SubjectResolver, reasonAboutRoutines, subjectPhrase } from './routine-advice';
import { VisitResolution, visitNote } from './visit-duration';
import { mustHaveLabel } from './must-have-labels';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { TravelMode } from '@/src/types/travel';
import { travelTimeWithMode } from '@/src/utils/travel-time';
import { familyDisplayName } from '@/src/utils/family-title';

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
  /** Frame 03's 62pt thumbnail (node 73:3). Absent, the card draws the category placeholder. */
  imageUrl?: string;
  /** For the placeholder when there is no photograph: the stop's category if known. */
  category?: string;
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

/** One option under a piece of advice. `alternative` and `add-lunch` re-run the plan; the screen applies them. */
export interface PlanAdviceOptionView {
  key: string;
  kind: 'alternative' | 'add-lunch';
  label: string;
  alternative?: PlanAlternative;
}

export interface PlanAdviceView {
  id: string;
  /** `soft`: a routine the family keeps at home overlaps the outing. `info`: worth a line, nothing more. */
  severity: 'soft' | 'info';
  title: string;
  where: string;
  detail: string;
  options: PlanAdviceOptionView[];
}

/**
 * How the day sits around the family's routines. A routine overlapping the outing is advice here, never a refusal: see
 * routine-advice.ts for the three tiers.
 */
export interface PlanRoutinesView {
  headline: string;
  advice: PlanAdviceView[];
  homeBefore: string[];
  together: string[];
  /** How long was allowed and why, when FamilyPilot chose the length. */
  visitNote: string | null;
  /** True when no routine overlaps and at least one was given. */
  clear: boolean;
}

export interface PlanSectionView {
  id: 'day' | 'who' | 'travel';
  label: string;
}

export interface PlanViewModel {
  title: string;
  /** "Saturday", for frame 03's "Your Saturday plan" heading (node 70:31); null without a date. */
  dayName: string | null;
  /**
   * Frame 03's timing insight (node 74:3): one quiet line relating the day to the family's own
   * routine, "Home around 14:45, before the usual nap". Only when the planner itself recorded a
   * routine the day is home before; never invented from the time alone.
   */
  insight: string | null;
  /**
   * Must-haves a family named that nobody has confirmed at a stop: the plan is built, and this says plainly what to check
   * before going. Prominent, and never worded as a fact either way. A must-have confirmed MISSING stops the plan instead.
   */
  needsChecking: string[];
  /** Where the day sits around naps and feeds. Null when the family gave no routines: nothing is claimed about them. */
  routines: PlanRoutinesView | null;
  /**
   * Whether a lunch stop is in the day and whether one could be: lets the screen offer "Add lunch" or "Take lunch out",
   * so food belongs to the plan instead of sitting beside it.
   */
  lunch: { included: boolean; available: boolean };
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
  return { label: 'Opening', value: 'Hours not confirmed. Check before you go', unconfirmed: true };
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
  /** Photographs and categories by place id, for the stop cards. Absent stops draw a placeholder. */
  media?: Record<string, { imageUrl?: string; category?: string }>;
  /** How long at the main venue, and why. Absent on a day saved before lengths were explained. */
  visit?: VisitResolution;
  /** Verified ways to clear a routine overlap, from the planner. */
  alternatives?: PlanAlternative[];
  /** The anchor's recorded pushchair suitability. A venue fact, so it may be saved; absent reads as unknown. */
  pushchair?: PushchairSuitability;
  /** Planner families that use a pushchair (ids only). */
  buggyFamilyIds?: string[];
  /** A place to eat is known near the venue, so a lunch could be added. */
  lunchAvailable?: boolean;
  /** The family gave at least one routine, so "fits your routines" is a claim with something behind it. */
  hasRoutines?: boolean;
  /** The anchor's category, for wording an assumed visit length. */
  anchorCategory?: string;
}

/** What only the device knows at render time. Names live here, not in the saved plan. */
export interface PlanViewContext {
  resolveSubject?: SubjectResolver;
  /** "Shaw family": what the signed-in household is called on screen. Absent, it reads "Our family". */
  householdTitle?: string;
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
    { label: 'Parking', value: 'Not confirmed. Check before you go', unconfirmed: true },
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

const upperFirst = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * "Baby changing isn't confirmed at Kentish Town City Farm, and you said you need it. Check with them before you go."
 *
 * One line per must-have per family, naming the stops it is unconfirmed at. A field with no parent-facing name is left out
 * rather than shown as a key. Neither a yes nor a no: only what nobody has checked.
 */
function needsCheckingLines(itinerary: DayItinerary): string[] {
  const groups = new Map<string, { familyId: string; familyLabel: string; label: string; stops: string[] }>();
  // The day's indoor/outdoor choice is the plan's, not one family's, so it is said once per stop. It is an explicit request, so an
  // unconfirmed setting is a prominent warning like any other must-have, never silently dropped.
  const settingStops: string[] = [];
  for (const item of itinerary.unresolvedMustHaves ?? []) {
    if (item.field === 'environment') {
      if (!settingStops.includes(item.stopName)) settingStops.push(item.stopName);
      continue;
    }
    const label = mustHaveLabel(item.field);
    if (!label) continue;
    const key = `${item.familyId}|${label}`;
    const group = groups.get(key) ?? { familyId: item.familyId, familyLabel: item.familyLabel, label, stops: [] };
    if (!group.stops.includes(item.stopName)) group.stops.push(item.stopName);
    groups.set(key, group);
  }
  const settingLines = settingStops.map((stop) => `Whether ${stop} is indoors or outdoors isn’t confirmed, and you asked for a particular setting today. Check before you go.`);
  return [...settingLines, ...[...groups.values()].map((group) => {
    const where = group.stops.length === 1 ? group.stops[0] : `${group.stops.slice(0, -1).join(', ')} and ${group.stops[group.stops.length - 1]}`;
    if (group.familyId === 'mine') {
      return `${upperFirst(group.label)} isn’t confirmed at ${where}, and you said you need it. Check before you go.`;
    }
    const who = familyDisplayName(group.familyLabel);
    return `${upperFirst(group.label)} isn’t confirmed at ${where}, and ${who} needs it. Check before you go.`;
  })];
}

function routinesView(input: PlanViewModelInput, context: PlanViewContext | undefined): PlanRoutinesView | null {
  const { itinerary } = input;
  const insights = itinerary.routineInsights ?? [];
  const homeAfter = itinerary.homeAfter ?? [];
  const resolveSubject: SubjectResolver =
    context?.resolveSubject ??
    ((familyId, _routineId, kind) => ({
      name: null,
      noun: kind === 'nap' ? 'nap' : 'feed',
      familyLabel: itinerary.families.find((f) => f.familyId === familyId)?.label ?? '',
      yours: familyId === 'mine',
    }));
  // "…which gets you home before Ozzie’s nap at 12:15": the routine a shortened visit was shortened for, named here.
  let routineSentence: string | null = null;
  if (input.visit?.basis === 'routine-limited') {
    const after = homeAfter.find((h) => h.familyId === input.visit?.familyId && h.routineId === input.visit?.routineId);
    if (after) {
      const subject = resolveSubject(after.familyId, after.routineId, after.kind);
      const phrase = subjectPhrase(subject, after.kind);
      routineSentence = subject.yours
        ? `which gets you home before ${phrase} at ${planClock(after.start)}.`
        : `which gets ${familyDisplayName(subject.familyLabel)} home before ${phrase} at ${planClock(after.start)}.`;
    }
  }
  const note = visitNote(input.visit, input.anchorCategory, routineSentence);
  if (!input.hasRoutines && insights.length === 0 && homeAfter.length === 0) {
    return note ? { headline: '', advice: [], homeBefore: [], together: [], visitNote: note, clear: false } : null;
  }
  const adviceContext: RoutineAdviceContext = {
    itinerary,
    venue: { name: input.anchorName, pushchair: input.pushchair ?? 'unknown' },
    resolveSubject,
    buggyFamilies: new Set(input.buggyFamilyIds ?? []),
    alternatives: input.alternatives ?? [],
    mealIncluded: itinerary.stops.some((stop) => stop.role === 'meal'),
    lunchAvailable: Boolean(input.lunchAvailable),
  };
  const reasoning = reasonAboutRoutines(adviceContext);
  const soft = reasoning.advice.filter((a) => a.severity === 'soft').length;
  const headline = !reasoning.hasOverlap
    ? 'Fits the routines you told us about'
    : soft > 0
      ? soft === 1
        ? 'One routine overlaps this day. Here’s what we’d suggest'
        : `${soft} routines overlap this day. Here’s what we’d suggest`
      : 'Worth knowing about your routines';
  return {
    headline,
    advice: reasoning.advice.map((a) => ({
      id: a.id,
      severity: a.severity,
      title: a.title,
      where: a.where,
      detail: a.detail,
      options: a.options.map((option, index) => ({ key: `${a.id}#${index}`, kind: option.kind, label: option.label, alternative: option.alternative })),
    })),
    homeBefore: reasoning.homeBefore,
    together: reasoning.together,
    visitNote: note,
    clear: !reasoning.hasOverlap && Boolean(input.hasRoutines),
  };
}

export function toPlanViewModel(input: PlanViewModelInput, context?: PlanViewContext): PlanViewModel {
  const { itinerary, travel, caveats, anchorName } = input;
  const date = weekdayOf(itinerary.date);

  const primary = itinerary.families[0];
  const dayStart = primary ? primary.depart : itinerary.stops[0]?.arrive ?? 0;
  const dayEnd = primary ? primary.home : itinerary.stops[itinerary.stops.length - 1]?.depart ?? 0;

  const stops: PlanStopView[] = itinerary.stops.map((stop, position) => {
    // Frame 03's expanded rows (nodes 73:9 to 73:18): arrive, how long, leave, then the journey on
    // to the next stop. Opening stays, because an unconfirmed opening is something nobody checked.
    const next = itinerary.stops[position + 1];
    const onward = next ? arrivalTravelFor(next, itinerary.legs) : undefined;
    const rows: PlanStopRow[] = [
      { label: 'Arrive', value: planClock(stop.arrive) },
      { label: 'Time there', value: durationLabel(stop.dwellMinutes) },
      { label: 'Leave', value: planClock(stop.depart) },
      openingRow(stop),
      // The mode symbol stays with the duration (Section 13): a parent reads what the timing assumed.
      ...(onward ? [{ label: 'Travel to next stop', value: `${onward.symbol} ${onward.label}` }] : []),
    ];
    const media = input.media?.[stop.placeId];
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
      imageUrl: media?.imageUrl,
      category: media?.category ?? (stop.role === 'meal' ? 'restaurant' : undefined),
    };
  });

  const routines = routinesView(input, context);
  // Where the routines section already says it (with names), the nameless per-family notes would only repeat it.
  const noteIsCovered = (note: string) => Boolean(routines && routines.advice.length + routines.homeBefore.length > 0 && (/^Home before /.test(note) || / while out; allow /.test(note)));
  const party: PlanPartyView[] = itinerary.families.map((family) => ({
    familyId: family.familyId,
    label: family.familyId === 'mine' ? (context?.householdTitle || family.label) : familyDisplayName(family.label),
    departLabel: planClock(family.depart),
    homeLabel: planClock(family.home),
    latestDepartureLabel: planClock(family.latestDeparture),
    notes: family.notes.filter((note) => !noteIsCovered(note)),
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

  // The planner records "Home before <routine> at <time>." on the family it planned for; that is the
  // only source the insight line may have. No note, no line.
  const homeBefore = primary?.notes
    .map((note) => /^Home before (.+) at (\d{2}:\d{2})\.$/.exec(note))
    .find((match): match is RegExpExecArray => Boolean(match));
  const insight = routines?.homeBefore[0]
    ?? (primary && homeBefore ? `Home around ${planClock(primary.home)}, before ${homeBefore[1]}` : null);

  return {
    title: `A day at ${anchorName}`,
    dayName: date ? date.long : null,
    insight,
    needsChecking: needsCheckingLines(itinerary),
    routines,
    lunch: {
      included: itinerary.stops.some((stop) => stop.role === 'meal'),
      available: Boolean(input.lunchAvailable) || itinerary.stops.some((stop) => stop.role === 'meal'),
    },
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
