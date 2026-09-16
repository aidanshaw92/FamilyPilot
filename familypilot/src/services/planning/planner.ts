import { FamilyProfile } from '@/src/types';
import { DayRequest, MatchableVenueFacts } from '@/src/types/day-request';
import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';

// Routine windows and their overlap rules live in routine-windows.ts so the day sequencer applies
// the same ones across several stops. Routine is re-exported here to keep this module's API
// unchanged for its existing callers.
import type { Routine } from './routine-windows';
import {
  clockMinutes,
  homeBeforeNote,
  homeRoutineConflict,
  nextHomeRoutineAfter,
  outOfHomeNotes,
  routineWindows,
  travelRoutineConflict,
} from './routine-windows';

export type { Routine } from './routine-windows';
export interface PlanningFamily {
  id: string; label: string; area: string; latitude: number; longitude: number;
  ages: number[]; maxDriveMinutes: number; budgetTier: FamilyProfile['budgetTier'];
  pushchair: boolean; required: Array<'toilets' | 'babyChanging' | 'parking' | 'pushchair'>;
  routines: Routine[];
}
export interface PlanningOptions {
  date: string; leaveAt: string; visitMinutes: number; bufferMinutes: number;
  environment: 'either' | 'indoor' | 'outdoor'; returnBy: string;
}
export interface Journey { outbound: number; inbound: number; source: 'live' | 'estimated' }
export interface FamilyTiming { familyId: string; label: string; depart: number; arrive: number; leaveVenue: number; home: number; latestDeparture: number; journey: Journey; notes: string[] }
export interface PlanMatch { venueId: string; name: string; timings: FamilyTiming[]; start: number; end: number; fairnessGap: number; reasons: string[]; unknowns: string[]; score: number }

