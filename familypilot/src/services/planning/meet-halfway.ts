import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';
import { evaluateAgeRecommendation, yearsToMonths } from '@/src/services/matching/age-suitability';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { estimateDriveMinutes } from '@/src/services/places/geo-utils';
import { Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { isOpenOn } from '@/src/utils/opening-hours';

import { PlanningFamily, familyRequest } from './planner';
import { RoutineWindow, clockMinutes, overlapMinutes, routineWindows } from './routine-windows';
import { typicalMinutesFor } from './visit-duration';

/**
 * MEET HALFWAY: places that work for TWO families, not the point on the map between them.
 *
 * The middle of two homes is the wrong answer. It can be a motorway junction or a river; it ignores that one family drives
 * 12 minutes and the other 40, that one has a baby asleep at 12:30, that the café shuts at 3, that one family needs baby
 * changing. So nothing here ever computes a midpoint. Each place the product already knows about is asked the same
 * questions of BOTH families, and the answer is a ranked, explained shortlist:
 *
 *   journey        each family's own time there and back (an estimate from distance, said to be one), and how fair the
 *                  split is: the longer journey matters more than the average.
 *   suitability    the planner's own definition of "works for this family" (`matchVenueToDayRequest`), per family: limits,
 *                  must-have facilities (unknown fails closed, exactly as the plan would), age policy. A place a plan could
 *                  not be built for is never offered.
 *   Family Fit     the signed-in family's own fit (`venue.familyMatch`), and ages for the other family only where they
 *                  chose to share them.
 *   routines       each family's naps and feeds against the day the arrival time implies, only where routines are known.
 *   the day        opening hours at the time they would be there; weather via the family's own fit.
 *
 * WHAT IT WILL NOT DO. It will not pretend to know a family it only has a postcode for: with no children and no routines on
 * record, nothing is claimed for them beyond the journey, and the result says so. It makes no network call, no search and
 * no paid route request: the places are the ones Home already loaded, and every journey is the free distance estimate.
 *
 * Pure: no clock (the caller passes `now`), no stores, no I/O.
 */

const BUFFER_MINUTES = 15;
const GRID_MINUTES = 5;
export const MAX_OPTIONS = 5;
/** A gap this small is "about the same": not worth a sentence about who has further to go. */
const EVEN_GAP_MINUTES = 3;

export interface HalfwayInput {
  /** The places in hand (Home's London set). */
  venues: readonly Venue[];
  mine: PlanningFamily;
  other: PlanningFamily;
  /** `YYYY-MM-DD`. */
  date: string;
  /** When both would like to arrive, `HH:MM`. */
  arriveAt: string;
  /** The planning instant: today's date and minutes in the planning timezone. */
  today: string;
  nowMinutes: number;
  environment?: 'either' | 'indoor' | 'outdoor';
}

export type FamilyRole = 'mine' | 'other';

export interface HalfwayJourney {
  role: FamilyRole;
  familyId: string;
  label: string;
  /** One way, minutes. An estimate from distance. */
  minutes: number;
  /** Home to home, with a settling buffer each end: when this family would leave and be back. */
  leave: number;
  home: number;
}

export interface HalfwayOption {
  venue: Venue;
  journeys: [HalfwayJourney, HalfwayJourney];
  /** The difference between the two one-way journeys. */
  gap: number;
  /** Who has the longer journey, when the gap is worth saying. */
  longerFor: FamilyRole | null;
  /** Confirmed reasons it works for both. Each is a fact or a computed result, never an inference. */
  reasons: string[];
  /** What nobody has confirmed, or a routine to plan around. Stated, never counted as a fit. */
  toCheck: string[];
  /** Whether the opening hours were confirmed at the time they would be there. */
  hoursConfirmed: boolean;
  score: number;
}

export interface HalfwayExclusions {
  /** Beyond one family's drive limit. */
  journey: number;
  /** Shut on the day, or before they would arrive. */
  closed: number;
  /** A must-have, an age policy or the setting that one family's plan could not meet (including must-haves nobody has confirmed). */
  requirements: number;
  /** The start would already have gone for one family. */
  tooSoon: number;
}

export interface HalfwayResult {
  options: HalfwayOption[];
  considered: number;
  excluded: HalfwayExclusions;
  /** When every place was ruled out by time alone, the first arrival that would work for both. `HH:MM`. */
  earliestArrival?: string;
  /** What FamilyPilot does not know about the other family, so the screen can say it plainly. */
  otherKnown: { children: boolean; routines: boolean };
}

const hhmm = (minutes: number): string => {
  const within = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(within / 60)).padStart(2, '0')}:${String(within % 60).padStart(2, '0')}`;
};
const upperFirst = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const snapUp = (minutes: number) => Math.ceil(minutes / GRID_MINUTES) * GRID_MINUTES;

/** `family` as "your family" or "Hannah’s family" in a sentence. */
export const familyPhrase = (role: FamilyRole, label: string): string =>
  role === 'mine' ? 'your family' : `${label.replace(/’s family$/i, '')}’s family`;

function factsFor(venue: Venue): MatchableVenueFacts {
  return (
    venue.trustedFacts ??
    extractMatchableFacts(venue.id, venue.name, venue.category, 0, venue.enrichmentStatus, null, venue.isOpen)
  );
}

function windowsOf(family: PlanningFamily): RoutineWindow[] {
  try {
    return routineWindows(family.routines);
  } catch {
    // A routine nobody could have meant is ignored here; the plan itself rejects it by name.
    return [];
  }
}

const routineKinds = (windows: RoutineWindow[]): string =>
  windows.every((w) => w.kind === 'nap') ? 'naps' : windows.every((w) => w.kind === 'feed') ? 'feeds' : 'naps and feeds';

export function meetHalfway(input: HalfwayInput): HalfwayResult {
  const { mine, other, date, arriveAt, today, nowMinutes } = input;
  const environment = input.environment ?? 'either';
  const arrive = clockMinutes(arriveAt);
  const excluded: HalfwayExclusions = { journey: 0, closed: 0, requirements: 0, tooSoon: 0 };
  const roles: [FamilyRole, PlanningFamily][] = [
    ['mine', mine],
    ['other', other],
  ];
  const otherKnown = { children: other.ages.length > 0, routines: other.routines.length > 0 };
  const windows = { mine: windowsOf(mine), other: windowsOf(other) };

  const options: HalfwayOption[] = [];
  let earliest: number | null = null;

  for (const venue of input.venues) {
    if (!Number.isFinite(venue.latitude) || !Number.isFinite(venue.longitude)) continue;

    // 1. Each family's own journey, from where THEY start. Never a midpoint.
    const minutes = roles.map(([, family]) =>
      estimateDriveMinutes(family.latitude, family.longitude, venue.latitude, venue.longitude),
    );
    if (minutes.some((m) => !Number.isFinite(m))) continue;
    if (roles.some(([, family], i) => minutes[i] > family.maxDriveMinutes)) {
      excluded.journey += 1;
      continue;
    }

    // 2. Can both be there at the time chosen? On today the start must still be ahead of each family's leaving.
    const farthest = Math.max(...minutes);
    if (date === today) {
      const first = snapUp(nowMinutes + farthest + BUFFER_MINUTES);
      earliest = earliest === null ? first : Math.min(earliest, first);
      if (arrive - farthest - BUFFER_MINUTES < nowMinutes) {
        excluded.tooSoon += 1;
        continue;
      }
    }

    // 3. A time at the place, assumed from its kind: a planning assumption, never shown as a fact about the venue.
    const facts = factsFor(venue);
    const dwell = facts.visitDurationMinutes && facts.visitDurationMinutes >= 30 ? facts.visitDurationMinutes : typicalMinutesFor(venue.category);
    const depart = arrive + dwell;

    // 4. Open when they would be there. A confirmed closure rules it out; unknown hours are carried, never read as open.
    const verdict = isOpenOn(date, hhmm(arrive), hhmm(depart), venue.structuredOpeningHours);
    if (verdict.status === 'closed') {
      excluded.closed += 1;
      continue;
    }

    // 5. The planner's own definition of "works for this family", asked of BOTH. A place a plan could not be built for
    //    (including a must-have nobody has confirmed) is not offered, so every option here can become a plan.
    const unsuitable = roles.some(([, family], i) => !matchVenueToDayRequest({ ...facts, driveMinutes: minutes[i] }, familyRequest(family, environment)).eligible);
    if (unsuitable) {
      excluded.requirements += 1;
      continue;
    }

    // ---- it can work for both: now say why, and rank --------------------------------------------------------
    const journeys = roles.map(([role, family], i): HalfwayJourney => ({
      role,
      familyId: family.id,
      label: family.label,
      minutes: minutes[i],
      leave: arrive - minutes[i] - BUFFER_MINUTES,
      home: depart + minutes[i] + BUFFER_MINUTES,
    })) as [HalfwayJourney, HalfwayJourney];
    const gap = Math.abs(minutes[0] - minutes[1]);
    const longerFor: FamilyRole | null = gap > EVEN_GAP_MINUTES ? (minutes[0] > minutes[1] ? 'mine' : 'other') : null;

    const reasons: string[] = [];
    const toCheck: string[] = [];
    let bonus = 0;

    // Journeys.
    if (longerFor === null) reasons.push('Journeys within a few minutes of each other');
    else {
      const shorter = longerFor === 'mine' ? ('other' as const) : ('mine' as const);
      reasons.push(`${upperFirst(familyPhrase(shorter, (shorter === 'mine' ? mine : other).label))} has the shorter journey`);
    }

    // Your own Family Fit, which already reads your household, the venue's evidence and today.
    const fit = venue.familyMatch;
    if (fit && (fit.verdict === 'excellent' || fit.verdict === 'good')) {
      reasons.push(fit.headline.replace(/ today$/, ''));
      bonus += fit.verdict === 'excellent' ? 12 : 7;
    } else if (fit && fit.verdict === 'poor') {
      bonus -= 12;
      // Your own Family Fit says it is probably not right for someone in your family: said as it is, never softened.
      toCheck.push(fit.headline.replace(/ today$/, ''));
    }

    // Ages: each family only where there are ages on record.
    const ageFits = roles
      .map(([role, family]) => ({ role, family, fit: family.ages.length ? evaluateAgeRecommendation(facts, yearsToMonths(family.ages)) : ('unknown' as const) }))
      .filter((entry) => entry.fit !== 'unknown');
    if (ageFits.length === 2 && ageFits.every((entry) => entry.fit === 'all')) {
      reasons.push('Suits the ages of both families’ children');
      bonus += 6;
    } else if (ageFits.length > 0 && ageFits.every((entry) => entry.fit === 'all')) {
      reasons.push(`Suits the ages of the children in ${familyPhrase(ageFits[0].role, ageFits[0].family.label)}`);
    } else {
      for (const entry of ageFits) {
        if (entry.fit === 'none' || entry.fit === 'some') {
          toCheck.push(`Recommended ages may not suit all the children in ${familyPhrase(entry.role, entry.family.label)}`);
          bonus -= 4;
        }
      }
    }

    // Routines, only for the families that have them on record.
    const withRoutines = roles.filter(([role]) => windows[role].length > 0);
    const clash: FamilyRole[] = [];
    for (const [role] of withRoutines) {
      const journey = journeys[role === 'mine' ? 0 : 1];
      const overlapping = windows[role].some((w) => overlapMinutes(w, journey.leave, journey.home) > 0);
      if (overlapping) clash.push(role);
    }
    if (withRoutines.length === 2 && clash.length === 0) {
      reasons.push(`Works around both families’ ${routineKinds([...windows.mine, ...windows.other])}`);
      bonus += 10;
    } else if (withRoutines.length === 1 && clash.length === 0) {
      reasons.push(`Works around the ${routineKinds(windows[withRoutines[0][0]])} for ${familyPhrase(withRoutines[0][0], withRoutines[0][1].label)}`);
      bonus += 5;
    }
    for (const role of clash) {
      toCheck.push(
        `${role === 'mine' ? 'A nap or feed of yours falls' : `A routine for ${familyPhrase(role, other.label)} falls`} during the outing. The plan will suggest options`,
      );
      bonus -= 3;
    }
    if (!otherKnown.children && !otherKnown.routines) {
      toCheck.push(`We only know where ${familyPhrase('other', other.label)} sets off from, so only the journey is checked for them`);
    }

    // The venue's own confirmed facilities that matter to a family day.
    const youngest = Math.min(...[...mine.ages, ...other.ages, 99]);
    if (facts.babyChanging === 'yes' && youngest < 3) reasons.push('Baby changing confirmed');
    if (venue.facilities?.includes('cafe')) {
      reasons.push('Café on site');
      bonus += 3;
    }
    if (facts.parking === 'yes') reasons.push(facts.freeParking === 'yes' ? 'Free parking confirmed' : 'Parking confirmed');

    // The day.
    const hoursConfirmed = verdict.status === 'open';
    if (hoursConfirmed) {
      reasons.push('Open when you’d be there');
      bonus += 4;
    } else {
      toCheck.push('Opening hours not confirmed for that day');
    }

    // Fairness is the point: the longer journey weighs more than the average, and a lopsided split is penalised.
    const score = 100 - farthest * 1.0 - gap * 0.8 - (minutes[0] + minutes[1]) * 0.15 + bonus;

    options.push({ venue, journeys, gap, longerFor, reasons, toCheck, hoursConfirmed, score });
  }

  options.sort((a, b) => b.score - a.score || a.venue.name.localeCompare(b.venue.name));

  return {
    options: options.slice(0, MAX_OPTIONS),
    considered: input.venues.length,
    excluded,
    earliestArrival: options.length === 0 && excluded.tooSoon > 0 && earliest !== null ? hhmm(earliest) : undefined,
    otherKnown,
  };
}
