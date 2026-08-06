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
  terrain: TerrainType;
  bestAges: string;
  parkingInfo: string;
  description: string;
  visitDurationMinutes?: number;
  warnings?: string[];
  communityTips?: CommunityTip[];
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
}

export interface SavedItem {
  id: string;
  type: 'place' | 'restaurant' | 'hotel' | 'shop';
  venue: Venue;
}

export interface StoreLocation {
  id: string;
  name: string;
  brand: 'tesco' | 'sainsburys' | 'boots' | 'aldi' | 'superdrug';
  driveMinutes: number;
  isOpen: boolean;
  closesAt?: string;
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