export { clockMinutes };
export function clockLabel(minutes: number): string {
  const day = Math.floor(minutes / 1440); const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}${day > 0 ? ' next day' : ''}`;
}
/** True only when a documented range explicitly excludes one of these children.
 * An absent bound is missing evidence, not evidence of unsuitability, so it never excludes;
 * planVenue owns this decision and the matcher records the gap as an unknown instead. */
export function ageRangeExcludes(facts: Pick<MatchableVenueFacts, 'minRecommendedAge' | 'maxRecommendedAge'>, ages: number[]): boolean {
  const { minRecommendedAge: min, maxRecommendedAge: max } = facts;
  if (min == null && max == null) return false;
  return ages.some((age) => (min != null && age < min) || (max != null && age > max));
}

export function familyRequest(family: PlanningFamily, environment: PlanningOptions['environment']): DayRequest {
  const constraints: DayRequest['constraints'] = {
    // Age suitability is enforced by ageRangeExcludes before the matcher runs. Kept here as
    // preferred so an unrecorded range still surfaces in plan.unknowns rather than failing
    // the whole plan closed — required + unknown is rejected by applyConstraint.
    childAgeFit: { strength: 'preferred', value: 'in_range' },
    journey: { strength: 'required', value: { maxMinutes: family.maxDriveMinutes } },
    environment: { strength: 'required', value: environment },
    budget: { strength: 'preferred', value: 'within_profile' },
  };
  for (const field of family.required) {
    if (field === 'pushchair') constraints.pushchair = { strength: 'required', value: 'not_difficult' };
    else constraints[field] = { strength: 'required', value: 'yes' };
  }
  return { rawText: '', parsedAt: '', childAges: family.ages, homeLocation: family.area,
    budgetTier: family.budgetTier, maxDriveMinutes: family.maxDriveMinutes,
    hasPushchair: family.pushchair || family.required.includes('pushchair'), constraints, context: {} };
}

/** Same-day scheduler: tries the earliest meeting that respects every home routine.
 * Routines never prescribe or postpone feeding. Unknown required facts fail closed.
 */
export function planVenue(facts: MatchableVenueFacts, families: PlanningFamily[], journeys: Record<string, Journey>, options: PlanningOptions, now = new Date()): PlanMatch | null {
  if (!families.length || families.length > 6) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date) || !Number.isFinite(options.visitMinutes) || options.visitMinutes < 15 || options.visitMinutes > 480 || !Number.isFinite(options.bufferMinutes) || options.bufferMinutes < 0 || options.bufferMinutes > 60) throw new Error('Choose a valid date, visit length and travel buffer.');
  const selectedDate = new Date(`${options.date}T00:00:00`);
  if (!Number.isFinite(selectedDate.getTime()) || selectedDate.getFullYear() !== Number(options.date.slice(0,4)) || selectedDate.getMonth()+1 !== Number(options.date.slice(5,7)) || selectedDate.getDate() !== Number(options.date.slice(8,10))) throw new Error('Choose a valid date.');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (selectedDate < today) throw new Error('Choose today or a future date.');
  const earliest = Math.max(clockMinutes(options.leaveAt), selectedDate.getTime() === today.getTime() ? now.getHours()*60+now.getMinutes() : 0);
  const deadline = options.returnBy ? clockMinutes(options.returnBy) : 1439;
  const evaluations = families.map((family) => {
    const journey = journeys[family.id];
    if (!journey || ![journey.outbound, journey.inbound].every(n => Number.isFinite(n) && n >= 0 && n <= family.maxDriveMinutes)) return null;
    // Where a range is documented, every child must fall within it; overlap is insufficient.
    // Where no range is documented, there is nothing to reject on — see ageRangeExcludes.
    if (family.ages.length && ageRangeExcludes(facts, family.ages)) return null;
    const match = matchVenueToDayRequest({ ...facts, driveMinutes: journey.outbound }, familyRequest(family, options.environment));
    return match.eligible ? match : null;
  });
  if (evaluations.some(e => !e)) return null;
  const maxOut = Math.max(...families.map(f => journeys[f.id].outbound));
  const intervals = families.map(f => routineWindows(f.routines));
  for (let start = earliest + maxOut + options.bufferMinutes; start + options.visitMinutes <= deadline; start += 5) {
    const end = start + options.visitMinutes;
    const timings: FamilyTiming[] = [];
    let fits = true;
    families.forEach((family, i) => {
      const journey = journeys[family.id];
      const depart = start - journey.outbound - options.bufferMinutes;
      const home = end + journey.inbound + options.bufferMinutes;
      const conflicts = homeRoutineConflict(intervals[i], depart, home);
      // The outbound and inbound drives are the spans where a routine cannot happen; time at the
      // venue is not checked, because that is where it can.
      const travelConflict = travelRoutineConflict(intervals[i], [
        { from: depart, to: start },
        { from: end, to: home },
      ]);
      if (home > deadline || conflicts || travelConflict || depart < earliest) { fits = false; return; }
      const nextHome = nextHomeRoutineAfter(intervals[i], home);
      const bound = Math.min(deadline, nextHome?.start ?? deadline);
      const latestDeparture = bound - journey.inbound - journey.outbound - options.bufferMinutes*2 - options.visitMinutes;
      const notes = outOfHomeNotes(intervals[i], depart, home);
      if (nextHome) notes.push(homeBeforeNote(nextHome));
      timings.push({ familyId: family.id, label: family.label, depart, arrive: start, leaveVenue: end, home, latestDeparture, journey, notes });
    });
    if (!fits) continue;
    const drives = families.map(f => journeys[f.id].outbound);
    const fairnessGap = Math.max(...drives) - Math.min(...drives);
    const unknowns = [...new Set(evaluations.flatMap(e => e!.evaluations.filter(v => v.outcome === 'unknown').map(v => `${v.field}: not confirmed`)))];
    // Only claim the age range was checked when there was one to check against. Saying otherwise
    // would assert a verification that did not happen.
    const anyChildren = families.some(f => f.ages.length > 0);
    const ageRangeDocumented = facts.minRecommendedAge != null || facts.maxRecommendedAge != null;
    const checkedReason = !anyChildren
      ? 'Required facilities checked for every family.'
      : ageRangeDocumented
        ? 'Required facilities and age range checked for every family.'
        : 'Required facilities checked for every family. Recommended ages are not published for this place.';
    return { venueId: facts.placeId, name: facts.name, timings, start, end, fairnessGap,
      reasons: [checkedReason, families.length > 1 ? `${fairnessGap} minute difference between outbound journeys.` : 'Fits your selected travel limit.', 'Fits the home routines you entered.'],
      unknowns, score: evaluations.reduce((sum,e) => sum+e!.preferredPoints-e!.preferredUnknowns-e!.preferredUnsuitable*2,0)*10 - fairnessGap - Math.max(...drives)*0.25 - (start-earliest)*0.05 };
  }
  return null;
}

export function sharePlanText(plan: PlanMatch, date: string): string {
  // Deliberately excludes addresses, coordinates, ages and routine details.
  return `${plan.name}\n${date} · Meet ${clockLabel(plan.start)} · Finish ${clockLabel(plan.end)}\n${plan.timings.map(t => `${t.label}: leave ${clockLabel(t.depart)}, home about ${clockLabel(t.home)} (${t.journey.source} journey)`).join('\n')}\nCheck opening hours and travel before leaving.`;
}
