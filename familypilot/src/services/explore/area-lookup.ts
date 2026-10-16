import { knownLocation } from '@/src/services/places/geo-utils';

/**
 * Turns what a parent typed into a point Explore can measure from, WITHOUT spending anything.
 *
 * A full UK postcode ("NW5 1TL") or just its first half ("NW5") is looked up on postcodes.io, which is free. A few well-known
 * towns are answered from the list built into the app. Anything else is NOT sent to a geocoder: the location endpoint the rest of
 * the app uses falls back to Google Geocoding (billable) for a town name, and Explore must never cause a paid request, so it
 * says what it can look up instead.
 *
 * The postcode is sent to postcodes.io only when the parent submits it, and nothing about it is stored.
 */
export type AreaLookup =
  | { ok: true; label: string; detail: string; latitude: number; longitude: number }
  | { ok: false; message: string };

const FULL_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const OUTWARD_CODE = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

export const AREA_HELP =
  'Enter a London postcode like NW5 1TL, just the first part like NW5, or a well-known town. Other town names are not looked up yet.';

const titleCase = (text: string) => text.trim().replace(/\b\w/g, (c) => c.toUpperCase());

interface PostcodesIoBody {
  status?: number;
  result?: { latitude?: number | null; longitude?: number | null; outcode?: string } | null;
}

async function fetchPoint(url: string, fetchImpl: typeof fetch): Promise<{ latitude: number; longitude: number; outcode?: string } | 'not_found' | 'unavailable'> {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  } catch {
    return 'unavailable';
  }
  if (response.status === 404) return 'not_found';
  if (!response.ok) return 'unavailable';
  let body: PostcodesIoBody;
  try {
    body = (await response.json()) as PostcodesIoBody;
  } catch {
    return 'unavailable';
  }
  const result = body.result;
  if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) return 'not_found';
  return { latitude: result.latitude as number, longitude: result.longitude as number, outcode: result.outcode };
}

export async function lookupArea(input: string, fetchImpl: typeof fetch = fetch): Promise<AreaLookup> {
  const text = input.trim();
  if (!text) return { ok: false, message: AREA_HELP };

  if (FULL_POSTCODE.test(text) || OUTWARD_CODE.test(text)) {
    const compact = text.replace(/\s+/g, '').toUpperCase();
    const full = FULL_POSTCODE.test(text);
    const found = await fetchPoint(`https://api.postcodes.io/${full ? 'postcodes' : 'outcodes'}/${encodeURIComponent(compact)}`, fetchImpl);
    if (found === 'unavailable') return { ok: false, message: 'We could not look that up just now. Check your connection and try again, or use your home area.' };
    if (found === 'not_found') return { ok: false, message: 'We could not find that postcode. Check it and try again.' };
    const outcode = (found.outcode ?? (full ? compact.slice(0, -3) : compact)).toUpperCase();
    return { ok: true, label: `Near ${outcode}`, detail: full ? 'The postcode you entered' : 'The area you entered', latitude: found.latitude, longitude: found.longitude };
  }

  const town = knownLocation(text);
  if (town) return { ok: true, label: `Near ${titleCase(text)}`, detail: 'The area you entered', ...town };
  return { ok: false, message: AREA_HELP };
}
