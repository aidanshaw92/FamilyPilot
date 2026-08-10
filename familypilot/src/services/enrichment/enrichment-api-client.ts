const ENRICHMENT_TOKEN_KEY = 'fp_enrichment_admin_token';

function getEnrichmentApiUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/enrichment`;
  }
  if (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_PLACES_API_URL) {
    const base = process.env.EXPO_PUBLIC_PLACES_API_URL.replace(/\/$/, '');
    const origin = base.endsWith('/api/places') ? base.slice(0, -'/api/places'.length) : base;
    return `${origin}/api/enrichment`;
  }
  return '/api/enrichment';
}

export function getEnrichmentToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = window.sessionStorage.getItem(ENRICHMENT_TOKEN_KEY);
  if (!token) return null;
  const normalized = token.replace(/^\uFEFF/, '').trim().replace(/^['"]|['"]$/g, '');
  return normalized || null;
}

export function setEnrichmentToken(token: string): void {
  if (typeof window === 'undefined') return;
  const normalized = token.replace(/^\uFEFF/, '').trim().replace(/^['"]|['"]$/g, '');
  window.sessionStorage.setItem(ENRICHMENT_TOKEN_KEY, normalized);
}

export function clearEnrichmentToken(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(ENRICHMENT_TOKEN_KEY);
}

async function enrichmentFetch(action: string, options: RequestInit = {}, queryParams?: Record<string, string>) {
  const token = getEnrichmentToken();
  if (!token) throw new Error('Enrichment admin token required');

  const query = new URLSearchParams({ action });
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      query.set(key, value);
    }
  }

  const response = await fetch(`${getEnrichmentApiUrl()}?${query.toString()}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Enrichment-Token': token,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      missing?: string[];
      code?: string;
    };
    const err = new Error(body.error ?? `Enrichment API error ${response.status}`);
    (err as Error & { missing?: string[]; code?: string }).missing = body.missing;
    (err as Error & { code?: string }).code = body.code;
    throw err;
  }

  if (response.headers.get('content-type')?.includes('text/csv')) {
    return response.text();
  }

  return response.json();
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  shouldContinue?: () => boolean,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      if (shouldContinue && !shouldContinue()) return;
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export const enrichmentApi = {
  async getConfig() {
    const response = await fetch(`${getEnrichmentApiUrl()}?action=config`);
    return response.json() as Promise<{
      authConfigured: boolean;
      storageMode: string;
      aiConfigured?: boolean;
    }>;
  },

  async getStats(params?: {
    betaLat?: number;
    betaLng?: number;
    betaRadiusKm?: number;
  }) {
    const queryParams: Record<string, string> = {};
    if (params?.betaLat != null) queryParams.betaLat = String(params.betaLat);
    if (params?.betaLng != null) queryParams.betaLng = String(params.betaLng);
    if (params?.betaRadiusKm != null) queryParams.betaRadiusKm = String(params.betaRadiusKm);
    return enrichmentFetch('stats', {}, queryParams) as Promise<{
      stats: import('@/src/types/enrichment').EnrichmentStats;
      storageMode: string;
    }>;
  },

  async getQueue(params: {
    status?: string;
    sort?: string;
    betaLat?: number;
    betaLng?: number;
    betaRadiusKm?: number;
  }) {
    const queryParams: Record<string, string> = {};
    if (params.status) queryParams.status = params.status;
    if (params.sort) queryParams.sort = params.sort;
    if (params.betaLat != null) queryParams.betaLat = String(params.betaLat);
    if (params.betaLng != null) queryParams.betaLng = String(params.betaLng);
    if (params.betaRadiusKm != null) queryParams.betaRadiusKm = String(params.betaRadiusKm);
    return enrichmentFetch('queue', {}, queryParams) as Promise<{
      items: import('@/src/types/enrichment').EnrichmentQueueItem[];
      count: number;
    }>;
  },

  async syncArea(lat: number, lng: number, radiusKm: number) {
    return enrichmentFetch('sync', {
      method: 'POST',
      body: JSON.stringify({ lat, lng, radiusKm, intent: 'explore' }),
    }) as Promise<{ synced: number }>;
  },

  async getVenue(id: string) {
    return enrichmentFetch('venue', {}, { id }) as Promise<{
      place: Record<string, unknown> | null;
      metadata: import('@/src/types/places').VenueFamilyMetadata | null;
      draft: import('@/src/types/ai-enrichment').VenueEnrichmentDraftRecord | null;
      evidence: import('@/src/types/ai-enrichment').VenueSourceEvidence[];
      claims: import('@/src/types/enrichment').VenueClaim[];
      evidenceConflicts: import('@/src/utils/claim-review').EvidenceConflictSummary[];
    }>;
  },

  async getClaims(id: string, status?: string) {
    const queryParams: Record<string, string> = { id };
    if (status) queryParams.status = status;
    return enrichmentFetch('claims', {}, queryParams) as Promise<{
      claims: import('@/src/types/enrichment').VenueClaim[];
      count: number;
    }>;
  },

  async disputeClaim(claimId: string) {
    return enrichmentFetch('dispute-claim', {
      method: 'POST',
      body: JSON.stringify({ claimId }),
    }) as Promise<{
      claim: import('@/src/types/enrichment').VenueClaim;
      metadata: import('@/src/types/places').VenueFamilyMetadata;
      ok: boolean;
    }>;
  },

  async expireClaim(claimId: string) {
    return enrichmentFetch('expire-claim', {
      method: 'POST',
      body: JSON.stringify({ claimId }),
    }) as Promise<{
      claim: import('@/src/types/enrichment').VenueClaim;
      metadata: import('@/src/types/places').VenueFamilyMetadata;
      ok: boolean;
    }>;
  },

  async saveVenue(id: string, payload: import('@/src/types/enrichment').EnrichmentSavePayload) {
    return enrichmentFetch(
      'venue',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      { id },
    ) as Promise<{ metadata: import('@/src/types/places').VenueFamilyMetadata; saved: boolean }>;
  },

  async exportCsv() {
    return enrichmentFetch('export') as Promise<string>;
  },

  async generateDraft(id: string, regenerate = false) {
    return enrichmentFetch('generate-draft', {
      method: 'POST',
      body: JSON.stringify({ id, regenerate }),
    }) as Promise<{
      draft: import('@/src/types/ai-enrichment').VenueEnrichmentDraftRecord;
      tokenUsage?: Record<string, number>;
      estimatedCostUsd?: number;
      evidenceBundle?: import('@/src/types/ai-enrichment').EvidenceBundle;
    }>;
  },

  /** Regenerate a legacy pending draft through the evidence-backed pipeline. */
  async regenerateDraftWithEvidence(id: string) {
    return this.generateDraft(id, true);
  },

  async getLegacyDrafts(params?: { batchSize?: number }) {
    const queryParams: Record<string, string> = {};
    if (params?.batchSize != null) queryParams.batchSize = String(params.batchSize);
    return enrichmentFetch('legacy-drafts', {}, queryParams) as Promise<{
      items: Array<{
        familypilotPlaceId: string;
        familypilotId: string;
        name: string;
        draftId: string;
        evidenceStatus: string;
        enrichmentStatus: string;
      }>;
      count: number;
    }>;
  },

  /**
   * Client-controlled batch (Option A) — avoids Vercel 504 on long server batch.
   * Calls generate-draft per venue with limited concurrency; each draft persists immediately.
   */
  async generateDraftBatch(
    params: {
      batchSize?: number;
      betaLat?: number;
      betaLng?: number;
      betaRadiusKm?: number;
      concurrency?: number;
      onProgress?: (progress: import('@/src/types/ai-enrichment').BatchDraftProgress) => void;
      shouldContinue?: () => boolean;
    } = {},
  ): Promise<import('@/src/types/ai-enrichment').BatchDraftResult> {
    const batchSize = params.batchSize ?? 10;
    const concurrency = params.concurrency ?? 2;

    const { items } = await this.getQueue({
      status: 'provider_only',
      sort: 'priority',
      betaLat: params.betaLat,
      betaLng: params.betaLng,
      betaRadiusKm: params.betaRadiusKm,
    });

    const candidates = items.slice(0, batchSize);
    const results: import('@/src/types/ai-enrichment').BatchDraftItemResult[] = [];
    let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let estimatedCostUsd = 0;
    let completed = 0;

    const report = () => {
      params.onProgress?.({
        total: candidates.length,
        completed,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results: [...results],
      });
    };

    await runWithConcurrency(
      candidates,
      concurrency,
      async (item) => {
        if (params.shouldContinue && !params.shouldContinue()) {
          return null;
        }

        params.onProgress?.({
          total: candidates.length,
          completed,
          succeeded: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
          current: item.name,
          results: [...results],
        });

        try {
          const result = await this.generateDraft(item.familypilotId);
          tokenUsage.promptTokens += result.tokenUsage?.promptTokens ?? 0;
          tokenUsage.completionTokens += result.tokenUsage?.completionTokens ?? 0;
          tokenUsage.totalTokens += result.tokenUsage?.totalTokens ?? 0;
          estimatedCostUsd += result.estimatedCostUsd ?? 0;
          const entry = {
            familypilotPlaceId: item.familypilotId,
            name: item.name,
            ok: true as const,
            draftId: result.draft.id,
            evidenceStatus: result.draft.evidenceStatus,
          };
          results.push(entry);
        } catch (error) {
          results.push({
            familypilotPlaceId: item.familypilotId,
            name: item.name,
            ok: false,
            error: error instanceof Error ? error.message : 'Generation failed',
          });
        }

        completed += 1;
        report();
        return null;
      },
      params.shouldContinue,
    );

    return {
      processed: candidates.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
      tokenUsage,
      estimatedCostUsd,
    };
  },

  /**
   * Client-controlled legacy draft regeneration — same concurrency model as generateDraftBatch.
   * Re-runs evidence-backed generation for pending drafts with legacy_no_sources status.
   */
  async regenerateLegacyDraftBatch(
    params: {
      batchSize?: number;
      concurrency?: number;
      onProgress?: (progress: import('@/src/types/ai-enrichment').BatchDraftProgress) => void;
      shouldContinue?: () => boolean;
    } = {},
  ): Promise<import('@/src/types/ai-enrichment').BatchDraftResult> {
    const batchSize = params.batchSize ?? 10;
    const concurrency = params.concurrency ?? 2;

    const { items } = await this.getLegacyDrafts({ batchSize });
    const candidates = items.slice(0, batchSize);
    const results: import('@/src/types/ai-enrichment').BatchDraftItemResult[] = [];
    let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let estimatedCostUsd = 0;
    let completed = 0;

    const report = () => {
      params.onProgress?.({
        total: candidates.length,
        completed,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results: [...results],
      });
    };

    await runWithConcurrency(
      candidates,
      concurrency,
      async (item) => {
        if (params.shouldContinue && !params.shouldContinue()) {
          return null;
        }

        params.onProgress?.({
          total: candidates.length,
          completed,
          succeeded: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
          current: item.name,
          results: [...results],
        });

        try {
          const result = await this.regenerateDraftWithEvidence(item.familypilotPlaceId);
          tokenUsage.promptTokens += result.tokenUsage?.promptTokens ?? 0;
          tokenUsage.completionTokens += result.tokenUsage?.completionTokens ?? 0;
          tokenUsage.totalTokens += result.tokenUsage?.totalTokens ?? 0;
          estimatedCostUsd += result.estimatedCostUsd ?? 0;
          results.push({
            familypilotPlaceId: item.familypilotPlaceId,
            name: item.name,
            ok: true,
            draftId: result.draft.id,
            evidenceStatus: result.draft.evidenceStatus,
          });
        } catch (error) {
          results.push({
            familypilotPlaceId: item.familypilotPlaceId,
            name: item.name,
            ok: false,
            error: error instanceof Error ? error.message : 'Regeneration failed',
          });
        }

        completed += 1;
        report();
        return null;
      },
      params.shouldContinue,
    );

    return {
      processed: candidates.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
      tokenUsage,
      estimatedCostUsd,
    };
  },

  /**
   * Regenerate every pending AI draft through the current evidence-backed pipeline.
   * Processing is deliberately sequential: each atomic replacement is persisted
   * before the next venue starts, while approvals remain a separate manual step.
   */
  async regenerateAllPendingDrafts(
    params: {
      concurrency?: number;
      onProgress?: (progress: import('@/src/types/ai-enrichment').BatchDraftProgress) => void;
      shouldContinue?: () => boolean;
    } = {},
  ): Promise<import('@/src/types/ai-enrichment').BatchDraftResult> {
    const concurrency = Math.max(1, Math.min(params.concurrency ?? 1, 2));
    const { items } = await this.getQueue({
      status: 'ai_draft',
      sort: 'alphabetical',
    });
    const candidates = items.filter((item) => item.hasAiDraft !== false);
    const results: import('@/src/types/ai-enrichment').BatchDraftItemResult[] = [];
    let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let estimatedCostUsd = 0;
    let completed = 0;

    const report = (current?: string) => {
      params.onProgress?.({
        total: candidates.length,
        completed,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        current,
        results: [...results],
      });
    };

    report();

    await runWithConcurrency(
      candidates,
      concurrency,
      async (item) => {
        if (params.shouldContinue && !params.shouldContinue()) return null;
        report(item.name);

        try {
          const result = await this.regenerateDraftWithEvidence(item.familypilotId);
          tokenUsage.promptTokens += result.tokenUsage?.promptTokens ?? 0;
          tokenUsage.completionTokens += result.tokenUsage?.completionTokens ?? 0;
          tokenUsage.totalTokens += result.tokenUsage?.totalTokens ?? 0;
          estimatedCostUsd += result.estimatedCostUsd ?? 0;
          results.push({
            familypilotPlaceId: item.familypilotId,
            name: item.name,
            ok: true,
            draftId: result.draft.id,
            evidenceStatus: result.draft.evidenceStatus,
          });
        } catch (error) {
          results.push({
            familypilotPlaceId: item.familypilotId,
            name: item.name,
            ok: false,
            error: error instanceof Error ? error.message : 'Regeneration failed',
          });
        }

        completed += 1;
        report();
        return null;
      },
      params.shouldContinue,
    );

    return {
      processed: completed,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
      tokenUsage,
      estimatedCostUsd,
    };
  },

  async getDraft(id: string) {
    return enrichmentFetch('draft', {}, { id }) as Promise<{
      draft: import('@/src/types/ai-enrichment').VenueEnrichmentDraftRecord | null;
    }>;
  },

  async approveDraft(id: string, payload?: import('@/src/types/enrichment').EnrichmentSavePayload) {
    return enrichmentFetch('approve-draft', {
      method: 'POST',
      body: JSON.stringify({ id, payload, reviewedBy: 'enrichment-editor' }),
    }) as Promise<{ metadata: import('@/src/types/places').VenueFamilyMetadata; draftId: string }>;
  },

  async rejectDraft(id: string) {
    return enrichmentFetch('reject-draft', {
      method: 'POST',
      body: JSON.stringify({ id, reviewedBy: 'enrichment-editor' }),
    }) as Promise<{ rejected: boolean; draftId: string }>;
  },
};
