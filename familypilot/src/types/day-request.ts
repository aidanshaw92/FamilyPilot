import { FamilyProfile } from '@/src/types';
import { TriState, VenueEnergyLevel, VenueEnvironment } from '@/src/types/enrichment';

/** How a parsed constraint affects eligibility vs ranking */
export type ConstraintStrength = 'required' | 'preferred' | 'context';

export interface DayConstraint<T> {
  strength: ConstraintStrength;
  value: T;
}

export type EnvironmentNeed = 'indoor' | 'outdoor' | 'either';
export type EnergyNeed = 'high' | 'moderate' | 'low' | 'either';
export type PushchairNeed = 'not_difficult';

export interface DayRequestConstraints {
  childAgeFit?: DayConstraint<'in_range'>;
  environment?: DayConstraint<EnvironmentNeed>;
  pushchair?: DayConstraint<PushchairNeed>;
  babyChanging?: DayConstraint<'yes'>;
  toilets?: DayConstraint<'yes'>;
  parking?: DayConstraint<'yes'>;
  energyLevel?: DayConstraint<EnergyNeed>;
  visitDuration?: DayConstraint<{ maxMinutes?: number; minMinutes?: number }>;
  budget?: DayConstraint<'within_profile'>;
  journey?: DayConstraint<{ maxMinutes: number }>;
}

/** Parsed from natural language — merged with persistent family profile */
export interface DayRequest {
  rawText: string;
  parsedAt: string;
  childAges: number[];
  homeLocation: string;
  budgetTier: FamilyProfile['budgetTier'];
  maxDriveMinutes: number;
  hasPushchair: boolean;
  constraints: DayRequestConstraints;
  context: {
    freeformNotes?: string;
    timeWindow?: string;
  };
}

export type FocusedFitClassification = 'Best fit' | 'Strong fit' | 'Possible fit';

export interface FocusedReason {
  field: string;
  text: string;
}

export interface FocusedRecommendation {
  venueId: string;
  venueName: string;
  category: string;
  imageUrl: string;
  driveMinutes: number;
  estimatedSpend?: string;
  fit: FocusedFitClassification;
  reasons: FocusedReason[];
  caveats: string[];
  unknowns: FocusedReason[];
  enrichmentStatus: 'enriched' | 'verified' | 'provider_only';
}

export interface FocusedRecommendationsResult {
  request: DayRequest;
  recommendations: FocusedRecommendation[];
  eligibleCount: number;
  message?: string;
}

/** Trusted venue facts for deterministic matching — no category inference */
export interface MatchableVenueFacts {
  placeId: string;
  name: string;
  category: string;
  driveMinutes: number;
  enrichmentStatus: 'provider_only' | 'ai_draft' | 'enriched' | 'verified';
  minRecommendedAge: number | null;
  maxRecommendedAge: number | null;
  toilets: TriState | 'unknown';
  babyChanging: TriState | 'unknown';
  parking: TriState | 'unknown';
  pushchairSuitability: import('@/src/types/enrichment').PushchairSuitability;
  environment: VenueEnvironment;
  energyLevel: VenueEnergyLevel;
  visitDurationMinutes: number | null;
  estimatedSpend: string | null;
  goodToKnow: string[];
  warnings: string[];
}

export type FactMatchOutcome = 'suitable' | 'unsuitable' | 'unknown' | 'not_applicable';

export interface ConstraintEvaluation {
  field: string;
  strength: ConstraintStrength;
  outcome: FactMatchOutcome;
}

export interface VenueMatchResult {
  placeId: string;
  eligible: boolean;
  preferredPoints: number;
  preferredUnknowns: number;
  preferredUnsuitable: number;
  evaluations: ConstraintEvaluation[];
  fit: FocusedFitClassification | null;
}
