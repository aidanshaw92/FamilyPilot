import { describe, expect, it } from 'vitest';

import { mockFamilyProfile, mockVenueDetails } from '@/src/data/mock-data';
import { mockRestaurantDetails } from '@/src/data/mock-restaurants';
import { getRestaurantsNearVenue } from '@/src/services/eat-nearby';
import {
  calculateEatNearbyRankScore,
  calculateRestaurantFamilyScore,
} from '@/src/services/scoring/restaurant-score';
import { filterRestaurants } from '@/src/utils/filter-restaurants';
import { FamilyProfile } from '@/src/types';

const activityVenue = mockVenueDetails['venue-1']!;

describe('Eat Nearby ranking', () => {
  it('ranks a farther but more family-suitable restaurant above a closer poor match', () => {
    const results = getRestaurantsNearVenue(activityVenue, mockFamilyProfile);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.name).toBe('The Family Kitchen');
    expect(results[0]?.restaurantId).toBe('restaurant-1');

    const familyKitchen = mockRestaurantDetails['restaurant-1']!;
    const quickBite = mockRestaurantDetails['restaurant-2']!;
    const familyKitchenScore = calculateRestaurantFamilyScore(familyKitchen, mockFamilyProfile, {
      activityVenue,
      driveMinutesFromActivity: 3,
    });
    const quickBiteScore = calculateRestaurantFamilyScore(quickBite, mockFamilyProfile, {
      activityVenue,
      driveMinutesFromActivity: 1,
    });

    const familyKitchenRank = calculateEatNearbyRankScore(
      familyKitchenScore.score,
      3,
      familyKitchenScore.factors.budgetFit,
      familyKitchenScore.factors.facilitiesMatch,
    );
    const quickBiteRank = calculateEatNearbyRankScore(
      quickBiteScore.score,
      1,
      quickBiteScore.factors.budgetFit,
      quickBiteScore.factors.facilitiesMatch,
    );
    expect(familyKitchenRank).toBeGreaterThan(quickBiteRank);
  });

  it('returns at most three nearby recommendations', () => {
    const results = getRestaurantsNearVenue(activityVenue, mockFamilyProfile);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('only includes restaurants within reasonable distance of the activity', () => {
    const results = getRestaurantsNearVenue(activityVenue, mockFamilyProfile);
    for (const rec of results) {
      expect(rec.driveMinutes).toBeLessThanOrEqual(20);
    }
  });
});

describe('Restaurant budget scoring', () => {
  it('scores restaurants significantly outside family budget lower', () => {
    const budgetProfile: FamilyProfile = {
      ...mockFamilyProfile,
      budgetTier: 'budget',
    };
    const premiumProfile: FamilyProfile = {
      ...mockFamilyProfile,
      budgetTier: 'premium',
    };

    const cheap = mockRestaurantDetails['restaurant-2']!;
    const expensive = mockRestaurantDetails['restaurant-5']!;

    const cheapScore = calculateRestaurantFamilyScore(cheap, budgetProfile);
    const expensiveScore = calculateRestaurantFamilyScore(expensive, budgetProfile);
    expect(cheapScore.factors.budgetFit).toBeGreaterThan(expensiveScore.factors.budgetFit);

    const cheapPremium = calculateRestaurantFamilyScore(cheap, premiumProfile);
    const expensivePremium = calculateRestaurantFamilyScore(expensive, premiumProfile);
    expect(expensivePremium.factors.budgetFit).toBeGreaterThanOrEqual(cheapPremium.factors.budgetFit);
  });
});

describe('Unknown restaurant facility data', () => {
  it('does not treat not_confirmed baby changing as confirmed false in filters', () => {
    const withUnknown = Object.values(mockRestaurantDetails).filter(
      (r) => r.restaurantFeatures.babyChanging === 'not_confirmed',
    );
    expect(withUnknown.length).toBeGreaterThan(0);

    const filtered = filterRestaurants(
      Object.values(mockRestaurantDetails).map((r) => ({
        ...r,
        familyScore: calculateRestaurantFamilyScore(r, mockFamilyProfile),
      })),
      ['baby_changing'],
      'any',
      mockFamilyProfile.maxDriveMinutes,
      'any',
    );

    for (const restaurant of filtered) {
      expect(restaurant.restaurantFeatures.babyChanging).toBe('confirmed');
    }

    const unknownStillListed = filterRestaurants(
      Object.values(mockRestaurantDetails).map((r) => ({
        ...r,
        familyScore: calculateRestaurantFamilyScore(r, mockFamilyProfile),
      })),
      [],
      'any',
      mockFamilyProfile.maxDriveMinutes,
      'any',
    );
    expect(
      unknownStillListed.some((r) => r.restaurantFeatures.babyChanging === 'not_confirmed'),
    ).toBe(true);
  });
});

describe('Restaurant filters', () => {
  it('filters by kids menu when selected', () => {
    const all = Object.values(mockRestaurantDetails).map((r) => ({
      ...r,
      familyScore: calculateRestaurantFamilyScore(r, mockFamilyProfile),
    }));

    const filtered = filterRestaurants(all, ['kids_menu'], 'any', 30, 'any');
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((r) => r.restaurantFeatures.kidsMenu === 'confirmed')).toBe(true);
  });

  it('filters by budget tier', () => {
    const all = Object.values(mockRestaurantDetails).map((r) => ({
      ...r,
      familyScore: calculateRestaurantFamilyScore(r, mockFamilyProfile),
    }));

    const filtered = filterRestaurants(all, [], 'any', 30, 'under_25');
    for (const restaurant of filtered) {
      const spend = restaurant.estimatedFamilySpend ?? restaurant.estimatedSpend ?? '';
      const match = spend.match(/£(\d+)/);
      if (match) {
        expect(Number(match[1])).toBeLessThanOrEqual(25);
      }
    }
  });
});

describe('Restaurant Family Match reasons', () => {
  it('includes restaurant-specific attributes in explanation', () => {
    const restaurant = mockRestaurantDetails['restaurant-1']!;
    const score = calculateRestaurantFamilyScore(restaurant, mockFamilyProfile, {
      activityVenue,
      driveMinutesFromActivity: 3,
    });

    expect(score.explanation.some((r) => r.includes('Kids menu'))).toBe(true);
    expect(score.explanation.some((r) => r.includes('High chairs'))).toBe(true);
    expect(score.explanation.some((r) => r.includes('3 minutes from'))).toBe(true);
  });
});
