import { FamilyProfile } from '@/src/types';
import { feedNoun } from '@/src/utils/routine-schedule';

import { RoutineSubject, SubjectResolver } from './routine-advice';

/**
 * Puts names back on routines at the moment a screen is drawn.
 *
 * The planner receives routines with no child's name or id (see `routinesForPlanner`), so a saved day and a backup of
 * the planning workspace carry none either. The routine's own id is kept, though, and the profile on this device still
 * knows which child it belongs to: "nap-<child>-…" → Ozzie, a feed → "feed" under a year and "meal" over it.
 *
 * Only the signed-in household's profile is ever consulted. A connected family's children are not known here and are
 * never guessed: their routines read as "the nap for Hannah’s family".
 */
export function makeSubjectResolver(
  profile: Pick<FamilyProfile, 'routines' | 'members'> | null | undefined,
  families: { id: string; label: string }[],
  mineId = 'mine',
): SubjectResolver {
  return (familyId, routineId, kind): RoutineSubject => {
    const family = families.find((f) => f.id === familyId);
    const yours = familyId === mineId;
    if (!yours) {
      return { name: null, noun: kind === 'nap' ? 'nap' : 'feed', familyLabel: family?.label ?? 'Their', yours: false };
    }
    const routine = (profile?.routines ?? []).find((r) => r.id === routineId);
    const child = routine?.childId
      ? (profile?.members ?? []).find((m) => m.id === routine.childId && m.role === 'child')
      : undefined;
    const name = child?.name.trim() || null;
    const noun = kind === 'nap' ? 'nap' : child ? feedNoun(child) : 'feed';
    return { name, noun, familyLabel: 'Your family', yours: true };
  };
}

/** Families that use a pushchair, from the planner's own families. */
export const buggyFamilyIds = (families: { id: string; pushchair: boolean }[]): string[] =>
  families.filter((f) => f.pushchair).map((f) => f.id);
