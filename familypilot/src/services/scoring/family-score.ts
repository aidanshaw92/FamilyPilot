import { EnrichmentStatus, FamilyProfile, FamilyScore, FamilyScoreFactors, VenueDetail, WeatherInfo } from '@/src/types';
import { familyUsesBuggy } from '@/src/utils/family-mobility';
import { budgetFitReason } from '@/src/utils/budget-copy';
import { budgetTierOf, driveLimitMinutes } from '@/src/utils/preferences';
import { blendFactors } from './blend';

import { PROVIDER_ONLY_FAMILY_MATCH_CAP } from '@/src/constants/places-quality';
import { isUnreviewedEnrichmentStatus } from '@/src/utils/enrichment-rules';
import { buildFacilityMissingCaution } from '@/src/utils/facility-match';

import { childAgesInMonths } from '@/src/services/matching/age-suitability';
import {
  buildTrustedExplanation,
  hasTrustedMatchSignals,
  scoreTrustedAccessibility,
  scoreTrustedAgeSuitability,
  scoreTrustedBudget,
  scoreTrustedFacilitiesMatch,
  scoreTrustedWeatherFit,
  buildTrustedCautions,
} from './trusted-family-score';

const WEIGHTS = {
  ageSuitability: 0.25,
  accessibility: 0.15,
  distance: 0.15,
  weatherFit: 0.1,
  budgetFit: 0.1,
  facilitiesMatch: 0.15,
} as const;
/** The weights need not sum to one: the blend divides by the weights of the factors present (a budget nobody stated takes no part). */

/** A missing must-have facility caps how "family-suitable" a venue can score, the same way an
 * unreviewed venue is capped — a caution shouldn't be the only place this shows up. */
const FACILITY_MISSING_CAP = 35;

export interface FamilyScoreOptions {
  enrichmentStatus?: EnrichmentStatus;
  weather?: WeatherInfo | null;
}

/**
 * Category-based approximation of indoor/outdoor used only as a last-resort heuristic when a
 * venue has no reviewed environment fact yet. Never surfaced as a confirmed claim.
 */
function heuristicIsIndoor(category: VenueDetail['category']): boolean | null {
  if (['museum', 'soft_play', 'shop', 'restaurant', 'cafe', 'hotel'].includes(category)) return true;
  if (['park', 'farm', 'beach'].includes(category)) return false;
  return null; // zoo, attraction, activity: genuinely mixed - don't guess.
}

