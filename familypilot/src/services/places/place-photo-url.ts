/**
 * Google's photo references expire and must never be resolved with the API key in the client, so
 * `server/places/lib/google-places.js` stores each photo as a path to our own proxy instead:
 *
 *   /api/places/photo?id=<googlePlaceId>&index=<0-2>&credit=<attribution>
 *
 * `api/places/photo.js` then looks the reference up server-side and 302s to the signed
 * googleusercontent URL. That path is origin-relative, which a browser resolves against the page
 * it is on — but a native build has no page and no origin, so expo-image is handed a URI it
 * cannot fetch and every real venue photograph silently falls back to the category gradient.
 *
 * This resolves those paths to absolute URLs against the same base the places API client uses.
 */

/** Photos already stored as absolute URLs (other providers, seeded fixtures) pass through. */
const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * The origin our own API is served from. Mirrors `places-api-client`'s resolution so a build
 * pointed at a deployed API keeps its photos working, then falls back to the page's own origin.
 */
export function apiOrigin(): string | null {
  const configured =
    typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_PLACES_API_URL : undefined;
  if (configured) {
    // The variable points at `<origin>/api/places`; photos need the bare origin.
    const trimmed = configured.replace(/\/$/, '');
    const match = /^(https?:\/\/[^/]+)/i.exec(trimmed);
    if (match) return match[1];
  }
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return null;
}

/**
 * An absolute, fetchable URL for a stored photo path, or an empty string when there is nothing
 * usable. Returning empty rather than the unresolved path matters: `VenueImage` treats a missing
 * URI as "no photograph" and draws the designed fallback, whereas a relative URI on native
 * produces a failed request and a flash of the loading state first.
 */
export function resolvePlacePhotoUrl(photo: string | undefined | null): string {
  if (!photo) return '';
  if (ABSOLUTE.test(photo)) return photo;
  if (!photo.startsWith('/')) return '';

  const origin = apiOrigin();
  return origin ? `${origin}${photo}` : '';
}

/** The same resolution across a whole photo list, dropping any that cannot be resolved. */
export function resolvePlacePhotoUrls(photos: readonly string[] | undefined | null): string[] {
  return (photos ?? []).map(resolvePlacePhotoUrl).filter((url) => url.length > 0);
}

/**
 * The photographer Google requires us to name, carried on the proxy URL by the sync worker.
 * Null for anything that is not one of our proxied Google photos.
 */
export function photoCredit(uri: string | undefined | null): string | null {
  if (!uri || !uri.includes('/api/places/photo?')) return null;
  const query = uri.slice(uri.indexOf('?') + 1);
  const credit = new URLSearchParams(query).get('credit')?.trim();
  return credit ? credit : null;
}
