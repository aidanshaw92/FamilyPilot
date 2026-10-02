import { NearbyFoodResult } from '@/src/types/nearby-food';

function baseUrl(): string {
  if (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_PLACES_API_URL) {
    return process.env.EXPO_PUBLIC_PLACES_API_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/places`;
  }
  return '/api/places';
}

/**
 * Fetches the places to eat near one anchor.
 *
 * Errors propagate rather than resolving to an empty list. An outage is not an empty neighbourhood,
 * and "no restaurants found" is a claim about the world that a failed request cannot support --
 * react-query's error state is what the screen renders, which is a different thing on purpose.
 */
export async function fetchNearbyFood(params: {
  latitude: number;
  longitude: number;
  placeId?: string;
  radiusM?: number;
  limit?: number;
}): Promise<NearbyFoodResult> {
  // `intent=nearby-food` on the search endpoint, not a route of its own: the deployment budget is
  // twelve serverless functions. The branch returns before anything billable, and the module behind
  // it holds no Google client -- see the comment at that branch.
  const query = new URLSearchParams({
    intent: 'nearby-food',
    lat: String(params.latitude),
    lng: String(params.longitude),
  });
  if (params.placeId) query.set('placeId', params.placeId);
  if (params.radiusM) query.set('radiusM', String(params.radiusM));
  if (params.limit) query.set('limit', String(params.limit));

  const response = await fetch(`${baseUrl()}/search?${query.toString()}`, {
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Nearby food lookup failed (${response.status})`);
  }

  return (await response.json()) as NearbyFoodResult;
}
