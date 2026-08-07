import { describe, expect, it } from 'vitest';

import { getFamilyPlaceMetadata } from '@/src/data/family-place-metadata';
import { mockPlacesProvider } from '@/src/services/providers/mock-places-provider';
import { mergePlaceToVenueDetail } from '@/src/services/places/merge-place';
import { DEFAULT_HOME } from '@/src/services/places/geo-utils';

describe('MockPlacesProvider', () => {
  it('returns external place records with separate external IDs', async () => {
    const places = await mockPlacesProvider.searchNearby({
      latitude: DEFAULT_HOME.latitude,
      longitude: DEFAULT_HOME.longitude,
      radiusKm: 50,
    });
    expect(places.length).toBeGreaterThan(0);
    expect(places[0].externalId).toMatch(/^mock:/);
    expect(places[0].familypilotId).toBe('venue-1');
    expect(places[0].provenance.name?.source).toBe('mock');
  });

  it('loads place detail by FamilyPilot ID', async () => {
    const place = await mockPlacesProvider.getPlace('venue-1');
    expect(place?.name).toBe('Aldenham Country Park');
    expect(place?.provider).toBe('mock');
  });
});

describe('mergePlaceToVenueDetail', () => {
  it('merges provider facts with FamilyPilot metadata', async () => {
    const place = await mockPlacesProvider.getPlace('venue-1');
    expect(place).not.toBeNull();
    const metadata = getFamilyPlaceMetadata('venue-1');
    const detail = mergePlaceToVenueDetail(
      place!,
      metadata,
      DEFAULT_HOME.latitude,
      DEFAULT_HOME.longitude,
    );
    expect(detail.name).toBe('Aldenham Country Park');
    expect(detail.terrain).toBe('flat');
    expect(detail.bestAges).toBeTruthy();
    expect(detail.openingHours).toContain('Hours from');
  });

  it('preserves FamilyPilot fields when provider has no enrichment', async () => {
    const place = await mockPlacesProvider.getPlace('venue-1');
    const detail = mergePlaceToVenueDetail(
      place!,
      null,
      DEFAULT_HOME.latitude,
      DEFAULT_HOME.longitude,
    );
    expect(detail.terrain).toBe('mixed');
    expect(detail.bestAges).toBe('All ages');
  });
});

describe('Family metadata separation', () => {
  it('stores editorial fields separately from external records', () => {
    const metadata = getFamilyPlaceMetadata('venue-1');
    expect(metadata?.familypilotPlaceId).toBe('venue-1');
    expect(metadata?.provenance.terrain?.source).toBe('familypilot');
    expect(metadata?.facilities?.length).toBeGreaterThan(0);
  });
});
