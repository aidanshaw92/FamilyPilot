import { describe, expect, it } from 'vitest';

import { estimateDriveMinutes } from '@/src/services/places/geo-utils';
import { mergePlaceToVenue } from '@/src/services/places/merge-place';
import { ExternalPlaceRecord } from '@/src/types/places';
import { Venue } from '@/src/types';
import { getTravelSignal } from '@/src/utils/family-signals';
import { filterVenues } from '@/src/utils/filter-venues';
import {
  compareTravelMinutes,
  isTravelTimeKnown,
  travelTimeLabel,
  travelTimeWithMode,
  UNKNOWN_TRAVEL_LABEL,
} from '@/src/utils/travel-time';

/**
 * REGRESSION: a place with no coordinates showed "about 10739 min".
 *
 * `null` coerces to 0 in arithmetic, so a missing latitude/longitude was the point 0,0 (the Gulf of
 * Guinea) and the Haversine distance from London to it was a real, enormous, meaningless number. The
 * search path normally guarantees coordinates, but FamilyPilot must fail safely: when a journey cannot
 * be worked out, it says so with the existing "Travel time not worked out yet" treatment and never
 * prints a calculated figure.
 */
const HOME = { lat: 51.5074, lng: -0.1278 };

const record = (over: Partial<ExternalPlaceRecord> = {}): ExternalPlaceRecord => ({
  familypilotId: 'fp-google-nocoords',
  externalId: 'google:nocoords',
  provider: 'google',
  name: 'A Place Without A Location',
  category: 'park',
  latitude: 51.52,
  longitude: -0.1,
  photos: [],
  provenance: {},
  fetchedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

const venueWith = (over: Partial<ExternalPlaceRecord>): Venue =>
  mergePlaceToVenue(record(over), null, HOME.lat, HOME.lng);

describe('estimating a journey from coordinates that may be missing', () => {
  it('still estimates a real journey from real coordinates', () => {
    const minutes = estimateDriveMinutes(HOME.lat, HOME.lng, 51.52, -0.1);
    expect(Number.isFinite(minutes)).toBe(true);
    expect(minutes).toBeGreaterThanOrEqual(1);
    expect(minutes).toBeLessThan(30);
  });

  it('says "not worked out" (NaN) for every kind of missing coordinate, never a distance to 0,0', () => {
    const bad: unknown[] = [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, '51.5', {}];
    for (const value of bad) {
      expect(estimateDriveMinutes(HOME.lat, HOME.lng, value as number, -0.1), `lat ${String(value)}`).toBeNaN();
      expect(estimateDriveMinutes(HOME.lat, HOME.lng, 51.52, value as number), `lng ${String(value)}`).toBeNaN();
      expect(estimateDriveMinutes(value as number, HOME.lng, 51.52, -0.1), `home lat ${String(value)}`).toBeNaN();
    }
  });

  it('treats a genuine coordinate of 0 as a coordinate, not as missing', () => {
    expect(Number.isFinite(estimateDriveMinutes(0, 0, 0.01, 0.01))).toBe(true);
  });
});

describe('a venue with no coordinates', () => {
  const venue = venueWith({ latitude: null as never, longitude: null as never });

  it('has an unknown journey, not a huge one', () => {
    expect(isTravelTimeKnown(venue.driveMinutes)).toBe(false);
  });

  it('is labelled with the existing unknown treatment wherever a travel time is worded', () => {
    expect(travelTimeLabel(venue.driveMinutes, 'estimated')).toBe(UNKNOWN_TRAVEL_LABEL);
    expect(travelTimeWithMode(venue.driveMinutes, 'estimated', 'drive')).toBe(UNKNOWN_TRAVEL_LABEL);
    expect(getTravelSignal(venue.driveMinutes).label).toBe(UNKNOWN_TRAVEL_LABEL);
  });

  it('never prints a calculated figure for it', () => {
    const text = [
      travelTimeLabel(venue.driveMinutes, 'estimated'),
      getTravelSignal(venue.driveMinutes).label,
      ...venue.familyScore.explanation,
    ].join(' ');
    expect(text).not.toMatch(/\d{3,}/);
    expect(text).not.toMatch(/NaN/);
  });

  it('is not treated as within a drive limit, but is kept when there is no limit', () => {
    const known = venueWith({ familypilotId: 'fp-google-known', name: 'Known' });
    const all = [known, venue];
    expect(filterVenues(all, 'all', [], 30, 30, 'any').map((v) => v.id)).toEqual(['fp-google-known']);
    expect(filterVenues(all, 'all', [], 'any', 30, 'any').map((v) => v.id)).toHaveLength(2);
  });

});

describe('ordering by journey time with unknown journeys', () => {
  it('puts known journeys first in order and unknown ones last', () => {
    const sorted = [Number.NaN, 30, 5, Number.NaN, 12].sort(compareTravelMinutes);
    expect(sorted.slice(0, 3)).toEqual([5, 12, 30]);
    expect(sorted.slice(3).every(Number.isNaN)).toBe(true);
  });
});
