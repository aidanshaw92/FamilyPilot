import { FamilyProfile } from '@/src/types';
import { DayRequest, MatchableVenueFacts } from '@/src/types/day-request';
import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';

export interface Routine { id: string; label: string; kind: 'nap' | 'feed'; time: string; durationMinutes: number; atHome: boolean }
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

export function clockMinutes(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Enter times as HH:MM, for example 09:30.');
  const [h, m] = value.split(':').map(Number); return h * 60 + m;
}
export function clockLabel(minutes: number): string {
  const day = Math.floor(minutes / 1440); const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}${day > 0 ? ' next day' : ''}`;
}
export function familyRequest(family: PlanningFamily, environment: PlanningOptions['environment']): DayRequest {
  const constraints: DayRequest['constraints'] = {
    childAgeFit: { strength: 'required', value: 'in_range' },
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
    // Every child must fall within the explicitly documented range; overlap is insufficient.
    if (family.ages.length && (facts.minRecommendedAge == null || facts.maxRecommendedAge == null || family.ages.some(age => age < facts.minRecommendedAge! || age > facts.maxRecommendedAge!))) return null;
    const match = matchVenueToDayRequest({ ...facts, driveMinutes: journey.outbound }, familyRequest(family, options.environment));
    return match.eligible ? match : null;
  });
  if (evaluations.some(e => !e)) return null;
  const maxOut = Math.max(...families.map(f => journeys[f.id].outbound));
  const intervals = families.map(f => f.routines.map(r => {
    if (!Number.isFinite(r.durationMinutes) || r.durationMinutes < 1 || r.durationMinutes > 240) throw new Error('Routine duration must be 1–240 minutes.');
    return { ...r, start: clockMinutes(r.time), end: clockMinutes(r.time) + r.durationMinutes };
  }));
  for (let start = earliest + maxOut + options.bufferMinutes; start + options.visitMinutes <= deadline; start += 5) {
    const end = start + options.visitMinutes;
    const timings: FamilyTiming[] = [];
    let fits = true;
    families.forEach((family, i) => {
      const journey = journeys[family.id];
      const depart = start - journey.outbound - options.bufferMinutes;
      const home = end + journey.inbound + options.bufferMinutes;
      const conflicts = intervals[i].some(r => r.atHome && depart < r.end && home > r.start);
      const travelConflict = intervals[i].some(r => !r.atHome &&
        ((depart < r.end && start > r.start) || (end < r.end && home > r.start)));
      if (home > deadline || conflicts || travelConflict || depart < earliest) { fits = false; return; }
      const nextHome = intervals[i].filter(r => r.atHome && r.start >= home).sort((a,b) => a.start-b.start)[0];
      const bound = Math.min(deadline, nextHome?.start ?? deadline);
      const latestDeparture = bound - journey.inbound - journey.outbound - options.bufferMinutes*2 - options.visitMinutes;
      const notes = intervals[i].filter(r => !r.atHome && r.start >= depart && r.start < home).map(r => `${r.label || r.kind}: ${r.time} while out; allow ${r.durationMinutes} minutes within your visit and check facilities.`);
      if (nextHome) notes.push(`Home before ${nextHome.label || nextHome.kind} at ${nextHome.time}.`);
      timings.push({ familyId: family.id, label: family.label, depart, arrive: start, leaveVenue: end, home, latestDeparture, journey, notes });
    });
    if (!fits) continue;
    const drives = families.map(f => journeys[f.id].outbound);
    const fairnessGap = Math.max(...drives) - Math.min(...drives);
    const unknowns = [...new Set(evaluations.flatMap(e => e!.evaluations.filter(v => v.outcome === 'unknown').map(v => `${v.field}: not confirmed`)))];
    return { venueId: facts.placeId, name: facts.name, timings, start, end, fairnessGap,
      reasons: ['Required facilities and age range checked for every family.', families.length > 1 ? `${fairnessGap} minute difference between outbound journeys.` : 'Fits your selected travel limit.', 'Fits the home routines you entered.'],
      unknowns, score: evaluations.reduce((sum,e) => sum+e!.preferredPoints-e!.preferredUnknowns-e!.preferredUnsuitable*2,0)*10 - fairnessGap - Math.max(...drives)*0.25 - (start-earliest)*0.05 };
  }
  return null;
}

export function sharePlanText(plan: PlanMatch, date: string): string {
  // Deliberately excludes addresses, coordinates, ages and routine details.
  return `${plan.name}\n${date} · Meet ${clockLabel(plan.start)} · Finish ${clockLabel(plan.end)}\n${plan.timings.map(t => `${t.label}: leave ${clockLabel(t.depart)}, home about ${clockLabel(t.home)} (${t.journey.source} journey)`).join('\n')}\nCheck opening hours and travel before leaving.`;
}
