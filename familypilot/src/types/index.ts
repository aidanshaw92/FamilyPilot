import { OpeningHoursSchedule } from './opening-hours';

export type { OpeningHoursPeriod, OpeningHoursPoint, OpeningHoursSchedule } from './opening-hours';

export type FacilityType =
  | 'cafe'
  | 'toilets'
  | 'baby_changing'
  | 'playground'
  | 'parking'
  | 'shade'
  | 'splash_pad'
  | 'picnic'
  | 'dog_friendly'
  | 'cycling'
  | 'highchairs'
  | 'swimming'
  | 'soft_play'
  | 'pushchair_friendly';

export type VenueCategory =
  | 'park'
  | 'restaurant'
  | 'cafe'
  | 'museum'
  | 'zoo'
  | 'attraction'
  | 'activity'
  | 'soft_play'
  | 'beach'
  | 'farm'
  | 'hotel'
  | 'shop';

export type TerrainType = 'flat' | 'hilly' | 'mixed';

/** Tri-state for restaurant attributes — never treat unknown as false. */
export type FacilityStatus = 'confirmed' | 'not_available' | 'not_confirmed';

export interface TrustMetadata {
  source?: 'estimated' | 'provider' | 'community';
  lastChecked?: string;
}

export interface RestaurantFeatures {
  kidsMenu: FacilityStatus;
  highChairs: FacilityStatus;
  babyChanging: FacilityStatus;
  pushchairSpace: FacilityStatus;
  stepFreeAccess: FacilityStatus;
  accessibleToilet: FacilityStatus;
  outdoorSeating: FacilityStatus;
  playArea: FacilityStatus;
  activityPacks: FacilityStatus;
  parking: FacilityStatus;
  noiseLevel?: 'quiet' | 'moderate' | 'lively' | 'unknown';
  bookingRecommended?: boolean;
  dietaryOptions?: string[];
  childOffers?: string;
  serviceSpeed?: 'quick' | 'relaxed' | 'unknown';
  familyNotes?: string;
}

export interface RestaurantDetail extends VenueDetail {
  category: 'restaurant' | 'cafe';
  cuisineType?: string;
  restaurantFeatures: RestaurantFeatures;
  estimatedFamilySpend?: string;
  trust?: TrustMetadata;
  /** Drive minutes from home (Explore list). */
  driveMinutes: number;
  /** Minutes from a linked activity — populated per context. */
  driveMinutesFromActivity?: number;
}

export interface EatNearbyRecommendation {
  restaurantId: string;
  name: string;
  imageUrl: string;
  driveMinutes: number;
  estimatedFamilySpend?: string;
  classification: string;
  familyScore: FamilyScore;
  highlights: string[];
  goodToKnow?: string[];
}

export interface FamilyScoreFactors {
  ageSuitability: number;
  accessibility: number;
  distance: number;
  weatherFit: number;
  budgetFit: number;
  facilitiesMatch: number;
  // There is deliberately no routine factor. Ranking used to reward a place the family could reach and leave before the
  // next nap or feed TODAY, so Home reordered itself by the clock. Ranking is about the family; routines are about a
  // chosen day, and are worked out by the planner (routine-advice.ts).
}

export interface FamilyScore {
  score: number;
  factors: FamilyScoreFactors;
  /** Reasons the place suits this family. Only positives belong here: the UI ticks each line. */
  explanation: string[];
  /**
   * Reviewed facts that count AGAINST the match for this family ("Pushchair access reviewed as
   * difficult"). Kept apart from `explanation` because the two render differently — a tick and a
   * warning — and a caution shown with a tick is a false claim.
   */
  cautions?: string[];
}

export type EnrichmentStatus = 'provider_only' | 'ai_draft' | 'enriched' | 'verified';

