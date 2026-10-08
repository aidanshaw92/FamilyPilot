import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';
import { evaluateFamilyMatch, FamilyMatchResult } from '@/src/services/matching/family-match';
import { evaluateAgeRecommendation, yearsToMonths } from '@/src/services/matching/age-suitability';
import { extractMatchableFacts } from '@/src/services/matching/venue-facts';
import { estimateDriveMinutes } from '@/src/services/places/geo-utils';
import { FacilityType, FamilyMember, FamilyProfile, Venue } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { isOpenOn } from '@/src/utils/opening-hours';

import { mustHaveLabel } from './must-have-labels';
import { PlanningFamily, familyRequest } from './planner';
import { RoutineWindow, clockMinutes, overlapMinutes, routineWindows } from './routine-windows';
import { typicalMinutesFor } from './visit-duration';
import { familyDisplayName } from '@/src/utils/family-title';

/**
 * MEET HALFWAY: places that work for TWO families, not the point on the map between them.
 *
 * The middle of two homes is the wrong answer. It can be a motorway junction or a river; it ignores that one family drives
 * 12 minutes and the other 40, that one has a baby asleep at 12:30, that the café shuts at 3, that one family needs baby
 * changing. So nothing here ever computes a midpoint. Each candidate place is asked the same questions of BOTH families,
 * and the answer is a ranked, explained shortlist.
 *
 * WHERE THE CANDIDATES COME FROM. Not from Home. Home is personalised to one family, so ranking Home's places would bias
 * the answer toward the first family's neighbourhood and could miss the best compromise entirely. The candidates are the
 * stored venue catalogue's places in the corridor between the two homes (`server/places/lib/between.js`: a database read,
 * a cheap straight-line fairness pass, no Google, no spend). This function receives that shortlist and does the
 * family-specific part:
 *
 *   journey        each family's own time there and back (an estimate from distance, said to be one), and how fair the
 *                  split is: the longer journey matters more than the average.
 *   suitability    the planner's own definition of "works for this family" (`matchVenueToDayRequest`), per family. A
 *                  CONFIRMED miss (a must-have the place lacks, an age policy, a closure) rules a place out. A must-have
 *                  nobody has confirmed does not: the place stays, ranked lower, with "check before you go" said plainly.
 *   Family Fit     each family's own fit: yours from your profile (`venue.familyMatch`), theirs only from what they chose
 *                  to share (ages, must-haves, pushchair). Never "good for the family" while a child is not covered.
 *   routines       each family's naps and feeds against the day the arrival time implies, only where routines are known.
 *                  A routine shared before routines had a kind ("Home time") is never called a nap or a feed.
 *   the day        opening hours at the time they would be there.
 *
 * WHAT IT WILL NOT DO. It will not pretend to know a family it only has a postcode for: with no children and no routines on
 * record, nothing is claimed for them beyond the journey, and the result says so. It makes no network call, no search and
 * no paid route request: every journey is the free distance estimate.
 *
 * Pure: no clock (the caller passes `now`), no stores, no I/O.
 */

const BUFFER_MINUTES = 15;
const GRID_MINUTES = 5;
export const MAX_OPTIONS = 5;
/** A gap this small is "about the same": not worth a sentence about who has further to go. */
const EVEN_GAP_MINUTES = 3;
/** Up to this, the split is "within N minutes of each other"; beyond it the gap is stated plainly. */
const CLOSE_GAP_MINUTES = 10;

/** How even the journeys are, in fairness words. Never says who travels less. */
export function fairnessLine(gap: number): string {
  if (gap <= EVEN_GAP_MINUTES) return "Almost equal journeys";
  return gap <= CLOSE_GAP_MINUTES ? `Journeys are within ${gap} minutes of each other` : `Journeys differ by ${gap} minutes`;
}

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
  /** How even the two journeys are, in fairness words. First on the card. */
  fairness: string;
  /** What is confirmed, in card order: fairness, fit, routines, facilities. Each is a fact or a computed result, never an inference. */
  reasons: string[];
  /** What nobody has confirmed, or a routine to plan around. Stated, never counted as a fit. */
  toCheck: string[];
  /** How many things need checking. Excludes the note that only a postcode-only family's journey was checked. */
  checks: number;
  /**
   * Whether "works for both" is genuinely supported: nothing to check, something known about both families, and journeys
   * within ten minutes of each other. Only then may the top card say "Best for both".
   */
  supported: boolean;
  /** Whether the opening hours were confirmed at the time they would be there. */
  hoursConfirmed: boolean;
  /**
   * Must-haves nobody has confirmed at this place, per family. NOT a blocker: the place is offered, ranked below one where
   * they are confirmed, and the screen says what to check. A must-have confirmed MISSING never reaches here: the place is
   * excluded.
   */
  unresolved: { role: FamilyRole; field: string; label: string }[];
  /** The "check before you go" sentences for `unresolved`, one per family. Also first in `toCheck`; the screen shows them prominently. */
  needsChecking: string[];
  score: number;
}

