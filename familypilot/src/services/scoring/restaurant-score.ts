import {
  FamilyProfile,
  FamilyScore,
  FamilyScoreFactors,
  RestaurantDetail,
  RestaurantFeatures,
  VenueDetail,
} from '@/src/types';

import { getDriveMinutesFromActivity } from '@/src/data/mock-restaurants';
import { familyUsesBuggy } from '@/src/utils/family-mobility';
import { budgetFitReason } from '@/src/utils/budget-copy';
import { budgetTierOf, driveLimitMinutes } from '@/src/utils/preferences';
import { blendFactors } from './blend';

const WEIGHTS = {
  ageSuitability: 0.2,
  accessibility: 0.15,
  distance: 0.2,
  budgetFit: 0.15,
  facilitiesMatch: 0.25,
} as const;
/** No routine factor: where to eat is chosen while browsing, and naps and feeds belong to a planned day. */

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function isConfirmed(status: RestaurantFeatures[keyof RestaurantFeatures]): boolean {
  return status === 'confirmed';
}

function parseMaxSpend(spend?: string): number | null {
  if (!spend) return null;
  const match = spend.match(/£(\d+)/);
  return match ? Number(match[1]) : null;
}

function scoreBudget(spend: string | undefined, tier: NonNullable<FamilyProfile['budgetTier']>): number {
  const max = parseMaxSpend(spend);
  if (max === null) return 75;
  if (tier === 'budget') {
    if (max <= 20) return 95;
    if (max <= 30) return 80;
    if (max <= 45) return 60;
    return 45;
  }
  if (tier === 'premium') return max <= 55 ? 90 : 75;
  if (max <= 35) return 92;
  if (max <= 50) return 78;
  return 55;
}

function scoreFacilities(features: RestaurantFeatures, profile: FamilyProfile): number {
  let score = 50;
  if (isConfirmed(features.kidsMenu)) score += 12;
  if (isConfirmed(features.highChairs)) score += 14;
  if (isConfirmed(features.babyChanging)) score += 12;
  if (isConfirmed(features.pushchairSpace)) score += 10;
  if (isConfirmed(features.playArea)) score += 6;
  if (isConfirmed(features.parking)) score += 4;
  if (familyUsesBuggy(profile) && isConfirmed(features.pushchairSpace)) score += 8;
  return clamp(score);
}

function scoreDistanceFromActivity(driveMinutes: number): number {
  if (driveMinutes <= 3) return 98;
  if (driveMinutes <= 5) return 92;
  if (driveMinutes <= 8) return 85;
  if (driveMinutes <= 12) return 72;
  if (driveMinutes <= 18) return 58;
  return 40;
}

function scoreAgeFit(features: RestaurantFeatures, childAges: number[]): number {
  if (childAges.length === 0) return 75;
  const youngest = Math.min(...childAges);
  let score = 78;
  if (isConfirmed(features.kidsMenu)) score += 8;
  if (isConfirmed(features.highChairs)) score += 6;
  if (youngest <= 2 && isConfirmed(features.babyChanging)) score += 10;
  if (youngest <= 3 && isConfirmed(features.playArea)) score += 8;
  if (youngest >= 5 && features.noiseLevel === 'lively') score += 4;
  return clamp(score);
}

