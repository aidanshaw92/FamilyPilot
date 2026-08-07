import { describe, expect, it } from 'vitest';

import {
  formatTerrainLabel,
  getMatchClassification,
  getQualitativeRating,
} from '@/src/utils/family-match-classification';

describe('Family Match classification', () => {
  it('maps scores to human-readable classifications', () => {
    expect(getMatchClassification(95)).toBe('Excellent match');
    expect(getMatchClassification(85)).toBe('Great match');
    expect(getMatchClassification(75)).toBe('Good match');
    expect(getMatchClassification(65)).toBe('Worth considering');
    expect(getMatchClassification(50)).toBe('Limited match');
  });

  it('maps factor values to qualitative ratings', () => {
    expect(getQualitativeRating(90)).toBe('Excellent');
    expect(getQualitativeRating(75)).toBe('Good');
    expect(getQualitativeRating(60)).toBe('Fair');
    expect(getQualitativeRating(40)).toBe('Limited');
  });

  it('formats terrain labels for display', () => {
    expect(formatTerrainLabel('flat')).toBe('Mostly flat');
    expect(formatTerrainLabel('hilly')).toBe('Hilly in places');
    expect(formatTerrainLabel('mixed')).toBe('Mixed terrain');
  });
});
