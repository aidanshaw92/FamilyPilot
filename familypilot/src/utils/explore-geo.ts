import { distanceKm, estimateDriveMinutes, knownLocation } from '@/src/services/places/geo-utils';
import { FamilyProfile, Venue } from '@/src/types';

/**
 * WHERE EXPLORE MEASURES FROM, and how far in miles.
 *
 * Distances are straight-line miles from a chosen point. They are exact for what they are (the great-circle distance between
 * two coordinates) and are never described as a route or a journey time: the "about N min drive" beside them is the existing
 * estimate (`estimateDriveMinutes`, labelled estimated), computed from the same two points. Nothing here calls a provider.
 *
 * The point is one of three: the family's home area (the default), the device's current location (asked for only when the
 * parent taps it, kept in memory on the phone and never stored or sent), or a postcode the parent typed.
 */
export const KM_PER_MILE = 1.609344;
export const RADIUS_MILES = [2, 5, 10] as const;
export type RadiusMiles = (typeof RADIUS_MILES)[number];
export const DEFAULT_RADIUS_MILES: RadiusMiles = 5;

export type AnchorKind = 'home' | 'device' | 'area';

export interface ExploreAnchor {
  kind: AnchorKind;
  /** The words in the "where" row: "Near NW5", "Your current location". */
  label: string;
  /** The line under it: where the point came from. */
  detail: string;
  latitude: number;
  longitude: number;
  /** True when no home location is known and central London stands in, so the screen can say so rather than imply a home. */
  standIn?: boolean;
}

const CENTRAL_LONDON = { latitude: 51.5074, longitude: -0.1278 };

export const kmToMiles = (km: number): number => km / KM_PER_MILE;
export const milesToKm = (miles: number): number => miles * KM_PER_MILE;

export function milesBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  return kmToMiles(distanceKm(a.latitude, a.longitude, b.latitude, b.longitude));
}

/** "0.2 miles", "1 mile", "4.2 miles", "12 miles": one decimal under ten, whole miles after. */
export function formatMiles(miles: number): string {
  if (!Number.isFinite(miles)) return 'distance not known';
  const rounded = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles);
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${rounded === 1 ? 'mile' : 'miles'}`;
}

const FULL_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}$/i;

/** What the family wrote for its home, as the screen shows it: a full postcode becomes its first half ("NW5 1TL" is "NW5"). */
export function areaDisplayName(text: string): string {
  const trimmed = text.trim();
  const match = FULL_POSTCODE.exec(trimmed);
  return match ? match[1].toUpperCase() : trimmed;
}

export function homeAnchor(profile: Pick<FamilyProfile, 'homeLocation' | 'homeLatitude' | 'homeLongitude'>): ExploreAnchor {
  const name = areaDisplayName(profile.homeLocation ?? '');
  if (Number.isFinite(profile.homeLatitude) && Number.isFinite(profile.homeLongitude)) {
    return { kind: 'home', label: name ? `Near ${name}` : 'Near your home', detail: 'Your home area', latitude: profile.homeLatitude as number, longitude: profile.homeLongitude as number };
  }
  const known = knownLocation(profile.homeLocation ?? '');
  if (known) return { kind: 'home', label: `Near ${name}`, detail: 'Your home area', ...known };
  return {
    kind: 'home',
    label: 'Central London',
    detail: 'Add your postcode in Profile to measure from home',
    ...CENTRAL_LONDON,
    standIn: true,
  };
}

export interface Located {
  venue: Venue;
  /** Straight-line miles from the anchor. */
  miles: number;
  /** The existing drive estimate between the same two points, in minutes; NaN when it cannot be worked out. */
  driveMinutes: number;
}

export function locate(venues: readonly Venue[], anchor: ExploreAnchor): Located[] {
  return venues.map((venue) => ({
    venue,
    miles: milesBetween(anchor, venue),
    driveMinutes: estimateDriveMinutes(anchor.latitude, anchor.longitude, venue.latitude, venue.longitude),
  }));
}

export interface Coverage {
  total: number;
  within2: number;
  within5: number;
  within10: number;
  nearestMiles: number | null;
}

/** How many places FamilyPilot holds near a point, so a thin area is described with its real numbers. */
export function coverageAround(located: readonly Located[]): Coverage {
  const finite = located.filter((l) => Number.isFinite(l.miles));
  const count = (limit: number) => finite.filter((l) => l.miles <= limit).length;
  return {
    total: finite.length,
    within2: count(2),
    within5: count(5),
    within10: count(10),
    nearestMiles: finite.length ? Math.min(...finite.map((l) => l.miles)) : null,
  };
}

export const countWithin = (coverage: Coverage, radius: RadiusMiles): number =>
  radius === 2 ? coverage.within2 : radius === 5 ? coverage.within5 : coverage.within10;

/** The next radius up that holds more places than this one, or null when widening finds nothing new. */
export function widerRadiusWithMore(coverage: Coverage, radius: RadiusMiles): RadiusMiles | null {
  const here = countWithin(coverage, radius);
  for (const next of RADIUS_MILES) {
    if (next > radius && countWithin(coverage, next) > here) return next;
  }
  return null;
}
