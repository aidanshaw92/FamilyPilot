import type { FamilyProfile } from '@/src/types';

/**
 * Preferences a parent has CHOSEN, as opposed to values the app filled in.
 *
 * The rule this module exists for: an untouched system default must never become a user restriction. A family that has not
 * said how far it will travel has no travel limit (the journey time is still shown, and may order places by proximity), and
 * a family that has not said what it will spend has no budget (no place is cut, capped or marked down for its price).
 * Before this, every profile was created with a 30 minute limit and a "moderate" budget that nobody chose, and a 34 minute
 * place was cautioned and ranked down as "4 minutes over the limit we're using".
 *
 * Both preferences are therefore optional on the profile: absent or null is "not set". These helpers are the one place that
 * reads them, so no screen or service can quietly fall back to a number.
 */

export type BudgetTier = NonNullable<FamilyProfile['budgetTier']>;

/** The smallest and largest limits a parent can state. Anything outside is not a limit anyone chose. */
export const MIN_DRIVE_LIMIT_MINUTES = 5;
export const MAX_DRIVE_LIMIT_MINUTES = 120;

/** The journey limit the family stated, in minutes, or null when none was stated. Never a default. */
export function driveLimitMinutes(source: { maxDriveMinutes?: number | null } | null | undefined): number | null {
  const value = source?.maxDriveMinutes;
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_DRIVE_LIMIT_MINUTES && value <= MAX_DRIVE_LIMIT_MINUTES
    ? Math.round(value)
    : null;
}

/** The budget the family stated, or null when none was stated. */
export function budgetTierOf(source: { budgetTier?: string | null } | null | undefined): BudgetTier | null {
  const value = source?.budgetTier;
  return value === 'budget' || value === 'moderate' || value === 'premium' ? value : null;
}

/**
 * What every profile used to be created with. Before this change a stored 30 minutes or "moderate" could be a parent's
 * answer or the app's, and nothing recorded which. Anything ELSE (15, 45, 60, "budget", "premium") can only have been
 * chosen, so it is kept.
 */
export const LEGACY_DEFAULT_DRIVE_MINUTES = 30;
export const LEGACY_DEFAULT_BUDGET: BudgetTier = 'moderate';

/**
 * A stored profile with the ambiguous legacy defaults taken out: exactly 30 minutes and exactly "moderate" are treated as
 * "not set". The cost of being wrong is one tap (a parent who really did choose 30 minutes can choose it again, and it is
 * then kept as a choice); the cost of keeping them is a restriction nobody asked for. Explicit values are untouched.
 */
export function withoutLegacyDefaults<T extends { maxDriveMinutes?: number | null; budgetTier?: string | null }>(profile: T): T {
  const { maxDriveMinutes, budgetTier, ...rest } = profile;
  const keepDrive = maxDriveMinutes != null && maxDriveMinutes !== LEGACY_DEFAULT_DRIVE_MINUTES;
  const keepBudget = budgetTier != null && budgetTier !== LEGACY_DEFAULT_BUDGET;
  return {
    ...rest,
    ...(keepDrive ? { maxDriveMinutes } : {}),
    ...(keepBudget ? { budgetTier } : {}),
  } as T;
}

/** What "add a family by postcode" used to store for a family it knew nothing about, as the planner's largest allowed limit. */
const LEGACY_UNKNOWN_FAMILY_DRIVE_MINUTES = 120;

/**
 * A stored planning family with the values the app, not the family, put there taken out. Besides the 30 minutes and
 * "moderate" every profile used to start with, a family added by postcode was stored with a 120 minute placeholder.
 * Everything else was typed by someone and is kept.
 */
export function planningFamilyWithoutLegacyDefaults<T extends { id?: string; maxDriveMinutes?: number | null; budgetTier?: string | null }>(family: T): T {
  const cleaned = withoutLegacyDefaults(family);
  if (cleaned.maxDriveMinutes === LEGACY_UNKNOWN_FAMILY_DRIVE_MINUTES && String(family.id ?? '').startsWith('guest-')) {
    const { maxDriveMinutes: _placeholder, ...rest } = cleaned;
    return rest as T;
  }
  return cleaned;
}