function scoreWeatherFitHeuristic(venue: VenueDetail, weather?: WeatherInfo | null): number {
  const fallback = venue.category === 'museum' || venue.category === 'farm' ? 88 : 85;
  if (!weather) return fallback;

  const isIndoor = heuristicIsIndoor(venue.category);
  if (isIndoor === null) return fallback;

  const isWet = weather.condition === 'rainy';
  const isBright = weather.condition === 'sunny' || weather.condition === 'partly_cloudy';

  if (isIndoor) return isWet ? 95 : isBright ? 76 : 86;
  return isWet ? 48 : isBright ? 95 : 80;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * What the age factor contributes when no venue has published a recommendation for these ages.
 *
 * A neutral value for "nothing to say either way", and deliberately not a suitability judgement: it keeps the weighted average well-defined without asserting that
 * a venue does or does not suit a child. Nothing may turn this number into an explanation — a
 * neutral placeholder is the absence of evidence, not evidence of a good fit.
 *
 * This replaced a category-based heuristic that scored a museum from the oldest child's age and a
 * park from the youngest, and so told parents about age suitability on the strength of the word
 * "park". With 0 of 122 venues carrying a recommended range, that heuristic was producing
 * essentially every age score in production.
 */
const UNKNOWN_AGE_SCORE = 75;

/**
 * How near a place is, for ranking. With a stated limit it is judged against that limit. Without one there is no limit to
 * be over, so nearness is a plain gentle slope, never a cliff: a place 34 minutes away is a little lower than one 25 minutes
 * away, not "over the limit" and not several times lower. (A 30 minute limit nobody stated used to turn 34 minutes into a
 * score of 43 against 75 at 30.)
 */
function scoreDistance(driveMinutes: number, maxDriveMinutes: number | null): number {
  if (maxDriveMinutes === null) {
    if (!Number.isFinite(driveMinutes)) return 60;
    return clamp(98 - Math.max(0, driveMinutes - 15) * 0.5, 55, 98);
  }
  if (driveMinutes <= maxDriveMinutes * 0.5) return 98;
  if (driveMinutes <= maxDriveMinutes) return clamp(100 - (driveMinutes / maxDriveMinutes) * 25);
  if (driveMinutes <= maxDriveMinutes + 10) return clamp(55 - (driveMinutes - maxDriveMinutes) * 3);
  return 30;
}

function scoreBudgetHeuristic(venue: VenueDetail, tier: NonNullable<FamilyProfile['budgetTier']>): number {
  const spend = venue.estimatedSpend ?? '';
  const isFree = spend.toLowerCase().includes('free') || spend.startsWith('£0');
  // Matches the £/££/£££ tier-symbol format used by scoreTrustedBudget - not a price range.
  const isExpensive = spend.includes('£££');

  if (tier === 'budget') {
    return isFree ? 95 : isExpensive ? 65 : 80;
  }
  if (tier === 'premium') return 88;
  return isFree ? 85 : 88;
}

/** "2-hour" / "90-minute" — an adjective phrase for "a ___ visit", not a raw number. */
function formatDurationAdjective(minutes: number): string {
  if (minutes < 60) return `${minutes}-minute`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}-hour`;
}

function buildHeuristicExplanation(
  venue: VenueDetail,
  profile: FamilyProfile,
  factors: FamilyScoreFactors,
  isProviderOnly: boolean,
): string[] {
  if (isProviderOnly) {
    // The "not yet reviewed" disclaimer used to lead this list, and the UI ticks every line of it
    // green. A status is not a reason. The panel states the status from `enrichmentStatus`; the
    // one thing we do know about an unreviewed place is how far away it is.
    return factors.distance >= 85 ? [`About ${venue.driveMinutes} minutes from home`] : [];
  }

  const reasons: string[] = [];
  const hasPushchair = familyUsesBuggy(profile);

  // Lead with whatever is most specific to this exact venue and family — a concrete duration,
  // distance, or facility fact. Never a routine: "leave by…" is about a chosen day, not the place.

  if (venue.visitDurationMinutes) {
    reasons.push(`Typically a ${formatDurationAdjective(venue.visitDurationMinutes)} visit`);
  }

  if (factors.distance >= 85) {
    reasons.push(`Only ${venue.driveMinutes} minutes from home`);
  }
  // A drive beyond the family's limit used to be pushed into THIS list, so Venue Detail showed
  // "Further than the 30 min drive we’re using" under "Why it suits your family" with a green tick. It is
  // a caution, and it is raised as one in personalise-venues alongside the other cautions.

  const hasParking = venue.facilities?.includes('parking');
  const hasBabyChanging = venue.facilities?.includes('baby_changing');
  if (hasParking && hasBabyChanging) {
    reasons.push('Parking and baby changing both on site');
  } else if (hasParking) {
    reasons.push('Parking available on site');
  } else if (hasBabyChanging) {
    reasons.push('Baby changing available on site');
  }

  if (hasPushchair && factors.accessibility >= 85) {
    reasons.push('Great for buggies: flat, step-free access');
  } else if (factors.accessibility >= 85) {
    reasons.push('Flat enough for pushchairs');
  }

  if (venue.facilities?.includes('cafe') && venue.category !== 'restaurant') {
    reasons.push('Café on site for lunch');
  }

  const tier = budgetTierOf(profile);
  if (tier && (factors.budgetFit ?? 0) >= 85) {
    reasons.push(budgetFitReason(tier));
  }

  if (factors.weatherFit >= 90) {
    reasons.push('Good for today’s weather');
  }

  // No age line here at all. This branch runs precisely when the venue has no trusted facts, so
  // anything it said about age would be inferred from the category — which is what produced
  // "Ada is a great age for this park" for a venue nobody had reviewed. The trusted branch still
  // reports a real published range; see buildTrustedExplanation.

  return reasons.slice(0, 6);
}

export function calculateFamilyScore(
  venue: VenueDetail,
  profile: FamilyProfile,
  options: FamilyScoreOptions = {},
): FamilyScore {
  const enrichmentStatus = options.enrichmentStatus ?? venue.enrichmentStatus ?? 'enriched';
  const isProviderOnly = isUnreviewedEnrichmentStatus(enrichmentStatus);

  const childMonths = childAgesInMonths(profile.members);
  const facts = venue.trustedFacts;
  const tier = budgetTierOf(profile);
  const useTrusted = !isProviderOnly && facts != null && hasTrustedMatchSignals(facts);
  const weather = options.weather;

  const facilitiesMatchRaw = useTrusted
    ? scoreTrustedFacilitiesMatch(facts, profile) ?? clamp(Math.min((venue.facilities?.length ?? 0) * 11, 96))
    : isProviderOnly
      ? 50
      : clamp(Math.min((venue.facilities?.length ?? 0) * 11, 96));
  const missingMustHave = buildFacilityMissingCaution(profile, venue.facilities) != null;

  const factors: FamilyScoreFactors = {
    ageSuitability:
      (useTrusted ? scoreTrustedAgeSuitability(facts, childMonths) : null) ?? UNKNOWN_AGE_SCORE,
    accessibility:
      (useTrusted ? scoreTrustedAccessibility(facts, profile) : null) ??
      (venue.facilities?.includes('pushchair_friendly') ? 92 : isProviderOnly ? 55 : 70),
    distance: scoreDistance(venue.driveMinutes, driveLimitMinutes(profile)),
    weatherFit:
      (useTrusted ? scoreTrustedWeatherFit(facts, weather) : null) ??
      scoreWeatherFitHeuristic(venue, weather),
    // Only for a family that stated a budget. Without one nothing about price is scored, capped or marked down.
    budgetFit: tier
      ? (useTrusted ? scoreTrustedBudget(facts, tier) : null) ?? scoreBudgetHeuristic(venue, tier)
      : undefined,
    facilitiesMatch: missingMustHave ? Math.min(facilitiesMatchRaw, FACILITY_MISSING_CAP) : facilitiesMatchRaw,
  };

  let score = clamp(blendFactors(WEIGHTS, factors));

  if (isProviderOnly) {
    score = Math.min(score, PROVIDER_ONLY_FAMILY_MATCH_CAP);
  }

  const explanation =
    useTrusted && facts
      ? buildTrustedExplanation(venue, profile, facts, factors, weather)
      : buildHeuristicExplanation(venue, profile, factors, isProviderOnly);
  const cautions = useTrusted && facts ? buildTrustedCautions(profile, facts, factors) : [];

  return { score, factors, explanation, cautions };
}
