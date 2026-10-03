import { ChildMobility, FamilyMember, FamilyProfile, FamilyRoutine } from '@/src/types';
import { AgeParts, ageFromDob, childDobProblem, parseIsoDate } from './child-age';
import { createChildFromDob, createParentMember, withCompletion } from './profile-defaults';
import {
  DEFAULT_NAP_MINUTES,
  createFeed,
  createNap,
  expandFeedInterval,
  toMinutes,
} from './routine-schedule';

/**
 * What a parent has typed into the onboarding screens, and the single function that turns it into a
 * profile.
 *
 * Kept out of the screen so the adaptive rules (which questions a baby, a toddler and an older child
 * are asked) and the build (derived age, sanitised answers, expanded feeds) are tested directly instead
 * of through a rendered form. The screen is a thin editor over these drafts.
 */

export interface DraftNap {
  id: string;
  time: string;
  durationMinutes: number;
}

export type FeedMode = 'none' | 'times' | 'interval';

export interface DraftChild {
  id: string;
  name: string;
  /** Typed as three boxes; held as strings so a half-typed date is never coerced. */
  day: string;
  month: string;
  year: string;
  mobility: ChildMobility[];
  naps: DraftNap[];
  feedMode: FeedMode;
  feedTimes: string[];
  feedFirst: string;
  feedEveryHours: number;
}

let draftCounter = 0;
export function newDraftId(prefix: string): string {
  draftCounter += 1;
  return `${prefix}-${Date.now().toString(36)}${draftCounter.toString(36)}`;
}

export function blankChild(): DraftChild {
  return {
    id: newDraftId('child'),
    name: '',
    day: '',
    month: '',
    year: '',
    mobility: [],
    naps: [],
    feedMode: 'none',
    feedTimes: [],
    feedFirst: '07:00',
    feedEveryHours: 4,
  };
}

export const NAP_LENGTHS = [60, 90, 120] as const;
export const FEED_INTERVAL_HOURS = [2, 3, 4, 5] as const;
export const MAX_CHILDREN = 6;
export const MAX_NAPS = 4;
export const MAX_FEED_TIMES = 6;

export function newNap(): DraftNap {
  return { id: newDraftId('nap'), time: '13:00', durationMinutes: DEFAULT_NAP_MINUTES };
}

/** ----- the date of birth boxes ----- */

const pad = (value: string) => value.padStart(2, '0');

/** `YYYY-MM-DD` when the three boxes hold a real calendar date, else null. */
export function draftDob(child: Pick<DraftChild, 'day' | 'month' | 'year'>): string | null {
  const { day, month, year } = child;
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) return null;
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  return parseIsoDate(iso) ? iso : null;
}

export type DobMessage = string | null;

/**
 * What to tell the parent about the date they typed. Silent while the boxes are still being filled
 * (nobody wants "invalid" shown after one digit); specific once all three are present.
 */
export function draftDobMessage(
  child: Pick<DraftChild, 'day' | 'month' | 'year'>,
  now: Date = new Date(),
  opts: { final?: boolean } = {},
): DobMessage {
  const { day, month, year } = child;
  const touched = day !== '' || month !== '' || year !== '';
  const complete = day !== '' && month !== '' && year.length === 4;
  if (!touched) return opts.final ? 'Add a date of birth' : null;
  if (!complete) return opts.final ? 'Add the day, month and year' : null;
  const iso = draftDob(child);
  if (!iso) return 'That date doesn’t look right';
  const problem = childDobProblem(iso, now);
  if (problem === 'future') return 'That date is in the future';
  if (problem === 'too-old') return 'FamilyPilot plans days out for children under 18';
  return null;
}

export function draftAge(child: DraftChild, now: Date = new Date()): AgeParts | null {
  const iso = draftDob(child);
  if (!iso || childDobProblem(iso, now)) return null;
  return ageFromDob(iso, now);
}

/** "8 months", "2 years 3 months", "6 years": how a parent says it, and exact for a baby. */
export function describeAge(age: AgeParts): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (age.totalMonths < 24) return plural(age.totalMonths, 'month');
  if (age.years < 4 && age.months > 0) return `${plural(age.years, 'year')} ${plural(age.months, 'month')}`;
  return plural(age.years, 'year');
}

