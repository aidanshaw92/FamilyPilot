import { describe, expect, it } from 'vitest';

import { formatCheckedDate, trustBadgesFor } from '@/src/utils/trust-badges';

describe('trust badges are built from facts, not printed by default', () => {
  it('says nothing for a venue that carries nothing', () => {
    expect(trustBadgesFor({})).toEqual([]);
    expect(trustBadgesFor({ enrichmentStatus: 'provider_only', provider: 'google' })).toEqual([]);
  });

  it('never prints a check date for a place FamilyPilot has not reviewed', () => {
    expect(
      trustBadgesFor({ enrichmentStatus: 'provider_only', trust: { source: 'estimated', lastChecked: '2026-10-01' } }),
    ).toEqual([]);
    expect(
      trustBadgesFor({ enrichmentStatus: 'ai_draft', trust: { source: 'provider', lastChecked: '2026-10-01' } }),
    ).toEqual([]);
  });

  it('prints the real check date for a reviewed place, in words a parent reads', () => {
    expect(trustBadgesFor({ enrichmentStatus: 'enriched', trust: { source: 'provider', lastChecked: '2026-10-01' } })).toEqual([
      'Family details checked 1 Oct 2026',
    ]);
    expect(trustBadgesFor({ enrichmentStatus: 'verified', trust: { source: 'provider', lastChecked: '2025-12-24T10:00:00Z' } })).toEqual([
      'Family details checked 24 Dec 2025',
    ]);
  });

  it('does not invent a date from something that is not one', () => {
    expect(formatCheckedDate('2 days ago')).toBeNull();
    expect(formatCheckedDate('')).toBeNull();
    expect(formatCheckedDate('2026-13-45')).toBeNull();
    expect(trustBadgesFor({ enrichmentStatus: 'enriched', trust: { source: 'provider', lastChecked: '2 days ago' } })).toEqual([]);
  });

  it('credits opening hours to the provider only when hours exist', () => {
    expect(trustBadgesFor({ provider: 'google', openingHours: 'Mon–Sun 9:00–17:00' })).toEqual(['Opening hours from Google']);
    expect(trustBadgesFor({ provider: 'osm', structuredOpeningHours: { periods: [] } })).toEqual(['Opening hours from OpenStreetMap']);
    expect(trustBadgesFor({ provider: 'google', openingHours: 'Opening hours not confirmed' })).toEqual([]);
    expect(trustBadgesFor({ provider: 'google', openingHours: '' })).toEqual([]);
    expect(trustBadgesFor({ provider: 'mock', openingHours: '9-5' })).toEqual([]);
  });

  it('marks an estimated cost as estimated', () => {
    expect(trustBadgesFor({ estimatedSpend: '£12 to £20' })).toEqual(['Estimated family cost']);
  });

  it('orders them check date, hours, cost', () => {
    expect(
      trustBadgesFor({ enrichmentStatus: 'enriched', trust: { source: 'provider', lastChecked: '2026-10-01' }, provider: 'google', openingHours: '9-5', estimatedSpend: '£' }),
    ).toEqual(['Family details checked 1 Oct 2026', 'Opening hours from Google', 'Estimated family cost']);
  });
});