export interface HalfwayExclusions {
  /** Beyond one family's drive limit. */
  journey: number;
  /** Shut on the day, or before they would arrive. */
  closed: number;
  /**
   * A must-have the place is confirmed to lack, an age policy or the setting that one family's plan could not meet. A
   * must-have nobody has confirmed is NOT counted here: it is carried on the option as `unresolved`.
   */
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
  otherKnown: {
    children: boolean;
    routines: boolean;
    /** Their routines were shared before routines carried a kind: only "home time" is known, and is treated conservatively. */
    routinesLegacy: boolean;
  };
}

const hhmm = (minutes: number): string => {
  const within = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(within / 60)).padStart(2, '0')}:${String(within % 60).padStart(2, '0')}`;
};
const upperFirst = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const snapUp = (minutes: number) => Math.ceil(minutes / GRID_MINUTES) * GRID_MINUTES;

/** `family` as "your family" or "Hannah’s family" in a sentence. */
export const familyPhrase = (role: FamilyRole, label: string): string =>
  role === 'mine' ? 'your family' : familyDisplayName(label);

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

/** A routine shared before routines carried a kind has only this label: it is a home routine, never claimed to be a nap. */
export const LEGACY_ROUTINE_LABEL = 'Home time';
const isLegacyRoutine = (window: RoutineWindow): boolean => window.label === LEGACY_ROUTINE_LABEL;

const routineKinds = (windows: RoutineWindow[]): string =>
  windows.some(isLegacyRoutine)
    ? 'home time'
    : windows.every((w) => w.kind === 'nap')
      ? 'naps'
      : windows.every((w) => w.kind === 'feed')
        ? 'feeds'
        : 'naps and feeds';

const FACILITY_FOR_REQUIRED: Record<PlanningFamily['required'][number], FacilityType> = {
  toilets: 'toilets',
  babyChanging: 'baby_changing',
  parking: 'parking',
  pushchair: 'pushchair_friendly',
};

/**
 * A profile for Family Fit built ONLY from what a connection shared: ages, must-haves, whether they use a pushchair, the
 * journey limit. No names (so no sentence can name a child), no routines (the engine reads those itself, against the real
 * journey), nothing invented about who walks and who rides.
 */
function sharedProfile(family: PlanningFamily): FamilyProfile {
  const members: FamilyMember[] = [
    { id: `${family.id}-adult`, name: '', role: 'parent', dateOfBirth: '', age: 35 },
    ...family.ages.map(
      (age, index): FamilyMember => ({ id: `${family.id}-child-${index}`, name: '', role: 'child', dateOfBirth: '', age, dobKnown: false }),
    ),
  ];
  return {
    id: family.id,
    parentName: '',
    members,
    homeLocation: family.area,
    ...(family.budgetTier ? { budgetTier: family.budgetTier } : {}),
    ...(typeof family.maxDriveMinutes === 'number' ? { maxDriveMinutes: family.maxDriveMinutes } : {}),
    completionPercent: 100,
    mustHaveFacilities: family.required.map((field) => FACILITY_FOR_REQUIRED[field]),
    routines: [],
    pushchair: family.pushchair ? 'a pushchair' : null,
  } as unknown as FamilyProfile;
}

/** Whether a Family Fit covers some of a household's children but leaves another not covered (a check open, or nothing known). */
const hasChildGap = (fit: Pick<FamilyMatchResult, 'children'> | undefined): boolean => {
  const kids = fit?.children ?? [];
  return kids.length > 1 && kids.some((kid) => kid.state === 'works') && kids.some((kid) => kid.state === 'check' || kid.state === 'unknown');
};

export function meetHalfway(input: HalfwayInput): HalfwayResult {
  const { mine, other, date, arriveAt, today, nowMinutes } = input;
  const environment = input.environment ?? 'either';
  const arrive = clockMinutes(arriveAt);
  const excluded: HalfwayExclusions = { journey: 0, closed: 0, requirements: 0, tooSoon: 0 };
  const roles: [FamilyRole, PlanningFamily][] = [
    ['mine', mine],
    ['other', other],
  ];
  const windows = { mine: windowsOf(mine), other: windowsOf(other) };
  const otherKnown = {
    children: other.ages.length > 0,
    routines: other.routines.length > 0,
    routinesLegacy: windows.other.length > 0 && windows.other.every(isLegacyRoutine),
  };
  const otherProfile = sharedProfile(other);

  const options: HalfwayOption[] = [];
  let earliest: number | null = null;

  for (const venue of input.venues) {
    if (!Number.isFinite(venue.latitude) || !Number.isFinite(venue.longitude)) continue;

    // 1. Each family's own journey, from where THEY start. Never a midpoint.
    const minutes = roles.map(([, family]) =>
      estimateDriveMinutes(family.latitude, family.longitude, venue.latitude, venue.longitude),
    );
    if (minutes.some((m) => !Number.isFinite(m))) continue;
    // Each family's own stated limit, where it stated one.
    if (roles.some(([, family], i) => typeof family.maxDriveMinutes === 'number' && minutes[i] > family.maxDriveMinutes)) {
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

    // 5. The planner's own definition of "works for this family", asked of BOTH. Two kinds of "no":
    //    - a CONFIRMED miss (the place lacks a must-have, an age policy refuses them, the setting is wrong): ruled out.
    //    - a must-have NOBODY HAS CONFIRMED: not a blocker. The place stays, ranked lower, and the screen says what to check.
    //    Unknown never becomes a yes and never becomes a no. Every option here can still become a plan.
    const unresolved: HalfwayOption['unresolved'] = [];
    let confirmedMiss = false;
    roles.forEach(([role, family], i) => {
      const { evaluations } = matchVenueToDayRequest({ ...facts, driveMinutes: minutes[i] }, familyRequest(family, environment));
      for (const evaluation of evaluations) {
        if (evaluation.strength !== 'required') continue;
        if (evaluation.outcome === 'unsuitable') confirmedMiss = true;
        else if (evaluation.outcome === 'unknown') {
          const label = mustHaveLabel(evaluation.field);
          if (label) unresolved.push({ role, field: evaluation.field, label });
        }
      }
    });
    if (confirmedMiss) {
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

    // The card reads in this order: journey fairness, fit for both families, routine compatibility, useful confirmed
    // facilities, then anything that needs checking. Each group is built separately and joined in that order.
    const fit: string[] = [];
    const routineLines: string[] = [];
    const facilityLines: string[] = [];
    const toCheck: string[] = [];
    let bonus = 0;

    // Journey fairness: about how even the split is, never about which family travels less.
    const fairness = fairnessLine(gap);

    // Ages: each family only where there are ages on record.
    const ageFits = roles
      .map(([role, family]) => ({ role, family, fit: family.ages.length ? evaluateAgeRecommendation(facts, yearsToMonths(family.ages)) : ('unknown' as const) }))
      .filter((entry) => entry.fit !== 'unknown');

    // Each family's own Family Fit. Yours reads your household; theirs reads only what they shared. A claim "for" a family is
    // made only when no child in it is left uncovered: "Good for Sloane" is not "good for the family" while Ozzie is unknown.
    const sharesAnything = other.ages.length > 0 || other.required.length > 0 || other.pushchair;
    const fits: [FamilyRole, FamilyMatchResult | undefined][] = [
      ['mine', venue.familyMatch],
      [
        'other',
        sharesAnything
          ? evaluateFamilyMatch({
              venue: { ...venue, driveMinutes: minutes[1] },
              profile: otherProfile,
              score: venue.familyScore?.score ?? Number.NaN,
              now: new Date(`${date}T${hhmm(arrive)}:00`),
            })
          : undefined,
      ],
    ];
    const saidFit = new Set<FamilyRole>();
    for (const [role, result] of fits) {
      if (!result) continue;
      const who = familyPhrase(role, (role === 'mine' ? mine : other).label);
      const sentence = result.headline.replace(/ today$/, '');
      if (result.verdict === 'poor') {
        bonus -= 12;
        // Said as it is, never softened. Yours carries its own sentence; theirs is worded without a second person.
        toCheck.push(role === 'mine' ? sentence : `Family Fit says this probably isn’t right for ${who}`);
        saidFit.add(role);
      } else if (result.verdict === 'excellent' || result.verdict === 'good') {
        if (hasChildGap(result)) {
          // Confirmed for some of the children only: the gap is what the parent reads, and it earns half the credit.
          toCheck.push(role === 'mine' ? sentence : `We haven’t yet confirmed whether this activity suits every child in ${who}`);
          saidFit.add(role);
          bonus += result.verdict === 'excellent' ? 6 : 3;
        } else {
          fit.push(role === 'mine' ? sentence : `Family Fit is ${result.verdict} for ${who}`);
          bonus += result.verdict === 'excellent' ? 12 : 7;
        }
      } else if (
        result.verdict === 'possible' &&
        !unresolved.some((item) => item.role === role) &&
        // The ages line below is the more specific way to say the same thing for them.
        !(role === 'other' && ageFits.some((entry) => entry.role === 'other' && (entry.fit === 'none' || entry.fit === 'some')))
      ) {
        // Not a fit and not a failure: it could work, with something to look at. Said, so "for both" is never claimed over it.
        // Not said again where an unconfirmed must-have already explains it: that is one thing to check, not two.
        toCheck.push(role === 'mine' ? sentence : `Family Fit is only a possible match for ${who}`);
        saidFit.add(role);
      }
    }
    // A place nobody has reviewed for families has no fit to speak of: said once, for the venue, not once per family.
    if (fits.some(([, result]) => result?.verdict === 'not_reviewed')) toCheck.push('We haven’t reviewed this place for families yet');

    // Ages (declared above the Family Fit loop; the lines are added here).
    if (ageFits.length === 2 && ageFits.every((entry) => entry.fit === 'all')) {
      fit.push('Suits the ages of both families’ children');
      bonus += 6;
    } else if (ageFits.length > 0 && ageFits.every((entry) => entry.fit === 'all')) {
      fit.push(`Suits the ages of the children in ${familyPhrase(ageFits[0].role, ageFits[0].family.label)}`);
    } else {
      for (const entry of ageFits) {
        if (entry.fit === 'none' || entry.fit === 'some') {
          // Your own Family Fit sentence already names the children and the reason; saying it twice would be two things to check.
          if (!saidFit.has(entry.role)) toCheck.push(`Recommended ages may not suit all the children in ${familyPhrase(entry.role, entry.family.label)}`);
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
      routineLines.push(`Works around both families’ ${routineKinds([...windows.mine, ...windows.other])}`);
      bonus += 10;
    } else if (withRoutines.length === 1 && clash.length === 0) {
      routineLines.push(`Works around the ${routineKinds(windows[withRoutines[0][0]])} for ${familyPhrase(withRoutines[0][0], withRoutines[0][1].label)}`);
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

    // Must-haves nobody has confirmed here: first among the things to check, one line per family.
    const needing = new Map<string, string[]>();
    for (const item of unresolved) {
      const who = familyPhrase(item.role, (item.role === 'mine' ? mine : other).label);
      needing.set(who, [...(needing.get(who) ?? []), item.label]);
    }
    const needsChecking = [...needing.entries()].map(
      ([who, labels]) => `${upperFirst([...new Set(labels)].join(' and '))} isn’t confirmed at ${venue.name}, and ${who} needs it. Check before you go`,
    );
    toCheck.unshift(...needsChecking);
    bonus -= 8 * unresolved.length;

    // The venue's own confirmed facilities that matter to a family day.
    const youngest = Math.min(...[...mine.ages, ...other.ages, 99]);
    if (facts.babyChanging === 'yes' && youngest < 3) facilityLines.push('Baby changing confirmed');
    if (venue.facilities?.includes('cafe')) {
      facilityLines.push('Café on site');
      bonus += 3;
    }
    if (facts.parking === 'yes') facilityLines.push(facts.freeParking === 'yes' ? 'Free parking confirmed' : 'Parking confirmed');

    // The day.
    const hoursConfirmed = verdict.status === 'open';
    if (hoursConfirmed) {
      facilityLines.push('Open when you’d be there');
      bonus += 4;
    } else {
      toCheck.push('Opening hours not confirmed for that day');
    }

    // Fairness is the point: the longer journey weighs more than the average, and a lopsided split is penalised.
    const score = 100 - farthest * 1.0 - gap * 0.8 - (minutes[0] + minutes[1]) * 0.15 + bonus;

    const reasons = [fairness, ...fit, ...routineLines, ...facilityLines];
    // Whether "for both" is genuinely supported. A postcode-only family is a caveat (only their journey was checked),
    // not a thing to check, but it still means nothing was confirmed for them.
    const onlyJourneyKnown = !otherKnown.children && !otherKnown.routines;
    const checks = toCheck.length - (onlyJourneyKnown ? 1 : 0);
    const supported = checks === 0 && !onlyJourneyKnown && gap <= CLOSE_GAP_MINUTES;

    options.push({ venue, journeys, gap, longerFor, fairness, reasons, toCheck, checks, supported, hoursConfirmed, unresolved, needsChecking, score });
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

/**
 * What the top card is called. "Best for both" is a claim, so it is reserved for an option where it is supported; one with
 * something to check is a promising option, and one that is simply the best of an uneven or thinly-known set is the best
 * compromise. The other cards carry their category, not a claim.
 */
export function topCardLabel(option: Pick<HalfwayOption, 'checks' | 'supported'>): string {
  if (option.supported) return 'Best for both';
  if (option.checks > 0) return `Promising option · ${option.checks} ${option.checks === 1 ? 'thing' : 'things'} to check`;
  return 'Best compromise';
}
