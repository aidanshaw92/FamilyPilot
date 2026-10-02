import { describe, expect, it } from 'vitest';

import { mergePlaceToVenue } from '@/src/services/places/merge-place';
import { ExternalPlaceRecord } from '@/src/types/places';

/**
 * Attribution is a licence condition, and the client cannot honour it without knowing where a place
 * came from. `provider` was not carried onto the consumer `Venue` at all, so Google's mark was shown
 * over OpenStreetMap places -- three of which were being served to parents.
 */
const record = (over: Partial<ExternalPlaceRecord> = {}): ExternalPlaceRecord => ({
  familypilotId: 'fp-osm-1',
  externalId: 'osm:1',
  provider: 'osm',
  name: 'A Park',
  category: 'park',
  latitude: 51.5,
  longitude: -0.1,
  photos: [],
  provenance: {},
  fetchedAt: '2026-10-01T00:00:00.000Z',
  ...over,
} as ExternalPlaceRecord);

describe('a venue remembers which provider it came from', () => {
  it('carries an OpenStreetMap origin to the client', () => {
    expect(mergePlaceToVenue(record(), null, 51.5, -0.1).provider).toBe('osm');
  });

  it('carries a Google origin to the client', () => {
    expect(mergePlaceToVenue(record({ provider: 'google' }), null, 51.5, -0.1).provider).toBe('google');
  });

  it('does not invent a provider for a record that has none', () => {
    const merged = mergePlaceToVenue(record({ provider: undefined as never }), null, 51.5, -0.1);
    expect(merged.provider).toBeUndefined();
  });
});