export interface Venue {
  id: string;
  name: string;
  category: VenueCategory;
  latitude: number;
  longitude: number;
  driveMinutes: number;
  imageUrl: string;
  familyScore: FamilyScore;
  /**
   * What FamilyPilot tells THIS family about the place, derived from the household, the venue's confirmed facts and
   * today's context (see services/matching/family-match.ts). Present once a venue has been personalised. The
   * `familyScore` number ranks; this decides the words.
   */
  familyMatch?: import('@/src/services/matching/family-match').FamilyMatchResult;
  estimatedSpend?: string;
  /** Open right now, from the weekly schedule and the clock; undefined when that cannot be said. */
  isOpen?: boolean;
  /**
   * The weekly schedule as data, when the provider supplied it. What "today" means for a place is worked out from
   * this at the time of use (`describeOpeningToday`), never from a stored flag.
   */
  /** Food close by, from a stored OpenStreetMap lookup; absent means it has not been looked up (unknown). */
  foodNearby?: import('./places').FoodNearby;
  structuredOpeningHours?: OpeningHoursSchedule;
  address?: string;
  goodToKnow?: string[];
  facilities?: FacilityType[];
  trust?: TrustMetadata;
  /** Whether FamilyPilot has reviewed family suitability for this place. */
  enrichmentStatus?: EnrichmentStatus;
  /** Claim-backed facts for Family Match — populated from projected consumer metadata. */
  trustedFacts?: import('@/src/types/day-request').MatchableVenueFacts;
  /**
   * Which provider this place came from.
   *
   * Carried to the client because attribution is a licence condition, not a detail: OpenStreetMap
   * is ODbL and requires crediting its contributors wherever its data is shown, and Google requires
   * its own mark on Google content. Without this field the client cannot tell them apart, so it
   * showed Google's attribution over every place regardless of where the place actually came from.
   */
  provider?: import('@/src/types/places').PlacesProviderName;
}

export interface CommunityTip {
  id: string;
  author: string;
  message: string;
  timeAgo: string;
}

export interface VenueDetail extends Venue {
  website?: string;
  phone?: string;
  photos: string[];
  facilities: FacilityType[];
  /** Display copy. Already localised by the provider, and not machine-readable. */
  openingHours: string;
  /**
   * The same hours as data, when the provider supplied them. Absent means nobody can say whether
   * this place is open on a given date — which is different from saying it is shut.
   *
   * Evaluate with `isOpenOn` in `@/src/utils/opening-hours` rather than reading it directly.
   */
  structuredOpeningHours?: OpeningHoursSchedule;
  /** Unknown when provider-only — do not synthesise defaults. */
  terrain?: TerrainType;
  bestAges?: string;
  parkingInfo?: string;
  description: string;
  visitDurationMinutes?: number;
  warnings?: string[];
  goodToKnow?: string[];
  communityTips?: CommunityTip[];
  eatNearby?: EatNearbyRecommendation[];
  weatherAlternative?: WeatherAlternative;
  trust?: TrustMetadata;
}

/** @deprecated use EatNearbyRecommendation from service layer */
export interface EatNearbyOption {
  venueId: string;
  name: string;
  driveMinutes: number;
  estimatedSpend?: string;
  highlights: string[];
}

export interface WeatherAlternative {
  name: string;
  driveMinutes: number;
  description: string;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  color: string;
  route: string;
  pilotFeature?: import('@/src/config/pilot-features').PilotFeature;
}

export interface RecommendationSection {
  id: string;
  title: string;
  subtitle?: string;
  venues: Venue[];
}

/**
 * How a child usually gets around on a day out. A set, not a single choice, because a baby is often in
 * a carrier AND a buggy and a toddler walks AND tires: see `family-mobility.ts` for what each means.
 */
export type ChildMobility = 'walks' | 'buggy' | 'carrier' | 'mobility-aid';

/** How another adult in the household relates to the person using the app. Inclusive, optional wording. */
export type AdultRelationship = 'partner' | 'co-parent' | 'other';

