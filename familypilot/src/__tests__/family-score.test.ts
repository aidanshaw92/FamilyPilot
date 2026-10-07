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

describe('calculateFamilyScore — never ranks by the clock', () => {
  // Browse first, plan second: the ranking is about the family, not about whether the next nap or feed leaves time to set
  // off NOW. It used to: a routine factor scored a venue 92 with time to spare and 45 without, so Home reordered itself
  // through the morning. Routines belong to a chosen day and are worked out by the planner (routine-advice.ts).
  afterEach(() => {
    vi.useRealTimers();
  });
  const withRoutines: FamilyProfile = {
    ...PROFILE,
    routines: [
      { id: 'r1', label: 'Nap', kind: 'nap', time: '09:10', durationMinutes: 60, atHome: true },
      { id: 'r2', label: 'Lunch', kind: 'feed', time: '12:00', durationMinutes: 30, atHome: true },
    ],
  };

  it('has no routine factor at all', () => {
    expect(Object.keys(calculateFamilyScore(venue(), withRoutines, {}).factors)).not.toContain('routineFit');
  });

  it('gives the same score at any time of day, routines or not', () => {
    const at = (h: number, m: number) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 1, h, m));
      const result = calculateFamilyScore(venue({ driveMinutes: 25 }), withRoutines, {});
      vi.useRealTimers();
      return result;
    };
    const scores = [at(8, 0), at(9, 5), at(11, 50), at(15, 0)].map((r) => r.score);
    expect(new Set(scores).size).toBe(1);
    expect(at(9, 5).score).toBe(calculateFamilyScore(venue({ driveMinutes: 25 }), PROFILE, {}).score);
  });

  it('never explains a place with a time to leave', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 9, 0));
    const { explanation, cautions } = calculateFamilyScore(venue({ driveMinutes: 30 }), withRoutines, {});
    expect([...explanation, ...(cautions ?? [])].join(' ')).not.toMatch(/leave by|nap|feed|lunch time|routine/i);
  });
});

describe('calculateFamilyScore — bespoke explanations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 9, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('surfaces a concrete visit-duration line rather than only the age-suitability filler', () => {
    const { explanation } = calculateFamilyScore(venue({ visitDurationMinutes: 120 }), PROFILE, {});
    expect(explanation.some((line) => line.includes('2-hour visit'))).toBe(true);
  });

  it('does not let the generic age-suitability line lead when more specific facts are available', () => {
    const { explanation } = calculateFamilyScore(
      venue({ visitDurationMinutes: 120, facilities: ['toilets', 'parking', 'baby_changing'] }),
      PROFILE,
      {},
    );
    // The age line ("Mia is a great age for this park") is still present, but only as filler -
    // never the very first thing a family reads on the card.
    expect(explanation[0]).not.toContain('great age');
  });

  it('mentions parking and baby changing together when both are on site', () => {
    const { explanation } = calculateFamilyScore(
      venue({ facilities: ['toilets', 'parking', 'baby_changing'] }),
      PROFILE,
      {},
    );
    expect(explanation.some((line) => line.includes('Parking and baby changing both on site'))).toBe(true);
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
