import {
  getDriveMinutesFromActivity,
  mockRestaurantDetails,
  mockRestaurantSeeds,
} from '@/src/data/mock-restaurants';
import {
  calculateEatNearbyRankScore,
  calculateRestaurantFamilyScore,
  restaurantFeatureHighlights,
} from '@/src/services/scoring/restaurant-score';
import {
  EatNearbyRecommendation,
  FamilyProfile,
  RestaurantDetail,
  VenueDetail,
} from '@/src/types';
import { getMatchClassification } from '@/src/utils/family-match-classification';

const MAX_EAT_NEARBY = 3;
const MAX_DRIVE_FROM_ACTIVITY = 20;

export function getRestaurantsNearVenue(
  activityVenue: VenueDetail,
  profile: FamilyProfile,
  limit = MAX_EAT_NEARBY,
): EatNearbyRecommendation[] {
  const candidates = mockRestaurantSeeds
    .map((seed) => {
      const driveMinutes = getDriveMinutesFromActivity(seed.id, activityVenue.id);
      if (driveMinutes === null || driveMinutes > MAX_DRIVE_FROM_ACTIVITY) return null;

      const base = mockRestaurantDetails[seed.id];
      if (!base) return null;

      const restaurant: RestaurantDetail = {
        ...base,
        driveMinutesFromActivity: driveMinutes,
      };

      const familyScore = calculateRestaurantFamilyScore(restaurant, profile, {
        activityVenue,
        driveMinutesFromActivity: driveMinutes,
      });

      const rankScore = calculateEatNearbyRankScore(
        familyScore.score,
        driveMinutes,
        familyScore.factors.budgetFit,
        familyScore.factors.facilitiesMatch,
      );

      return { restaurant, driveMinutes, familyScore, rankScore };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, limit);

  return candidates.map(({ restaurant, driveMinutes, familyScore }) => ({
    restaurantId: restaurant.id,
    name: restaurant.name,
    imageUrl: restaurant.imageUrl,
    driveMinutes,
    estimatedFamilySpend: restaurant.estimatedFamilySpend ?? restaurant.estimatedSpend,
    classification: getMatchClassification(familyScore.score),
    familyScore,
    highlights: restaurantFeatureHighlights(restaurant.restaurantFeatures),
    goodToKnow: restaurant.goodToKnow,
  }));
}

export function getAllRestaurants(profile: FamilyProfile): RestaurantDetail[] {
  return Object.values(mockRestaurantDetails).map((restaurant) => ({
    ...restaurant,
    familyScore: calculateRestaurantFamilyScore(restaurant, profile),
  }));
}

export function getRestaurantById(
  id: string,
  profile: FamilyProfile,
  context?: { activityVenueId?: string },
): RestaurantDetail | null {
  const base = mockRestaurantDetails[id];
  if (!base) return null;

  let driveMinutesFromActivity: number | undefined;
  if (context?.activityVenueId) {
    driveMinutesFromActivity =
      getDriveMinutesFromActivity(id, context.activityVenueId) ?? undefined;
  }

  const familyScore = calculateRestaurantFamilyScore(base, profile, {
    driveMinutesFromActivity,
  });

  return {
    ...base,
    driveMinutesFromActivity,
    familyScore,
  };
}

export function getTopRestaurantNearVenue(
  activityVenue: VenueDetail,
  profile: FamilyProfile,
): EatNearbyRecommendation | null {
  const results = getRestaurantsNearVenue(activityVenue, profile, 1);
  return results[0] ?? null;
}
