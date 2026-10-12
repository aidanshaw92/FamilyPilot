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
  /** The answers the day was built from, so it can be edited later. */
  draft?: { venueId: string; params: Record<string, string> };
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
  /** The answers to keep with the day, so it can be edited again. */
  draft?: SavedDayLike['draft'];
  /**
   * An edited saved day: the day with this id is replaced (same id, same place in the list, same created time) rather
   * than a second one being added. Unknown ids save a new day.
   */
  replaceId?: string | null;
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

/** Whether storage holds a day with this id AND this content: an edited day replacing an old one needs both. */
function storedHolds(stored: string | null, id: string, key: string): boolean {
  if (!stored || !stored.includes(`"id":"${id}"`)) return false;
  try {
    const parsed = JSON.parse(stored) as { state?: { savedDays?: SavedDayLike[] } };
    const day = parsed.state?.savedDays?.find((d) => d.id === id);
    return Boolean(day && planContentKey(day.source) === key);
  } catch {
    return false;
  }
}

export async function savePlanDurably(source: PlanViewModelInput, deps: SavePlanDeps): Promise<SaveOutcome> {
  const already = alreadySavedId(source, deps.existing);
  if (already) return { status: 'already', id: already };

  const replacing = deps.replaceId ? deps.existing.find((day) => day.id === deps.replaceId) : undefined;
  const id = replacing ? replacing.id : (deps.newId ?? (() => `day-${Date.now()}`))();
  const createdAt = replacing ? replacing.createdAt : (deps.now ?? (() => new Date().toISOString()))();
  const key = planContentKey(source);
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  try {
    deps.saveDay({ id, createdAt, source, ...(deps.draft ? { draft: deps.draft } : {}) });
    for (let attempt = 0; attempt < (deps.attempts ?? 10); attempt += 1) {
      const stored = await deps.readStored();
      if (storedHolds(stored, id, key)) return { status: 'saved', id };
      await wait(50);
    }
  } catch {
    // Storage refused (full, unavailable, private browsing): fall through to the rollback.
  }
  // Roll back: a new day is removed; an edited day gets its old answer back.
  if (replacing) deps.saveDay(replacing);
  else deps.deleteDay(id);
  return { status: 'failed', message: SAVE_FAILED_MESSAGE };
}
