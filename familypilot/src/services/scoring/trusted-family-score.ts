import { FamilyProfile, FamilyScoreFactors, VenueDetail, WeatherInfo } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';
import { evaluateAgeRecommendation } from '@/src/services/matching/age-suitability';
import { childAgeVerdicts, outsideRangeCautions, suitsChildrenLine } from '@/src/utils/child-fit';
import { familyUsesBuggy } from '@/src/utils/family-mobility';

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

  const needsPushchair = familyUsesBuggy(profile);
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

/**
 * How well a venue's CONFIRMED facilities serve this family, for ranking only.
 *
 * Weighted by what matters to the family, and with unknown counted as neutral rather than left out. The previous
 * version scored only the facts that happened to be known, as a ratio: a venue with nothing confirmed but its toilets
 * scored 100, exactly like one with toilets, baby changing and parking all confirmed, and a confirmed "no parking"
 * cost more than saying nothing. It also ignored the café entirely. For a family with a baby and a toddler the second
 * venue is the better-evidenced answer, and the ranking now says so:
 *
 *   - a confirmed yes earns the check's full weight, an unknown half, a confirmed no a fifth;
 *   - baby changing weighs most, and only for a child under four (the same line Family Fit draws);
 *   - a café counts, as somewhere to feed small children; free parking counts only on top of confirmed parking.
 *
 * Unknown is never a no and never a yes: it sits exactly in the middle, so evidence moves a venue up or down from where
 * silence leaves it. Buggy access is scored separately, under accessibility.
 */
export function scoreTrustedFacilitiesMatch(
  facts: MatchableVenueFacts,
  profile: FamilyProfile,
): number | null {
  const youngestChild = profile.members
    .filter((m) => m.role === 'child')
    .map((m) => m.age)
    .sort((a, b) => a - b)[0];

  const checks: Array<{ value: MatchableVenueFacts['toilets'] | undefined; weight: number }> = [
    { value: facts.toilets, weight: 1 },
    { value: facts.cafe, weight: 0.6 },
    { value: facts.parking, weight: 0.8 },
  ];
  if (facts.parking === 'yes') checks.push({ value: facts.freeParking, weight: 0.3 });
  if (youngestChild != null && youngestChild <= 3) {
    checks.push({ value: facts.babyChanging, weight: 1.2 });
  }

  let total = 0;
  let earned = 0;
  for (const check of checks) {
    total += check.weight;
    if (check.value === 'yes') earned += check.weight;
    else if (check.value === 'no') earned += check.weight * 0.2;
    else earned += check.weight * 0.5;
  }

  if (total === 0) return null;
  return clamp((earned / total) * 100);
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
  if (environment === 'outdoor' && isWet) return 'Outdoor venue, and today’s forecast is rain';
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
): string[] {
  const reasons: string[] = [];
  const children = profile.members.filter((m) => m.role === 'child');

  // Lead with the most bespoke facts before the reviewed-but-often-generic ones below — a concrete
  // visit duration says something no other venue's card would say in quite the same way. Never a
  // routine: whether a day works around naps and feeds is the planner's question, not the place's.

  if (facts.visitDurationMinutes != null) {
    reasons.push(`Typically a ${formatDurationAdjective(facts.visitDurationMinutes)} visit`);
  }

  if (facts.minRecommendedAge != null || facts.maxRecommendedAge != null) {
    // Named, per child, when every child has a name and at least one is inside the published range;
    // otherwise the generic wording, which only ever claims what the score also says (all inside).
    const named = suitsChildrenLine(facts, childAgeVerdicts(facts, profile.members));
    if (named) {
      reasons.push(named);
    } else if (factors.ageSuitability >= 85 && children.length > 0) {
      if (facts.minRecommendedAge != null && facts.maxRecommendedAge != null) {
        reasons.push(`Recommended for ages ${facts.minRecommendedAge}–${facts.maxRecommendedAge}`);
      } else if (facts.minRecommendedAge != null) {
        reasons.push(`Recommended from age ${facts.minRecommendedAge}`);
      } else if (facts.maxRecommendedAge != null) {
        reasons.push(`Recommended up to age ${facts.maxRecommendedAge}`);
      }
    }
  }

  if (facts.pushchairSuitability === 'excellent' || facts.pushchairSuitability === 'good') {
    reasons.push(
      facts.pushchairSuitability === 'excellent'
        ? 'Reviewed as excellent for pushchairs'
        : 'Reviewed as pushchair friendly',
    );
  }

  if (facts.parking === 'yes') {
    reasons.push(facts.freeParking === 'yes' ? 'Free parking confirmed' : 'Parking confirmed on site');
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
  }

  if (factors.budgetFit >= 85 && facts.estimatedSpend) {
    reasons.push(`Estimated spend ${facts.estimatedSpend}`);
  }

  if (reasons.length === 0) {
    reasons.push('Based on reviewed family suitability details');
  }

  return reasons.slice(0, 6);
}

/**
 * Reviewed facts that count AGAINST the match for this family. These used to be pushed into the
 * reasons list, where Venue Detail rendered them under "Why it suits your family" with a green
 * tick — "Pushchair access reviewed as difficult" as a plus. They are cautions, and they render
 * beside the other cautions (a long drive, a missing must-have) under "Good to know". The over-limit
 * drive is deliberately absent: `buildDriveCaution` already raises it from the profile.
 */
export function buildTrustedCautions(
  profile: FamilyProfile,
  facts: MatchableVenueFacts,
  factors: FamilyScoreFactors,
): string[] {
  const cautions: string[] = [];
  const children = profile.members.filter((m) => m.role === 'child');

  if ((facts.minRecommendedAge != null || facts.maxRecommendedAge != null) && children.length > 0) {
    // Per child, so a venue that suits one sibling and not the other says so even though the blended
    // score (58) is above the "may not suit" line. Falls back to the generic caution only when
    // nobody is named and the family as a whole is outside the range.
    const named = outsideRangeCautions(facts, childAgeVerdicts(facts, profile.members));
    if (named.length > 0) cautions.push(...named);
    else if (factors.ageSuitability <= 50) cautions.push('Age range may not suit your children');
  }
  if (facts.pushchairSuitability === 'difficult' && familyUsesBuggy(profile)) {
    cautions.push('Pushchair access reviewed as difficult');
  }
  if (facts.parking === 'no') {
    cautions.push('Parking reviewed as not available on site');
  }
  return cautions;
}
