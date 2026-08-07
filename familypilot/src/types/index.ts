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
  popularity: number;
}

export interface FamilyScore {
  score: number;
  factors: FamilyScoreFactors;
  explanation: string[];
}

export type EnrichmentStatus = 'provider_only' | 'enriched' | 'verified';

export interface Venue {
  id: string;
  name: string;
  category: VenueCategory;
  latitude: number;
  longitude: number;
  driveMinutes: number;
  imageUrl: string;
  familyScore: FamilyScore;
  estimatedSpend?: string;
  isOpen?: boolean;
  address?: string;
  goodToKnow?: string[];
  facilities?: FacilityType[];
  trust?: TrustMetadata;
  /** Whether FamilyPilot has reviewed family suitability for this place. */
  enrichmentStatus?: EnrichmentStatus;
}

export interface CommunityTip {
  id: string;
  author: string;
  message: string;
  timeAgo: string;
}

export interface VenueDetail extends Venue {
  photos: string[];
  facilities: FacilityType[];
  openingHours: string;
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
}

export interface RecommendationSection {
  id: string;
  title: string;
  subtitle?: string;
  venues: Venue[];
}

export interface FamilyMember {
  id: string;
  name: string;
  role: 'parent' | 'child';
  dateOfBirth: string;
  age: number;
}

export interface FamilyProfile {
  id: string;
  parentName: string;
  members: FamilyMember[];
  homeLocation: string;
  budgetTier: 'budget' | 'moderate' | 'premium';
  maxDriveMinutes: number;
  completionPercent: number;
  vehicle?: string | null;
  pushchair?: string | null;
  travelCot?: string | null;
  memberships?: string[];
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
