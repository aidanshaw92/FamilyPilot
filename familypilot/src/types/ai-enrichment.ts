import { EnrichmentSavePayload } from '@/src/types/enrichment';

/** Confidence in evidence supporting a draft field — not Family Match. */
export type DraftConfidence = 'high' | 'medium' | 'low' | 'unknown';

export interface DraftTriStateField {
  value: 'yes' | 'no' | 'unknown';
  confidence: DraftConfidence;
  reason?: string | null;
}

export interface DraftAgeRecommendation {
  min: number | null;
  max: number | null;
  notes: string | null;
  confidence: DraftConfidence;
}

export interface VenueEnrichmentDraftJson {
  recommendedAge: DraftAgeRecommendation;
  familyFacilities: {
    toilets: DraftTriStateField;
    babyChanging: DraftTriStateField;
    parking: DraftTriStateField;
    cafe: DraftTriStateField;
  };
  pushchairSuitability: {
    value: 'excellent' | 'good' | 'mixed' | 'difficult' | 'unknown';
    confidence: DraftConfidence;
    reason?: string | null;
  };
  terrain: {
    value: 'flat' | 'mostly_flat' | 'mixed' | 'hilly' | 'very_hilly' | 'unknown';
    confidence: DraftConfidence;
    reason?: string | null;
  };
  accessibility: Record<string, DraftTriStateField>;
  sendInfo: Record<string, DraftTriStateField>;
  whyFamiliesLike: string[];
  goodToKnow: string[];
  suggestedVisitDuration: number | null;
  rainyDaySuitability: 'yes' | 'no' | 'unknown';
  overallDraftConfidence: DraftConfidence;
}

export interface VenueEnrichmentInput {
  familypilotPlaceId: string;
  externalId?: string;
  name: string;
  category: string;
  address?: string;
  description?: string;
  website?: string;
  phone?: string;
  openingHours?: string;
  googlePrimaryType?: string;
  googleTypes?: string[];
  existingMetadata?: EnrichmentSavePayload | null;
}

export interface VenueEnrichmentDraftResult {
  draftJson: VenueEnrichmentDraftJson;
  model: string;
  sourceContext: Record<string, unknown>;
  confidenceJson: Record<string, DraftConfidence>;
  tokenUsage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  estimatedCostUsd?: number;
}

export type DraftStatus = 'pending_review' | 'approved' | 'rejected' | 'superseded';

export interface VenueEnrichmentDraftRecord {
  id: string;
  familypilotPlaceId: string;
  externalId?: string;
  draftJson: VenueEnrichmentDraftJson;
  model: string;
  generatedAt: string;
  sourceContext: Record<string, unknown>;
  confidenceJson: Record<string, DraftConfidence>;
  status: DraftStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  tokenUsage?: Record<string, number>;
  estimatedCostUsd?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BatchDraftResult {
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{
    familypilotPlaceId: string;
    name: string;
    ok: boolean;
    error?: string;
    draftId?: string;
  }>;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  estimatedCostUsd: number;
}
