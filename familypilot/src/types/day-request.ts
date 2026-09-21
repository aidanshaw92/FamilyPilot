import { FamilyProfile } from '@/src/types';
import { TriState, VenueEnergyLevel, VenueEnvironment } from '@/src/types/enrichment';

/** How a parsed constraint affects eligibility vs ranking */
export type ConstraintStrength = 'required' | 'preferred' | 'context';

export interface DayConstraint<T> {
  strength: ConstraintStrength;
  value: T;
}

/** A venue-level door policy in months, half-open [min, max). Always carries its source. */
export interface VenueAgeRestriction {
  minMonthsInclusive: number | null;
  maxMonthsExclusive: number | null;
  sourceUrl: string;
  checkedAt: string | null;
}

export type EnvironmentNeed = 'indoor' | 'outdoor' | 'either';
export type EnergyNeed = 'high' | 'moderate' | 'low' | 'either';
export type PushchairNeed = 'not_difficult';

export interface DayRequestConstraints {
  /**
   * How well a venue's *recommended* ages line up with the children. Soft by construction: it
   * ranks and explains, and can never make a venue ineligible. A venue-level prohibition is the
   * separate `ageAdmission` constraint below.
   *
   * Its strength is always `preferred` — see AGE_RECOMMENDATION_STRENGTH.
   */
  ageRecommendedFit?: DayConstraint<'in_range'>;
  /**
   * Whether the venue admits every child in the family. Hard by construction: this is the one age
   * fact that can make a venue ineligible, because a family turned away at the door has had a
   * wasted journey rather than a judgement call. Unknown never excludes.
   *
   * Server-owned like `journey` and `budget`: it comes from the family profile's children and the
   * venue's own published policy, never from the request text or the model.
   */
  ageAdmission?: DayConstraint<'admits_all_children'>;
  /**
   * @deprecated Ambiguous: it read as both "suits these ages" and "admits these ages", and every
   * producer emitted it at `required`, which made an absent recommendation reject the venue.
   * Superseded by `ageRecommendedFit`. Still accepted on input and normalised to the soft
   * semantics, so persisted or in-flight requests keep working; never emitted.
   */
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
  /** Whole years. Rounds every baby under one down to 0 — see `childAgeMonthsList`. */
  childAges: number[];
  /**
   * The same children in months, preserving the precision `childAges` loses under age one.
   * Optional so existing persisted requests still parse; consumers fall back to `childAges * 12`.
   */
  childAgeMonthsList?: number[];
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

export type OpeningStatus = 'open' | 'closed' | 'unknown';

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
  openingStatus: OpeningStatus;
  journeySource?: 'live' | 'estimated';
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
  /**
   * The venue's own door policy, in MONTHS, half-open [min, max) -- as opposed to the ages it
   * recommends. Null means unknown, and unknown never excludes. The only age fact that may make a
   * venue ineligible; see services/matching/age-admission.ts.
   *
   * Projected server-side from trusted, in-lifetime, non-conflicted venue-scope age-policy claims.
   * An activity or accompaniment rule never reaches this field: those are caveats, not doors.
   */
  venueAgeRestriction: VenueAgeRestriction | null;
  toilets: TriState | 'unknown';
  babyChanging: TriState | 'unknown';
  parking: TriState | 'unknown';
  freeParking?: TriState | 'unknown';
  pushchairSuitability: import('@/src/types/enrichment').PushchairSuitability;
  environment: VenueEnvironment;
  energyLevel: VenueEnergyLevel;
  visitDurationMinutes: number | null;
  estimatedSpend: string | null;
  goodToKnow: string[];
  warnings: string[];
  openingStatus: OpeningStatus;
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
