import type { PlanViewModelInput } from '@/src/services/planning/plan-view-model';

/**
 * Saving a generated day so that "Saved" is true when it is said.
 *
 * The plan screen used to flip its button to "Saved" the moment the day reached the in-memory store; whether it reached
 * the phone's storage (and so would still be there tomorrow) was never checked. Now the day is written, the write is
 * confirmed by reading it back from storage, and only then is it reported saved. A failed write is rolled back out of
 * memory too, so the Plans list never shows a plan that will vanish on the next launch.
 *
 * Idempotent: the same day saved again is recognised (by its content, not by a fresh id) and reported as already saved,
 * with the id it already has, so "View plan" opens that one and no duplicate is made.
 */

export type SaveOutcome =
  | { status: 'saved'; id: string }
  | { status: 'already'; id: string }
  | { status: 'failed'; message: string };

export interface SavedDayLike {
  id: string;
  createdAt: string;
  source: PlanViewModelInput;
}

export interface SavePlanDeps {
  existing: readonly SavedDayLike[];
  saveDay: (day: SavedDayLike) => void;
  deleteDay: (id: string) => void;
  /** The raw persisted planning state, as storage holds it now. */
  readStored: () => Promise<string | null>;
  newId?: () => string;
  now?: () => string;
  /** How many times to look for the write before calling it failed (the store writes asynchronously). */
  attempts?: number;
  wait?: (ms: number) => Promise<void>;
}

/** A stable key for a day's content, so the same day is recognised however it was reached. */
export function planContentKey(source: PlanViewModelInput): string {
  return JSON.stringify(source);
}

export function alreadySavedId(source: PlanViewModelInput, existing: readonly SavedDayLike[]): string | null {
  const key = planContentKey(source);
  return existing.find((day) => planContentKey(day.source) === key)?.id ?? null;
}

export const SAVE_FAILED_MESSAGE = 'We couldn’t save this plan on this phone. Please try again.';

export async function savePlanDurably(source: PlanViewModelInput, deps: SavePlanDeps): Promise<SaveOutcome> {
  const already = alreadySavedId(source, deps.existing);
  if (already) return { status: 'already', id: already };

  const id = (deps.newId ?? (() => `day-${Date.now()}`))();
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  try {
    deps.saveDay({ id, createdAt: (deps.now ?? (() => new Date().toISOString()))(), source });
    for (let attempt = 0; attempt < (deps.attempts ?? 10); attempt += 1) {
      const stored = await deps.readStored();
      if (stored && stored.includes(`"id":"${id}"`)) return { status: 'saved', id };
      await wait(50);
    }
  } catch {
    // Storage refused (full, unavailable, private browsing): fall through to the rollback.
  }
  deps.deleteDay(id);
  return { status: 'failed', message: SAVE_FAILED_MESSAGE };
}
