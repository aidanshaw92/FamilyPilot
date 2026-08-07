import { describe, expect, it } from 'vitest';

import { mockFamilyProfile, mockVenues } from '@/src/data/mock-data';
import { computeCompletionPercent } from '@/src/utils/profile-completion';
import { createEmptyProfile, withCompletion } from '@/src/utils/profile-defaults';
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
