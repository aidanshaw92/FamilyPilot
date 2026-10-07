import { planningFamilyWithoutLegacyDefaults } from '@/src/utils/preferences';

/**
 * Bringing stored planning state up to the current shape (kept apart from the store, which reaches React Native, so it is
 * tested directly).
 *
 * Version 1 removes values the app, not the family, put there: a journey limit of 30 minutes and a "moderate" budget on
 * the saved families (the same ambiguous defaults a profile used to start with), the 120 minute placeholder a family added
 * by postcode used to be given, and the remembered start time, which the plan sheet used to store whether or not the parent
 * had touched it (so a start worked out from the clock came back as if it were their usual one). Anything typed is kept.
 */
export const PLANNING_STATE_VERSION = 1;

export function migratePlanningState<T>(persisted: unknown, fromVersion: number): T {
  const state = (persisted ?? {}) as { families?: unknown[]; options?: Record<string, unknown> };
  if (fromVersion >= PLANNING_STATE_VERSION) return state as T;
  return {
    ...state,
    families: (state.families ?? []).map((f) => planningFamilyWithoutLegacyDefaults(f as { id?: string })),
    options: { ...(state.options ?? {}), leaveAt: '' },
  } as T;
}
