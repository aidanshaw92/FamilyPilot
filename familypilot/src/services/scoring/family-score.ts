import { EnrichmentStatus, FamilyProfile, FamilyScore, FamilyScoreFactors, VenueDetail, WeatherInfo } from '@/src/types';

import { PROVIDER_ONLY_FAMILY_MATCH_CAP } from '@/src/constants/places-quality';
import { isUnreviewedEnrichmentStatus } from '@/src/utils/enrichment-rules';
import { buildFacilityMissingCaution } from '@/src/utils/facility-match';
import { evaluateRoutineFit, RoutineFit } from '@/src/utils/routine-fit';

import { childAgesInMonths } from '@/src/services/matching/age-suitability';
import {
  buildTrustedExplanation,
  hasTrustedMatchSignals,
  scoreTrustedAccessibility,
  scoreTrustedAgeSuitability,
  scoreTrustedBudget,
  scoreTrustedFacilitiesMatch,
  scoreTrustedWeatherFit,
} from './trusted-family-score';

const WEIGHTS = {
  ageSuitability: 0.25,
  accessibility: 0.15,
  distance: 0.15,
  weatherFit: 0.1,
  budgetFit: 0.1,
  facilitiesMatch: 0.15,
  routineFit: 0.1,
} as const;

/** A missing must-have facility caps how "family-suitable" a venue can score, the same way an
 * unreviewed venue is capped — a caution shouldn't be the only place this shows up. */
const FACILITY_MISSING_CAP = 35;

/** Turns today's nap/feed timing into a score contribution: comfortable time to spare scores
 * well, a visit that would run into a routine scores poorly, and no routines set (or nothing
 * upcoming today) is neutral — never a thumb on the scale either way. */
function scoreRoutineFit(reason: string | null, caution: string | null): number {
  if (reason) return 92;
  if (caution) return 45;
  return 75;
}

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
 * The same neutral value scoreRoutineFit uses for "nothing to say either way", and deliberately
 * not a suitability judgement: it keeps the weighted average well-defined without asserting that
 * a venue does or does not suit a child. Nothing may turn this number into an explanation — a
 * neutral placeholder is the absence of evidence, not evidence of a good fit.
 *
 * This replaced a category-based heuristic that scored a museum from the oldest child's age and a
 * park from the youngest, and so told parents about age suitability on the strength of the word
 * "park". With 0 of 122 venues carrying a recommended range, that heuristic was producing
 * essentially every age score in production.
 */
const UNKNOWN_AGE_SCORE = 75;

function scoreDistance(driveMinutes: number, maxDriveMinutes: number): number {
  if (driveMinutes <= maxDriveMinutes * 0.5) return 98;
  if (driveMinutes <= maxDriveMinutes) return clamp(100 - (driveMinutes / maxDriveMinutes) * 25);
  if (driveMinutes <= maxDriveMinutes + 10) return clamp(55 - (driveMinutes - maxDriveMinutes) * 3);
  return 30;
}

function scoreBudgetHeuristic(venue: VenueDetail, tier: FamilyProfile['budgetTier']): number {
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
  routineFit: RoutineFit,
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
  const hasPushchair = Boolean(profile.pushchair?.trim());

  // Lead with whatever is most specific to this exact venue, visit, and family — a time-bound
  // routine fit, a concrete duration, distance, or facility fact — before the heuristic age
  // line below, which (with no reviewed age data to go on) is almost always trivially true and
  // reads as boilerplate ("X is a great age for this park") if it's allowed to always lead.
  if (routineFit.reason) {
    reasons.push(routineFit.reason);
  }

  if (venue.visitDurationMinutes) {
    reasons.push(`Typically a ${formatDurationAdjective(venue.visitDurationMinutes)} visit`);
  }

  if (factors.distance >= 85) {
    reasons.push(`Only ${venue.driveMinutes} minutes from home`);
  } else if (venue.driveMinutes > profile.maxDriveMinutes) {
    reasons.push(`Further than your usual ${profile.maxDriveMinutes} min drive`);
  }

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
    reasons.push('Great for buggies — flat, step-free access');
  } else if (factors.accessibility >= 85) {
    reasons.push('Flat enough for pushchairs');
  }

  if (venue.facilities?.includes('cafe') && venue.category !== 'restaurant') {
    reasons.push('Café on site for lunch');
  }

  if (factors.budgetFit >= 85) {
    reasons.push('Within your usual budget');
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
  const useTrusted = !isProviderOnly && facts != null && hasTrustedMatchSignals(facts);
  const weather = options.weather;

  const facilitiesMatchRaw = useTrusted
    ? scoreTrustedFacilitiesMatch(facts, profile) ?? clamp(Math.min((venue.facilities?.length ?? 0) * 11, 96))
    : isProviderOnly
      ? 50
      : clamp(Math.min((venue.facilities?.length ?? 0) * 11, 96));
  const missingMustHave = buildFacilityMissingCaution(profile, venue.facilities) != null;
  const routineFit = evaluateRoutineFit(profile, venue.driveMinutes);

  const factors: FamilyScoreFactors = {
    ageSuitability:
      (useTrusted ? scoreTrustedAgeSuitability(facts, childMonths) : null) ?? UNKNOWN_AGE_SCORE,
    accessibility:
      (useTrusted ? scoreTrustedAccessibility(facts, profile) : null) ??
      (venue.facilities?.includes('pushchair_friendly') ? 92 : isProviderOnly ? 55 : 70),
    distance: scoreDistance(venue.driveMinutes, profile.maxDriveMinutes),
    weatherFit:
      (useTrusted ? scoreTrustedWeatherFit(facts, weather) : null) ??
      scoreWeatherFitHeuristic(venue, weather),
    budgetFit:
      (useTrusted ? scoreTrustedBudget(facts, profile.budgetTier) : null) ??
      scoreBudgetHeuristic(venue, profile.budgetTier),
    facilitiesMatch: missingMustHave ? Math.min(facilitiesMatchRaw, FACILITY_MISSING_CAP) : facilitiesMatchRaw,
    routineFit: scoreRoutineFit(routineFit.reason, routineFit.caution),
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

  const explanation =
    useTrusted && facts
      ? buildTrustedExplanation(venue, profile, facts, factors, weather, routineFit)
      : buildHeuristicExplanation(venue, profile, factors, isProviderOnly, routineFit);

  return { score, factors, explanation };
}
