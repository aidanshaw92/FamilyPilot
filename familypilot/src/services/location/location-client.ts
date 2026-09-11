export interface ResolvedLocation {
  area: string;
  latitude: number;
  longitude: number;
}

function getLocationEndpoint(): string {
  const explicit = process.env.EXPO_PUBLIC_PLANNING_API_URL;
  if (explicit) return `${explicit.replace(/\/$/, '')}/location`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/planning/location`;
  }
  throw new Error('Location lookup is not configured for this app.');
}

export async function resolveUkLocation(area: string): Promise<ResolvedLocation> {
  const input = area.trim();
  if (input.length < 2) throw new Error('Enter a UK town or postcode.');

  const response = await fetch(getLocationEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ area: input }),
    signal: AbortSignal.timeout(12000),
  });

  const result = (await response.json().catch(() => ({}))) as Partial<ResolvedLocation> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(result.error ?? 'Could not find that location.');
  }

  if (!Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
    throw new Error('Could not find that location.');
  }

  return {
    area: typeof result.area === 'string' && result.area.trim() ? result.area : input,
    latitude: result.latitude as number,
    longitude: result.longitude as number,
  };
}
