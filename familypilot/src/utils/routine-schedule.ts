import { FamilyMember, FamilyProfile, FamilyRoutine } from '@/src/types';
import { childAgeMonths } from '@/src/services/matching/age-suitability';

/**
 * Per-child naps and feeds, and how they reach the planner.
 *
 * The planner still reads one flat list of `FamilyRoutine`; this module owns
 * how that list is built (several naps and feeds per child, a feed interval expanded into discrete
 * times) and how each entry is named. A routine belongs to a child by `childId`, and its label is
 * resolved from the child's *current* name when it is read, so renaming Mia never leaves "Maia's nap"
 * behind and "Leave by 12:15 to be home in time for Mia's nap" is true to the profile as it is now.
 */

const MINUTES_PER_DAY = 24 * 60;
/** Feeds are not expanded past this time: an interval never schedules a bottle at midnight. */
const LAST_EXPANDED_FEED_MINUTES = 21 * 60 + 30;
/** More than this many repeated feeds is a typo, not a routine. */
export const MAX_EXPANDED_FEEDS = 8;
export const DEFAULT_NAP_MINUTES = 90;
export const DEFAULT_FEED_MINUTES = 30;

export function toMinutes(clock: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function fromMinutes(total: number): string {
  const wrapped = ((Math.round(total) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * A feed under a year is a "feed"; an older child has a "meal". The label is the only place the
 * distinction shows, and it is what a parent reads in "home in time for Theo's meal".
 */
export function feedNoun(member: Pick<FamilyMember, 'age' | 'ageMonths'>): 'feed' | 'meal' {
  return childAgeMonths(member) < 12 ? 'feed' : 'meal';
}

function possessive(name: string): string {
  return `${name}’s`;
}

export function routineLabel(
  routine: Pick<FamilyRoutine, 'kind' | 'label' | 'childId'>,
  members: readonly FamilyMember[] | undefined,
): string {
  const child = routine.childId ? (members ?? []).find((m) => m.id === routine.childId && m.role === 'child') : undefined;
  const name = child?.name.trim();
  if (child && name) {
    return `${possessive(name)} ${routine.kind === 'nap' ? 'nap' : feedNoun(child)}`;
  }
  return routine.label?.trim() || (routine.kind === 'nap' ? 'nap' : 'feed');
}

/** The profile's routines with each label resolved against the children as they are now. */
export function resolveRoutines(
  profile: Pick<FamilyProfile, 'routines' | 'members'>,
): FamilyRoutine[] {
  return (profile.routines ?? []).map((routine) => ({
    ...routine,
    label: routineLabel(routine, profile.members),
  }));
}

/**
 * The routines as the PLANNER receives them: times and lengths, with no child's name and no child id.
 *
 * The planning workspace is a separate model from the family profile, and a parent can back it up to
 * their account ("Back up this device's plans and routines"). The profile itself never leaves the device,
 * so a child's name written into a planner routine label ("Mia's nap") would carry it out with that
 * backup. A routine that belongs to a child therefore reaches the planner under its plain kind; a
 * routine saved before routines had an owner keeps whatever label the parent gave it. The named wording
 * is for screens that read the local profile (Family Fit's leave-by line, Profile).
 */
export function routinesForPlanner(profile: Pick<FamilyProfile, 'routines'>): FamilyRoutine[] {
  return (profile.routines ?? []).map((routine) => {
    if (!routine.childId) return { ...routine };
    const { childId: _childId, ...rest } = routine;
    return { ...rest, label: routine.kind === 'nap' ? 'Nap' : 'Feed' };
  });
}

export function routinesForChild(
  routines: readonly FamilyRoutine[] | undefined,
  childId: string,
): FamilyRoutine[] {
  return (routines ?? []).filter((routine) => routine.childId === childId);
}

let counter = 0;
function routineId(kind: FamilyRoutine['kind'], childId: string): string {
  counter += 1;
  return `${kind}-${childId}-${Date.now().toString(36)}${counter.toString(36)}`;
}

export function createNap(
  child: Pick<FamilyMember, 'id' | 'name'>,
  time: string,
  durationMinutes: number = DEFAULT_NAP_MINUTES,
): FamilyRoutine {
  return {
    id: routineId('nap', child.id),
    label: `${possessive(child.name.trim() || 'Your child')} nap`,
    kind: 'nap',
    time,
    durationMinutes,
    atHome: true,
    childId: child.id,
  };
}

export function createFeed(
  child: Pick<FamilyMember, 'id' | 'name' | 'age' | 'ageMonths'>,
  time: string,
  durationMinutes: number = DEFAULT_FEED_MINUTES,
): FamilyRoutine {
  return {
    id: routineId('feed', child.id),
    label: `${possessive(child.name.trim() || 'Your child')} ${feedNoun(child)}`,
    kind: 'feed',
    time,
    durationMinutes,
    atHome: true,
    childId: child.id,
  };
}

/**
 * "Every 4 hours from 07:00" as the discrete times a planner can use: 07:00, 11:00, 15:00, 19:00.
 * Stops at 21:30 and at MAX_EXPANDED_FEEDS. Returns [] for an unusable start or interval rather
 * than guessing; an interval under 30 minutes is not a schedule.
 */
export function expandFeedInterval(firstTime: string, everyMinutes: number): string[] {
  const start = toMinutes(firstTime);
  if (start == null || !Number.isFinite(everyMinutes) || everyMinutes < 30) return [];
  const times: string[] = [];
  for (let at = start; at <= LAST_EXPANDED_FEED_MINUTES && times.length < MAX_EXPANDED_FEEDS; at += everyMinutes) {
    times.push(fromMinutes(at));
  }
  return times;
}
