import { MEAL_DWELL_MINUTES } from './create-plan';
import { minutesOfClock } from './meal-window';
import { DayItinerary, RoutineInsight, SequenceLeg, SequenceStop } from '@/src/types/day-sequence';
import { FamilyProfile } from '@/src/types';
import { familyDisplayName } from '@/src/utils/family-title';

import { homeMargins } from './home-margin';
import { PlanAnchorFacts, PlanLunchFacts, PlanViewModelInput, planClock } from './plan-view-model';
import { SubjectResolver, subjectPhrase } from './routine-advice';
import { allowedLabel } from './visit-duration';

/**
 * THE DAY AS A TIMELINE: when to leave, how long the journey is, when you arrive, how long you have before the next feed
 * or nap, where that routine falls, lunch and why that place suits, when to leave, when you are home, and whether the
 * routines at home have room. Chronological rows, each with the time, a title and a few lines, and each line saying
 * where its claim came from:
 *
 *   confirmed  a fact somebody checked (the venue's hours, a measured journey, a confirmed facility)
 *   estimated  a journey worked out from distance, never measured
 *   inferred   FamilyPilot's own choice or arithmetic (a typical visit length, the settling buffer)
 *   reported   what the parent entered (routines) or what mappers listed (a restaurant's tags)
 *   unknown    nobody has checked
 *
 * Built from the planner's saved answer (`PlanViewModelInput`), never from the screen, so a saved day reads the same way
 * it was planned and an edited day re-runs the real scheduler before this ever sees it. Names are resolved at draw time
 * through `resolveSubject`; nothing here is saved.
 *
 * The rows the parent can change carry `edit`: the arrival (re-plans from a new start), the visit length, the lunch
 * (take it out, or another real place nearby) and the verified earlier departure the tight-margin advice found. Stops
 * cannot be added, removed or reordered here (after beta).
 */

export type Provenance = 'confirmed' | 'estimated' | 'inferred' | 'reported' | 'unknown';

export interface TimelineLine {
  text: string;
  provenance?: Provenance;
  /**
   * Supporting evidence rather than the timing itself: how a journey was worked out, a facility that is confirmed, a sentence a
   * row above already said. Drawn only when the parent opens "How these times were worked out"; everything that changes what
   * they do (a time, a warning, something not confirmed) is never a detail.
   */
  detail?: boolean;
}

export type TimelineEdit = 'arrival' | 'visit' | 'lunch' | 'leave-earlier';

export type TimelineRowKind = 'leave-home' | 'arrive' | 'window' | 'routine' | 'leave' | 'lunch' | 'home' | 'routine-home';

export interface TimelineRow {
  id: string;
  kind: TimelineRowKind;
  /** Minutes from midnight. */
  time: number;
  until?: number;
  title: string;
  lines: TimelineLine[];
  /** `ok` a quiet row; `tight` a margin that may not hold; `warn` a routine that falls while out; `quiet` a plain step. */
  tone: 'ok' | 'tight' | 'warn' | 'quiet';
  edit?: TimelineEdit;
  stopIndex?: number;
}

export interface TimelineChild {
  id: string;
  name: string;
  age: number;
  ageMonths?: number;
}

export interface TimelineContext {
  resolveSubject?: SubjectResolver;
  /** The household's children, from this device's profile, for "suits Sloane; Ozzie is younger" and under-3 facilities. */
  children?: TimelineChild[];
  /** True when the plan carries a verified earlier departure the parent can apply (the tight-margin advice's option). */
  leaveEarlier?: boolean;
}

/** The household's children as the timeline needs them. Names stay on the device. */
export function timelineChildren(profile: Pick<FamilyProfile, 'members'> | null | undefined): TimelineChild[] {
  return (profile?.members ?? [])
    .filter((m) => m.role === 'child')
    .map((m) => ({ id: m.id, name: m.name.trim(), age: m.age, ageMonths: m.ageMonths ?? undefined }));
}

/** "1 hr 15 min", "45 min". */
export const spanLabel = (minutes: number): string => allowedLabel(minutes);

const clock = planClock;
const upperFirst = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const isUnderThree = (child: TimelineChild): boolean => (typeof child.ageMonths === 'number' ? child.ageMonths < 36 : child.age < 3);

