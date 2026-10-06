import { PushchairSuitability } from '@/src/types/enrichment';
import { DayItinerary, RoutineInsight, RoutinePhase } from '@/src/types/day-sequence';
import { PlanAlternative } from '@/src/types/day-plan';

/**
 * What a routine overlapping the outing MEANS, and what to do about it.
 *
 * A nap or a feed that falls while the family is out is not an error. A parent with a baby who naps at 12:30 still wants
 * to go to the farm; they want to know that it falls on the drive home, whether the buggy will do, and what the choices are.
 * The sequencer therefore never refuses a day for a routine (it reports each overlap as a `RoutineInsight`) and this
 * module turns those into three tiers, in the parent's words:
 *
 *   HARD CONFLICT   the plan cannot be built: the place is shut, the journey is beyond a stated limit, the start is in the
 *                   past, a must-have facility is ruled out. These are sequencer FAILURES and never reach this module.
 *   SOFT CLASH      a routine the family keeps at home overlaps the outing, or a feed falls on a drive: the plan still
 *                   stands, with advice and one-tap options (start earlier or later, stay a shorter time, add lunch).
 *   INFORMATIONAL   worth a line and nothing more: a routine the family says happens out and about, a nap that falls on a
 *                   drive (some children nap in the car), a feed that lines up with the lunch stop.
 *
 * It states what it knows and no more. Pushchair advice appears only for a family that uses a buggy and only from what the
 * venue record says; an unknown pushchair rating is said to be unknown, never turned into a yes or a no. Nothing here claims
 * a child will sleep, or that a venue has somewhere to feed a baby.
 *
 * Names: a routine reaches the planner with no child's name (so a saved day can be backed up without children's names), and
 * the name is added here, at render time, from the local profile through the `resolveSubject` the caller supplies.
 *
 * Pure; no clock, no I/O.
 */

export type AdviceSeverity = 'soft' | 'info';

/** Who a routine belongs to, as a sentence needs to say it. */
export interface RoutineSubject {
  /** The child's first name, only for the signed-in household whose profile holds it. */
  name: string | null;
  /** `feed` for a baby under a year, `meal` for an older child; naps are naps. */
  noun: 'nap' | 'feed' | 'meal' | 'routine';
  /** "Hannah", "Our family". */
  familyLabel: string;
  /** True for the household that is using the app. */
  yours: boolean;
}

export type SubjectResolver = (familyId: string, routineId: string, kind: 'nap' | 'feed') => RoutineSubject;

export interface AdviceVenue {
  name: string;
  pushchair: PushchairSuitability;
}

export interface AdviceOption {
  kind: 'alternative' | 'add-lunch';
  label: string;
  /** For `alternative`: the verified re-run the screen applies. */
  alternative?: PlanAlternative;
}

export interface RoutineAdvice {
  id: string;
  severity: AdviceSeverity;
  familyId: string;
  routineId: string;
  kind: 'nap' | 'feed';
  /** "Ozzie’s nap · 12:30–14:00" */
  title: string;
  /** Where it falls: "falls on the drive home". */
  where: string;
  /** What the parent might want to know or do, one or two sentences. */
  detail: string;
  options: AdviceOption[];
}

export interface RoutineReasoning {
  advice: RoutineAdvice[];
  /** Good news worth saying: "Home around 13:10, before Ozzie’s nap at 13:30." */
  homeBefore: string[];
  /** Reasoning across more than one family. Empty for a single family. */
  together: string[];
  /** True when at least one routine overlaps the outing. */
  hasOverlap: boolean;
}

export interface RoutineAdviceContext {
  itinerary: DayItinerary;
  venue: AdviceVenue;
  resolveSubject: SubjectResolver;
  /** Families that use a pushchair. Pushchair advice is given to these and nobody else. */
  buggyFamilies: ReadonlySet<string>;
  alternatives: PlanAlternative[];
  /** A lunch stop is already in the day. */
  mealIncluded: boolean;
  /** A lunch could be added: a place to eat is known near the venue. */
  lunchAvailable: boolean;
}

