import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { calculateFamilyScore } from '@/src/services/scoring/family-score';
import { FamilyProfile, VenueDetail } from '@/src/types';

const PROFILE: FamilyProfile = {
  id: 'p1',
  parentName: 'Parent',
  homeLocation: 'Bushey',
  maxDriveMinutes: 30,
  budgetTier: 'moderate',
  completionPercent: 100,
  members: [{ id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2020-01-01', age: 5 }],
};

function venue(overrides: Partial<VenueDetail> = {}): VenueDetail {
  return {
    id: 'v1',
    name: 'Test Park',
    category: 'park',
    latitude: 51.64,
    longitude: -0.36,
    driveMinutes: 15,
    imageUrl: '',
    familyScore: { score: 0, factors: {} as never, explanation: [] },
    photos: [],
    facilities: ['toilets', 'parking'],
    openingHours: '9-5',
    description: 'A park',
    enrichmentStatus: 'enriched',
    ...overrides,
  };
}

describe('calculateFamilyScore — routine fit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 9, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('scores higher when there is a comfortable window before the next routine', () => {
    const profile: FamilyProfile = {
      ...PROFILE,
      routines: [{ id: 'r1', label: 'Lunch', kind: 'feed', time: '15:00', durationMinutes: 30, atHome: true }],
    };
    const withTime = calculateFamilyScore(venue(), profile, {}).factors.routineFit;
    const withoutRoutine = calculateFamilyScore(venue(), PROFILE, {}).factors.routineFit;
    expect(withTime).toBeGreaterThan(withoutRoutine);
  });

  it('scores lower when leaving now would already run into the next routine', () => {
    const soonProfile: FamilyProfile = {
      ...PROFILE,
      routines: [{ id: 'r1', label: 'Nap', kind: 'nap', time: '09:10', durationMinutes: 60, atHome: true }],
    };
    // driveMinutes (15) means leaving now can't beat a nap only 10 minutes away.
    const fit = calculateFamilyScore(venue({ driveMinutes: 15 }), soonProfile, {}).factors.routineFit;
    const neutral = calculateFamilyScore(venue({ driveMinutes: 15 }), PROFILE, {}).factors.routineFit;
    expect(fit).toBeLessThan(neutral);
  });

  it('is neutral when the family has no routines set', () => {
    const { factors } = calculateFamilyScore(venue(), PROFILE, {});
    expect(factors.routineFit).toBe(75);
  });
});

describe('calculateFamilyScore — must-have facilities', () => {
  const wellEquipped = ['toilets', 'parking', 'cafe', 'playground'] as const;

  it('caps facilitiesMatch when a must-have facility is confirmed missing', () => {
    const profile: FamilyProfile = { ...PROFILE, mustHaveFacilities: ['baby_changing'] };
    const missing = calculateFamilyScore(venue({ facilities: [...wellEquipped] }), profile, {});
    const notRequired = calculateFamilyScore(venue({ facilities: [...wellEquipped] }), PROFILE, {});
    expect(missing.factors.facilitiesMatch).toBeLessThan(notRequired.factors.facilitiesMatch);
    expect(missing.factors.facilitiesMatch).toBeLessThanOrEqual(35);
  });

  it('does not cap facilitiesMatch when the must-have is present', () => {
    const profile: FamilyProfile = { ...PROFILE, mustHaveFacilities: ['toilets'] };
    const { factors } = calculateFamilyScore(venue({ facilities: [...wellEquipped] }), profile, {});
    expect(factors.facilitiesMatch).toBeGreaterThan(35);
  });

  it('does not penalise an unreviewed venue for a must-have simply because facilities are unknown', () => {
    const profile: FamilyProfile = { ...PROFILE, mustHaveFacilities: ['baby_changing'] };
    const { factors } = calculateFamilyScore(venue({ facilities: [], enrichmentStatus: 'provider_only' }), profile, {});
    expect(factors.facilitiesMatch).toBe(50);
  });
});
