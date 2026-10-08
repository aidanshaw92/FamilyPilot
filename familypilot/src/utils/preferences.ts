import type { FamilyProfile, UnconfirmedPreferences } from '@/src/types';

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
 * chosen, so it is kept as it is.
 */
export const LEGACY_DEFAULT_DRIVE_MINUTES = 30;
export const LEGACY_DEFAULT_BUDGET: BudgetTier = 'moderate';

/** The two values a migration sets aside, and nothing else. */
type WithStash = { unconfirmedPreferences?: UnconfirmedPreferences };
type StashedFields = { maxDriveMinutes?: number | null; budgetTier?: string | null; unconfirmedPreferences?: UnconfirmedPreferences };

/**
 * Sets the ambiguous legacy defaults ASIDE rather than deleting them: exactly 30 minutes and exactly "moderate" can no longer
 * be told from the app's own default, so they stop being a limit or a budget (every reader sees "not set") and are kept under
 * `unconfirmedPreferences`, where nothing reads them but the question put to the parent in Edit Profile. Explicit values
 * (15, 45, 60, "budget", "premium") can only have been chosen and are left exactly as they are.
 *
 * Pure, idempotent (a second pass changes nothing: the stash is not overwritten by the next migration) and reversible:
 * `restoreStashedPreferences` puts both values back where they were.
 */
export function stashLegacyDefaults<T extends StashedFields>(profile: T, recordedAt: string): T & WithStash {
  const { maxDriveMinutes, budgetTier, unconfirmedPreferences: existing, ...rest } = profile;
  const driveAmbiguous = maxDriveMinutes === LEGACY_DEFAULT_DRIVE_MINUTES;
  const budgetAmbiguous = budgetTier === LEGACY_DEFAULT_BUDGET;
  if (!driveAmbiguous && !budgetAmbiguous) return profile;

  const stash: UnconfirmedPreferences = {
    reason: 'legacy-default-or-choice',
    recordedAt: existing?.recordedAt ?? recordedAt,
    ...(existing?.maxDriveMinutes !== undefined ? { maxDriveMinutes: existing.maxDriveMinutes } : {}),
    ...(existing?.budgetTier !== undefined ? { budgetTier: existing.budgetTier } : {}),
    ...(driveAmbiguous ? { maxDriveMinutes: LEGACY_DEFAULT_DRIVE_MINUTES } : {}),
    ...(budgetAmbiguous ? { budgetTier: LEGACY_DEFAULT_BUDGET } : {}),
  };
  return {
    ...rest,
    ...(maxDriveMinutes != null && !driveAmbiguous ? { maxDriveMinutes } : {}),
    ...(budgetTier != null && !budgetAmbiguous ? { budgetTier } : {}),
    unconfirmedPreferences: stash,
  } as unknown as T & WithStash;
}

/** The inverse of `stashLegacyDefaults`: the set-aside values back as the stored ones, the stash gone. */
export function restoreStashedPreferences<T extends StashedFields>(profile: T): T {
  const { unconfirmedPreferences: stash, ...rest } = profile;
  if (!stash) return profile;
  return {
    ...rest,
    ...(stash.maxDriveMinutes !== undefined && rest.maxDriveMinutes == null ? { maxDriveMinutes: stash.maxDriveMinutes } : {}),
    ...(stash.budgetTier !== undefined && rest.budgetTier == null ? { budgetTier: stash.budgetTier } : {}),
  } as T;
}

export type UnconfirmedField = 'maxDriveMinutes' | 'budgetTier';

