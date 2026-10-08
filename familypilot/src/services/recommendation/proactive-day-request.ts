import { FamilyProfile } from '@/src/types';
import { familyUsesBuggy } from '@/src/utils/family-mobility';
import { budgetTierOf, driveLimitMinutes } from '@/src/utils/preferences';
import { DayRequest } from '@/src/types/day-request';
import { AGE_RECOMMENDATION_STRENGTH, childAgesInMonths } from '@/src/services/matching/age-suitability';

function childAgesFromProfile(profile: FamilyProfile): number[] {
  return profile.members.filter((member) => member.role === 'child').map((member) => member.age);
}

function youngestChildAge(childAges: number[]): number | null {
  if (childAges.length === 0) return null;
  return Math.min(...childAges);
}

/**
 * Builds a day request from the persistent profile alone so Home can recommend before the parent types anything.
 * Today's weather and the time of day are deliberately not inputs: a recommendation is about the family and the place,
 * and must not reorder itself with the clock or the forecast.
 */
export function buildProactiveDayRequest(profile: FamilyProfile, now: Date = new Date()): DayRequest {
  const childAges = childAgesFromProfile(profile);
  const youngest = youngestChildAge(childAges);
  const hasPushchair = familyUsesBuggy(profile);

  const limit = driveLimitMinutes(profile);
  const tier = budgetTierOf(profile);
  const constraints: DayRequest['constraints'] = {
    ageRecommendedFit: { strength: AGE_RECOMMENDATION_STRENGTH, value: 'in_range' },
    // Only what the family stated: no journey limit and no budget means neither constraint exists.
    ...(limit !== null ? { journey: { strength: 'required' as const, value: { maxMinutes: limit } } } : {}),
    ...(tier ? { budget: { strength: 'preferred' as const, value: 'within_profile' as const } } : {}),
  };

  if (hasPushchair) {
    constraints.pushchair = { strength: 'preferred', value: 'not_difficult' };
  }

  if (youngest != null && youngest <= 2) {
    constraints.babyChanging = { strength: 'preferred', value: 'yes' };
  }

  const locationLabel = profile.homeLocation.trim() || 'near home';

  return {
    rawText: 'Best matches for our family',
    parsedAt: now.toISOString(),
    childAges,
    childAgeMonthsList: childAgesInMonths(profile.members),
    homeLocation: profile.homeLocation,
    ...(tier ? { budgetTier: tier } : {}),
    ...(limit !== null ? { maxDriveMinutes: limit } : {}),
    hasPushchair,
    constraints,
    context: {
      freeformNotes: `Proactive suggestions based on your family profile and ${locationLabel}.`,
    },
  };
}
