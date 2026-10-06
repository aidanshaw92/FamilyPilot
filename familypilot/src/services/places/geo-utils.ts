/** Default home area for central London — used only when no profile coordinates are available. */
export const DEFAULT_HOME = {
  label: 'London',
  latitude: 51.5074,
  longitude: -0.1278,
};

const KNOWN_LOCATIONS: Record<string, { latitude: number; longitude: number }> = {
  'mill hill': { latitude: 51.613, longitude: -0.249 },
  'bushey': { latitude: 51.643, longitude: -0.36 },
  'richmond': { latitude: 51.4613, longitude: -0.3037 },
  'greenwich': { latitude: 51.4826, longitude: -0.0077 },
  'stratford': { latitude: 51.5413, longitude: -0.0033 },
  'croydon': { latitude: 51.3762, longitude: -0.0982 },
  'bromley': { latitude: 51.406, longitude: 0.013 },
  'wimbledon': { latitude: 51.4214, longitude: -0.2064 },
  'hampstead': { latitude: 51.556, longitude: -0.178 },
  'barnet': { latitude: 51.653, longitude: -0.2 },
  'ealing': { latitude: 51.513, longitude: -0.305 },
  watford: { latitude: 51.656, longitude: -0.396 },
  elstree: { latitude: 51.658, longitude: -0.308 },
};

type HomeInput =
  | string
  | {
      homeLocation: string;
      homeLatitude?: number | null;
      homeLongitude?: number | null;
    };

/**
 * Resolve the family's saved centroid first. Legacy profiles without coordinates still use
 * known-area fallbacks, but new/edited profiles are geocoded before they are saved.
 */
export function resolveHomeCoordinates(input: HomeInput): { latitude: number; longitude: number } {
  if (typeof input !== 'string') {
    if (Number.isFinite(input.homeLatitude) && Number.isFinite(input.homeLongitude)) {
      return {
        latitude: input.homeLatitude as number,
        longitude: input.homeLongitude as number,
      };
    }
    return resolveHomeCoordinates(input.homeLocation);
  }

  const key = input.trim().toLowerCase();
  if (!key) return DEFAULT_HOME;

  for (const [pattern, coords] of Object.entries(KNOWN_LOCATIONS)) {
    if (key.includes(pattern.replace(', hertfordshire', ''))) return coords;
  }

  return DEFAULT_HOME;
}

/** Haversine distance in km. */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Whether a latitude/longitude pair can be a place on Earth that somebody could drive to.
 *
 * A JSON `null` is NOT a number here. `Number.isFinite(null)` is false, but plain arithmetic coerces `null` to 0, so
 * a venue record with null coordinates used to be measured from "0, 0" in the Gulf of Guinea: "about 10739 min". A pair
 * of exactly 0, 0 is treated the same way, because that is where a missing coordinate lands once something has coerced
 * it, and no family-day-out place is there.
 */
export function isUsableCoordinate(latitude: unknown, longitude: unknown): boolean {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  return !(latitude === 0 && longitude === 0);
}

/**
 * Rough drive minutes at ~40 km/h average including local roads.
 *
 * Returns `NaN` when either end is not a usable coordinate. NaN is the product's existing "no journey could be worked
 * out" value: `travelTimeLabel` renders it as "Travel time not worked out yet", and every comparison treats it as
 * unknown. A nonsensical figure is never produced.
 */
export function estimateDriveMinutes(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  if (!isUsableCoordinate(fromLat, fromLng) || !isUsableCoordinate(toLat, toLng)) return Number.NaN;
  const km = distanceKm(fromLat, fromLng, toLat, toLng);
  return Math.max(1, Math.round((km / 40) * 60 * 1.25));
}

export function slugifyId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}
