import { ExternalPlaceRecord } from '@/src/types/places';

function baseUrl(): string {
  if (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_PLACES_API_URL) {
    return process.env.EXPO_PUBLIC_PLACES_API_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/places`;
  }
  return '/api/places';
}

export interface BetweenResult {
  places: ExternalPlaceRecord[];
  provider: string;
  googleCalls: number;
  considered: number;
  shortlisted: number;
}

/**
 * A home position as it may leave the device for this request: about a kilometre, the same rounding a connection's snapshot
 * uses. The first pass is a straight-line corridor and does not need more, and an exact home address must never sit in a
 * request URL (which servers, proxies and logs keep).
 */
export const coarse = (degrees: number): number => Math.round(degrees * 100) / 100;

export interface BetweenHome {
  latitude: number;
  longitude: number;
  /** The most this family would drive, in minutes. Narrows the corridor; the app still checks each journey itself. */
  maxDriveMinutes?: number | null;
}

/** The straight-line km a family's drive limit can reach, generously (the app's own estimate decides, this only narrows). */
const kmForMinutes = (minutes: number | null | undefined): string | null =>
  minutes && Number.isFinite(minutes) && minutes > 0 ? String(Math.round(minutes * 1.2)) : null;

/**
 * The stored-catalogue places between two homes: Meet Halfway's candidates.
 *
 * `intent=between` on the search endpoint, not a route of its own (the deployment budget is twelve functions). The branch
 * returns before anything billable and the module behind it holds no Google client: a database read, never a discovery.
 * Errors propagate: an unreachable catalogue is not an empty middle, and the screen says which it is.
 */
export async function fetchBetween(a: BetweenHome, b: BetweenHome, limit?: number): Promise<BetweenResult> {
  const query = new URLSearchParams({
    intent: 'between',
    aLat: String(coarse(a.latitude)),
    aLng: String(coarse(a.longitude)),
    bLat: String(coarse(b.latitude)),
    bLng: String(coarse(b.longitude)),
  });
  const aKm = kmForMinutes(a.maxDriveMinutes);
  const bKm = kmForMinutes(b.maxDriveMinutes);
  if (aKm) query.set('aMaxKm', aKm);
  if (bKm) query.set('bMaxKm', bKm);
  if (limit) query.set('limit', String(limit));

  const response = await fetch(`${baseUrl()}/search?${query.toString()}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Between lookup failed (${response.status})`);
  }
  return (await response.json()) as BetweenResult;
}
