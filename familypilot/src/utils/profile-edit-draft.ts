import { ChildMobility, FamilyMember, FamilyProfile, FamilyRoutine } from '@/src/types';
import { ageFromDob, childDobProblem } from './child-age';
import { childAgeMonths } from '@/src/services/matching/age-suitability';
import {
  DraftChild,
  blankChild,
  draftDob,
  draftDobMessage,
  questionsFor,
  routinesFor,
} from './onboarding-draft';

/**
 * Edit profile over the same child model as onboarding, so the two screens cannot drift.
 *
 * Two things the old editor got wrong are the reason this exists. It rebuilt every child with a new id
 * on every save, which would detach each routine from its child and drop their mobility and date of
 * birth the first time a parent changed anything. And it only knew an age, so it had no way to ask a
 * legacy child for the real birthday. Here a child keeps their id; an existing child who has no real date
 * of birth keeps the age they were saved with until a parent enters one; and nothing is ever made up.
 */

export interface EditChild extends DraftChild {
  /** The age a legacy child was saved with, kept until a real date of birth replaces it. */
  legacy: { age: number; ageMonths: number | null } | null;
}

export function editChildFromMember(member: FamilyMember, routines: readonly FamilyRoutine[] | undefined): EditChild {
  const owned = (routines ?? []).filter((r) => r.childId === member.id);
  const feedTimes = owned.filter((r) => r.kind === 'feed').map((r) => r.time).sort();
  const known = member.dobKnown === true && draftDobParts(member.dateOfBirth);
  return {
    ...blankChild(),
    id: member.id,
    name: member.name,
    day: known ? known.day : '',
    month: known ? known.month : '',
    year: known ? known.year : '',
    mobility: [...(member.mobility ?? [])],
    naps: owned
      .filter((r) => r.kind === 'nap')
      .map((r) => ({ id: r.id, time: r.time, durationMinutes: r.durationMinutes })),
    feedMode: feedTimes.length > 0 ? 'times' : 'none',
    feedTimes,
    legacy: known ? null : { age: member.age, ageMonths: member.ageMonths ?? null },
  };
}

function draftDobParts(iso: string): { day: string; month: string; year: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? { year: match[1], month: match[2], day: match[3] } : null;
}

const blankDate = (c: Pick<DraftChild, 'day' | 'month' | 'year'>) => c.day === '' && c.month === '' && c.year === '';

/** What is wrong with one child as typed, or null. A legacy child may leave the date empty and keep their age. */
export function editChildProblem(child: EditChild, now: Date = new Date()): string | null {
  if (!child.name.trim()) return 'Please add a name';
  if (child.legacy && blankDate(child)) return null;
  return draftDobMessage(child, now, { final: true });
}

export interface AppliedChildren {
  members: FamilyMember[];
  routines: FamilyRoutine[];
}

/**
 * The children and routines to store. `unowned` are routines saved before routines had an owner; they are
 * kept exactly as they were, never assigned to a child on a guess.
 */
export function applyEditedChildren(
  profile: Pick<FamilyProfile, 'members'>,
  drafts: readonly EditChild[],
  unowned: readonly FamilyRoutine[],
  now: Date = new Date(),
): AppliedChildren {
  const members: FamilyMember[] = [];
  const routines: FamilyRoutine[] = [...unowned];

  for (const draft of drafts) {
    if (!draft.name.trim()) continue;
    const existing = profile.members.find((m) => m.id === draft.id && m.role === 'child');
    const iso = draftDob(draft);
    const validDob = iso != null && childDobProblem(iso, now) == null;

    let member: FamilyMember | null = null;
    if (validDob) {
      const parts = ageFromDob(iso, now)!;
      member = {
        ...(existing ?? { id: draft.id, role: 'child' as const }),
        name: draft.name.trim(),
        role: 'child',
        dateOfBirth: iso,
        dobKnown: true,
        age: parts.years,
        ageMonths: parts.years === 0 ? parts.months : null,
      };
    } else if (existing) {
      member = { ...existing, name: draft.name.trim() };
    }
    if (!member) continue;

    const questions = questionsFor(childAgeMonths(member));
    const allowed: ChildMobility[] = questions.mobilityOptions;
    member.mobility = allowed.filter((option) => draft.mobility.includes(option));
    members.push(member);
    routines.push(...routinesFor(draft, member, questions));
  }

  return { members, routines };
}
