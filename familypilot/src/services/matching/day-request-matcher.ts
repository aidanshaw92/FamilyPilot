import {
  ConstraintEvaluation,
  DayRequest,
  EnvironmentNeed,
  EnergyNeed,
  FactMatchOutcome,
  FocusedFitClassification,
  MatchableVenueFacts,
  VenueMatchResult,
} from '@/src/types/day-request';
import { TriState } from '@/src/types/enrichment';
import { FamilyProfile } from '@/src/types';
import {
  hasTrustedMatchSignals,
  scoreTrustedAccessibility,
  scoreTrustedAgeSuitability,
  scoreTrustedBudget,
  scoreTrustedFacilitiesMatch,
} from '@/src/services/scoring/trusted-family-score';

function enrichmentRank(status: MatchableVenueFacts['enrichmentStatus']): number {
  switch (status) {
    case 'verified':
      return 3;
    case 'enriched':
      return 2;
    default:
      return 0;
  }
}

function trustedRankingScore(facts: MatchableVenueFacts, profile: FamilyProfile): number {
  if (!hasTrustedMatchSignals(facts)) return 0;

  const childAges = profile.members.filter((member) => member.role === 'child').map((member) => member.age);
  const scores = [
    scoreTrustedAgeSuitability(facts, childAges),
    scoreTrustedAccessibility(facts, profile),
    scoreTrustedFacilitiesMatch(facts, profile),
    scoreTrustedBudget(facts, profile.budgetTier),
  ].filter((score): score is number => score != null);

  if (scores.length === 0) return 0;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function evaluateTriStateRequired(value: TriState | 'unknown', needYes: boolean): FactMatchOutcome {
  if (value === 'unknown') return 'unknown';
  if (needYes && value === 'yes') return 'suitable';
  if (needYes && value === 'no') return 'unsuitable';
  return 'not_applicable';
}

function evaluateChildAgeFit(facts: MatchableVenueFacts, childAges: number[]): FactMatchOutcome {
  if (childAges.length === 0) return 'not_applicable';
  const { minRecommendedAge: min, maxRecommendedAge: max } = facts;
  if (min == null && max == null) return 'unknown';
  const youngest = Math.min(...childAges);
  const oldest = Math.max(...childAges);
  if (min != null && oldest < min) return 'unsuitable';
  if (max != null && youngest > max) return 'unsuitable';
  return 'suitable';
}

function evaluateEnvironment(
  venueEnv: MatchableVenueFacts['environment'],
  need: EnvironmentNeed,
): FactMatchOutcome {
  if (need === 'either') return 'not_applicable';
  if (venueEnv === 'unknown') return 'unknown';
  if (need === 'indoor') {
    if (venueEnv === 'indoor' || venueEnv === 'mixed') return 'suitable';
    return 'unsuitable';
  }
  if (need === 'outdoor') {
    if (venueEnv === 'outdoor' || venueEnv === 'mixed') return 'suitable';
    return 'unsuitable';
  }
  return 'unknown';
}

function evaluateEnergy(
  venueEnergy: MatchableVenueFacts['energyLevel'],
  need: EnergyNeed,
): FactMatchOutcome {
  if (need === 'either') return 'not_applicable';
  if (venueEnergy === 'unknown') return 'unknown';
  if (need === 'high') {
    if (venueEnergy === 'high' || venueEnergy === 'mixed') return 'suitable';
    return 'unsuitable';
  }
  if (need === 'moderate') {
    if (venueEnergy === 'moderate' || venueEnergy === 'high' || venueEnergy === 'mixed') {
      return 'suitable';
    }
    return 'unsuitable';
  }
  if (need === 'low') {
    if (venueEnergy === 'low' || venueEnergy === 'moderate') return 'suitable';
    return 'unsuitable';
  }
  return 'unknown';
}

function evaluatePushchair(facts: MatchableVenueFacts): FactMatchOutcome {
  const value = facts.pushchairSuitability;
  if (value === 'unknown') return 'unknown';
  if (value === 'excellent' || value === 'good' || value === 'mixed') return 'suitable';
  if (value === 'difficult') return 'unsuitable';
  return 'unknown';
}

function evaluateVisitDuration(
  minutes: number | null,
  maxMinutes?: number,
  minMinutes?: number,
): FactMatchOutcome {
  if (minutes == null) return 'unknown';
  if (maxMinutes != null && minutes > maxMinutes) return 'unsuitable';
  if (minMinutes != null && minutes < minMinutes) return 'unsuitable';
  return 'suitable';
}

function evaluateBudget(
  estimatedSpend: string | null,
  tier: 'budget' | 'moderate' | 'premium',
): FactMatchOutcome {
  if (!estimatedSpend) return 'unknown';
  const lower = estimatedSpend.toLowerCase();
  const isFree = lower.includes('free') || estimatedSpend.startsWith('£0');
  const isExpensive =
    lower.includes('£35') ||
    lower.includes('£40') ||
    lower.includes('£50') ||
    lower.includes('£60');

  if (tier === 'budget') {
    if (isFree) return 'suitable';
    if (isExpensive) return 'unsuitable';
    return 'suitable';
  }
  if (tier === 'premium') return 'suitable';
  if (isFree) return 'suitable';
  return 'suitable';
}

function evaluateJourney(driveMinutes: number, maxMinutes: number): FactMatchOutcome {
  if (driveMinutes <= maxMinutes) return 'suitable';
  return 'unsuitable';
}

function applyConstraint(
  evaluations: ConstraintEvaluation[],
  field: string,
  strength: 'required' | 'preferred',
  outcome: FactMatchOutcome,
  tally: { preferredPoints: number; preferredUnknowns: number; preferredUnsuitable: number },
): boolean {
  if (outcome === 'not_applicable') return true;
  evaluations.push({ field, strength, outcome });

  if (strength === 'required') {
    if (outcome === 'unsuitable' || outcome === 'unknown') return false;
    return true;
  }

  if (outcome === 'suitable') tally.preferredPoints += 2;
  else if (outcome === 'unsuitable') tally.preferredUnsuitable += 1;
  else if (outcome === 'unknown') tally.preferredUnknowns += 1;
  return true;
}

function classifyFit(
  evaluations: ConstraintEvaluation[],
  tally: { preferredPoints: number; preferredUnknowns: number; preferredUnsuitable: number },
): FocusedFitClassification {
  const required = evaluations.filter((e) => e.strength === 'required');
  const preferred = evaluations.filter((e) => e.strength === 'preferred');

  const requiredUnknowns = required.filter((e) => e.outcome === 'unknown').length;
  const preferredUnknowns = preferred.filter((e) => e.outcome === 'unknown').length;
  const preferredUnsuitable = preferred.filter((e) => e.outcome === 'unsuitable').length;
  const preferredSuitable = preferred.filter((e) => e.outcome === 'suitable').length;

  if (requiredUnknowns === 0 && preferredUnsuitable === 0 && preferredUnknowns <= 1) {
    return 'Best fit';
  }
  if (
    requiredUnknowns === 0 &&
    preferredUnsuitable === 0 &&
    preferredSuitable >= Math.ceil(preferred.length / 2)
  ) {
    return 'Strong fit';
  }
  if (tally.preferredPoints >= 2) return 'Strong fit';
  return 'Possible fit';
}

export function matchVenueToDayRequest(
  facts: MatchableVenueFacts,
  request: DayRequest,
): VenueMatchResult {
  const evaluations: ConstraintEvaluation[] = [];
  const tally = { preferredPoints: 0, preferredUnknowns: 0, preferredUnsuitable: 0 };
  let eligible = true;

  const journey = request.constraints.journey?.value.maxMinutes ?? request.maxDriveMinutes;
  if (
    !applyConstraint(
      evaluations,
      'journey',
      'required',
      evaluateJourney(facts.driveMinutes, journey),
      tally,
    )
  ) {
    eligible = false;
  }

  if (request.constraints.childAgeFit) {
    if (
      !applyConstraint(
        evaluations,
        'childAgeFit',
        'required',
        evaluateChildAgeFit(facts, request.childAges),
        tally,
      )
    ) {
      eligible = false;
    }
  }

  if (request.constraints.environment && request.constraints.environment.strength !== 'context') {
    if (
      !applyConstraint(
        evaluations,
        'environment',
        request.constraints.environment.strength,
        evaluateEnvironment(facts.environment, request.constraints.environment.value),
        tally,
      )
    ) {
      eligible = false;
    }
  }

  if (request.constraints.energyLevel && request.constraints.energyLevel.strength !== 'context') {
    if (
      !applyConstraint(
        evaluations,
        'energyLevel',
        request.constraints.energyLevel.strength,
        evaluateEnergy(facts.energyLevel, request.constraints.energyLevel.value),
        tally,
      )
    ) {
      eligible = false;
    }
  }

  if (request.constraints.pushchair && request.hasPushchair && request.constraints.pushchair.strength !== 'context') {
    if (
      !applyConstraint(
        evaluations,
        'pushchairSuitability',
        request.constraints.pushchair.strength,
        evaluatePushchair(facts),
        tally,
      )
    ) {
      eligible = false;
    }
  }

  if (request.constraints.toilets && request.constraints.toilets.strength !== 'context') {
    if (
      !applyConstraint(
        evaluations,
        'familyFacilities.toilets',
        request.constraints.toilets.strength,
        evaluateTriStateRequired(facts.toilets, true),
        tally,
      )
    ) {
      eligible = false;
    }
  }

  if (request.constraints.babyChanging && request.constraints.babyChanging.strength !== 'context') {
    if (
      !applyConstraint(
        evaluations,
        'familyFacilities.babyChanging',
        request.constraints.babyChanging.strength,
        evaluateTriStateRequired(facts.babyChanging, true),
        tally,
      )
    ) {
      eligible = false;
    }
  }

  if (request.constraints.parking && request.constraints.parking.strength !== 'context') {
    if (
      !applyConstraint(
        evaluations,
        'familyFacilities.parking',
        request.constraints.parking.strength,
        evaluateTriStateRequired(facts.parking, true),
        tally,
      )
    ) {
      eligible = false;
    }
  }

  if (request.constraints.visitDuration && request.constraints.visitDuration.strength !== 'context') {
    const { maxMinutes, minMinutes } = request.constraints.visitDuration.value;
    if (
      !applyConstraint(
        evaluations,
        'visitDurationMinutes',
        request.constraints.visitDuration.strength,
        evaluateVisitDuration(facts.visitDurationMinutes, maxMinutes, minMinutes),
        tally,
      )
    ) {
      eligible = false;
    }
  }

  if (request.constraints.budget && request.constraints.budget.strength !== 'context') {
    if (
      !applyConstraint(
        evaluations,
        'estimatedSpend',
        request.constraints.budget.strength,
        evaluateBudget(facts.estimatedSpend, request.budgetTier),
        tally,
      )
    ) {
      eligible = false;
    }
  }

  return {
    placeId: facts.placeId,
    eligible,
    preferredPoints: tally.preferredPoints,
    preferredUnknowns: tally.preferredUnknowns,
    preferredUnsuitable: tally.preferredUnsuitable,
    evaluations,
    fit: eligible ? classifyFit(evaluations, tally) : null,
  };
}

export function rankVenueMatches(
  factsList: MatchableVenueFacts[],
  request: DayRequest,
  profile?: FamilyProfile,
): Array<{ facts: MatchableVenueFacts; match: VenueMatchResult }> {
  const results = factsList
    .map((facts) => ({ facts, match: matchVenueToDayRequest(facts, request) }))
    .filter((item) => item.match.eligible && item.match.fit != null);

  results.sort((a, b) => {
    const fitOrder: Record<FocusedFitClassification, number> = {
      'Best fit': 3,
      'Strong fit': 2,
      'Possible fit': 1,
    };
    const fitDiff = fitOrder[b.match.fit!] - fitOrder[a.match.fit!];
    if (fitDiff !== 0) return fitDiff;

    const enrichDiff =
      enrichmentRank(b.facts.enrichmentStatus) - enrichmentRank(a.facts.enrichmentStatus);
    if (enrichDiff !== 0) return enrichDiff;

    if (profile) {
      const trustedDiff = trustedRankingScore(b.facts, profile) - trustedRankingScore(a.facts, profile);
      if (trustedDiff !== 0) return trustedDiff;
    }

    if (b.match.preferredPoints !== a.match.preferredPoints) {
      return b.match.preferredPoints - a.match.preferredPoints;
    }
    if (a.match.preferredUnknowns !== b.match.preferredUnknowns) {
      return a.match.preferredUnknowns - b.match.preferredUnknowns;
    }
    return a.facts.driveMinutes - b.facts.driveMinutes;
  });

  return results.slice(0, 3);
}
