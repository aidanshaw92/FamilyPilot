import { describe, expect, it } from 'vitest';

import {
  isEligibleOpeningStatus,
  openingStatusLabel,
  resolveOpeningStatus,
} from '@/src/services/context/live-context';

describe('opening status helpers', () => {
  it('maps provider isOpen values without guessing', () => {
    expect(resolveOpeningStatus(true)).toBe('open');
    expect(resolveOpeningStatus(false)).toBe('closed');
    expect(resolveOpeningStatus(undefined)).toBe('unknown');
  });

  it('excludes confirmed closed venues from proactive recommendations', () => {
    expect(isEligibleOpeningStatus('open')).toBe(true);
    expect(isEligibleOpeningStatus('unknown')).toBe(true);
    expect(isEligibleOpeningStatus('closed')).toBe(false);
  });

  it('uses honest opening labels', () => {
    expect(openingStatusLabel('open')).toBe('Open now');
    expect(openingStatusLabel('closed')).toBe('Closed now');
    expect(openingStatusLabel('unknown')).toBe('Opening status not confirmed');
  });
});

describe('weather provider', () => {
  it('maps OpenWeather conditions into FamilyPilot weather types', async () => {
    const { mapOpenWeatherCondition, estimateWeatherFallback } = await import(
      '../../../api/context/lib/weather-provider.js'
    );

    expect(mapOpenWeatherCondition('Rain', 90)).toBe('rainy');
    expect(mapOpenWeatherCondition('Clear', 10)).toBe('sunny');
    expect(mapOpenWeatherCondition('Clouds', 80)).toBe('cloudy');

    const fallback = estimateWeatherFallback(51.64, -0.36, new Date('2026-08-10T12:00:00.000Z'));
    expect(fallback.source).toBe('estimated');
    expect(fallback.temperature).toBeTypeOf('number');
    expect(['sunny', 'cloudy', 'rainy', 'partly_cloudy']).toContain(fallback.condition);
  });
});

describe('journey provider', () => {
  it('estimates drive times when no maps key is configured', async () => {
    const { estimateJourneys } = await import('../../../api/context/lib/journey-provider.js');

    const journeys = estimateJourneys(
      { latitude: 51.64, longitude: -0.36 },
      [{ placeId: 'fp-google-a', latitude: 51.657, longitude: -0.312 }],
    );

    expect(journeys).toHaveLength(1);
    expect(journeys[0]?.placeId).toBe('fp-google-a');
    expect(journeys[0]?.driveMinutes).toBeGreaterThan(0);
    expect(journeys[0]?.source).toBe('estimated');
  });
});
