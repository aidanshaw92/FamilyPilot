/**
 * Which Family Fit policy is in force.
 *
 * Two independent switches, both OFF by default, so production behaves exactly as it does today until someone with the
 * authority to change a scoring policy switches them on:
 *
 *   evidenceAware    The score reads what a venue is CONFIRMED to offer THIS household, and nothing else: an age factor from
 *                    confirmed activity evidence (not from how many facts were extracted), an access factor only for a
 *                    household that has an access need, and a facilities factor only over the facilities this household
 *                    needs. Unknown is neutral. Weights are unchanged.
 *   conflictsLast    A venue with a confirmed incompatibility against one of the household's non-negotiables (the same
 *                    ones the planner refuses) is listed after the venues without one, whatever its score.
 *
 * `EXPO_PUBLIC_FAMILY_FIT_V2` takes `all`, `score`, `conflicts` or nothing. A caller (a test, an analysis, a preview) can
 * pass a policy explicitly and then the environment is not consulted.
 */
export interface FitPolicy {
  evidenceAware: boolean;
  conflictsLast: boolean;
}

export const CURRENT_POLICY: FitPolicy = Object.freeze({ evidenceAware: false, conflictsLast: false });
export const PROPOSED_POLICY: FitPolicy = Object.freeze({ evidenceAware: true, conflictsLast: true });

export function activeFitPolicy(): FitPolicy {
  const flag = (typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_FAMILY_FIT_V2 : undefined)?.trim().toLowerCase();
  switch (flag) {
    case 'all':
    case 'true':
    case '1':
      return PROPOSED_POLICY;
    case 'score':
      return { evidenceAware: true, conflictsLast: false };
    case 'conflicts':
      return { evidenceAware: false, conflictsLast: true };
    default:
      return CURRENT_POLICY;
  }
}