function buildRestaurantExplanation(
  restaurant: RestaurantDetail,
  profile: FamilyProfile,
  activityVenue?: VenueDetail,
  driveFromActivity?: number,
): string[] {
  const reasons: string[] = [];
  const f = restaurant.restaurantFeatures;

  if (isConfirmed(f.kidsMenu)) reasons.push('Kids menu');
  if (driveFromActivity !== undefined && activityVenue) {
    reasons.push(`About ${driveFromActivity} minutes from ${activityVenue.name}`);
  }
  if (isConfirmed(f.highChairs)) reasons.push('High chairs available');
  if (isConfirmed(f.babyChanging)) reasons.push('Baby changing');
  if (isConfirmed(f.pushchairSpace)) reasons.push('Pushchair friendly');
  const limit = driveLimitMinutes(profile);
  // Mentioned as a nicety when it is near; without a stated limit there is nothing to be within, so only a short journey is.
  if (driveFromActivity === undefined && restaurant.driveMinutes <= (limit ?? 30)) {
    reasons.push(`About ${restaurant.driveMinutes} minutes from home`);
  }

  const spend = restaurant.estimatedFamilySpend ?? restaurant.estimatedSpend;
  const tier = budgetTierOf(profile);
  if (tier && scoreBudget(spend, tier) >= 85) {
    reasons.push(budgetFitReason(tier));
  }

  if (isConfirmed(f.outdoorSeating)) reasons.push('Outdoor seating');
  if (isConfirmed(f.playArea)) reasons.push('Small play area for children');

  return reasons.slice(0, 4);
}

export function calculateRestaurantFamilyScore(
  restaurant: RestaurantDetail,
  profile: FamilyProfile,
  options?: {
    activityVenue?: VenueDetail;
    driveMinutesFromActivity?: number;
  },
): FamilyScore {
  const childAges = profile.members.filter((m) => m.role === 'child').map((m) => m.age);
  const driveFromActivity =
    options?.driveMinutesFromActivity ??
    (options?.activityVenue
      ? getDriveMinutesFromActivity(restaurant.id, options.activityVenue.id) ?? restaurant.driveMinutes
      : restaurant.driveMinutes);

  const spend = restaurant.estimatedFamilySpend ?? restaurant.estimatedSpend;

  const factors: FamilyScoreFactors = {
    ageSuitability: scoreAgeFit(restaurant.restaurantFeatures, childAges),
    accessibility: isConfirmed(restaurant.restaurantFeatures.stepFreeAccess) ? 90 : 68,
    distance: options?.activityVenue
      ? scoreDistanceFromActivity(driveFromActivity ?? 99)
      : clamp(100 - (restaurant.driveMinutes / ((driveLimitMinutes(profile) ?? 30) + 1)) * 30),
    budgetFit: budgetTierOf(profile) ? scoreBudget(spend, budgetTierOf(profile)!) : undefined,
    facilitiesMatch: scoreFacilities(restaurant.restaurantFeatures, profile),
  };

  const score = clamp(blendFactors(WEIGHTS, factors));

  const explanation = buildRestaurantExplanation(
    restaurant,
    profile,
    options?.activityVenue,
    driveFromActivity ?? undefined,
  );

  return { score, factors, explanation };
}

/** Composite ranking score balancing suitability and proximity to activity. */
export function calculateEatNearbyRankScore(
  familyScore: number,
  driveMinutesFromActivity: number,
  budgetFit: number | undefined,
  facilitiesMatch: number,
): number {
  // No stated budget: price takes no part in the order, and the other parts keep their proportions.
  if (budgetFit === undefined) {
    const rest = 0.5 + 0.25 + 0.13;
    return (familyScore * 0.5 + scoreDistanceFromActivity(driveMinutesFromActivity) * 0.25 + facilitiesMatch * 0.13) / rest;
  }
  const distanceScore = scoreDistanceFromActivity(driveMinutesFromActivity);
  return (
    familyScore * 0.5 +
    distanceScore * 0.25 +
    budgetFit * 0.12 +
    facilitiesMatch * 0.13
  );
}

export function restaurantFeatureHighlights(features: RestaurantFeatures, max = 3): string[] {
  const highlights: string[] = [];
  if (isConfirmed(features.kidsMenu)) highlights.push('Kids menu');
  if (isConfirmed(features.highChairs)) highlights.push('High chairs');
  if (isConfirmed(features.babyChanging)) highlights.push('Baby changing');
  if (isConfirmed(features.pushchairSpace)) highlights.push('Pushchair space');
  if (isConfirmed(features.playArea)) highlights.push('Play area');
  if (isConfirmed(features.outdoorSeating)) highlights.push('Outdoor seating');
  return highlights.slice(0, max);
}