export interface FamilyMember {
  id: string;
  name: string;
  /** `parent` is any adult in the household (the name is historical): a partner, co-parent or another adult. */
  role: 'parent' | 'child';
  /** Adults only: how this adult relates to the person who set the app up. Unset means the person themself. */
  relationship?: AdultRelationship;
  dateOfBirth: string;
  /**
   * True only when a parent actually entered `dateOfBirth`. A profile saved before dates of birth were
   * collected has an invented one (1 January of a guessed year), which must never be used: for those
   * members `age` below is the stored number and nothing is derived.
   */
  dobKnown?: boolean;
  /**
   * Whole years, for age-suitability matching (rounds down for a baby under 1 - see ageMonths).
   * DERIVED from `dateOfBirth` on every profile read when `dobKnown`; see `child-age.ts`.
   */
  age: number;
  /** Precise age in months for a baby under 1 (age === 0). Null/undefined once age >= 1. Derived like `age`. */
  ageMonths?: number | null;
  /** Children only. Unset means nobody has said, which is not the same as "walks". */
  mobility?: ChildMobility[];
}

/** Same shape as planner.ts's Routine — kept structurally compatible so a profile's usual
 * feeds/naps can seed a planning family's routines without conversion. */
export interface FamilyRoutine {
  id: string;
  label: string;
  kind: 'nap' | 'feed';
  /** HH:MM. For a nap this is when it usually STARTS; the window is `time` to `time + durationMinutes`. */
  time: string;
  durationMinutes: number;
  atHome: boolean;
  /** The child this belongs to. Unset on a routine saved before routines had an owner. */
  childId?: string;
}

export interface FamilyProfile {
  id: string;
  parentName: string;
  /**
   * Optional family name ("Shaw"), device-only, used for the household's own heading ("Shaw family"). Never
   * uploaded: a connection sees only a first-name label.
   */
  familyName?: string;
  members: FamilyMember[];
  homeLocation: string;
  /** Resolved centroid for the entered town/postcode. Stored locally with the profile. */
  homeLatitude?: number | null;
  homeLongitude?: number | null;
  budgetTier: 'budget' | 'moderate' | 'premium';
  maxDriveMinutes: number;
  completionPercent: number;
  vehicle?: string | null;
  pushchair?: string | null;
  travelCot?: string | null;
  memberships?: string[];
  /** Usual feed/nap schedule, used to build a bespoke "leave by X to be home for Y" reason or
   * caution per venue (see routine-fit.ts) and to seed Plans' "our family" routines so a parent
   * doesn't re-enter them there. */
  routines?: FamilyRoutine[];
  /** Facilities this family always needs — used to flag a venue that's missing one
   * (see facility-match.ts) instead of just listing every facility a venue happens to have. */
  mustHaveFacilities?: FacilityType[];
}

export interface WeatherInfo {
  condition: 'sunny' | 'cloudy' | 'rainy' | 'partly_cloudy';
  temperature: number;
  description: string;
}

export interface TripStop {
  id: string;
  time: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  type: 'venue' | 'meal' | 'travel' | 'home';
}

export interface Trip {
  id: string;
  title: string;
  date: string;
  stops: TripStop[];
  totalDriveMinutes?: number;
  estimatedCost?: string;
  totalDurationHours?: number;
}

export type SavedGroup = 'want' | 'favourite' | 'been';

export interface SavedItem {
  id: string;
  type: 'place' | 'restaurant' | 'hotel' | 'shop';
  venue: Venue;
  group?: SavedGroup;
  savedAt?: string;
}

export interface StoreLocation {
  id: string;
  name: string;
  brand: 'tesco' | 'sainsburys' | 'boots' | 'aldi' | 'superdrug';
  driveMinutes: number;
  isOpen: boolean;
  closesAt?: string;
  phone?: string;
  categoriesAvailable?: string[];
  stockNotes: string[];
}

export interface CarEquipment {
  id: string;
  name: string;
  volumeLitres: number;
  fits: boolean;
}

export interface CarFitResult {
  carName: string;
  bootCapacityLitres: number;
  equipment: CarEquipment[];
  allFits: boolean;
  spareLitres: number;
}

export interface PackingItem {
  id: string;
  category: string;
  name: string;
  quantity: number;
  packed: boolean;
}

export interface HolidayOffer {
  id: string;
  provider: 'jet2' | 'tui' | 'loveholidays' | 'easyjet' | 'booking';
  hotelName: string;
  imageUrl: string;
  price: number;
  familyScore: FamilyScore;
  highlights: string[];
  recommended?: boolean;
}

export interface ExploreFilter {
  id: string;
  label: string;
  active: boolean;
}
