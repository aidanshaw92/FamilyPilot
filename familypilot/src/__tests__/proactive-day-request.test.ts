import { describe, expect, it } from 'vitest';

import { mockFamilyProfile, mockWeather } from '@/src/data/mock-data';
import { buildProactiveDayRequest } from '@/src/services/recommendation/proactive-day-request';

describe('buildProactiveDayRequest', () => {
  it('builds profile-backed constraints without user text', () => {
    const request = buildProactiveDayRequest(
      mockFamilyProfile,
      mockWeather,
      new Date('2026-08-10T09:30:00.000Z'),
    );

    expect(request.childAges).toEqual([4, 1]);
    expect(request.hasPushchair).toBe(true);
    expect(request.constraints.childAgeFit).toEqual({ strength: 'required', value: 'in_range' });
    expect(request.constraints.journey).toEqual({
      strength: 'required',
      value: { maxMinutes: mockFamilyProfile.maxDriveMinutes },
    });
    expect(request.constraints.pushchair).toEqual({
      strength: 'preferred',
      value: 'not_difficult',
    });
    expect(request.constraints.babyChanging).toEqual({
      strength: 'preferred',
      value: 'yes',
    });
    expect(request.context.timeWindow).toBe('morning');
  });

  it('prefers indoor venues when it is raining', () => {
    const request = buildProactiveDayRequest(mockFamilyProfile, {
      condition: 'rainy',
      temperature: 12,
      description: 'Light rain expected',
    });

    expect(request.constraints.environment).toEqual({
      strength: 'preferred',
      value: 'indoor',
    });
  });

  it('prefers outdoor venues on sunny days', () => {
    const request = buildProactiveDayRequest(mockFamilyProfile, {
      condition: 'sunny',
      temperature: 22,
      description: 'Bright and dry',
    });

    expect(request.constraints.environment).toEqual({
      strength: 'preferred',
      value: 'outdoor',
    });
  });

  it('uses a calmer energy context in the evening', () => {
    const request = buildProactiveDayRequest(
      mockFamilyProfile,
      mockWeather,
      new Date('2026-08-10T18:00:00.000Z'),
    );

    expect(request.constraints.energyLevel).toEqual({
      strength: 'context',
      value: 'low',
    });
    expect(request.context.timeWindow).toBe('evening');
  });
});