/** The set-aside value for a field, for the question only. Never a limit: nothing but the Edit Profile prompt calls this. */
export function unconfirmedValue(source: { unconfirmedPreferences?: UnconfirmedPreferences } | null | undefined, field: 'maxDriveMinutes'): number | null;
export function unconfirmedValue(source: { unconfirmedPreferences?: UnconfirmedPreferences } | null | undefined, field: 'budgetTier'): BudgetTier | null;
export function unconfirmedValue(source: { unconfirmedPreferences?: UnconfirmedPreferences } | null | undefined, field: UnconfirmedField): number | BudgetTier | null {
  const stash = source?.unconfirmedPreferences;
  if (!stash) return null;
  if (field === 'maxDriveMinutes') return driveLimitMinutes({ maxDriveMinutes: stash.maxDriveMinutes });
  return budgetTierOf({ budgetTier: stash.budgetTier });
}

/**
 * The parent answered the question for one field (kept the value, chose another, or chose "no limit"): that field's stash
 * is no longer open. The other field's stays until it is answered too; with none left the whole record goes.
 */
export function withoutUnconfirmed<T extends { unconfirmedPreferences?: UnconfirmedPreferences }>(profile: T, answered: readonly UnconfirmedField[]): T {
  const stash = profile.unconfirmedPreferences;
  if (!stash || answered.length === 0) return profile;
  const { maxDriveMinutes, budgetTier, ...meta } = stash;
  const remaining = {
    ...meta,
    ...(maxDriveMinutes !== undefined && !answered.includes('maxDriveMinutes') ? { maxDriveMinutes } : {}),
    ...(budgetTier !== undefined && !answered.includes('budgetTier') ? { budgetTier } : {}),
  } as UnconfirmedPreferences;
  const { unconfirmedPreferences: _gone, ...rest } = profile;
  return (remaining.maxDriveMinutes === undefined && remaining.budgetTier === undefined
    ? rest
    : { ...rest, unconfirmedPreferences: remaining }) as T;
}

/** What "add a family by postcode" used to store for a family it knew nothing about, as the planner's largest allowed limit. */
const LEGACY_UNKNOWN_FAMILY_DRIVE_MINUTES = 120;

/**
 * A stored planning family with the values the app, not the family, put there set aside. Besides the 30 minutes and
 * "moderate" every profile used to start with, a family added by postcode was stored with a 120 minute placeholder. The
 * placeholder is set aside the same way (a typed 120 would be indistinguishable), so nothing is lost.
 */
export function planningFamilyWithoutLegacyDefaults<T extends { id?: string } & StashedFields>(family: T, recordedAt: string): T & WithStash {
  const stashed = stashLegacyDefaults(family, recordedAt);
  if (stashed.maxDriveMinutes === LEGACY_UNKNOWN_FAMILY_DRIVE_MINUTES && String(family.id ?? '').startsWith('guest-')) {
    const { maxDriveMinutes: _placeholder, unconfirmedPreferences: existing, ...rest } = stashed;
    return {
      ...rest,
      unconfirmedPreferences: {
        reason: 'legacy-default-or-choice',
        recordedAt: existing?.recordedAt ?? recordedAt,
        ...(existing ?? {}),
        maxDriveMinutes: LEGACY_UNKNOWN_FAMILY_DRIVE_MINUTES,
      },
    } as unknown as T & WithStash;
  }
  return stashed;
}

/**
 * A connection's shared snapshot read back from the server. A snapshot written before defaults stopped being filled in
 * carries no `preferencesStated` marker, so a 30 minute limit or "moderate" in it cannot be told from the other family's
 * default and is not applied to the plan; any other value was chosen and is. A snapshot with the marker is taken at its word.
 */
export function sharedFamilyPreferences<T extends { maxDriveMinutes?: number | null; budgetTier?: string | null; preferencesStated?: boolean }>(family: T): T {
  if (family.preferencesStated === true) return family;
  const { maxDriveMinutes, budgetTier, ...rest } = family;
  return {
    ...rest,
    ...(maxDriveMinutes != null && maxDriveMinutes !== LEGACY_DEFAULT_DRIVE_MINUTES ? { maxDriveMinutes } : {}),
    ...(budgetTier != null && budgetTier !== LEGACY_DEFAULT_BUDGET ? { budgetTier } : {}),
  } as T;
}
