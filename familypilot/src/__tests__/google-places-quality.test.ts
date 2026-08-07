import { describe, expect, it } from 'vitest';

import { PROVIDER_ONLY_FAMILY_MATCH_CAP } from '@/src/constants/places-quality';
import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { mergePlaceToVenueDetail } from '@/src/services/places/merge-place';
import { DEFAULT_HOME } from '@/src/services/places/geo-utils';
import { deriveEnrichmentStatus } from '@/src/utils/places-enrichment';
import { getMatchClassification } from '@/src/utils/family-match-classification';
import { FamilyProfile, VenueDetail } from '@/src/types';
import { ExternalPlaceRecord } from '@/src/types/places';

import {
  dedupeChains,
  dedupeVenueAliases,
  googleTypesForIntent,
  isSupportedForIntent,
  mapGoogleCategory,
  mapGoogleTaxonomy,
  normaliseChainKey,
  rankPlaces,
  shouldExcludePlace,
} from '../../server/places/places-quality';
import { googlePlaceToRecord } from '../../server/places/google-places-mapper';

const SAMPLE_PROFILE: FamilyProfile = {
  id: 'profile-1',
  parentName: 'Parent',
  homeLocation: 'Bushey',
  maxDriveMinutes: 30,
  budgetTier: 'moderate',
  completionPercent: 100,
  members: [
    { id: '1', name: 'Mia', role: 'child', dateOfBirth: '2020-01-01', age: 5 },
    { id: '2', name: 'Ollie', role: 'child', dateOfBirth: '2017-01-01', age: 8 },
  ],
  vehicle: 'Family SUV',
  pushchair: '',
};

function googlePlace(primaryType: string, types: string[] = [], overrides: Record<string, unknown> = {}) {
  return {
    id: 'ChIJTest',
    displayName: { text: 'Test Place' },
    location: { latitude: 51.64, longitude: -0.36 },
    formattedAddress: 'Test Address',
    primaryType,
    types,
    businessStatus: 'OPERATIONAL',
    ...overrides,
  };
}

describe('Google category mapping', () => {
  it('maps museum types correctly', () => {
    expect(mapGoogleCategory('museum', [])).toBe('museum');
    expect(mapGoogleCategory('art_gallery', [])).toBe('museum');
  });

  it('returns null for unsupported types — never defaults to park', () => {
    expect(mapGoogleCategory('unknown_type', [])).toBeNull();
    expect(mapGoogleCategory('historical_landmark', [])).toBeNull();
  });

  it('temple must not become park', () => {
    expect(mapGoogleCategory('hindu_temple', ['place_of_worship'])).toBeNull();
  });

  it('cinema must not become restaurant', () => {
    expect(mapGoogleCategory('movie_theater', ['movie_theater'])).toBeNull();
  });

  it('bowling alley must not become restaurant', () => {
    expect(mapGoogleCategory('bowling_alley', [])).toBe('soft_play');
  });

  it('art museum must not become cafe', () => {
    expect(mapGoogleCategory('art_gallery', ['museum'])).toBe('museum');
    expect(mapGoogleCategory('art_museum', [])).toBe('museum');
  });

  it('historical landmark must not silently become park', () => {
    expect(mapGoogleCategory('historical_landmark', ['point_of_interest'])).toBeNull();
  });
});

describe('Production category audit examples', () => {
  it('maps tourist attractions to museum (attraction taxonomy), not park', () => {
    expect(mapGoogleTaxonomy('tourist_attraction', ['tourist_attraction', 'point_of_interest']))
      .toBe('attraction');
    expect(
      mapGoogleCategory('tourist_attraction', ['tourist_attraction', 'point_of_interest'], 'Warner Bros. Studio Tour London'),
    ).toBe('museum');
    expect(
      mapGoogleCategory('tourist_attraction', ['tourist_attraction'], 'Harry Potter Studio'),
    ).toBe('museum');
  });

  it('excludes performing arts theatres from explore', () => {
    expect(mapGoogleCategory('performing_arts_theater', ['performing_arts_theater'], 'Troubadour Wembley Park Theatre')).toBeNull();
    expect(isSupportedForIntent('performing_arts_theater', ['performing_arts_theater'], 'explore', 'Troubadour Wembley Park Theatre')).toBe(false);
  });

  it('excludes libraries rather than mapping them to museum', () => {
    expect(mapGoogleCategory('library', ['library'], 'College Lane Campus LRC')).toBeNull();
    expect(isSupportedForIntent('library', ['library'], 'explore', 'College Lane Campus LRC')).toBe(false);
  });

  it('maps zoos to museum (attraction bucket), not farm', () => {
    expect(mapGoogleCategory('zoo', ['zoo', 'point_of_interest'], 'Hanwell Zoo')).toBe('museum');
  });

  it('maps trampoline venues from weak park primary types using name and secondary types', () => {
    expect(
      mapGoogleCategory(
        'park',
        ['park', 'point_of_interest'],
        'Jump In by AirHop Adventure & Trampoline Park Elstree',
      ),
    ).toBe('soft_play');
    expect(
      mapGoogleCategory('park', ['park', 'trampoline_park', 'point_of_interest'], 'Some Venue'),
    ).toBe('soft_play');
  });

  it('never defaults unknown types to park', () => {
    expect(mapGoogleCategory('unknown_type', ['point_of_interest'])).toBeNull();
    expect(mapGoogleCategory(undefined, ['point_of_interest'])).toBeNull();
  });
});

