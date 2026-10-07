import { describe, expect, it } from 'vitest';

import { mockFamilyProfile } from '@/src/data/mock-data';
import { buildProactiveDayRequest } from '@/src/services/recommendation/proactive-day-request';

describe('buildProactiveDayRequest', () => {
  it('builds profile-backed constraints without user text', () => {
    const request = buildProactiveDayRequest(mockFamilyProfile, new Date(2026, 7, 10, 9, 30));

    expect(request.childAges).toEqual([4, 1]);
    expect(request.hasPushchair).toBe(true);
    expect(request.constraints.ageRecommendedFit).toEqual({ strength: 'preferred', value: 'in_range' });
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
  });

  it('is the same request at any hour: the time of day is not an input', () => {
    const morning = buildProactiveDayRequest(mockFamilyProfile, new Date(2026, 7, 10, 9, 30));
    const evening = buildProactiveDayRequest(mockFamilyProfile, new Date(2026, 7, 10, 18, 0));
    const { parsedAt: _m, ...m } = morning;
    const { parsedAt: _e, ...e } = evening;
    expect(e).toEqual(m);
    expect(evening.constraints.energyLevel).toBeUndefined();
    expect(evening.context.timeWindow).toBeUndefined();
  });

  it('has no environment preference: the forecast is not an input and a request never prefers indoor or outdoor', () => {
    const request = buildProactiveDayRequest(mockFamilyProfile);
    expect(request.constraints.environment).toBeUndefined();
    expect(request.rawText).not.toMatch(/rain|sun|weather|today/i);
    expect(request.context.freeformNotes).not.toMatch(/rain|sun|weather|today/i);
  });
});