const defaultResolver: SubjectResolver = (_familyId, _routineId, kind) => ({ name: null, noun: kind, familyLabel: 'Your family', yours: true });

function journeyLines(leg: Pick<SequenceLeg, 'travelMinutes' | 'bufferMinutes' | 'source'>, to: string | null, options: { detailOnly?: boolean } = {}): TimelineLine[] {
  const travel = Math.max(1, Math.round(leg.travelMinutes));
  const buffer = Math.round(leg.bufferMinutes);
  const where = to ? ` to ${to}` : '';
  const live = leg.source === 'live';
  // The sequencer times every leg as a drive (a measured route, or an estimate from distance), so that is what is said;
  // a walk the discovery found is offered on the lunch row as the alternative it is. The drive is the timing and stays in
  // view; how it was worked out (the settling allowance, measured or estimated) is the detail, said once per journey.
  const how = `${buffer > 0 ? `Includes ${buffer} min to settle. ` : ''}${live ? 'Measured.' : 'Estimated from distance, not measured.'}`;
  return [
    { text: `${live ? '' : 'About '}${travel} min drive${where}.`, provenance: live ? 'confirmed' : 'estimated', detail: options.detailOnly },
    { text: how, provenance: live ? 'confirmed' : 'estimated', detail: true },
  ];
}

function ageLine(facts: PlanAnchorFacts | undefined, children: TimelineChild[]): TimelineLine | null {
  if (!facts || !children.length) return null;
  const min = facts.minRecommendedAge ?? null;
  const max = facts.maxRecommendedAge ?? null;
  if (min === null && max === null) return null;
  const range = min !== null && max !== null ? `ages ${min}–${max}` : min !== null ? `age ${min} and up` : `up to age ${max}`;
  const suits: string[] = [];
  const younger: string[] = [];
  const older: string[] = [];
  for (const child of children) {
    if (min !== null && child.age < min) younger.push(child.name);
    else if (max !== null && child.age > max) older.push(child.name);
    else suits.push(child.name);
  }
  const parts = [
    suits.length ? `suits ${suits.join(' and ')}` : null,
    younger.length ? `${younger.join(' and ')} ${younger.length === 1 ? 'is' : 'are'} younger` : null,
    older.length ? `${older.join(' and ')} ${older.length === 1 ? 'is' : 'are'} older` : null,
  ].filter(Boolean);
  // Kept in view when a child is outside the range: that is a warning, not background.
  return { text: `Recommended for ${range}: ${parts.join('; ')}.`, provenance: 'inferred', detail: younger.length + older.length === 0 };
}

function facilityLines(input: PlanViewModelInput, children: TimelineChild[], buggy: boolean): TimelineLine[] {
  const lines: TimelineLine[] = [];
  const parking = input.parking;
  if (parking?.parking === 'yes') {
    const cost = parking.freeParking === 'yes' ? ', free' : parking.freeParking === 'no' ? ', paid' : '';
    lines.push({ text: `Parking on site${cost}.`, provenance: 'confirmed', detail: true });
  } else if (parking?.parking === 'no') lines.push({ text: 'No parking on site.', provenance: 'confirmed', detail: true });
  else lines.push({ text: 'Parking not confirmed.', provenance: 'unknown' });

  if (buggy) {
    const p = input.pushchair;
    if (p === 'excellent' || p === 'good') lines.push({ text: 'Pushchair friendly.', provenance: 'confirmed', detail: true });
    else if (p === 'mixed') lines.push({ text: 'Pushchair access is mixed.', provenance: 'confirmed', detail: true });
    else if (p === 'difficult') lines.push({ text: 'Difficult with a pushchair.', provenance: 'confirmed', detail: true });
    else lines.push({ text: 'Pushchair access not confirmed.', provenance: 'unknown' });
  }

  const littleOnes = children.filter(isUnderThree);
  if (littleOnes.length && input.anchorFacts) {
    const bc = input.anchorFacts.babyChanging;
    const who = littleOnes.map((c) => c.name).join(' and ');
    if (bc === 'yes') lines.push({ text: `Baby changing confirmed, for ${who}.`, provenance: 'confirmed', detail: true });
    else if (bc === 'no') lines.push({ text: 'No baby changing recorded here.', provenance: 'confirmed', detail: true });
    else lines.push({ text: 'Baby changing not confirmed.', provenance: 'unknown' });
  }
  return lines;
}

