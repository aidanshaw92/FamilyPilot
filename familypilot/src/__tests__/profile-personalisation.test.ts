import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mockFamilyProfile, mockVenues } from '@/src/data/mock-data';
import { computeCompletionPercent } from '@/src/utils/profile-completion';
import {
  createChildMember,
  createEmptyProfile,
  formatChildAge,
  withCompletion,
} from '@/src/utils/profile-defaults';
import { buildHomeRecommendations, personaliseVenues } from '@/src/utils/personalise-venues';

describe('profile completion', () => {
  it('returns a low score for an empty profile with only defaults', () => {
    expect(computeCompletionPercent(createEmptyProfile())).toBe(25);
  });

  it('increases as optional fields are added', () => {
    const partial = withCompletion({
      ...createEmptyProfile(),
      parentName: 'Sam',
      homeLocation: 'Bushey',
      members: [{ id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2020-01-01', age: 4 }],
      maxDriveMinutes: 30,
      budgetTier: 'moderate',
    });
    expect(partial.completionPercent).toBeGreaterThan(0);
    expect(partial.completionPercent).toBeLessThan(100);
  });
});

describe('personalised recommendations', () => {
  it('uses child names in recommendation subtitles', () => {
    const sections = buildHomeRecommendations(mockFamilyProfile);
    expect(sections[0]?.subtitle).toContain('Sloane');
    expect(sections[0]?.subtitle).toContain('Ozzie');
  });

  it('recalculates family match scores from profile context', () => {
    const personalised = personaliseVenues(mockVenues, mockFamilyProfile);
    expect(personalised.length).toBeGreaterThan(0);
    expect(personalised[0]?.familyScore.explanation.length).toBeGreaterThan(0);
    expect(personalised[0]?.familyScore.score).toBeGreaterThan(0);
  });

  it('respects maximum drive time when filtering venues', () => {
    const strictProfile = { ...mockFamilyProfile, maxDriveMinutes: 15 };
    const personalised = personaliseVenues(mockVenues, strictProfile);
    expect(personalised.every((v) => v.driveMinutes <= 25)).toBe(true);
  });
});

describe('baby age in months', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records a precise month count for a child under 1, distinct from a newborn', () => {
    const newborn = createChildMember('Baby', 0, 0);
    const almostOne = createChildMember('Baby', 0, 11);

    expect(newborn.age).toBe(0);
    expect(newborn.ageMonths).toBe(0);
    expect(almostOne.age).toBe(0);
    expect(almostOne.ageMonths).toBe(11);
    // Age in years alone can't tell these apart - ageMonths is what makes them distinct.
    expect(newborn.ageMonths).not.toBe(almostOne.ageMonths);
  });

  it('does not set ageMonths for a child aged 1 or older', () => {
    const toddler = createChildMember('Kid', 2);
    expect(toddler.age).toBe(2);
    expect(toddler.ageMonths).toBeNull();
  });

  it('computes a real approximate date of birth from months, not always January 1st', () => {
    const eightMonths = createChildMember('Baby', 0, 8);
    const today = new Date();
    const expected = new Date(today.getFullYear(), today.getMonth() - 8, 1);
    expect(eightMonths.dateOfBirth).toBe(expected.toISOString().slice(0, 10));
    expect(eightMonths.dateOfBirth.endsWith('-01-01')).toBe(false);
  });

  it('formats a baby under 1 in months, not "0 years old"', () => {
    expect(formatChildAge({ age: 0, ageMonths: 8 })).toBe('8 months old');
    expect(formatChildAge({ age: 0, ageMonths: 1 })).toBe('1 month old');
  });

  it('formats a child 1 or older in years as before', () => {
    expect(formatChildAge({ age: 1, ageMonths: null })).toBe('1 year old');
    expect(formatChildAge({ age: 4, ageMonths: null })).toBe('4 years old');
  });
});
