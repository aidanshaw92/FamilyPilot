/** Tri-state for venue attributes — unknown is distinct from no. */
export type TriState = 'yes' | 'no' | 'unknown';

export type EnrichmentSourceType =
  | 'official_website'
  | 'venue_contact'
  | 'google_provider'
  | 'family_pilot_editorial'
  | 'ai_assisted'
  | 'community_report'
  | 'local_authority'
  | 'other';

export type PushchairSuitability = 'excellent' | 'good' | 'mixed' | 'difficult' | 'unknown';

export type PathSurface = 'paved' | 'gravel' | 'grass' | 'mixed' | 'unknown';

export type ExtendedTerrain =
  | 'flat'
  | 'mostly_flat'
  | 'mixed'
  | 'hilly'
  | 'very_hilly'
  | 'unknown';

/** Trusted venue setting — approved via claims projection, never category-inferred. */
export type VenueEnvironment = 'indoor' | 'outdoor' | 'mixed' | 'unknown';

/** Trusted activity intensity — approved via claims projection, never category-inferred. */
export type VenueEnergyLevel = 'low' | 'moderate' | 'high' | 'mixed' | 'unknown';

export interface EnrichmentProvenance {
  sourceType: EnrichmentSourceType;
  sourceReference?: string;
  checkedDate: string;
  checkedBy?: string;
  evidenceNotes?: string;
}

export interface FamilyFacilitiesMap {
  toilets?: TriState;
  babyChanging?: TriState;
  familyToilet?: TriState;
  cafe?: TriState;
  restaurant?: TriState;
  picnicArea?: TriState;
  parking?: TriState;
  freeParking?: TriState;
  playground?: TriState;
  fencedPlayground?: TriState;
  shade?: TriState;
  waterRefill?: TriState;
  microwave?: TriState;
}

export interface AccessibilityInfo {
  stepFreeEntrance?: TriState;
  wheelchairAccessible?: TriState;
  accessibleToilet?: TriState;
  changingPlaces?: TriState;
  accessibleParking?: TriState;
  disabledParkingBays?: TriState;
  lift?: TriState;
  accessibleSeating?: TriState;
  accessiblePlayEquipment?: TriState;
  accessiblePaths?: TriState;
  notes?: string;
}

export interface SendInfo {
  sensoryFriendlySessions?: TriState;
  quietSessions?: TriState;
  reducedNoiseSessions?: TriState;
  visualTimetable?: TriState;
  quietRoom?: TriState;
  sensoryRoom?: TriState;
  earDefendersAvailable?: TriState;
  queueAssistance?: TriState;
  carerTicket?: TriState;
  staffSendTraining?: TriState;
  flexibleEntry?: TriState;
  smallGroupSessions?: TriState;
  scheduleNotes?: string;
}

export interface EnrichmentQueueItem {
  familypilotId: string;
  externalId: string;
  provider: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  address?: string;
  googlePrimaryType?: string;
  enrichmentStatus: 'provider_only' | 'ai_draft' | 'enriched' | 'verified';
  hasAiDraft?: boolean;
  lastChecked?: string;
  sourceType?: EnrichmentSourceType;
  hasMetadata: boolean;
  betaPriority: boolean;
  fetchedAt?: string;
}

export interface EnrichmentStats {
  discovered: number;
  providerOnly: number;
  aiDraft: number;
  enriched: number;
  verified: number;
  awaitingReview: number;
  byCategory: Record<string, number>;
}

export interface EnrichmentSavePayload {
  minRecommendedAge?: number | null;
  maxRecommendedAge?: number | null;
  ageNotes?: string;
  bestAges?: string;
  familyFacilities?: FamilyFacilitiesMap;
  pushchairSuitability?: PushchairSuitability;
  pathSurface?: PathSurface;
  extendedTerrain?: ExtendedTerrain;
  terrain?: 'flat' | 'hilly' | 'mixed';
  terrainNotes?: string;
  accessibility?: AccessibilityInfo;
  sendInfo?: SendInfo;
  whyFamiliesLike?: string[];
  goodToKnow?: string[];
  warnings?: string[];
  familyNotes?: string;
  parkingInfo?: string;
  estimatedSpend?: string;
  visitDurationMinutes?: number | null;
  environment?: VenueEnvironment;
  energyLevel?: VenueEnergyLevel;
  categoryConfirmed?: TriState;
  enrichmentProvenance?: EnrichmentProvenance;
  lastChecked?: string;
  checkedBy?: string;
  betaPriority?: boolean;
  requestedStatus?: 'enriched' | 'verified';
}

/** Trusted field-level fact — only active claims project into venue_family_metadata. */
export type VenueClaimStatus = 'active' | 'disputed' | 'expired' | 'superseded';

export interface VenueClaim {
  id: string;
  familypilotPlaceId: string;
  fieldKey: string;
  valueJson: string | number | boolean | null;
  confidence?: 'high' | 'medium' | 'low' | 'unknown';
  sourceUrl?: string | null;
  evidenceExcerpt?: string | null;
  sourceType?: string | null;
  sourceEvidenceId?: string | null;
  checkedAt: string;
  validUntil?: string | null;
  approvedAt: string;
  approvedBy: string;
  approvedFromDraftId?: string | null;
  status: VenueClaimStatus;
  supersedesClaimId?: string | null;
}