function visitBasisLine(input: PlanViewModelInput, phrase: (familyId: string, routineId: string, kind: 'nap' | 'feed') => string): TimelineLine | null {
  const visit = input.visit;
  if (!visit) return null;
  switch (visit.basis) {
    case 'chosen':
      return null;
    case 'venue-typical':
      return { text: `The length ${input.anchorName} suggests for a visit.`, provenance: 'confirmed' };
    case 'category-typical':
      return { text: 'A typical visit for this kind of place; you can change it.', provenance: 'inferred' };
    case 'routine-limited': {
      const kind = input.itinerary.homeAfter.find((h) => h.routineId === visit.routineId)?.kind ?? 'nap';
      const name = visit.familyId && visit.routineId ? phrase(visit.familyId, visit.routineId, kind) : 'a routine at home';
      return { text: `Shortened so you’re home before ${name}.`, provenance: 'inferred' };
    }
    case 'until-closing':
      return { text: visit.closesAt ? `Until it closes at ${visit.closesAt}.` : 'Until it closes.', provenance: 'confirmed' };
    case 'day-cap':
      return { text: 'A whole day, with no closing time on record.', provenance: 'inferred' };
    default:
      return null;
  }
}

function lunchLines(stop: SequenceStop, input: PlanViewModelInput, children: TimelineChild[]): TimelineLine[] {
  const lines: TimelineLine[] = [];
  const facts = input.lunchFacts;
  const from = input.anchorName;
  // The drive the day was timed with is on the "Leave for lunch" row; a walk the discovery found is the alternative.
  if (facts?.walkMinutes !== undefined) {
    const n = Math.max(1, Math.round(facts.walkMinutes));
    lines.push(
      facts.walkSource === 'measured'
        ? { text: `Or a ${n}-minute walk from ${from}, measured.`, provenance: 'confirmed', detail: true }
        : { text: `Or about a ${n}-minute walk from ${from}, estimated from distance.`, provenance: 'estimated', detail: true },
    );
  }
  if (facts) {
    const listed = [facts.highchair ? 'high chairs' : null, facts.changingTable ? 'baby changing' : null, facts.outdoorSeating ? 'outdoor seating' : null].filter(Boolean) as string[];
    const littleOnes = children.filter(isUnderThree);
    if (listed.length) {
      const why = littleOnes.length && (facts.highchair || facts.changingTable) ? `, which matters with ${littleOnes.map((c) => c.name).join(' and ')}` : '';
      lines.push({ text: `${upperFirst(listed.join(', '))} listed on OpenStreetMap${why}.`, provenance: 'reported', detail: true });
    } else {
      lines.push({ text: 'No high chair or baby changing listed on OpenStreetMap; worth asking.', provenance: 'unknown' });
    }
    if (facts.cuisine) lines.push({ text: `${upperFirst(facts.cuisine)}, as listed.`, provenance: 'reported', detail: true });
  }
  lines.push({ text: `${spanLabel(stop.dwellMinutes)} at the table.`, provenance: 'inferred' });
  if (stop.opening.status === 'open') lines.push({ text: stop.opening.closesAt ? `Open until ${stop.opening.closesAt}.` : 'Open at this time.', provenance: 'confirmed', detail: true });
  else lines.push({ text: 'Opening hours not confirmed for this day.', provenance: 'unknown' });
  return lines;
}