/** ----- which questions each child is asked ----- */

export interface ChildQuestions {
  mobilityOptions: ChildMobility[];
  asksNaps: boolean;
  asksFeeds: boolean;
}

/** A baby is not asked whether they walk; a six-year-old is not asked about naps, feeds or a carrier. */
export function questionsFor(totalMonths: number): ChildQuestions {
  const mobilityOptions: ChildMobility[] =
    totalMonths < 12
      ? ['carrier', 'buggy', 'mobility-aid']
      : totalMonths < 48
        ? ['walks', 'buggy', 'carrier', 'mobility-aid']
        : ['walks', 'buggy', 'mobility-aid'];
  return { mobilityOptions, asksNaps: totalMonths < 48, asksFeeds: totalMonths < 36 };
}

/** Whether any child needs the naps-and-feeds step, so the step is skipped entirely for older children. */
export function anyRoutineQuestions(children: DraftChild[], now: Date = new Date()): boolean {
  return children.some((child) => {
    const age = draftAge(child, now);
    if (!age) return false;
    const q = questionsFor(age.totalMonths);
    return q.asksNaps || q.asksFeeds;
  });
}

/** ----- building the profile ----- */

function validTime(value: string): boolean {
  return toMinutes(value) != null;
}

export function routinesFor(draft: DraftChild, member: FamilyMember, questions: ChildQuestions): FamilyRoutine[] {
  const routines: FamilyRoutine[] = [];

  if (questions.asksNaps) {
    const seen = new Set<string>();
    for (const nap of draft.naps.slice(0, MAX_NAPS)) {
      if (!validTime(nap.time) || seen.has(nap.time)) continue;
      seen.add(nap.time);
      routines.push(createNap(member, nap.time, nap.durationMinutes));
    }
  }

  if (questions.asksFeeds) {
    let times: string[] = [];
    if (draft.feedMode === 'times') {
      times = [...new Set(draft.feedTimes.filter(validTime))].slice(0, MAX_FEED_TIMES);
    } else if (draft.feedMode === 'interval') {
      times = expandFeedInterval(draft.feedFirst, draft.feedEveryHours * 60);
    }
    for (const time of times.sort()) routines.push(createFeed(member, time));
  }

  return routines;
}

export interface OnboardingInput {
  parentName: string;
  homeLocation: string;
  home: { latitude: number; longitude: number };
  children: DraftChild[];
  now?: Date;
}

/**
 * The profile onboarding produces. Children without a valid date of birth or a name are left out,
 * answers a child's age no longer allows (a carrier for a six-year-old after the date was edited) are
 * dropped, and the drive and budget defaults are the ones every consumer already expects.
 */
export function buildOnboardingProfile(input: OnboardingInput): FamilyProfile {
  const now = input.now ?? new Date();
  const members: FamilyMember[] = [];
  const routines: FamilyRoutine[] = [];

  for (const draft of input.children) {
    const dob = draftDob(draft);
    if (!draft.name.trim() || !dob) continue;
    const member = createChildFromDob(draft.name, dob, [], now);
    if (!member) continue;
    const questions = questionsFor(ageFromDob(dob, now)?.totalMonths ?? 0);
    member.mobility = questions.mobilityOptions.filter((option) => draft.mobility.includes(option));
    members.push(member);
    routines.push(...routinesFor(draft, member, questions));
  }

  return withCompletion({
    id: `family-${now.getTime()}`,
    parentName: input.parentName.trim(),
    members: [createParentMember(input.parentName), ...members],
    homeLocation: input.homeLocation.trim(),
    homeLatitude: input.home.latitude,
    homeLongitude: input.home.longitude,
    // Not asked at the start: these are what a family wants on a given day. The defaults keep every
    // consumer working, and Home, Explore and Profile are where they are changed.
    budgetTier: 'moderate',
    maxDriveMinutes: 30,
    completionPercent: 0,
    vehicle: null,
    pushchair: null,
    travelCot: null,
    memberships: [],
    routines,
  });
}
