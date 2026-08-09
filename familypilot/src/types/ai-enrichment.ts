import { EnrichmentSavePayload } from '@/src/types/enrichment';

/** Confidence in evidence supporting a draft field — not Family Match. */
export type DraftConfidence = 'high' | 'medium' | 'low' | 'unknown';

export type EvidenceStatus = 'evidence_backed' | 'legacy_no_sources' | 'provider_only';

export interface DraftEvidenceMeta {
  sourceUrl?: string | null;
  evidence?: string | null;
  sourceType?: string | null;
  retrievedAt?: string | null;
}

export interface DraftTriStateField extends DraftEvidenceMeta {
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
  pushchairSuitability: DraftTriStateField & {
    value: 'excellent' | 'good' | 'mixed' | 'difficult' | 'unknown';
  };
  terrain: DraftTriStateField & {
    value: 'flat' | 'mostly_flat' | 'mixed' | 'hilly' | 'very_hilly' | 'unknown';
  };
  environment: DraftTriStateField & {
    value: 'indoor' | 'outdoor' | 'mixed' | 'unknown';
  };
  energyLevel: DraftTriStateField & {
    value: 'low' | 'moderate' | 'high' | 'mixed' | 'unknown';
  };
  accessibility: Record<string, DraftTriStateField>;
  sendInfo: Record<string, DraftTriStateField>;
  whyFamiliesLike: string[];
  goodToKnow: string[];
  suggestedVisitDuration: number | null;
  rainyDaySuitability: 'yes' | 'no' | 'unknown';
  overallDraftConfidence: DraftConfidence;
}

export interface EvidenceFact {
  field: string;
  value: string;
  confidence: DraftConfidence;
  evidenceText?: string | null;
  sourceUrl?: string | null;
  sourceType?: string | null;
  retrievedAt?: string | null;
}

export interface EvidenceDiagnostics {
  linksDiscovered: Array<{
    url: string;
    score?: number;
    reason?: string;
    anchorText?: string | null;
  }>;
  linksSelected: Array<{
    url: string;
    score?: number;
    reason?: string;
    anchorText?: string | null;
    sourceType?: string;
  }>;
  pagesFetched: Array<{
    url: string;
    fetchStatus: string;
    pageTitle?: string | null;
  }>;
  pagesFailed: Array<{
    url: string;
    fetchStatus: string;
    error?: string;
  }>;
  evidenceByPage: Array<{
    url: string;
    fields: string[];
    factCount: number;
    error?: string;
  }>;
  homepageFetchStatus?: string;
  homepageFetchError?: string | null;
}

export interface EvidenceSourceSummary {
  url: string;
  type?: string;
  sourceType?: string;
  pageTitle?: string | null;
  retrievedAt?: string;
  fetchStatus?: string;
  error?: string | null;
  facts?: EvidenceFact[];
}

export interface EvidenceBundle {
  venueId: string;
  sourceStatus: 'official_website' | 'no_official_source' | string;
  sources: EvidenceSourceSummary[];
  facts: EvidenceFact[];
  pagesChecked: number;
  cacheHits: number;
  diagnostics?: EvidenceDiagnostics;
}

export interface VenueSourceEvidence {
  id: string;
  familypilotPlaceId: string;
  sourceUrl: string;
  sourceType: string;
  pageTitle?: string | null;
  retrievedAt: string;
  contentHash?: string;
  extractedEvidence: EvidenceFact[];
  fetchStatus: string;
  error?: string | null;
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
  evidenceBundle?: EvidenceBundle | null;
}

export interface VenueEnrichmentDraftResult {
  draftJson: VenueEnrichmentDraftJson;
  model: string;
  sourceContext: Record<string, unknown>;
  confidenceJson: Record<string, DraftConfidence>;
  evidenceStatus?: EvidenceStatus;
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
  evidenceStatus?: EvidenceStatus;
  status: DraftStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  tokenUsage?: Record<string, number>;
  estimatedCostUsd?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BatchDraftItemResult {
  familypilotPlaceId: string;
  name: string;
  ok: boolean;
  error?: string;
  draftId?: string;
  evidenceStatus?: EvidenceStatus;
}

export interface BatchDraftResult {
  processed: number;
  succeeded: number;
  failed: number;
  results: BatchDraftItemResult[];
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  estimatedCostUsd: number;
}

export interface BatchDraftProgress {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  current?: string;
  results: BatchDraftItemResult[];
}