describe('Venue alias deduplication', () => {
  it('suppresses Harry Potter Studio when Warner Bros Studio Tour is present nearby', () => {
    const places = [
      {
        familypilotId: 'fp-warner',
        name: 'Warner Bros. Studio Tour London',
        latitude: 51.656,
        longitude: -0.418,
        category: 'museum' as const,
      },
      {
        familypilotId: 'fp-hp',
        name: 'Harry Potter Studio',
        latitude: 51.6561,
        longitude: -0.4181,
        category: 'museum' as const,
      },
    ];
    const result = dedupeVenueAliases(places);
    expect(result).toHaveLength(1);
    expect(result[0].familypilotId).toBe('fp-warner');
  });
});

describe('Explore exclusions', () => {
  it('excludes hotels from explore', () => {
    expect(shouldExcludePlace('hotel', ['lodging'], 'explore')).toBe(true);
    expect(isSupportedForIntent('hotel', ['lodging'], 'explore')).toBe(false);
  });

  it('excludes supermarkets from explore', () => {
    expect(shouldExcludePlace('supermarket', [], 'explore')).toBe(true);
  });

  it('excludes bars and pubs from explore', () => {
    expect(shouldExcludePlace('bar', [], 'explore')).toBe(true);
    expect(shouldExcludePlace('pub', [], 'explore')).toBe(true);
  });

  it('does not include restaurant types in explore search types', () => {
    const types = googleTypesForIntent('explore');
    expect(types).not.toContain('restaurant');
    expect(types).not.toContain('cafe');
  });
});

describe('Restaurant search path', () => {
  it('allows restaurant and cafe types', () => {
    const types = googleTypesForIntent('restaurant');
    expect(types).toContain('restaurant');
    expect(types).toContain('cafe');
  });

  it('supports restaurant mapping', () => {
    expect(isSupportedForIntent('restaurant', ['food'], 'restaurant')).toBe(true);
    expect(mapGoogleCategory('restaurant', [])).toBe('restaurant');
  });

  it('still excludes supermarkets from restaurant search', () => {
    expect(isSupportedForIntent('supermarket', [], 'restaurant')).toBe(false);
  });
});

describe('Chain deduplication', () => {
  it('normalises chain names from branch suffixes', () => {
    expect(normaliseChainKey("McDonald's Watford")).toBe("mcdonald's");
    expect(normaliseChainKey('Costa Coffee, Bushey')).toBe('costa coffee');
  });

  it('keeps nearest branch per chain in explore', () => {
    const places = [
      {
        familypilotId: 'fp-1',
        name: "McDonald's Watford",
        latitude: 51.65,
        longitude: -0.36,
        category: 'restaurant' as const,
      },
      {
        familypilotId: 'fp-2',
        name: "McDonald's Bushey",
        latitude: 51.64,
        longitude: -0.35,
        category: 'restaurant' as const,
      },
    ];
    const result = dedupeChains(places, 51.64, -0.36, 'explore');
    expect(result).toHaveLength(1);
    expect(result[0].familypilotId).toBe('fp-2');
  });

  it('does not dedupe chains for restaurant intent', () => {
    const places = [
      {
        familypilotId: 'fp-1',
        name: "McDonald's Watford",
        latitude: 51.65,
        longitude: -0.36,
        category: 'restaurant' as const,
      },
      {
        familypilotId: 'fp-2',
        name: "McDonald's Bushey",
        latitude: 51.64,
        longitude: -0.35,
        category: 'restaurant' as const,
      },
    ];
    expect(dedupeChains(places, 51.64, -0.36, 'restaurant')).toHaveLength(2);
  });
});

describe('Ranking', () => {
  it('prefers family-relevant categories over pure distance', () => {
    const places = [
      {
        familypilotId: 'far-park',
        name: 'Far Park',
        latitude: 51.7,
        longitude: -0.36,
        category: 'park' as const,
      },
      {
        familypilotId: 'near-shop',
        name: 'Near Shop',
        latitude: 51.641,
        longitude: -0.361,
        category: 'shop' as const,
      },
    ];
    const ranked = rankPlaces(places, {
      originLat: 51.64,
      originLng: -0.36,
      intent: 'explore',
      maxResults: 2,
    });
    expect(ranked[0].familypilotId).toBe('far-park');
  });
});

