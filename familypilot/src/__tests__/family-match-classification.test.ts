import { describe, expect, it } from 'vitest';

import {
  formatTerrainLabel,
  getMatchClassification,
  getQualitativeRating,
} from '@/src/utils/family-match-classification';

describe('Family Match classification', () => {
  it('maps scores to human-readable classifications', () => {
    expect(getMatchClassification(95)).toBe('Excellent fit');
    expect(getMatchClassification(85)).toBe('Great fit');
    expect(getMatchClassification(75)).toBe('Good fit');
    expect(getMatchClassification(65)).toBe('Worth considering');
    expect(getMatchClassification(50)).toBe('Limited fit');
    expect(getMatchClassification(90, 'provider_only')).toBe('Not yet reviewed');
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
