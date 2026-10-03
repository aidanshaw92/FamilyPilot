import { FamilyMember, FamilyProfile } from '@/src/types';

/**
 * The ONE place a date of birth becomes an age.
 *
 * A child's age used to be a number a parent typed once and that every screen then trusted, so it went
 * stale on the first birthday and nothing ever noticed. Ages are now derived: from `dateOfBirth`, in
 * whole calendar months (a baby's age is exact, a child's years are `floor(months / 12)`), against the
 * clock at the moment of reading.
 *
 * Only a date a parent actually entered is trusted (`dobKnown`). A profile that predates this has an
 * invented date of birth; deriving from it would turn a guess into a fact, so those members keep their
 * stored age and are asked for the real date instead.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface ParsedDate {
  year: number;
  month: number;
  day: number;
}

/** A real calendar date in `YYYY-MM-DD`, or null. Rejects 2026-02-30 rather than rolling it over. */
export function parseIsoDate(value: unknown): ParsedDate | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return { year, month, day };
}

export interface AgeParts {
  years: number;
  /** Months since the last birthday, 0 to 11. */
  months: number;
  /** Whole months since birth: the figure the age-suitability evaluator works in. */
  totalMonths: number;
}

/**
 * Whole calendar months between a date of birth and `now`, in the device's local calendar.
 * A month counts once its day-of-month has been reached, so on 15 March a child born 16 December is
 * still 2 months old. Null for an invalid date or one in the future.
 */
export function ageFromDob(dateOfBirth: unknown, now: Date = new Date()): AgeParts | null {
  const dob = parseIsoDate(dateOfBirth);
  if (!dob) return null;

  let totalMonths = (now.getFullYear() - dob.year) * 12 + (now.getMonth() + 1 - dob.month);
  if (now.getDate() < dob.day) totalMonths -= 1;
  if (totalMonths < 0) return null;

  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12, totalMonths };
}

/** The oldest a child can be and still be planned for here: under 18. */
export const MAX_CHILD_YEARS = 17;

export type DobProblem = 'invalid' | 'future' | 'too-old';

/** Why a date of birth cannot be accepted for a child, or null when it can. */
export function childDobProblem(dateOfBirth: unknown, now: Date = new Date()): DobProblem | null {
  const dob = parseIsoDate(dateOfBirth);
  if (!dob) return 'invalid';
  const age = ageFromDob(dateOfBirth, now);
  if (!age) return 'future';
  if (age.years > MAX_CHILD_YEARS) return 'too-old';
  return null;
}

/** A child member with `age` and `ageMonths` brought up to `now`, when its date of birth is trusted. */
export function withDerivedAge(member: FamilyMember, now: Date = new Date()): FamilyMember {
  if (member.role !== 'child' || !member.dobKnown) return member;
  const age = ageFromDob(member.dateOfBirth, now);
  if (!age) return member;
  const ageMonths = age.years === 0 ? age.months : null;
  if (member.age === age.years && (member.ageMonths ?? null) === ageMonths) return member;
  return { ...member, age: age.years, ageMonths };
}

/**
 * The profile as every consumer should see it: every child's age current. Returns the same object when
 * nothing changed, so memoised readers do not re-run for no reason.
 */
export function withDerivedAges(profile: FamilyProfile, now: Date = new Date()): FamilyProfile {
  const members = profile.members ?? [];
  const next = members.map((member) => withDerivedAge(member, now));
  return next.some((member, index) => member !== members[index]) ? { ...profile, members: next } : profile;
}

/** The members of a profile who are children and whose date of birth is invented or missing. */
export function childrenNeedingBirthday(profile: Pick<FamilyProfile, 'members'>): FamilyMember[] {
  return (profile.members ?? []).filter((member) => member.role === 'child' && !member.dobKnown);
}
