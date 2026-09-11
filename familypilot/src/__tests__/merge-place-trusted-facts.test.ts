import { describe, expect, it } from 'vitest';

import { mergePlaceToVenue, mergePlaceToVenueDetail } from '../services/places/merge-place';
import { calculateFamilyScore } from '../services/scoring/family-score';
import { hasTrustedMatchSignals } from '../services/scoring/trusted-family-score';
import { ExternalPlaceRecord, VenueFamilyMetadata } from '../types/places';
import { FamilyProfile, VenueDetail } from '../types';

const PLACE: ExternalPlaceRecord = {
  familypilotId: 'fp-google-verified-park',
  externalId: 'ext-1',
  provider: 'google',
  name: 'Verified Park',
  latitude: 51.6,
  longitude: -0.3,
  category: 'park',
  photos: [],
  provenance: {},
  fetchedAt: '2026-09-01T00:00:00.000Z',
  enrichmentStatus: 'enriched',
  isOpen: true,
};

const METADATA: VenueFamilyMetadata = {
  familypilotPlaceId: PLACE.familypilotId,
  enrichmentStatus: 'enriched',
  minRecommendedAge: 1,
  maxRecommendedAge: 10,
  pushchairSuitability: 'excellent',
  environment: 'outdoor',
  energyLevel: 'high',
  familyFacilities: {
    toilets: 'yes',
    babyChanging: 'yes',
    parking: 'yes',
    freeParking: 'yes',
  },
  provenance: {},
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const PROFILE: FamilyProfile = {
  id: 'family-1',
  parentName: 'Test parent',
  homeLocation: 'Mill Hill',
  maxDriveMinutes: 30,
  budgetTier: 'moderate',
  completionPercent: 100,
  members: [{ id: 'child-1', name: 'Sam', role: 'child', age: 3, dateOfBirth: '2023-01-01' }],
};

describe('mergePlaceToVenue trustedFacts', () => {
  it('populates trustedFacts on list-level Venue objects, not just VenueDetail', () => {
    const venue = mergePlaceToVenue(PLACE, METADATA, 51.6, -0.3);

    expect(venue.trustedFacts).toBeDefined();
    expect(venue.trustedFacts?.toilets).toBe('yes');
    expect(venue.trustedFacts?.babyChanging).toBe('yes');
    expect(venue.trustedFacts?.pushchairSuitability).toBe('excellent');
    expect(hasTrustedMatchSignals(venue.trustedFacts!)).toBe(true);
  });

  it('lets Home/Explore list cards score with verified evidence, not just the detail page', () => {
    const venue = mergePlaceToVenue(PLACE, METADATA, 51.6, -0.3);

    // calculateFamilyScore expects a VenueDetail-shaped object; list callers (personaliseVenue)
    // pass the Venue through toVenueDetail() first, which spreads it as-is. What matters here is
    // that trustedFacts survives onto the object handed to scoring, which it will as long as
    // mergePlaceToVenue sets it.
    const score = calculateFamilyScore(venue as unknown as VenueDetail, PROFILE);

    expect(score.explanation.join(' ')).toMatch(/confirmed|Recommended|pushchair/i);
  });

  it('detail view keeps the same trustedFacts as the list view (no duplicate/diverging computation)', () => {
    const venue = mergePlaceToVenue(PLACE, METADATA, 51.6, -0.3);
    const detail = mergePlaceToVenueDetail(PLACE, METADATA, 51.6, -0.3);

    expect(detail.trustedFacts).toEqual(venue.trustedFacts);
  });

  it('provider-only places keep trustedFacts fields unknown, never inferring yes/no', () => {
    const providerOnlyPlace: ExternalPlaceRecord = { ...PLACE, enrichmentStatus: 'provider_only' };
    const venue = mergePlaceToVenue(providerOnlyPlace, null, 51.6, -0.3);

    expect(venue.trustedFacts?.toilets).toBe('unknown');
    expect(venue.trustedFacts?.babyChanging).toBe('unknown');
    expect(venue.trustedFacts?.pushchairSuitability).toBe('unknown');
    expect(hasTrustedMatchSignals(venue.trustedFacts!)).toBe(false);
  });
});
