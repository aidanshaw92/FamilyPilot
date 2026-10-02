import { describe, expect, it } from 'vitest';

import {
  OSM_COPYRIGHT_URL,
  OSM_CREDIT,
  attributionSourceOf,
  creditsForPlaces,
  externalCreditFor,
} from '@/src/services/places/attribution';
import { mergePlaceToVenue } from '@/src/services/places/merge-place';
import { ExternalPlaceRecord, PlacesProviderName } from '@/src/types/places';

/**
 * Attribution is a licence condition, and the client cannot honour it without knowing where a place
 * came from. `provider` was not carried onto the consumer `Venue` at all, so Google's mark was shown
 * over OpenStreetMap places -- three of which were being served to parents.
 *
 * The rule these lock down is that nothing is ever guessed. The first fix defaulted an absent
 * provider to Google because Google is the majority source; that is precisely the failure
 * attribution prevents, since a majority is not a provenance record.
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
    expect(mergePlaceToVenue(record({ provider: undefined as never }), null, 51.5, -0.1).provider)
      .toBeUndefined();
  });
});

describe('the attribution a source is owed is explicit, never inferred', () => {
  it('names each provider as itself', () => {
    const providers: PlacesProviderName[] = ['google', 'osm', 'familypilot', 'mock'];
    for (const provider of providers) {
      expect(attributionSourceOf(provider), provider).toBe(provider);
    }
  });

  it('calls a missing provider unknown rather than filling it in', () => {
    expect(attributionSourceOf(undefined)).toBe('unknown');
  });

  it('never resolves a missing provider to google', () => {
    // The defect this replaces: an absent provider rendered Google's mark because Google is the
    // majority source. A majority is not provenance, and crediting the wrong holder is the exact
    // thing attribution exists to prevent.
    expect(attributionSourceOf(undefined)).not.toBe('google');
  });

  it('points the OpenStreetMap credit at the copyright page, which is how the licence is made clear', () => {
    expect(OSM_COPYRIGHT_URL).toBe('https://www.openstreetmap.org/copyright');
  });
});

describe('which external credit a place is owed', () => {
  it('owes Google its mark for Google data', () => {
    expect(externalCreditFor('google')).toBe('google');
  });

  it('owes OpenStreetMap its credit for OSM data', () => {
    expect(externalCreditFor('osm')).toBe('osm');
  });

  it('owes nobody an external credit for FamilyPilot-owned data', () => {
    // Our own observations and our own fixtures are not somebody else's licensed data, so putting an
    // external provider's mark beside them would misattribute work to a party that never supplied it.
    expect(externalCreditFor('familypilot')).toBeNull();
    expect(externalCreditFor('mock')).toBeNull();
  });

  it('shows no external credit at all when the origin is unknown', () => {
    // The only honest outcome: we cannot name the holder, so we name nobody. Specifically NOT Google.
    expect(externalCreditFor(undefined)).toBeNull();
    expect(externalCreditFor(undefined)).not.toBe('google');
  });

  it('uses the credit wording the OpenStreetMap licence guidance asks for', () => {
    expect(OSM_CREDIT).toBe('© OpenStreetMap contributors');
  });
});

describe('a list of places mixing providers credits each one once', () => {
  it('names both holders when both supplied data, in a stable order', () => {
    const credits = creditsForPlaces([
      { provider: 'osm' },
      { provider: 'google' },
      { provider: 'osm' },
      { provider: 'google' },
    ]);
    expect(credits).toEqual(['google', 'osm']);
  });

  it('does not credit Google for a list of places with no recorded provider', () => {
    // A mixed list is where a silent default does the most damage: one Google row would otherwise be
    // enough to put Google's mark under rows that are not Google's, and an all-unknown list would
    // claim a provenance nobody recorded.
    expect(creditsForPlaces([{ provider: undefined }, {}, { provider: undefined }])).toEqual([]);
  });

  it('credits only the holders actually present', () => {
    expect(creditsForPlaces([{ provider: 'osm' }, { provider: 'familypilot' }])).toEqual(['osm']);
    expect(creditsForPlaces([])).toEqual([]);
  });
});
