import { FamilyProfile } from '@/src/types';

/**
 * How the budget match is worded.
 *
 * A budget is only ever one the parent chose (none is filled in), and this line is only produced for a family that stated
 * one. It says only what is true of the match: the venue's spend fits the tier the profile holds.
 */
const SPEND_LABEL: Record<NonNullable<FamilyProfile['budgetTier']>, string> = {
  budget: 'budget-friendly',
  moderate: 'moderate',
  premium: 'premium',
};

export function budgetFitReason(tier: NonNullable<FamilyProfile['budgetTier']>): string {
  return `Fits a ${SPEND_LABEL[tier]} spend`;
}