const hm = (minutes: number): string => {
  const within = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(within / 60)).padStart(2, '0')}:${String(within % 60).padStart(2, '0')}`;
};

const possessive = (name: string): string => `${name}’s`;

/** "Ozzie’s nap", "your nap", "the feed for Hannah’s family". */
export function subjectPhrase(subject: RoutineSubject, kind: 'nap' | 'feed'): string {
  // A connection made before routines carried a kind shares only "Home time", so it is a home routine, not a nap.
  const noun = subject.noun === 'routine' ? 'home routine' : kind === 'nap' ? 'nap' : subject.noun === 'meal' ? 'meal' : 'feed';
  if (subject.yours) return subject.name ? `${possessive(subject.name)} ${noun}` : `your ${noun}`;
  return `the ${noun} for ${possessive(subject.familyLabel)} family`;
}

const upper = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const TRAVEL: ReadonlySet<RoutinePhase> = new Set<RoutinePhase>(['outbound', 'return', 'transfer']);

interface Group {
  familyId: string;
  routineId: string;
  kind: 'nap' | 'feed';
  atHome: boolean;
  start: number;
  end: number;
  phases: RoutinePhase[];
  visitStops: number[];
  overlapStart: number;
  overlapEnd: number;
}

function groupInsights(insights: RoutineInsight[]): Group[] {
  const groups = new Map<string, Group>();
  for (const insight of insights) {
    const key = `${insight.familyId}\u0000${insight.routineId}`;
    const group = groups.get(key) ?? {
      familyId: insight.familyId,
      routineId: insight.routineId,
      kind: insight.kind,
      atHome: insight.atHome,
      start: insight.start,
      end: insight.end,
      phases: [],
      visitStops: [],
      overlapStart: Number.POSITIVE_INFINITY,
      overlapEnd: Number.NEGATIVE_INFINITY,
    };
    if (!group.phases.includes(insight.phase)) group.phases.push(insight.phase);
    if (insight.phase === 'visit' && insight.stopIndex !== undefined && !group.visitStops.includes(insight.stopIndex)) {
      group.visitStops.push(insight.stopIndex);
    }
    group.overlapStart = Math.min(group.overlapStart, Math.max(insight.start, insight.span.from));
    group.overlapEnd = Math.max(group.overlapEnd, Math.min(insight.end, insight.span.to));
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.start - b.start || a.familyId.localeCompare(b.familyId));
}

function whereLine(group: Group, itinerary: DayItinerary, venueName: string): string {
  const onlyTravel = group.phases.every((phase) => TRAVEL.has(phase));
  const stopName = (index: number) => itinerary.stops.find((stop) => stop.index === index)?.name ?? venueName;
  if (onlyTravel) {
    if (group.phases.length === 1) {
      switch (group.phases[0]) {
        case 'return':
          return 'falls on the drive home';
        case 'outbound':
          return 'falls on the way there';
        default:
          return 'falls on the drive between stops';
      }
    }
    return `overlaps your travelling between ${hm(group.overlapStart)} and ${hm(group.overlapEnd)}`;
  }
  const stops = [...new Set(group.visitStops)].sort((a, b) => a - b);
  const meal = stops.length === 1 && itinerary.stops.find((stop) => stop.index === stops[0])?.role === 'meal';
  if (group.phases.length === 1 && stops.length === 1) {
    return meal ? 'falls during lunch' : `falls while you’re at ${stopName(stops[0])}`;
  }
  return `overlaps your day from ${hm(group.overlapStart)} to ${hm(group.overlapEnd)}`;
}

function pushchairLine(venue: AdviceVenue): string {
  switch (venue.pushchair) {
    case 'excellent':
    case 'good':
      return 'Pushchair access is recorded as good here, so a nap in the buggy could work.';
    case 'mixed':
      return 'Pushchair access is recorded as mixed here, so check the paths before counting on a buggy nap.';
    case 'difficult':
      return 'This place is recorded as difficult with a pushchair, so a buggy nap here may not be easy.';
    default:
      return 'We don’t know yet how pushchair-friendly this place is.';
  }
}

function describeAlternative(alternative: PlanAlternative, originalArrive: number | undefined): string {
  if (alternative.kind === 'shorter') return `Stay ${spokenLength(alternative.visitMinutes)} instead`;
  const arrive = alternative.arriveAt;
  if (originalArrive === undefined) return `Arrive at ${arrive} instead`;
  const [h, m] = arrive.split(':').map(Number);
  const delta = Math.abs(h * 60 + m - originalArrive);
  return `Arrive at ${arrive} (${delta} min ${alternative.kind === 'earlier' ? 'earlier' : 'later'})`;
}

function spokenLength(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  if (rest === 30) return hours === 1 ? 'an hour and a half' : `${hours} and a half hours`;
  return `${hours}h ${rest}m`;
}

export function reasonAboutRoutines(context: RoutineAdviceContext): RoutineReasoning {
  const { itinerary, venue, resolveSubject, buggyFamilies, alternatives, mealIncluded, lunchAvailable } = context;
  const groups = groupInsights(itinerary.routineInsights ?? []);
  const originalArrive = itinerary.stops[0]?.arrive;
  const mealStops = itinerary.stops.filter((stop) => stop.role === 'meal');

  const advice: RoutineAdvice[] = groups.map((group) => {
    const subject = resolveSubject(group.familyId, group.routineId, group.kind);
    const phrase = subjectPhrase(subject, group.kind);
    const onlyTravel = group.phases.every((phase) => TRAVEL.has(phase));
    const duringVisit = group.phases.includes('visit');
    const overlapsMeal = mealStops.some(
      (stop) => group.visitStops.includes(stop.index),
    );
    const onlyMeal = overlapsMeal && group.visitStops.length > 0 && group.visitStops.every((i) => mealStops.some((m) => m.index === i)) && !group.phases.some((p) => TRAVEL.has(p));

    // SOFT or INFORMATIONAL (see the header). A hard conflict is a sequencer failure and never gets here.
    let severity: AdviceSeverity;
    if (group.kind === 'nap') severity = onlyTravel || !group.atHome ? 'info' : 'soft';
    else severity = onlyMeal || (!group.atHome && !onlyTravel) ? 'info' : 'soft';

    const lines: string[] = [];
    if (group.kind === 'nap') {
      if (onlyTravel) {
        lines.push('If they usually nap on the move this could suit them. If not, the options below move the day around it.');
      } else if (duringVisit && buggyFamilies.has(group.familyId)) {
        lines.push(pushchairLine(venue));
      } else {
        lines.push('The options below move the day around it.');
      }
    } else {
      const length = itinerary.routineInsights.find(
        (i) => i.familyId === group.familyId && i.routineId === group.routineId,
      );
      const minutes = length ? Math.max(0, length.end - length.start) : 0;
      if (onlyMeal) {
        lines.push('Your lunch stop falls at the same time, so it can double as the feed.');
      } else if (duringVisit) {
        lines.push(`Allow about ${minutes || 30} minutes for it${group.atHome ? ' while you’re out' : ''}.`);
      } else {
        lines.push('A feed before you leave, or a stop on the way, would cover it.');
      }
    }

    const options: AdviceOption[] = [];
    // Options go with a clash that is worth acting on, and with a nap on a drive: that one is only "might be fine", so
    // the parent who would rather not rely on it gets a way out. A feed that lines up with lunch needs none.
    if (severity === 'soft' || (group.kind === 'nap' && onlyTravel)) {
      for (const alternative of alternatives) {
        if (alternative.resolves.some((r) => r.familyId === group.familyId && r.routineId === group.routineId)) {
          options.push({ kind: 'alternative', label: describeAlternative(alternative, originalArrive), alternative });
        }
      }
      if (group.kind === 'feed' && !mealIncluded && lunchAvailable && duringVisit) {
        options.push({ kind: 'add-lunch', label: 'Add a 45-minute lunch and recheck the timings' });
      }
    }

    return {
      id: `${group.familyId}:${group.routineId}`,
      severity,
      familyId: group.familyId,
      routineId: group.routineId,
      kind: group.kind,
      title: `${upper(phrase)} · ${hm(group.start)}–${hm(group.end)}`,
      where: whereLine(group, itinerary, venue.name),
      detail: lines.join(' '),
      options,
    };
  });

  const homeBefore: string[] = [];
  for (const after of itinerary.homeAfter ?? []) {
    const family = itinerary.families.find((f) => f.familyId === after.familyId);
    if (!family) continue;
    const subject = resolveSubject(after.familyId, after.routineId, after.kind);
    const phrase = subjectPhrase(subject, after.kind);
    homeBefore.push(
      subject.yours
        ? `You’re home around ${hm(family.home)}, before ${phrase} at ${hm(after.start)}.`
        : `${possessive(subject.familyLabel)} family is home around ${hm(family.home)}, before their ${subject.noun === 'routine' ? 'home routine' : after.kind === 'nap' ? 'nap' : subject.noun === 'meal' ? 'meal' : 'feed'} at ${hm(after.start)}.`,
    );
  }

  return {
    advice,
    homeBefore,
    together: reasonAcrossFamilies(itinerary, advice, resolveSubject),
    hasOverlap: advice.length > 0,
  };
}

/**
 * Reasoning over more than one family at once: one plan, read across everyone's routines, rather than two schedules.
 *
 * Says who is affected, whether the routines happen to line up, and when everyone is home. Nothing is said about a
 * connected family's children or routines beyond what that family chose to share: with no shared routines there is
 * simply nothing to reason about for them, and that is stated rather than guessed.
 */
function reasonAcrossFamilies(
  itinerary: DayItinerary,
  advice: RoutineAdvice[],
  resolveSubject: SubjectResolver,
): string[] {
  if (itinerary.families.length < 2) return [];
  const lines: string[] = [];
  const affected = new Set(advice.map((a) => a.familyId));
  const familyName = (familyId: string): string => {
    const family = itinerary.families.find((f) => f.familyId === familyId);
    return resolveSubject(familyId, '', 'nap').yours ? 'your family' : `${possessive(family?.label ?? 'their')} family`;
  };

  if (affected.size === 0) {
    lines.push('Nobody’s routines are overlapped by this day.');
  } else if (affected.size < itinerary.families.length) {
    const names = [...affected].map(familyName);
    lines.push(`Only ${names.join(' and ')} ${names.length === 1 ? 'has' : 'have'} a routine that overlaps the day.`);
  } else {
    lines.push('Every family has a routine that overlaps the day, so the options are checked against everyone.');
  }

  // Naps that fall at the same time in two families: whatever helps one helps the other.
  const naps = (itinerary.routineInsights ?? []).filter((i) => i.kind === 'nap');
  const byFamily = new Map<string, RoutineInsight>();
  for (const nap of naps) if (!byFamily.has(nap.familyId)) byFamily.set(nap.familyId, nap);
  const napFamilies = [...byFamily.values()];
  for (let i = 0; i < napFamilies.length; i += 1) {
    for (let j = i + 1; j < napFamilies.length; j += 1) {
      const a = napFamilies[i];
      const b = napFamilies[j];
      const from = Math.max(a.start, b.start);
      const to = Math.min(a.end, b.end);
      if (to - from >= 30) {
        lines.push(`Both families’ naps fall between ${hm(from)} and ${hm(to)}, so planning around one covers the other.`);
      }
    }
  }
  return lines;
}
