import { planningFamilyWithoutLegacyDefaults } from '@/src/utils/preferences';

/**
 * Bringing stored planning state up to the current shape (kept apart from the store, which reaches React Native, so it is
 * tested directly).
 *
 * Version 1 stops applying values the app, not the family, may have put there: a journey limit of 30 minutes and a "moderate"
 * budget on the saved families (the same ambiguous defaults a profile used to start with) and the 120 minute placeholder a
 * family added by postcode used to be given. Those are SET ASIDE under `unconfirmedPreferences`, not deleted, and nothing
 * applies them. The remembered start time is cleared: the plan sheet used to store it whether or not the parent had touched
 * it (so a start worked out from the clock came back as if it were their usual one), and it is re-chosen for every plan.
 * Anything typed and unambiguous is kept as it is.
 */
export const PLANNING_STATE_VERSION = 1;

export function migratePlanningState<T>(persisted: unknown, fromVersion: number, recordedAt: string = new Date().toISOString()): T {
  const state = (persisted ?? {}) as { families?: unknown[]; options?: Record<string, unknown> };
  if (fromVersion >= PLANNING_STATE_VERSION) return state as T;
  return {
    ...state,
    families: (state.families ?? []).map((f) => planningFamilyWithoutLegacyDefaults(f as { id?: string }, recordedAt)),
    options: { ...(state.options ?? {}), leaveAt: '' },
  } as T;
}
