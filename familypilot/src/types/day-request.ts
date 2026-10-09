import { FamilyProfile } from '@/src/types';
import { TriState, VenueEnergyLevel, VenueEnvironment } from '@/src/types/enrichment';

/** How a parsed constraint affects eligibility vs ranking */
export type ConstraintStrength = 'required' | 'preferred' | 'context';

export interface DayConstraint<T> {
  strength: ConstraintStrength;
  value: T;
}

/** A venue-level door policy in months, half-open [min, max). Always carries its source. */
/**
 * One door a venue enforces, in MONTHS, half-open [min, max).
 *
 * A venue may enforce several. "Under 4s are not admitted" and "over 12s are not admitted" are
 * two doors, not one interval and not a contradiction, so `VenueAgePolicy.restrictions` is a list
 * and a child must satisfy every entry.
 */
export interface VenueAgeRestriction {
  minMonthsInclusive: number | null;
  maxMonthsExclusive: number | null;
  sourceUrl: string;
  checkedAt: string | null;
  statedAs?: string | null;
}

/** Where an age rule applies. Only `venue` describes the door, and only a door may exclude. */
export type VenueAgeScope = 'venue' | 'activity' | 'accompaniment' | 'ambiguous';

/**
 * An age rule that explains without excluding: an activity rule ("soft play is 5+"), an
 * accompaniment rule ("under 2s must be with an adult"), a rule whose scope could not be
 * determined, or a door whose provenance, lifetime or corroboration fell short of gating.
 */
export interface VenueAgeCaveat {
  scope: VenueAgeScope;
  activity?: string | null;
  accompaniment?: { adultRequired?: boolean; ratio?: string } | null;
  statedAs?: string | null;
  minMonthsInclusive: number | null;
  maxMonthsExclusive: number | null;
  sourceUrl: string | null;
}

/**
 * A venue's projected age policy: what it enforces, what it merely states, and whether its
 * sources contradict each other.
 *
 * Built server-side from trusted age-policy claims (server/enrichment/_lib/age-policy.js). When
 * `sourcesDisagree` is true, `restrictions` is empty by construction -- a contradiction between
 * sources leaves no door standing, because picking a side would invent a policy neither stated.
 */
export interface VenueAgePolicy {
  restrictions: VenueAgeRestriction[];
  caveats: VenueAgeCaveat[];
  sourcesDisagree: boolean;
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
  /** Disabled-bay / Blue Badge parking. Its own constraint: general parking neither satisfies nor contradicts it. */
  blueBadgeParking?: DayConstraint<'yes'>;
  /** The venue's nearest station is step-free. Its own constraint: never read from parking or from the wheelchair claim. */
  stepFreeStation?: DayConstraint<'yes'>;
  /** The venue is reachable by public transport. */
  publicTransport?: DayConstraint<'yes'>;
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
  /** Only when the family stated one: see utils/preferences.ts. */
  budgetTier?: FamilyProfile['budgetTier'];
  maxDriveMinutes?: number | null;
  hasPushchair: boolean;
  /**
   * The day being planned (`YYYY-MM-DD`), so a dated venue rule is read against it. Absent for a request with no day (a
   * ranking card), where only undated rules are read.
   */
  visitDate?: string;
  /** Someone in the party uses a wheelchair or mobility aid. Never inferred from a buggy. */
  needsStepFree?: boolean;
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
   * The venue's own age policy -- as opposed to the ages it recommends. Null means unknown, and
   * unknown never excludes. `restrictions` holds the only age facts that may make a venue
   * ineligible; see services/matching/age-admission.ts.
   *
   * Projected server-side from trusted, in-lifetime, human-approved, venue-scope age-policy
   * claims. An activity or accompaniment rule never becomes a restriction: it arrives in
   * `caveats`, which explain without excluding.
   */
  venueAgePolicy: VenueAgePolicy | null;
  /** Reviewed venue-specific rules; see types/venue-rules.ts. Absent or empty: none recorded, which says nothing either way. */
  rules?: import('@/src/types/venue-rules').VenueRule[];
  /** Reviewed opening hours from the venue's own pages; reconciled against the provider's by `reconcileHours`. */
  officialHours?: import('@/src/types/official-hours').OfficialHoursRule[];
  toilets: TriState | 'unknown';
  babyChanging: TriState | 'unknown';
  /** GENERAL parking on site. Says nothing about Blue Badge bays, step-free access or how the family gets there. */
  parking: TriState | 'unknown';
  freeParking?: TriState | 'unknown';
  /** Blue Badge / disabled-bay parking, from its own approved claim (`accessibility.accessibleParking`, or `disabledParkingBays`). Not read from general parking. */
  blueBadgeParking?: TriState | 'unknown';
  /** Where the Blue Badge bays are (on site, nearby, or on a named street), from its own claim. Set only while `blueBadgeParking` is yes. */
  blueBadgeNote?: string | null;
  /** Step-free entrance and route, from its own approved claim (`accessibility.stepFreeEntrance`). Distinct from a wheelchair-access claim. */
  stepFreeAccess?: TriState | 'unknown';
  /** The nearest station is step-free, from its own approved transport claim. Not read from parking. */
  stepFreeStation?: TriState | 'unknown';
  /** Reachable by public transport, from its own approved transport claim. */
  publicTransport?: TriState | 'unknown';
  /** A café on site, from an approved claim. Optional so older fixtures and callers read it as unknown. */
  cafe?: TriState | 'unknown';
  /**
   * A playground on site, from an approved claim. PROVISION ONLY: it says nothing about which children it suits (no claim
   * carries the playground's ages), so it is never read as activity suitability. Optional: older callers read unknown.
   */
  playground?: TriState | 'unknown';
  /** The venue as a whole can be visited by a wheelchair user, from an approved claim. Not the same as buggy access. */
  wheelchairAccessible?: TriState | 'unknown';
  /** An accessible toilet on site, from an approved claim. */
  accessibleToilet?: TriState | 'unknown';
  pushchairSuitability: import('@/src/types/enrichment').PushchairSuitability;
  /**
   * How hilly the paths are, from an approved claim (never inferred from the category: a park is not assumed hilly, a
   * zoo is not assumed to mean lots of walking). Absent or 'unknown' means nobody has said.
   */
  terrain?: import('@/src/types/enrichment').ExtendedTerrain;
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
  /** A reviewed sentence explaining an `unsuitable` outcome, when the evidence is a venue rule. */
  detail?: string;
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
