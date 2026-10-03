import { FamilyProfile } from '@/src/types';

/**
 * How the budget match is worded.
 *
 * The family's budget tier starts as a default (onboarding no longer asks for it), so a line that said
 * "Within your usual budget" would claim a habit the parent never described. This says only what is
 * true of the match: the venue's spend fits the tier the profile holds, whoever chose it.
 */
const SPEND_LABEL: Record<FamilyProfile['budgetTier'], string> = {
  budget: 'budget-friendly',
  moderate: 'moderate',
  premium: 'premium',
};

export function budgetFitReason(tier: FamilyProfile['budgetTier']): string {
  return `Fits a ${SPEND_LABEL[tier] ?? 'moderate'} spend`;
}
