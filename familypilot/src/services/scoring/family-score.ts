import { FamilyProfile, FamilyScore, FamilyScoreFactors, VenueDetail } from '@/src/types';

const WEIGHTS = {
  ageSuitability: 0.25,
  accessibility: 0.15,
  distance: 0.15,
  weatherFit: 0.1,
  budgetFit: 0.1,
  facilitiesMatch: 0.15,
  popularity: 0.1,
} as const;

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function calculateFamilyScore(
  venue: VenueDetail,
  profile: FamilyProfile,
): FamilyScore {
  const childAges = profile.members
    .filter((m) => m.role === 'child')
    .map((m) => m.age);

  const factors: FamilyScoreFactors = {
    ageSuitability: clamp(85 + childAges.length * 3),
    accessibility: venue.facilities.includes('pushchair_friendly') ? 92 : 70,
    distance: clamp(100 - venue.driveMinutes * 2),
    weatherFit: 85,
    budgetFit: profile.budgetTier === 'budget' ? (venue.estimatedSpend === 'Free' ? 95 : 75) : 88,
    facilitiesMatch: clamp(venue.facilities.length * 12),
    popularity: 80,
  };

  const score = clamp(
    Object.entries(WEIGHTS).reduce(
      (sum, [key, weight]) => sum + factors[key as keyof FamilyScoreFactors] * weight,
      0,
    ),
  );

  const explanation = buildExplanation(venue, profile, factors);

  return { score, factors, explanation };
}

function buildExplanation(
  venue: VenueDetail,
  profile: FamilyProfile,
  factors: FamilyScoreFactors,
): string[] {
  const reasons: string[] = [];
  const children = profile.members.filter((m) => m.role === 'child');

  if (factors.ageSuitability >= 85 && children[0]) {
    reasons.push(`${children[0].name} is the perfect age for this ${venue.category}`);
  }
  if (factors.accessibility >= 85) {
    reasons.push('Flat enough for pushchairs');
  }
  if (factors.distance >= 85) {
    reasons.push(`Only ${venue.driveMinutes} minutes from home`);
  }
  if (factors.budgetFit >= 85) {
    reasons.push('Within your usual budget');
  }
  if (venue.facilities.includes('baby_changing')) {
    reasons.push('Baby changing available on site');
  }

  return reasons.slice(0, 4);
}
