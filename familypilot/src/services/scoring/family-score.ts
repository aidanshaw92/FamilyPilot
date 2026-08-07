import { EnrichmentStatus, FamilyProfile, FamilyScore, FamilyScoreFactors, VenueDetail } from '@/src/types';

import { PROVIDER_ONLY_FAMILY_MATCH_CAP } from '@/src/constants/places-quality';
import { isUnreviewedEnrichmentStatus } from '@/src/utils/enrichment-rules';

const WEIGHTS = {
  ageSuitability: 0.25,
  accessibility: 0.15,
  distance: 0.15,
  weatherFit: 0.1,
  budgetFit: 0.1,
  facilitiesMatch: 0.15,
  popularity: 0.1,
} as const;

export interface FamilyScoreOptions {
  enrichmentStatus?: EnrichmentStatus;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function scoreAgeSuitability(venue: VenueDetail, childAges: number[]): number {
  if (childAges.length === 0) return 75;

  const youngest = Math.min(...childAges);
  const oldest = Math.max(...childAges);

  switch (venue.category) {
    case 'museum':
      return oldest >= 3 ? clamp(88 + oldest) : clamp(70 + youngest * 5);
    case 'farm':
      return youngest >= 1 ? clamp(90 + youngest * 2) : 65;
    case 'restaurant':
    case 'cafe':
      return clamp(82 + childAges.length * 4);
    case 'park':
      return clamp(85 + youngest * 3);
    default:
      return clamp(80 + childAges.length * 3);
  }
}

function scoreDistance(driveMinutes: number, maxDriveMinutes: number): number {
  if (driveMinutes <= maxDriveMinutes * 0.5) return 98;
  if (driveMinutes <= maxDriveMinutes) return clamp(100 - (driveMinutes / maxDriveMinutes) * 25);
  if (driveMinutes <= maxDriveMinutes + 10) return clamp(55 - (driveMinutes - maxDriveMinutes) * 3);
  return 30;
}

function scoreBudget(venue: VenueDetail, tier: FamilyProfile['budgetTier']): number {
  const spend = venue.estimatedSpend ?? '';
  const isFree = spend.toLowerCase().includes('free') || spend.startsWith('£0');

  if (tier === 'budget') {
    return isFree ? 95 : spend.includes('£35') || spend.includes('£50') ? 65 : 80;
  }
  if (tier === 'premium') return 88;
  return isFree ? 85 : 88;
}

export function calculateFamilyScore(
  venue: VenueDetail,
  profile: FamilyProfile,
  options: FamilyScoreOptions = {},
): FamilyScore {
  const enrichmentStatus = options.enrichmentStatus ?? venue.enrichmentStatus ?? 'enriched';
  const isProviderOnly = isUnreviewedEnrichmentStatus(enrichmentStatus);

  const childAges = profile.members
    .filter((m) => m.role === 'child')
    .map((m) => m.age);

  const factors: FamilyScoreFactors = {
    ageSuitability: scoreAgeSuitability(venue, childAges),
    accessibility: venue.facilities?.includes('pushchair_friendly') ? 92 : isProviderOnly ? 55 : 70,
    distance: scoreDistance(venue.driveMinutes, profile.maxDriveMinutes),
    weatherFit: venue.category === 'museum' || venue.category === 'farm' ? 88 : 85,
    budgetFit: scoreBudget(venue, profile.budgetTier),
    facilitiesMatch: isProviderOnly
      ? 50
      : clamp(Math.min((venue.facilities?.length ?? 0) * 11, 96)),
    popularity: isProviderOnly ? 55 : 80,
  };

  let score = clamp(
    Object.entries(WEIGHTS).reduce(
      (sum, [key, weight]) => sum + factors[key as keyof FamilyScoreFactors] * weight,
      0,
    ),
  );

  if (isProviderOnly) {
    score = Math.min(score, PROVIDER_ONLY_FAMILY_MATCH_CAP);
  }

  const explanation = buildExplanation(venue, profile, factors, isProviderOnly);

  return { score, factors, explanation };
}

function buildExplanation(
  venue: VenueDetail,
  profile: FamilyProfile,
  factors: FamilyScoreFactors,
  isProviderOnly: boolean,
): string[] {
  if (isProviderOnly) {
    const reasons: string[] = [
      'Based on location and category only. Family suitability has not yet been reviewed.',
    ];
    if (factors.distance >= 85) {
      reasons.push(`About ${venue.driveMinutes} minutes from home`);
    }
    return reasons.slice(0, 2);
  }

  const reasons: string[] = [];
  const children = profile.members.filter((m) => m.role === 'child');

  if (factors.ageSuitability >= 85 && children[0]) {
    if (children.length === 1) {
      reasons.push(`${children[0].name} is a great age for this ${venue.category}`);
    } else {
      reasons.push(`Works well for ${children.map((c) => c.name).join(' and ')}`);
    }
  }

  if (profile.pushchair?.trim() && factors.accessibility >= 85) {
    reasons.push('Pushchair friendly paths and access');
  } else if (factors.accessibility >= 85) {
    reasons.push('Flat enough for pushchairs');
  }

  if (factors.distance >= 85) {
    reasons.push(`Only ${venue.driveMinutes} minutes from home`);
  } else if (venue.driveMinutes > profile.maxDriveMinutes) {
    reasons.push(`Further than your usual ${profile.maxDriveMinutes} min drive`);
  }

  if (factors.budgetFit >= 85) {
    reasons.push('Within your usual budget');
  }

  if (venue.facilities?.includes('baby_changing')) {
    reasons.push('Baby changing available on site');
  }

  if (venue.facilities?.includes('cafe') && venue.category !== 'restaurant') {
    reasons.push('Café on site for lunch');
  }

  return reasons.slice(0, 4);
}
