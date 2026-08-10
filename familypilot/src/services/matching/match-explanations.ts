import {
  ConstraintEvaluation,
  FocusedReason,
  FocusedRecommendation,
  MatchableVenueFacts,
  VenueMatchResult,
} from '@/src/types/day-request';

const FIELD_LABELS: Record<string, string> = {
  'childAgeFit': 'Recommended ages',
  environment: 'Indoor/outdoor setting',
  energyLevel: 'Activity energy level',
  pushchairSuitability: 'Pushchair suitability',
  'familyFacilities.toilets': 'Toilets',
  'familyFacilities.babyChanging': 'Baby changing',
  'familyFacilities.parking': 'Parking',
  visitDurationMinutes: 'Typical visit length',
  estimatedSpend: 'Estimated spend',
  journey: 'Travel time',
};

function formatTriStateReason(field: string, value: string): string {
  const label = FIELD_LABELS[field] ?? field;
  if (value === 'yes') return `${label} confirmed on site`;
  if (value === 'no') return `${label} not available`;
  return `${label} not confirmed`;
}

function formatEnvironment(value: string): string {
  switch (value) {
    case 'indoor':
      return 'Mostly indoor — suitable for rainy days';
    case 'outdoor':
      return 'Mostly outdoor';
    case 'mixed':
      return 'Mix of indoor and outdoor areas';
    default:
      return 'Indoor/outdoor setting not confirmed';
  }
}

function formatEnergy(value: string): string {
  switch (value) {
    case 'high':
      return 'Good for burning off energy';
    case 'moderate':
      return 'Moderate activity level';
    case 'low':
      return 'Calmer pace';
    case 'mixed':
      return 'Mix of active and calmer areas';
    default:
      return 'Activity level not confirmed';
  }
}

function formatPushchair(value: string): string {
  switch (value) {
    case 'excellent':
      return 'Excellent for pushchairs';
    case 'good':
      return 'Pushchair-friendly paths';
    case 'mixed':
      return 'Some pushchair-friendly areas';
    case 'difficult':
      return 'Difficult with a pushchair';
    default:
      return 'Pushchair suitability not confirmed';
  }
}

function formatAgeRange(facts: MatchableVenueFacts): string {
  const { minRecommendedAge: min, maxRecommendedAge: max } = facts;
  if (min != null && max != null) return `Recommended for ages ${min}–${max}`;
  if (min != null) return `Recommended from age ${min}+`;
  if (max != null) return `Recommended up to age ${max}`;
  return 'Age suitability not confirmed';
}

export function buildFocusedReasons(
  facts: MatchableVenueFacts,
  evaluations: ConstraintEvaluation[],
): FocusedReason[] {
  const reasons: FocusedReason[] = [];

  for (const evaluation of evaluations) {
    if (evaluation.outcome !== 'suitable') continue;

    switch (evaluation.field) {
      case 'childAgeFit':
        reasons.push({ field: 'childAgeFit', text: formatAgeRange(facts) });
        break;
      case 'environment':
        reasons.push({ field: 'environment', text: formatEnvironment(facts.environment) });
        break;
      case 'energyLevel':
        reasons.push({ field: 'energyLevel', text: formatEnergy(facts.energyLevel) });
        break;
      case 'pushchairSuitability':
        reasons.push({ field: 'pushchairSuitability', text: formatPushchair(facts.pushchairSuitability) });
        break;
      case 'familyFacilities.toilets':
        reasons.push({
          field: 'familyFacilities.toilets',
          text: formatTriStateReason('familyFacilities.toilets', facts.toilets),
        });
        break;
      case 'familyFacilities.babyChanging':
        reasons.push({
          field: 'familyFacilities.babyChanging',
          text: formatTriStateReason('familyFacilities.babyChanging', facts.babyChanging),
        });
        break;
      case 'familyFacilities.parking':
        reasons.push({
          field: 'familyFacilities.parking',
          text: formatTriStateReason('familyFacilities.parking', facts.parking),
        });
        break;
      case 'visitDurationMinutes':
        if (facts.visitDurationMinutes != null) {
          reasons.push({
            field: 'visitDurationMinutes',
            text: `Typical visit around ${facts.visitDurationMinutes} minutes`,
          });
        }
        break;
      case 'estimatedSpend':
        if (facts.estimatedSpend) {
          reasons.push({
            field: 'estimatedSpend',
            text: `Estimated spend: ${facts.estimatedSpend}`,
          });
        }
        break;
      case 'journey':
        reasons.push({
          field: 'journey',
          text: `About ${facts.driveMinutes} minutes from home`,
        });
        break;
      default:
        break;
    }
  }

  return reasons.slice(0, 4);
}

export function buildFocusedUnknowns(evaluations: ConstraintEvaluation[]): FocusedReason[] {
  return evaluations
    .filter((e) => e.outcome === 'unknown' && e.strength !== 'context')
    .map((e) => ({
      field: e.field,
      text: `${FIELD_LABELS[e.field] ?? e.field} not confirmed for this venue`,
    }))
    .slice(0, 4);
}

export function buildFocusedRecommendation(
  facts: MatchableVenueFacts,
  match: VenueMatchResult,
  imageUrl: string,
  journeySource?: 'live' | 'estimated',
): FocusedRecommendation {
  return {
    venueId: facts.placeId,
    venueName: facts.name,
    category: facts.category,
    imageUrl,
    driveMinutes: facts.driveMinutes,
    estimatedSpend: facts.estimatedSpend ?? undefined,
    fit: match.fit!,
    reasons: buildFocusedReasons(facts, match.evaluations),
    caveats: facts.warnings.slice(0, 2),
    unknowns: buildFocusedUnknowns(match.evaluations),
    enrichmentStatus:
      facts.enrichmentStatus === 'verified'
        ? 'verified'
        : facts.enrichmentStatus === 'enriched'
          ? 'enriched'
          : 'provider_only',
    openingStatus: facts.openingStatus,
    journeySource,
  };
}