describe('Enrichment status', () => {
  it('marks Google places as provider_only', () => {
    const record = googlePlaceToRecord(googlePlace('park', ['park']), 'explore');
    expect(record?.enrichmentStatus).toBe('provider_only');
  });

  it('maps production audit examples through googlePlaceToRecord', () => {
    const warner = googlePlaceToRecord(
      googlePlace('tourist_attraction', ['tourist_attraction'], {
        displayName: { text: 'Warner Bros. Studio Tour London' },
      }),
      'explore',
    );
    expect(warner?.category).toBe('museum');

    const theatre = googlePlaceToRecord(
      googlePlace('performing_arts_theater', ['performing_arts_theater'], {
        displayName: { text: 'Troubadour Wembley Park Theatre' },
      }),
      'explore',
    );
    expect(theatre).toBeNull();
  });

  it('derives enriched from partial metadata', () => {
    const status = deriveEnrichmentStatus({
      familypilotPlaceId: 'test',
      bestAges: '3+',
      provenance: {},
      updatedAt: '2026-01-01',
    });
    expect(status).toBe('enriched');
  });
});

describe('Provider-only Family Match', () => {
  const providerOnlyVenue: VenueDetail = {
    id: 'fp-google-test',
    name: 'Live Park',
    category: 'park',
    latitude: 51.64,
    longitude: -0.36,
    driveMinutes: 10,
    imageUrl: '',
    familyScore: { score: 0, factors: {} as never, explanation: [] },
    photos: [],
    facilities: [],
    openingHours: 'Unknown',
    description: 'Test',
    enrichmentStatus: 'provider_only',
  };

  it('caps Family Match below normal thresholds', () => {
    const score = calculateFamilyScore(providerOnlyVenue, SAMPLE_PROFILE, {
      enrichmentStatus: 'provider_only',
    });
    expect(score.score).toBeLessThanOrEqual(PROVIDER_ONLY_FAMILY_MATCH_CAP);
  });

  it('uses Potential match classification', () => {
    expect(getMatchClassification(65, 'provider_only')).toBe('Potential match');
    expect(getMatchClassification(90, 'provider_only')).toBe('Potential match');
  });

  it('does not generate child-name copy for provider-only', () => {
    const score = calculateFamilyScore(providerOnlyVenue, SAMPLE_PROFILE, {
      enrichmentStatus: 'provider_only',
    });
    expect(score.explanation.join(' ')).not.toMatch(/Mia|Ollie/);
    expect(score.explanation[0]).toContain('not yet been reviewed');
  });
});

describe('Missing metadata stays unknown', () => {
  const externalPlace: ExternalPlaceRecord = {
    familypilotId: 'fp-google-ChIJTest',
    externalId: 'google:ChIJTest',
    provider: 'google',
    name: 'Google Park',
    latitude: 51.64,
    longitude: -0.36,
    category: 'park',
    photos: [],
    provenance: {},
    fetchedAt: '2026-08-07T00:00:00.000Z',
    enrichmentStatus: 'provider_only',
  };

  it('does not synthesise facilities or ages without metadata', () => {
    const detail = mergePlaceToVenueDetail(
      externalPlace,
      null,
      DEFAULT_HOME.latitude,
      DEFAULT_HOME.longitude,
    );
    expect(detail.facilities).toEqual([]);
    expect(detail.bestAges).toBeUndefined();
    expect(detail.terrain).toBeUndefined();
    expect(detail.enrichmentStatus).toBe('provider_only');
  });
});

describe('Enriched and verified scoring unchanged', () => {
  const enrichedVenue: VenueDetail = {
    id: 'venue-1',
    name: 'Enriched Park',
    category: 'park',
    latitude: 51.64,
    longitude: -0.36,
    driveMinutes: 10,
    imageUrl: '',
    familyScore: { score: 0, factors: {} as never, explanation: [] },
    photos: [],
    facilities: ['toilets', 'parking', 'pushchair_friendly'],
    openingHours: '9–5',
    terrain: 'flat',
    bestAges: 'All ages',
    description: 'Enriched',
    enrichmentStatus: 'enriched',
  };

  it('allows scores above provider-only cap for enriched venues', () => {
    const score = calculateFamilyScore(enrichedVenue, SAMPLE_PROFILE, {
      enrichmentStatus: 'enriched',
    });
    expect(score.score).toBeGreaterThan(PROVIDER_ONLY_FAMILY_MATCH_CAP);
  });

  it('allows Excellent match for verified venues', () => {
    const score = calculateFamilyScore(
      { ...enrichedVenue, enrichmentStatus: 'verified' },
      SAMPLE_PROFILE,
      { enrichmentStatus: 'verified' },
    );
    expect(getMatchClassification(score.score, 'verified')).not.toBe('Potential match');
  });
});
