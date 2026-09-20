import { FamilyProfile, FamilyScoreFactors, VenueDetail, WeatherInfo } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { RoutineFit } from '@/src/utils/routine-fit';
import { evaluateAgeRecommendation } from '@/src/services/matching/age-suitability';

/** "2-hour" / "90-minute" — an adjective phrase for "a ___ visit", not a raw number. */
function formatDurationAdjective(minutes: number): string {
  if (minutes < 60) return `${minutes}-minute`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}-hour`;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function hasTrustedMatchSignals(facts: MatchableVenueFacts): boolean {
  return Boolean(
    facts.minRecommendedAge != null ||
      facts.maxRecommendedAge != null ||
      facts.toilets !== 'unknown' ||
      facts.babyChanging !== 'unknown' ||
      facts.parking !== 'unknown' ||
      facts.freeParking !== 'unknown' ||
      facts.pushchairSuitability !== 'unknown' ||
      facts.environment !== 'unknown' ||
      facts.energyLevel !== 'unknown' ||
      facts.estimatedSpend,
  );
}

/**
 * How strongly a venue's recommended ages favour these children, for ranking only.
 *
 * Takes months, not years, so a two-month-old and an eleven-month-old are not the same input.
 * Each child is judged on their own — the previous youngest/oldest comparison let one child
 * inside the range vouch for a sibling outside it, so ages 2 and 8 against a 5–12 recommendation
 * scored as a full match on the strength of the 8-year-old alone.
 *
 * Returns null to mean "no evidence-backed age score", not zero and not a guess. What a caller
 * does with that is its own decision: calculateFamilyScore currently substitutes its neutral
 * UNKNOWN_AGE_SCORE so the weighted average stays well-defined. This function never decides
 * eligibility.
 */
export function scoreTrustedAgeSuitability(
  facts: MatchableVenueFacts,
  childMonths: number[],
): number | null {
  const fit = evaluateAgeRecommendation(facts, childMonths);
  switch (fit) {
    case 'all':
      return 96;
    // Some children suited scores above none, rather than treating every mismatch the same.
    case 'some':
      return 58;
    case 'none':
      return 42;
    default:
      return null;
  }
}

export function scoreTrustedAccessibility(
  facts: MatchableVenueFacts,
  profile: FamilyProfile,
): number | null {
  if (facts.pushchairSuitability === 'unknown') return null;

  const needsPushchair = Boolean(profile.pushchair?.trim());
  switch (facts.pushchairSuitability) {
    case 'excellent':
      return 98;
    case 'good':
      return 90;
    case 'mixed':
      return needsPushchair ? 68 : 74;
    case 'difficult':
      return needsPushchair ? 32 : 48;
    default:
      return null;
  }
}

export function scoreTrustedFacilitiesMatch(
  facts: MatchableVenueFacts,
  profile: FamilyProfile,
): number | null {
  const youngestChild = profile.members
    .filter((m) => m.role === 'child')
    .map((m) => m.age)
    .sort((a, b) => a - b)[0];

  const checks: Array<{ value: MatchableVenueFacts['toilets']; weight: number; label: string }> = [
    { value: facts.toilets, weight: 1, label: 'toilets' },
    { value: facts.parking, weight: 0.9, label: 'parking' },
    { value: facts.freeParking ?? 'unknown', weight: 0.7, label: 'freeParking' },
  ];

  if (youngestChild != null && youngestChild <= 3) {
    checks.push({ value: facts.babyChanging, weight: 1, label: 'babyChanging' });
  }

  let knownWeight = 0;
  let earned = 0;

  for (const check of checks) {
    if (check.value === 'unknown' || check.value === undefined) continue;
    knownWeight += check.weight;
    if (check.value === 'yes') earned += check.weight;
    else if (check.value === 'no') earned += check.weight * 0.25;
  }

  if (knownWeight === 0) return null;
  return clamp((earned / knownWeight) * 100);
}

export function scoreTrustedWeatherFit(
  facts: MatchableVenueFacts,
  weather?: WeatherInfo | null,
): number | null {
  // No live weather signal (fetch failed, or not passed in for this call site): fall back to a
  // static environment desirability score rather than pretending we know today's conditions.
  if (!weather) {
    switch (facts.environment) {
      case 'indoor':
        return 92;
      case 'outdoor':
        return 84;
      case 'mixed':
        return 90;
      default:
        return null;
    }
  }

  const isWet = weather.condition === 'rainy';
  const isBright = weather.condition === 'sunny' || weather.condition === 'partly_cloudy';

  switch (facts.environment) {
    case 'indoor':
      return isWet ? 97 : isBright ? 78 : 88;
    case 'outdoor':
      return isWet ? 45 : isBright ? 97 : 80;
    case 'mixed':
      return isWet ? 82 : isBright ? 90 : 86;
    default:
      return null;
  }
}

export function scoreTrustedBudget(facts: MatchableVenueFacts, tier: FamilyProfile['budgetTier']): number | null {
  const spend = facts.estimatedSpend?.trim();
  if (!spend) return null;

  const lower = spend.toLowerCase();
  const isFree = lower.includes('free') || spend.startsWith('£0');

  if (tier === 'budget') {
    if (isFree) return 96;
    if (spend.includes('£££')) return 52;
    if (spend.includes('££')) return 72;
    return 84;
  }
  if (tier === 'premium') return isFree ? 82 : 90;
  return isFree ? 88 : 86;
}

function weatherEnvironmentReason(
  environment: MatchableVenueFacts['environment'],
  weather?: WeatherInfo | null,
): string | null {
  if (!weather) {
    if (environment === 'indoor') return 'Indoor environment confirmed';
    if (environment === 'outdoor') return 'Outdoor environment confirmed';
    return null;
  }

  const isWet = weather.condition === 'rainy';
  const isBright = weather.condition === 'sunny' || weather.condition === 'partly_cloudy';

  if (environment === 'indoor' && isWet) return 'Good indoor option for today’s rain';
  if (environment === 'outdoor' && isBright) return 'Good for today’s weather';
  if (environment === 'outdoor' && isWet) return 'Outdoor venue — today’s forecast is rain';
  if (environment === 'indoor') return 'Indoor environment confirmed';
  if (environment === 'outdoor') return 'Outdoor environment confirmed';
  return null;
}

export function buildTrustedExplanation(
  venue: VenueDetail,
  profile: FamilyProfile,
  facts: MatchableVenueFacts,
  factors: FamilyScoreFactors,
  weather?: WeatherInfo | null,
  routineFit?: RoutineFit,
): string[] {
  const reasons: string[] = [];
  const children = profile.members.filter((m) => m.role === 'child');

  // Lead with the most time-bound, bespoke facts before the reviewed-but-often-generic ones
  // below — a routine-fit line or a concrete visit duration says something no other venue's
  // card would say in quite the same way.
  if (routineFit?.reason) {
    reasons.push(routineFit.reason);
  }

  if (facts.visitDurationMinutes != null) {
    reasons.push(`Typically a ${formatDurationAdjective(facts.visitDurationMinutes)} visit`);
  }

  if (facts.minRecommendedAge != null || facts.maxRecommendedAge != null) {
    if (factors.ageSuitability >= 85 && children.length > 0) {
      if (facts.minRecommendedAge != null && facts.maxRecommendedAge != null) {
        reasons.push(`Recommended for ages ${facts.minRecommendedAge}–${facts.maxRecommendedAge}`);
      } else if (facts.minRecommendedAge != null) {
        reasons.push(`Recommended from age ${facts.minRecommendedAge}`);
      } else if (facts.maxRecommendedAge != null) {
        reasons.push(`Recommended up to age ${facts.maxRecommendedAge}`);
      }
    } else if (factors.ageSuitability <= 50 && children.length > 0) {
      reasons.push('Age range may not suit your children');
    }
  }

  if (facts.pushchairSuitability === 'excellent' || facts.pushchairSuitability === 'good') {
    reasons.push(
      facts.pushchairSuitability === 'excellent'
        ? 'Reviewed as excellent for pushchairs'
        : 'Reviewed as pushchair friendly',
    );
  } else if (facts.pushchairSuitability === 'difficult' && profile.pushchair?.trim()) {
    reasons.push('Pushchair access reviewed as difficult');
  }

  if (facts.parking === 'yes') {
    reasons.push(facts.freeParking === 'yes' ? 'Free parking confirmed' : 'Parking confirmed on site');
  } else if (facts.parking === 'no') {
    reasons.push('Parking reviewed as not available on site');
  }

  if (facts.toilets === 'yes' && facts.babyChanging === 'yes') {
    reasons.push('Toilets and baby changing confirmed on site');
  } else {
    if (facts.toilets === 'yes') reasons.push('Toilets confirmed on site');
    if (facts.babyChanging === 'yes') reasons.push('Baby changing confirmed on site');
  }

  const weatherReason = weatherEnvironmentReason(facts.environment, weather);
  if (weatherReason) reasons.push(weatherReason);

  if (factors.distance >= 85) {
    reasons.push(`About ${venue.driveMinutes} minutes from home`);
  } else if (venue.driveMinutes > profile.maxDriveMinutes) {
    reasons.push(`Further than your usual ${profile.maxDriveMinutes} min drive`);
  }

  if (factors.budgetFit >= 85 && facts.estimatedSpend) {
    reasons.push(`Estimated spend ${facts.estimatedSpend}`);
  }

  if (reasons.length === 0) {
    reasons.push('Based on reviewed family suitability details');
  }

  return reasons.slice(0, 6);
}
