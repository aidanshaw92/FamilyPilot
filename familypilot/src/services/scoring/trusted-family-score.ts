import { FamilyProfile, FamilyScoreFactors, VenueDetail } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';

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

export function scoreTrustedAgeSuitability(facts: MatchableVenueFacts, childAges: number[]): number | null {
  if (childAges.length === 0) return null;
  if (facts.minRecommendedAge == null && facts.maxRecommendedAge == null) return null;

  const youngest = Math.min(...childAges);
  const oldest = Math.max(...childAges);
  const min = facts.minRecommendedAge ?? 0;
  const max = facts.maxRecommendedAge ?? 16;

  if (youngest >= min && oldest <= max) return 96;
  if (youngest < min || oldest > max) {
    if (youngest <= max && oldest >= min) return 58;
    return 42;
  }
  return 65;
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
    { value: facts.freeParking, weight: 0.7, label: 'freeParking' },
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

export function scoreTrustedWeatherFit(facts: MatchableVenueFacts): number | null {
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

export function buildTrustedExplanation(
  venue: VenueDetail,
  profile: FamilyProfile,
  facts: MatchableVenueFacts,
  factors: FamilyScoreFactors,
): string[] {
  const reasons: string[] = [];
  const children = profile.members.filter((m) => m.role === 'child');

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

  if (facts.environment === 'indoor') reasons.push('Indoor environment confirmed');
  if (facts.environment === 'outdoor') reasons.push('Outdoor environment confirmed');

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

  return reasons.slice(0, 4);
}
