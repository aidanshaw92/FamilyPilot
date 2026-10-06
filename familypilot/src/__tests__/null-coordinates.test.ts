import { describe, expect, it } from 'vitest';

import { estimateDriveMinutes, isUsableCoordinate } from '@/src/services/places/geo-utils';
import { matchVenueToDayRequest } from '@/src/services/matching/day-request-matcher';
import { mergePlaceToVenue } from '@/src/services/places/merge-place';
import { personaliseVenue } from '@/src/utils/personalise-venues';
import { UNKNOWN_TRAVEL_LABEL, travelTimeLabel, travelTimeSpoken } from '@/src/utils/travel-time';
import { ExternalPlaceRecord } from '@/src/types/places';
import { FamilyProfile } from '@/src/types';
import { MatchableVenueFacts } from '@/src/types/day-request';

/**
 * A place with no usable coordinates must fail safely: the existing "Travel time not worked out yet" treatment, never a
 * calculated figure.
 *
 * THE DEFECT. A venue record with `latitude: null` was measured as if it were at 0, 0 (arithmetic coerces null to 0), and a
 * card read "about 10739 min". The current search path normally guarantees coordinates, so this was latent; it is fixed
 * where the figure is made, so no caller can reach it.
 */

const HOME = { latitude: 51.643, longitude: -0.36 };

describe('a coordinate is usable only if it is a real place on Earth', () => {
  it.each([
    [null, -0.1],
    [51.5, null],
    [undefined, undefined],
    [Number.NaN, -0.1],
    ['51.5', '-0.1'],
    [0, 0],
    [91, 0.1],
    [51.5, 181],
    [Number.POSITIVE_INFINITY, 0],
  ])('rejects %p, %p', (lat, lng) => {
    expect(isUsableCoordinate(lat, lng)).toBe(false);
  });

  it('accepts a real London position, and the equator or meridian on their own', () => {
    expect(isUsableCoordinate(51.5074, -0.1278)).toBe(true);
    expect(isUsableCoordinate(0, 51)).toBe(true);
    expect(isUsableCoordinate(51, 0)).toBe(true);
  });
});

describe('the estimate never invents a journey', () => {
  it.each([
    ['a null venue latitude', HOME.latitude, HOME.longitude, null, -0.1],
    ['a null venue longitude', HOME.latitude, HOME.longitude, 51.5, null],
    ['both null', HOME.latitude, HOME.longitude, null, null],
    ['an undefined venue', HOME.latitude, HOME.longitude, undefined, undefined],
    ['a null home', null, null, 51.5, -0.1],
    ['a venue at 0, 0', HOME.latitude, HOME.longitude, 0, 0],
  ])('is NaN for %s, not a distance to the Gulf of Guinea', (_name, a, b, c, d) => {
    const minutes = estimateDriveMinutes(a as never, b as never, c as never, d as never);
    expect(Number.isNaN(minutes)).toBe(true);
  });

  it('still estimates a real journey, and is unchanged for it', () => {
    const minutes = estimateDriveMinutes(HOME.latitude, HOME.longitude, 51.5074, -0.1278);
    expect(minutes).toBeGreaterThan(10);
    expect(minutes).toBeLessThan(90);
    expect(estimateDriveMinutes(51.5, -0.1, 51.5, -0.1)).toBe(1);
  });
});

