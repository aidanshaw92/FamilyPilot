import { FamilyProfile, WeatherInfo } from '@/src/types';
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

function timeWindowLabel(hour: number): string {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function environmentPreference(
  weather?: WeatherInfo | null,
): DayRequest['constraints']['environment'] | undefined {
  if (!weather) return undefined;

  switch (weather.condition) {
    case 'rainy':
      return { strength: 'preferred', value: 'indoor' };
    case 'sunny':
    case 'partly_cloudy':
      return { strength: 'preferred', value: 'outdoor' };
    default:
      return undefined;
  }
}

function energyPreference(hour: number): DayRequest['constraints']['energyLevel'] | undefined {
  if (hour < 12) {
    return { strength: 'context', value: 'moderate' };
  }
  if (hour >= 17) {
    return { strength: 'context', value: 'low' };
  }
  return undefined;
}

/**
 * Builds a day request from persistent profile + live context so Home can
 * recommend before the parent types anything.
 */
export function buildProactiveDayRequest(
  profile: FamilyProfile,
  weather?: WeatherInfo | null,
  now: Date = new Date(),
): DayRequest {
  const childAges = childAgesFromProfile(profile);
  const youngest = youngestChildAge(childAges);
  const hour = now.getHours();
  const hasPushchair = familyUsesBuggy(profile);

  const limit = driveLimitMinutes(profile);
  const tier = budgetTierOf(profile);
  const constraints: DayRequest['constraints'] = {
    ageRecommendedFit: { strength: AGE_RECOMMENDATION_STRENGTH, value: 'in_range' },
    // Only what the family stated: no journey limit and no budget means neither constraint exists.
    ...(limit !== null ? { journey: { strength: 'required' as const, value: { maxMinutes: limit } } } : {}),
    ...(tier ? { budget: { strength: 'preferred' as const, value: 'within_profile' as const } } : {}),
  };

  const environment = environmentPreference(weather);
  if (environment) {
    constraints.environment = environment;
  }

  if (hasPushchair) {
    constraints.pushchair = { strength: 'preferred', value: 'not_difficult' };
  }

  if (youngest != null && youngest <= 2) {
    constraints.babyChanging = { strength: 'preferred', value: 'yes' };
  }

  const energyLevel = energyPreference(hour);
  if (energyLevel) {
    constraints.energyLevel = energyLevel;
  }

  const weatherPhrase = weather?.description?.trim() || 'today';
  const locationLabel = profile.homeLocation.trim() || 'near home';

  return {
    rawText: `Best matches for our family ${weatherPhrase.toLowerCase()}`,
    parsedAt: now.toISOString(),
    childAges,
    childAgeMonthsList: childAgesInMonths(profile.members),
    homeLocation: profile.homeLocation,
    ...(tier ? { budgetTier: tier } : {}),
    ...(limit !== null ? { maxDriveMinutes: limit } : {}),
    hasPushchair,
    constraints,
    context: {
      freeformNotes: `Proactive suggestions based on your family profile, ${locationLabel}, and ${weatherPhrase.toLowerCase()}.`,
      timeWindow: timeWindowLabel(hour),
    },
  };
}
