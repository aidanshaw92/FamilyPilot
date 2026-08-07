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

export const enrichmentApi = {
  async getConfig() {
    const response = await fetch(`${getEnrichmentApiUrl()}?action=config`);
    return response.json() as Promise<{ authConfigured: boolean; storageMode: string }>;
  },

  async getStats() {
    return enrichmentFetch('stats') as Promise<{
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
};