describe('a record with null coordinates reaches the screen as "not worked out yet"', () => {
  const place = (over: Partial<ExternalPlaceRecord>): ExternalPlaceRecord =>
    ({
      familypilotId: 'fp-google-no-coordinates',
      externalId: 'ext-no-coordinates',
      provider: 'google',
      name: 'No Coordinates Park',
      latitude: null,
      longitude: null,
      category: 'park',
      photos: [],
      provenance: {},
      fetchedAt: '2026-10-01T00:00:00.000Z',
      enrichmentStatus: 'provider_only',
      ...over,
    }) as unknown as ExternalPlaceRecord;

  const profile = {
    id: 'f', parentName: 'Aidan', members: [{ id: 'c', name: 'Sloane', role: 'child', age: 3, dateOfBirth: '2023-01-01' }],
    homeLocation: 'Bushey', homeLatitude: HOME.latitude, homeLongitude: HOME.longitude, maxDriveMinutes: 45, budgetTier: 'moderate', completionPercent: 100,
  } as unknown as FamilyProfile;

  it('has no calculated journey and says so', () => {
    const venue = mergePlaceToVenue(place({}), null, HOME.latitude, HOME.longitude);
    expect(Number.isNaN(venue.driveMinutes)).toBe(true);
    expect(travelTimeLabel(venue.driveMinutes, 'estimated')).toBe(UNKNOWN_TRAVEL_LABEL);
    expect(travelTimeSpoken(venue.driveMinutes, 'estimated')).toBe(UNKNOWN_TRAVEL_LABEL);
    for (const text of [travelTimeLabel(venue.driveMinutes, 'estimated'), travelTimeSpoken(venue.driveMinutes, 'estimated')]) {
      expect(text).not.toMatch(/\d{3,}|NaN|Infinity/);
    }
  });

  it('survives personalisation without a nonsensical figure anywhere in the card data', () => {
    const venue = personaliseVenue(mergePlaceToVenue(place({}), null, HOME.latitude, HOME.longitude), profile);
    const everything = JSON.stringify({ score: venue.familyScore, drive: String(venue.driveMinutes) });
    expect(everything).not.toMatch(/\b\d{4,} min|null min/);
    // The drive caution ("N min away, M over the limit") is never written for a journey nobody could work out.
    expect(venue.familyScore.explanation.some((line) => /min away|over the/.test(line))).toBe(false);
  });

  it('a place with one null and one real coordinate is the same: unknown, not a long drive', () => {
    const venue = mergePlaceToVenue(place({ latitude: 51.6, longitude: null as never }), null, HOME.latitude, HOME.longitude);
    expect(Number.isNaN(venue.driveMinutes)).toBe(true);
  });

  it('a place with real coordinates is unaffected', () => {
    const venue = mergePlaceToVenue(place({ latitude: 51.6, longitude: -0.3 }), null, HOME.latitude, HOME.longitude);
    expect(venue.driveMinutes).toBeGreaterThan(0);
    expect(venue.driveMinutes).toBeLessThan(60);
  });
});

describe('an unknown journey is unknown to the matcher too, not "too far"', () => {
  const facts = (driveMinutes: number): MatchableVenueFacts =>
    ({
      placeId: 'p', name: 'P', category: 'park', driveMinutes, enrichmentStatus: 'verified', minRecommendedAge: null, maxRecommendedAge: null,
      venueAgePolicy: null, toilets: 'unknown', babyChanging: 'unknown', parking: 'unknown', pushchairSuitability: 'unknown', environment: 'unknown',
      energyLevel: 'unknown', visitDurationMinutes: null, estimatedSpend: null, goodToKnow: [], warnings: [], openingStatus: 'unknown',
    }) as MatchableVenueFacts;
  const request = { rawText: '', parsedAt: '', childAges: [3], maxDriveMinutes: 45, budgetTier: 'moderate', hasPushchair: false, homeLocation: 'x', constraints: {}, context: {} } as never;

  it('records the journey as unknown', () => {
    const journey = matchVenueToDayRequest(facts(Number.NaN), request).evaluations.find((e) => e.field === 'journey');
    expect(journey?.outcome).toBe('unknown');
  });

  it('still records a known journey as before', () => {
    expect(matchVenueToDayRequest(facts(20), request).evaluations.find((e) => e.field === 'journey')?.outcome).toBe('suitable');
    expect(matchVenueToDayRequest(facts(90), request).evaluations.find((e) => e.field === 'journey')?.outcome).toBe('unsuitable');
  });
});
