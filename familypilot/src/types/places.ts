import {
  CommunityTip,
  FacilityStatus,
  FacilityType,
  TerrainType,
  VenueCategory,
} from '@/src/types';

/** External data provider — never expose API keys for these on the client. */
export type PlacesProviderName = 'mock' | 'google' | 'osm' | 'familypilot';

/** How much FamilyPilot-specific family metadata exists for a venue. */
export type EnrichmentStatus = 'provider_only' | 'ai_draft' | 'enriched' | 'verified';

/** Search intent — general family Explore vs restaurant-specific queries. */
export type PlaceSearchIntent = 'explore' | 'restaurant';

export type FieldReliability = 'provider' | 'cached' | 'estimated' | 'community' | 'familypilot';

export interface FieldProvenance {
  source: PlacesProviderName | 'familypilot' | 'estimated' | 'community';
  updatedAt: string;
  reliability: FieldReliability;
  label?: string;
}

export interface OpeningHoursPeriod {
  day: number;
  open: string;
  close: string;
}

export interface StructuredOpeningHours {
  periods?: OpeningHoursPeriod[];
  weekdayText?: string[];
  source: PlacesProviderName | 'estimated';
}

/** Provider-supplied place facts — cached separately from FamilyPilot enrichment. */
export interface ExternalPlaceRecord {
  /** Stable FamilyPilot ID used in routes and saved items. */
  familypilotId: string;
  externalId: string;
  provider: PlacesProviderName;
  name: string;
  latitude: number;
  longitude: number;
  category: VenueCategory;
  address?: string;
  description?: string;
  openingHours?: StructuredOpeningHours;
  website?: string;
  phone?: string;
  photos: string[];
  isOpen?: boolean;
  provenance: Partial<Record<ExternalPlaceField, FieldProvenance>>;
  fetchedAt: string;
  /** Family metadata layer status — live Google results default to provider_only. */
  enrichmentStatus?: EnrichmentStatus;
  /** Google primaryType preserved for filtering and audit. */
  googlePrimaryType?: string;
  /** Full Google types array preserved for safe reclassification. */
  googleTypes?: string[];
  /** FamilyPilot metadata when joined server-side (not from provider sync). */
  familyMetadata?: VenueFamilyMetadata;
}

export type ExternalPlaceField =
  | 'name'
  | 'coordinates'
  | 'category'
  | 'address'
  | 'description'
  | 'openingHours'
  | 'website'
  | 'phone'
  | 'photos'
  | 'isOpen';

/** FamilyPilot-owned enrichment — stored in our database, not from map providers. */
export interface VenueFamilyMetadata {
  familypilotPlaceId: string;
  enrichmentStatus?: EnrichmentStatus;
  bestAges?: string;
  minRecommendedAge?: number;
  maxRecommendedAge?: number;
  ageNotes?: string;
  terrain?: TerrainType;
  extendedTerrain?: import('@/src/types/enrichment').ExtendedTerrain;
  terrainNotes?: string;
  pathSurface?: import('@/src/types/enrichment').PathSurface;
  facilities?: FacilityType[];
  familyFacilities?: import('@/src/types/enrichment').FamilyFacilitiesMap;
  parkingInfo?: string;
  visitDurationMinutes?: number;
  warnings?: string[];
  goodToKnow?: string[];
  whyFamiliesLike?: string[];
  communityTips?: CommunityTip[];
  estimatedSpend?: string;
  pushchairAccess?: FacilityStatus;
  pushchairSuitability?: import('@/src/types/enrichment').PushchairSuitability;
  babyChanging?: FacilityStatus;
  stepFreeAccess?: FacilityStatus;
  accessibleToilet?: FacilityStatus;
  accessibility?: import('@/src/types/enrichment').AccessibilityInfo;
  accessibilityNotes?: string;
  sendInfo?: import('@/src/types/enrichment').SendInfo;
  sendNotes?: string;
  familyNotes?: string;
  categoryConfirmed?: import('@/src/types/enrichment').TriState;
  enrichmentProvenance?: import('@/src/types/enrichment').EnrichmentProvenance;
  lastChecked?: string;
  checkedBy?: string;
  betaPriority?: boolean;
  provenance: Partial<Record<FamilyMetadataField, FieldProvenance>>;
  updatedAt: string;
}

export type FamilyMetadataField =
  | 'bestAges'
  | 'terrain'
  | 'facilities'
  | 'parkingInfo'
  | 'visitDurationMinutes'
  | 'warnings'
  | 'goodToKnow'
  | 'communityTips'
  | 'estimatedSpend'
  | 'pushchairAccess'
  | 'babyChanging'
  | 'stepFreeAccess'
  | 'accessibleToilet'
  | 'accessibilityNotes'
  | 'sendNotes'
  | 'familyNotes';

export interface PlaceSearchParams {
  latitude: number;
  longitude: number;
  radiusKm: number;
  categories?: VenueCategory[];
  /** Default explore — family activities without generic restaurants/cafés. */
  intent?: PlaceSearchIntent;
}

export interface PlacesSearchResult {
  places: ExternalPlaceRecord[];
  provider: PlacesProviderName;
  cached: boolean;
  fetchedAt: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

export interface PlaceDetailResult {
  place: ExternalPlaceRecord;
  metadata: VenueFamilyMetadata | null;
  provider: PlacesProviderName;
  cached: boolean;
  fetchedAt: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

export interface PlacesDataError {
  code: 'PROVIDER_UNAVAILABLE' | 'NOT_FOUND' | 'RATE_LIMITED' | 'NETWORK_ERROR';
  message: string;
  fallbackAvailable: boolean;
}
