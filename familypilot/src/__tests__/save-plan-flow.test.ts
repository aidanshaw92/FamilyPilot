import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SAVE_FAILED_MESSAGE, alreadySavedId, planContentKey, savePlanDurably, SavedDayLike } from '@/src/services/planning/save-plan';
import type { PlanViewModelInput } from '@/src/services/planning/plan-view-model';

/**
 * Saving a plan must feel complete, and must be true.
 *
 * Real-device run: "Save this plan" turned into "Saved", with no sense that anything had happened or where the plan had
 * gone, and the button said so before the day had reached the phone's storage. Now: saved is said only once the write
 * is confirmed; a failed write is rolled back and said plainly; the same day twice is recognised; and the confirmation
 * offers "View plan", which opens THAT plan in Plans.
 */
const source = (name: string): PlanViewModelInput => ({
  itinerary: { date: '2026-10-07', stops: [{ name, arrive: 600, depart: 750, role: 'activity' }], families: [], legs: [] } as never,
  travel: {} as never,
  caveats: [],
  anchorName: name,
});

/** A planning store and its storage, where the storage can be told to refuse. */
function harness(options: { refuse?: boolean; lag?: number } = {}) {
  let days: SavedDayLike[] = [];
  let stored: string | null = JSON.stringify({ state: { savedDays: [] } });
  let writes = 0;
  const persist = () => {
    writes += 1;
    if (options.refuse) return;
    const snapshot = JSON.stringify({ state: { savedDays: days } });
    if (options.lag) setTimeout(() => (stored = snapshot), options.lag);
    else stored = snapshot;
  };
  return {
    get days() { return days; },
    get writes() { return writes; },
    deps: () => ({
      existing: days,
      saveDay: (day: SavedDayLike) => { days = [day, ...days.filter((d) => d.id !== day.id)]; persist(); },
      deleteDay: (id: string) => { days = days.filter((d) => d.id !== id); persist(); },
      readStored: async () => stored,
      wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.min(ms, 5))),
    }),
  };
}

let seq = 0;
const ids = () => `day-test-${++seq}`;

describe('saving a plan', () => {
  it('success: saved only once storage holds it', async () => {
    const h = harness({ lag: 15 });
    const outcome = await savePlanDurably(source('RAF Museum'), { ...h.deps(), newId: ids });
    expect(outcome.status).toBe('saved');
    expect(h.days.map((d) => d.source.anchorName)).toEqual(['RAF Museum']);
  });

  it('failure: storage refuses, so it is not saved, is rolled back, and says so', async () => {
    const h = harness({ refuse: true });
    const outcome = await savePlanDurably(source('RAF Museum'), { ...h.deps(), newId: ids, attempts: 3 });
    expect(outcome).toEqual({ status: 'failed', message: SAVE_FAILED_MESSAGE });
    expect(h.days).toEqual([]);
  });

  it('failure: storage throws, same answer', async () => {
    const h = harness();
    const outcome = await savePlanDurably(source('RAF Museum'), { ...h.deps(), newId: ids, readStored: async () => { throw new Error('quota'); } });
    expect(outcome.status).toBe('failed');
    expect(h.days).toEqual([]);
  });

  it('already saved: the same day is recognised by its content, and no duplicate is made', async () => {
    const h = harness();
    const first = await savePlanDurably(source('RAF Museum'), { ...h.deps(), newId: ids });
    const again = await savePlanDurably(source('RAF Museum'), { ...h.deps(), newId: ids });
    expect(again).toEqual({ status: 'already', id: (first as { id: string }).id });
    expect(h.days).toHaveLength(1);
    expect(alreadySavedId(source('RAF Museum'), h.days)).toBe((first as { id: string }).id);
    expect(alreadySavedId(source('Somewhere else'), h.days)).toBeNull();
  });

  it('a different day is a different plan', async () => {
    const h = harness();
    await savePlanDurably(source('RAF Museum'), { ...h.deps(), newId: ids });
    const other = await savePlanDurably(source('Kentish Town City Farm'), { ...h.deps(), newId: ids });
    expect(other.status).toBe('saved');
    expect(h.days).toHaveLength(2);
    expect(planContentKey(source('a'))).not.toBe(planContentKey(source('b')));
  });

  it('a plan saved survives a reload: what was written is what is read back', async () => {
    const h = harness();
    const outcome = await savePlanDurably(source('RAF Museum'), { ...h.deps(), newId: ids });
    const reloaded = JSON.parse((await h.deps().readStored())!).state.savedDays as SavedDayLike[];
    expect(reloaded.map((d) => d.id)).toEqual([(outcome as { id: string }).id]);
  });
});

describe('the plan screen around it', () => {
  const root = join(__dirname, '..', '..');
  const plan = readFileSync(join(root, 'app/plan.tsx'), 'utf8');
  const screen = readFileSync(join(root, 'src/components/planning/PlanScreenView.tsx'), 'utf8');
  const plans = readFileSync(join(root, 'app/(tabs)/trips.tsx'), 'utf8');

  it('double tap: one save in flight at a time (the ref guards, not state)', () => {
    expect(plan).toContain('if (!readySource || !readyKey || saving.current) return;');
    expect(plan).toContain('saving.current = true;');
  });

  it('says "Plan saved" (or "Already in your plans"), then offers View plan and Add to calendar', () => {
    expect(screen).toContain("{saveState === 'already' ? 'Already in your plans' : 'Plan saved'}");
    expect(screen).toContain('<ArrowCta label="View plan"');
    expect(screen).toContain('Add to calendar');
    expect(screen).toContain("saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Try again' : 'Save this plan'");
  });

  it('a rebuilt day (advice option, lunch added) is unsaved again', () => {
    expect(plan).toContain('const currentSave = saveFor && saveFor.key === readyKey ? saveFor : null;');
  });

  it('View plan opens that saved plan with a plain push, so the phone’s Back and the screen’s Back agree', () => {
    expect(plan).toContain("router.push({ pathname: '/saved-plan', params: { id: keptId, from: 'save' } } as never)");
    // Popping to Plans and pushing the plan over it left Safari's history behind the app: never again.
    expect(plan).not.toMatch(/dismissTo\(/);
  });

  it('from there, "See all your plans" goes on to Plans with the row marked as just saved', () => {
    const saved = readFileSync(join(root, 'app/saved-plan.tsx'), 'utf8');
    expect(saved).toContain("onSeeAllPlans={fromSave ? seeAllPlans : undefined}");
    expect(saved).toContain("params: { justSaved: id }");
    expect(screen).toContain('testID="plan-see-all-plans"');
    expect(plans).toContain("const justSavedParam=typeof params.justSaved==='string'?params.justSaved:null;");
    expect(plans).toContain("testID={fresh?'plans-just-saved':undefined}");
  });
});