export function planTimeline(input: PlanViewModelInput, context: TimelineContext = {}): TimelineRow[] {
  const itinerary: DayItinerary = input.itinerary;
  const primary = itinerary.families[0];
  if (!primary || itinerary.stops.length === 0) return [];
  const others = itinerary.families.slice(1);
  const resolve = context.resolveSubject ?? defaultResolver;
  const phrase = (familyId: string, routineId: string, kind: 'nap' | 'feed') => subjectPhrase(resolve(familyId, routineId, kind), kind);
  const children = context.children ?? [];
  const buggy = (input.buggyFamilyIds ?? []).includes(primary.familyId);
  const stops = [...itinerary.stops].sort((a, b) => a.index - b.index);
  const legs = itinerary.legs;
  const legFromHome = (familyId: string) => legs.find((l) => l.kind === 'rendezvous' && l.familyId === familyId);
  const legHome = (familyId: string) => legs.find((l) => l.kind === 'return' && l.familyId === familyId);
  const legAfter = (index: number) => legs.find((l) => l.from.kind === 'stop' && l.from.index === index && (l.kind === 'transfer' || (l.kind === 'return' && l.familyId === primary.familyId)));
  const margins = homeMargins(itinerary).filter((m) => m.familyId === primary.familyId);
  const insights = itinerary.routineInsights.filter((i) => i.familyId === primary.familyId);

  const rows: TimelineRow[] = [];
  let seq = 0;
  const push = (row: Omit<TimelineRow, 'id'>) => {
    rows.push({ ...row, id: `${row.kind}-${seq}` });
    seq += 1;
  };

  // Leave home.
  const first = stops[0];
  const out = legFromHome(primary.familyId);
  push({
    kind: 'leave-home',
    time: primary.depart,
    title: 'Leave home',
    tone: 'quiet',
    lines: [
      ...(out ? journeyLines(out, first.name) : []),
      ...others.map((family): TimelineLine => {
        const leg = legFromHome(family.familyId);
        return {
          text: `${familyDisplayName(family.label)} leave at ${clock(family.depart)}${leg ? ` · ${leg.source === 'live' ? `${Math.round(leg.travelMinutes)} min` : `about ${Math.round(leg.travelMinutes)} min`}` : ''}.`,
          provenance: leg?.source === 'live' ? 'confirmed' : 'estimated',
        };
      }),
    ],
  });

  let visitEditGiven = false;
  for (const stop of stops) {
    const next = stops.find((s) => s.index === stop.index + 1);
    const legIn = stop.index === 0 ? out : legs.find((l) => l.kind === 'transfer' && l.to.kind === 'stop' && l.to.index === stop.index);
    const during = insights.filter((i) => i.phase === 'visit' && i.stopIndex === stop.index).sort((a, b) => a.start - b.start);

    if (stop.role === 'meal') {
      push({
        kind: 'lunch',
        time: stop.arrive,
        until: stop.depart,
        title: `Lunch at ${stop.name}`,
        tone: 'quiet',
        lines: lunchLines(stop, input, children),
        edit: 'lunch',
        stopIndex: stop.index,
      });
    } else {
      const arriveLines: TimelineLine[] = [];
      if (stop.opening.status === 'open') arriveLines.push({ text: stop.opening.closesAt ? `Open until ${stop.opening.closesAt}.` : 'Open when you arrive.', provenance: 'confirmed', detail: true });
      else arriveLines.push({ text: 'Opening hours not confirmed for this day.', provenance: 'unknown' });
      if (stop.anchor) {
        arriveLines.push(...facilityLines(input, children, buggy));
        const ages = ageLine(input.anchorFacts, children);
        if (ages) arriveLines.push(ages);
      }
      push({ kind: 'arrive', time: stop.arrive, title: `Arrive at ${stop.name}`, tone: 'quiet', lines: arriveLines, edit: stop.anchor ? 'arrival' : undefined, stopIndex: stop.index });

      // The time at the place, cut where a routine falls inside it.
      let cursor = stop.arrive;
      for (const insight of during) {
        const name = phrase(insight.familyId, insight.routineId, insight.kind);
        if (insight.start > cursor) {
          push({
            kind: 'window',
            time: cursor,
            until: insight.start,
            title: `Explore until ${name}`,
            tone: 'ok',
            lines: [{ text: `You have ${spanLabel(insight.start - cursor)} before ${name}.`, provenance: 'inferred' }],
            edit: stop.anchor && !visitEditGiven ? 'visit' : undefined,
            stopIndex: stop.index,
          });
          if (stop.anchor) visitEditGiven = true;
        }
        const end = Math.min(insight.end, stop.depart);
        push({
          kind: 'routine',
          time: insight.start,
          until: end,
          title: upperFirst(name),
          tone: insight.atHome ? 'warn' : 'ok',
          lines: [
            { text: `Usually ${clock(insight.start)} to ${clock(insight.end)}; this one falls during the visit.`, provenance: 'reported' },
            ...routineFacilityLines(insight, input, children, buggy),
          ],
          stopIndex: stop.index,
        });
        cursor = Math.max(cursor, end);
      }
      if (cursor < stop.depart) {
        const basis = stop.anchor ? visitBasisLine(input, phrase) : null;
        push({
          kind: 'window',
          time: cursor,
          until: stop.depart,
          title: during.length ? `Carry on at ${stop.name}` : `Explore ${stop.name}`,
          tone: 'ok',
          lines: [{ text: `${spanLabel(stop.depart - cursor)} ${during.length ? 'more ' : ''}at ${stop.name}.`, provenance: 'inferred' }, ...(basis ? [{ ...basis, detail: true }] : [])],
          edit: stop.anchor && !visitEditGiven ? 'visit' : undefined,
          stopIndex: stop.index,
        });
        if (stop.anchor) visitEditGiven = true;
      }
    }

    // Leave this stop.
    const legOut = legAfter(stop.index);
    const leaveLines: TimelineLine[] = legOut ? journeyLines(legOut, next ? next.name : null) : [];
    let tone: TimelineRow['tone'] = 'quiet';
    let edit: TimelineEdit | undefined;
    if (!next) {
      const margin = margins[0];
      if (margin) {
        const name = phrase(margin.familyId, margin.routineId, margin.kind);
        if (margin.tight) {
          leaveLines.push({ text: `Leaving now gets you home only ${spanLabel(margin.marginMinutes)} before ${name}.`, provenance: margin.source === 'live' ? 'confirmed' : 'estimated' });
          tone = 'tight';
          if (context.leaveEarlier) edit = 'leave-earlier';
        } else {
          leaveLines.push({ text: `Leaving now gets you home ${spanLabel(margin.marginMinutes)} before ${name}.`, provenance: margin.source === 'live' ? 'confirmed' : 'estimated', detail: true });
        }
      }
    }
    push({
      kind: 'leave',
      time: stop.depart,
      title: next ? (next.role === 'meal' ? 'Leave for lunch' : `Leave for ${next.name}`) : input.ownLunch && stop.anchor ? 'Leave for lunch' : 'Leave for home',
      tone,
      lines: leaveLines,
      edit,
      stopIndex: stop.index,
    });
  }

  // A lunch the parent named: in the day where they put it (or straight after the visit), with what is and is not known.
  if (input.ownLunch) {
    const anchor = stops.find((s) => s.anchor) ?? stops[0];
    const given = minutesOfClock(input.ownLunch.startAt ?? '');
    const start = given ?? anchor.depart;
    push({
      kind: 'lunch',
      time: start,
      until: start + MEAL_DWELL_MINUTES,
      title: `Lunch at ${input.ownLunch.name}`,
      tone: 'quiet',
      lines: [
        { text: given ? 'You added this place, at the time you gave.' : 'You added this place; shown after the visit until you give it a time.', provenance: 'reported' },
        { text: `${spanLabel(MEAL_DWELL_MINUTES)} at the table, assumed.`, provenance: 'inferred' },
        { text: 'We don’t know where it is, so the journey there and your time home aren’t adjusted.', provenance: 'unknown' },
      ],
      edit: 'lunch',
      stopIndex: anchor.index,
    });
  }

  // Routines that fall while travelling. One that began during the visit and carries on into the move is one row,
  // extended, rather than the same routine twice.
  for (const insight of insights.filter((i) => i.phase !== 'visit')) {
    const name = phrase(insight.familyId, insight.routineId, insight.kind);
    const where = insight.phase === 'return' ? 'your drive home' : insight.phase === 'outbound' ? 'your journey there' : 'the move between stops';
    const shown = rows.find((r) => r.kind === 'routine' && r.title === upperFirst(name) && r.time === insight.start);
    if (shown) {
      shown.until = Math.max(shown.until ?? insight.start, insight.end);
      shown.lines.push({ text: `It carries on during ${where} (${clock(insight.span.from)} to ${clock(insight.span.to)}).`, provenance: 'reported' });
      continue;
    }
    push({
      kind: 'routine',
      time: insight.start,
      until: insight.end,
      title: upperFirst(name),
      tone: 'warn',
      lines: [{ text: `Usually ${clock(insight.start)} to ${clock(insight.end)}: falls during ${where} (${clock(insight.span.from)} to ${clock(insight.span.to)}).`, provenance: 'reported' }],
    });
  }

  // Home.
  const back = legHome(primary.familyId);
  // The drive home is on the "Leave for home" row; here it is only supporting detail.
  const homeLines: TimelineLine[] = back ? journeyLines(back, null, { detailOnly: true }) : [];
  let homeTone: TimelineRow['tone'] = 'ok';
  let homeEdit: TimelineEdit | undefined;
  for (const margin of margins) {
    const name = phrase(margin.familyId, margin.routineId, margin.kind);
    if (margin.tight) {
      homeLines.push({ text: `Tight for ${name}: ${spanLabel(margin.marginMinutes)} to spare, and the journey is ${margin.source === 'live' ? 'measured' : 'an estimate'}.`, provenance: margin.source === 'live' ? 'confirmed' : 'estimated' });
      homeTone = 'tight';
      if (context.leaveEarlier) homeEdit = 'leave-earlier';
    } else {
      homeLines.push({ text: `${spanLabel(margin.marginMinutes)} before ${name} at ${clock(margin.start)}.`, provenance: margin.source === 'live' ? 'confirmed' : 'estimated' });
    }
  }
  for (const family of others) homeLines.push({ text: `${familyDisplayName(family.label)} home around ${clock(family.home)}.`, provenance: legHome(family.familyId)?.source === 'live' ? 'confirmed' : 'estimated' });
  push({ kind: 'home', time: primary.home, title: 'Home', tone: homeTone, lines: homeLines, edit: homeEdit });

  // The routines at home the day is home before.
  for (const margin of margins) {
    const name = phrase(margin.familyId, margin.routineId, margin.kind);
    push({
      kind: 'routine-home',
      time: margin.start,
      title: `${upperFirst(name)}, at home`,
      tone: margin.tight ? 'tight' : 'ok',
      lines: [
        margin.tight
          ? { text: `You’re home ${spanLabel(margin.marginMinutes)} before it, and the journey is ${margin.source === 'live' ? 'measured' : 'estimated'}, so that may not hold.`, provenance: 'reported' }
          : { text: `You’re home ${spanLabel(margin.marginMinutes)} before it.`, provenance: 'reported', detail: true },
      ],
    });
  }

  const order: Record<TimelineRowKind, number> = { 'leave-home': 0, arrive: 1, window: 2, routine: 3, leave: 4, lunch: 1, home: 5, 'routine-home': 6 };
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.time - b.row.time || order[a.row.kind] - order[b.row.kind] || a.index - b.index)
    .map(({ row }) => row);
}

function routineFacilityLines(insight: RoutineInsight, input: PlanViewModelInput, children: TimelineChild[], buggy: boolean): TimelineLine[] {
  const lines: TimelineLine[] = [];
  if (insight.kind === 'feed') {
    const bc = input.anchorFacts?.babyChanging;
    if (children.some(isUnderThree)) {
      if (bc === 'yes') lines.push({ text: 'Baby changing confirmed here.', provenance: 'confirmed' });
      else if (bc === 'no') lines.push({ text: 'No baby changing recorded here.', provenance: 'confirmed' });
      else lines.push({ text: 'Baby changing not confirmed here.', provenance: 'unknown' });
    }
  } else if (insight.atHome) {
    lines.push({ text: 'A nap you usually keep at home. The advice above says what would clear it.', provenance: 'reported' });
  } else if (buggy) {
    const p = input.pushchair;
    lines.push(p === 'excellent' || p === 'good' ? { text: 'Pushchair friendly, so a nap on the move is realistic.', provenance: 'confirmed' } : { text: 'Pushchair access not confirmed for a nap on the move.', provenance: 'unknown' });
  }
  return lines;
}
